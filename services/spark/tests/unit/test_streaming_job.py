import streaming_job


def test_a_new_stream_reads_the_topic_from_the_beginning():
    # The Reddit producer publishes its first batch before Spark has started. Reading from
    # "latest" skipped those posts for good, so nothing reached HDFS or Elasticsearch.
    assert streaming_job.KAFKA_OPTIONS["startingOffsets"] == "earliest"


def test_a_recreated_topic_does_not_crash_the_job():
    # startingOffsets only applies without a checkpoint; with one the job resumes. If the topic
    # was deleted and recreated, the old offsets no longer exist: carry on instead of failing.
    assert streaming_job.KAFKA_OPTIONS["failOnDataLoss"] == "false"


def test_subscribes_to_the_topic_the_producer_writes():
    assert streaming_job.KAFKA_OPTIONS["subscribe"] == "reddit_raw"
    assert streaming_job.KAFKA_OPTIONS["kafka.bootstrap.servers"] == "kafka:9092"
