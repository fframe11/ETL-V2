from sdoqap.pipeline.context import RunContext


def make_ctx(spark, rows, schema_spec, primary_key="id", date_column=None, rules=None, columns=None, **kw):
    """Build a RunContext around a small in-memory DataFrame; side effects are captured in lists."""
    columns = columns or list(schema_spec.keys())
    df = spark.createDataFrame(rows, columns) if rows else spark.createDataFrame([], ", ".join(f"{c} string" for c in columns))
    ctx = RunContext(spark=spark, table_name=kw.pop("table_name", "t"), run_id=kw.pop("run_id", "run_test"),
                     primary_key=primary_key, date_column=date_column, schema_spec=dict(schema_spec),
                     rules=rules or {}, **kw)
    ctx.df = df
    ctx.es_docs, ctx.alerts = [], []
    ctx.log_es = lambda index, doc: ctx.es_docs.append((index, doc))
    ctx.alert = lambda title, message, severity="warning": ctx.alerts.append((title, severity))
    return ctx
