"""
Spark Structured Streaming job for Google Sync analytics.
Monitors sync job performance and health metrics.
"""

from pyspark.sql import SparkSession
from pyspark.sql.functions import (
    from_json, col, window, count, avg, max as spark_max, min as spark_min,
    to_timestamp, current_timestamp, expr, percentile_approx
)
from pyspark.sql.types import (
    StructType, StructField, StringType,
    TimestampType, IntegerType, LongType
)

# Schema for sync job events
SYNC_EVENT_SCHEMA = StructType([
    StructField("eventId", StringType(), True),
    StructField("eventType", StringType(), True),
    StructField("timestamp", StringType(), True),
    StructField("version", IntegerType(), True),
    StructField("payload", StructType([
        StructField("userId", StringType(), True),
        StructField("provider", StringType(), True),
        StructField("jobId", StringType(), True),
        StructField("status", StringType(), True),
        StructField("itemsProcessed", IntegerType(), True),
        StructField("error", StringType(), True),
        StructField("duration", LongType(), True),
    ]), True),
])


def create_spark_session():
    return (SparkSession.builder
        .appName("ScribblySyncAnalytics")
        .config("spark.jars.packages", "org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.0")
        .config("spark.sql.streaming.checkpointLocation", "/opt/spark-jobs/checkpoints/sync-analytics")
        .getOrCreate())


def read_sync_events(spark, bootstrap_servers="kafka:29092"):
    return (spark.readStream
        .format("kafka")
        .option("kafka.bootstrap.servers", bootstrap_servers)
        .option("subscribe", "scribbly.sync.results")
        .option("startingOffsets", "latest")
        .load())


def parse_sync_events(df):
    return (df
        .selectExpr("CAST(value AS STRING) as json_str")
        .select(from_json(col("json_str"), SYNC_EVENT_SCHEMA).alias("event"))
        .select(
            col("event.eventId"),
            col("event.eventType"),
            to_timestamp(col("event.timestamp")).alias("event_timestamp"),
            col("event.payload.userId"),
            col("event.payload.provider"),
            col("event.payload.jobId"),
            col("event.payload.status"),
            col("event.payload.itemsProcessed"),
            col("event.payload.duration"),
            col("event.payload.error"),
        ))


def compute_sync_health_metrics(parsed_df):
    """Compute sync health metrics per provider in 10-minute windows."""
    return (parsed_df
        .filter(col("eventType") == "SYNC_COMPLETED")
        .withWatermark("event_timestamp", "15 minutes")
        .groupBy(
            window(col("event_timestamp"), "10 minutes"),
            col("provider")
        )
        .agg(
            count("*").alias("total_syncs"),
            spark_sum(expr("CASE WHEN status = 'completed' THEN 1 ELSE 0 END")).alias("successful_syncs"),
            spark_sum(expr("CASE WHEN status = 'failed' THEN 1 ELSE 0 END")).alias("failed_syncs"),
            avg("duration").alias("avg_duration_ms"),
            spark_max("duration").alias("max_duration_ms"),
            spark_min("duration").alias("min_duration_ms"),
            avg("itemsProcessed").alias("avg_items_processed"),
            spark_sum("itemsProcessed").alias("total_items_processed"),
        )
        .withColumn("success_rate",
            expr("ROUND(successful_syncs / total_syncs * 100, 2)"))
        .select(
            col("window.start").alias("window_start"),
            col("window.end").alias("window_end"),
            col("provider"),
            col("total_syncs"),
            col("successful_syncs"),
            col("failed_syncs"),
            col("success_rate"),
            col("avg_duration_ms"),
            col("max_duration_ms"),
            col("min_duration_ms"),
            col("avg_items_processed"),
            col("total_items_processed"),
            current_timestamp().alias("computed_at")
        ))


def compute_user_sync_metrics(parsed_df):
    """Compute per-user sync patterns."""
    return (parsed_df
        .withWatermark("event_timestamp", "30 minutes")
        .groupBy(
            window(col("event_timestamp"), "30 minutes"),
            col("userId"),
            col("provider")
        )
        .agg(
            count("*").alias("sync_count"),
            spark_sum("itemsProcessed").alias("items_synced"),
            avg("duration").alias("avg_sync_duration"),
        )
        .select(
            col("window.start").alias("window_start"),
            col("window.end").alias("window_end"),
            col("userId"),
            col("provider"),
            col("sync_count"),
            col("items_synced"),
            col("avg_sync_duration"),
            current_timestamp().alias("computed_at")
        ))


def write_to_kafka(df, topic, checkpoint_suffix):
    return (df
        .selectExpr("to_json(struct(*)) AS value")
        .writeStream
        .format("kafka")
        .option("kafka.bootstrap.servers", "kafka:29092")
        .option("topic", topic)
        .option("checkpointLocation", f"/opt/spark-jobs/checkpoints/{checkpoint_suffix}")
        .outputMode("update")
        .start())


def main():
    print("Starting Scribbly Sync Analytics Spark Job...")

    spark = create_spark_session()
    spark.sparkContext.setLogLevel("WARN")

    # Read sync events
    kafka_df = read_sync_events(spark)
    parsed_df = parse_sync_events(kafka_df)

    # Compute metrics
    health_metrics = compute_sync_health_metrics(parsed_df)
    user_metrics = compute_user_sync_metrics(parsed_df)

    # Write to Kafka
    health_query = write_to_kafka(
        health_metrics,
        "scribbly.analytics.aggregates",
        "sync-health"
    )

    user_query = write_to_kafka(
        user_metrics,
        "scribbly.analytics.aggregates",
        "user-sync"
    )

    print("Sync Analytics jobs started. Waiting for termination...")
    spark.streams.awaitAnyTermination()


if __name__ == "__main__":
    main()
