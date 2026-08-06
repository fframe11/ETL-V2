from airflow import DAG
from airflow.providers.docker.operators.docker import DockerOperator
from datetime import datetime, timedelta

default_args = {
    "owner": "dataeng",
    "depends_on_past": False,
    "retries": 3,
    "retry_delay": timedelta(minutes=5),
}

with DAG(
    dag_id="sdoqap_semantic_cleaner_pipeline",
    default_args=default_args,
    description="Declarative DSL-driven PySpark Semantic Standardization Pipeline",
    schedule_interval="@daily",
    start_date=datetime(2026, 1, 1),
    catchup=False,
    tags=["data-eng", "batch", "standardization"],
) as dag:

    # Task to execute the packaged SemanticCleaner runner inside the Spark container
    run_standardization = DockerOperator(
        task_id="run_semantic_cleaner_job",
        image="dataengproj-spark-worker:latest",
        command=(
            "spark-submit "
            "--packages org.elasticsearch:elasticsearch-spark-30_2.12:8.10.2 "
            "/opt/spark-apps/run_semantic_cleaner.py "
            "--config /opt/spark-apps/remediation_rules.yaml "
            "--table unknown "
            "--input /opt/spark-apps/input_data_{{ ds }}.csv "
            "--output /opt/spark-apps/output_data_{{ ds }} "
            "--partition-date '{{ ds }}'"
        ),
        docker_url="unix://var/run/docker.sock",
        network_mode="sdoqap_network",
        auto_remove=True,
    )

    run_standardization
