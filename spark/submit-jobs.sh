#!/bin/bash
# Submit Spark streaming jobs to the cluster

SPARK_MASTER="spark://spark-master:7077"
KAFKA_PACKAGE="org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.0"

echo "Submitting Note Analytics job..."
docker exec scribbly-spark-master /opt/spark/bin/spark-submit \
  --master $SPARK_MASTER \
  --packages $KAFKA_PACKAGE \
  --conf spark.sql.streaming.checkpointLocation=/opt/spark-jobs/checkpoints \
  /opt/spark-jobs/note_analytics.py &

echo "Submitting Sync Analytics job..."
docker exec scribbly-spark-master /opt/spark/bin/spark-submit \
  --master $SPARK_MASTER \
  --packages $KAFKA_PACKAGE \
  --conf spark.sql.streaming.checkpointLocation=/opt/spark-jobs/checkpoints \
  /opt/spark-jobs/sync_analytics.py &

echo "Jobs submitted. Check Spark UI at http://localhost:8080"
