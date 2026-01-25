"""
Spark Structured Streaming job for real-time note analytics.
Consumes from Kafka 'scribbly.notes.events' topic and computes metrics.
"""

from pyspark.sql import SparkSession
from pyspark.sql.functions import (
    from_json, col, window, count, avg,
    to_timestamp, current_timestamp, expr,
    sum as spark_sum, countDistinct
)
from pyspark.sql.types import (
    StructType, StructField, StringType,
    TimestampType, IntegerType, ArrayType
)

# Schema for note events from Kafka
NOTE_EVENT_SCHEMA = StructType([
    StructField("eventId", StringType(), True),
    StructField("eventType", StringType(), True),
    StructField("timestamp", StringType(), True),
    StructField("version", IntegerType(), True),
    StructField("payload", StructType([
        StructField("noteId", StringType(), True),
        StructField("userId", StringType(), True),
        StructField("title", StringType(), True),
        StructField("content", StringType(), True),
        StructField("tags", ArrayType(StringType()), True),
        StructField("sessionCode", StringType(), True),
        StructField("metadata", StructType([
            StructField("source", StringType(), True),
            StructField("cursorPosition", IntegerType(), True),
        ]), True),
    ]), True),
])

def create_spark_session():
    """Create Spark session with Kafka dependencies."""
    return (SparkSession.builder
        .appName("ScribblyNoteAnalytics")
        .config("spark.jars.packages", "org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.0")
        .config("spark.sql.streaming.checkpointLocation", "/opt/spark-jobs/checkpoints/note-analytics")
        .getOrCreate())


def read_kafka_stream(spark, bootstrap_servers="kafka:29092"):
    """Read streaming data from Kafka note events topic."""
    return (spark.readStream
        .format("kafka")
        .option("kafka.bootstrap.servers", bootstrap_servers)
        .option("subscribe", "scribbly.notes.events")
        .option("startingOffsets", "latest")
        .option("failOnDataLoss", "false")
        .load())


def parse_events(df):
    """Parse JSON events from Kafka messages."""
    return (df
        .selectExpr("CAST(value AS STRING) as json_str", "timestamp as kafka_timestamp")
        .select(
            from_json(col("json_str"), NOTE_EVENT_SCHEMA).alias("event"),
            col("kafka_timestamp")
        )
        .select(
            col("event.eventId"),
            col("event.eventType"),
            to_timestamp(col("event.timestamp")).alias("event_timestamp"),
            col("event.payload.noteId"),
            col("event.payload.userId"),
            col("event.payload.title"),
            col("event.payload.metadata.source"),
            col("kafka_timestamp")
        ))


def compute_user_activity_metrics(parsed_df):
    """Compute per-user activity metrics in 5-minute windows."""
    return (parsed_df
        .withWatermark("event_timestamp", "10 minutes")
        .groupBy(
            window(col("event_timestamp"), "5 minutes"),
            col("userId")
        )
        .agg(
            count("*").alias("total_events"),
            countDistinct("noteId").alias("unique_notes"),
            spark_sum(expr("CASE WHEN eventType = 'NOTE_CREATED' THEN 1 ELSE 0 END")).alias("notes_created"),
            spark_sum(expr("CASE WHEN eventType = 'NOTE_UPDATED' THEN 1 ELSE 0 END")).alias("notes_updated"),
            spark_sum(expr("CASE WHEN eventType = 'NOTE_DELETED' THEN 1 ELSE 0 END")).alias("notes_deleted"),
        )
        .select(
            col("window.start").alias("window_start"),
            col("window.end").alias("window_end"),
            col("userId"),
            col("total_events"),
            col("unique_notes"),
            col("notes_created"),
            col("notes_updated"),
            col("notes_deleted"),
            current_timestamp().alias("computed_at")
        ))


def compute_global_metrics(parsed_df):
    """Compute global platform metrics in 1-minute windows."""
    return (parsed_df
        .withWatermark("event_timestamp", "5 minutes")
        .groupBy(window(col("event_timestamp"), "1 minute"))
        .agg(
            count("*").alias("events_per_minute"),
            countDistinct("userId").alias("active_users"),
            countDistinct("noteId").alias("notes_touched"),
        )
        .select(
            col("window.start").alias("window_start"),
            col("window.end").alias("window_end"),
            col("events_per_minute"),
            col("active_users"),
            col("notes_touched"),
            current_timestamp().alias("computed_at")
        ))


def write_to_kafka(df, topic, checkpoint_suffix):
    """Write aggregated metrics back to Kafka."""
    return (df
        .selectExpr("to_json(struct(*)) AS value")
        .writeStream
        .format("kafka")
        .option("kafka.bootstrap.servers", "kafka:29092")
        .option("topic", topic)
        .option("checkpointLocation", f"/opt/spark-jobs/checkpoints/{checkpoint_suffix}")
        .outputMode("update")
        .start())


def write_to_console(df, name):
    """Write to console for debugging."""
    return (df.writeStream
        .format("console")
        .outputMode("update")
        .option("truncate", False)
        .queryName(name)
        .start())


def main():
    print("Starting Scribbly Note Analytics Spark Job...")

    spark = create_spark_session()
    spark.sparkContext.setLogLevel("WARN")

    # Read from Kafka
    kafka_df = read_kafka_stream(spark)

    # Parse events
    parsed_df = parse_events(kafka_df)

    # Compute metrics
    user_metrics = compute_user_activity_metrics(parsed_df)
    global_metrics = compute_global_metrics(parsed_df)

    # Write user metrics to Kafka analytics aggregates topic
    user_query = write_to_kafka(
        user_metrics,
        "scribbly.analytics.aggregates",
        "user-metrics"
    )

    # Write global metrics to Kafka (or could go to a different sink)
    global_query = write_to_kafka(
        global_metrics,
        "scribbly.analytics.aggregates",
        "global-metrics"
    )

    # Also write to console for debugging (optional)
    # console_query = write_to_console(user_metrics, "user_activity")

    print("Spark Streaming jobs started. Waiting for termination...")
    spark.streams.awaitAnyTermination()


if __name__ == "__main__":
    main()
