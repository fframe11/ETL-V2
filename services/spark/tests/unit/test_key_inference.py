from sdoqap.common.keys import id_candidates, infer_primary_key


def frame(spark, rows, columns):
    return spark.createDataFrame(rows, columns)


def test_unique_id_column_is_the_key(spark):
    df = frame(spark, [(i, f"n{i}") for i in range(1, 51)], ["id", "name"])
    assert infer_primary_key(df, "t") == "id"


def test_exact_id_name_wins_over_other_id_like_columns(spark):
    df = frame(spark, [(i, i + 100) for i in range(1, 51)], ["order_id", "orders_id"])
    assert infer_primary_key(df, "orders") == "orders_id"


def test_non_unique_id_column_is_not_the_key_but_a_unique_composite_is(spark):
    # 25 students x 4 courses x 2 semesters: student_id alone repeats, the triple is unique.
    rows = [(s, c, sem, 50.0 + s % 40) for s in range(1, 26) for c in ("DW", "ML", "DB", "PY") for sem in ("1/2026", "2/2026")]
    df = frame(spark, rows, ["student_id", "course", "semester", "score"])
    assert infer_primary_key(df, "scores") == ["student_id", "course", "semester"]


def test_a_few_duplicate_rows_do_not_hide_the_composite_key(spark):
    rows = [(s, c, sem, 70.0) for s in range(1, 126) for c in ("DW", "ML", "DB", "PY") for sem in ("1/2026", "2/2026")]
    rows += rows[:30]  # 30 dirty duplicate rows out of 1030, like the student scores sample
    df = frame(spark, rows, ["student_id", "course", "semester", "score"])
    assert infer_primary_key(df, "scores") == ["student_id", "course", "semester"]


def test_the_smallest_composite_is_preferred(spark):
    rows = [(s, c, 1.0) for s in range(1, 41) for c in ("A", "B", "C")]
    df = frame(spark, rows, ["student_id", "course", "score"])
    assert infer_primary_key(df, "t") == ["student_id", "course"]


def test_numeric_measures_are_never_part_of_a_guessed_key(spark):
    # student_id + study_hours might look unique by accident; only text/date columns qualify.
    rows = [(s % 10, s, "x") for s in range(100)]
    df = frame(spark, rows, ["student_id", "study_hours", "course"])
    assert infer_primary_key(df, "t") is None


def test_no_id_like_column_means_no_guess(spark):
    assert infer_primary_key(frame(spark, [(1, "a"), (2, "b")], ["n", "label"]), "t") is None


def test_id_like_column_with_no_workable_key_means_no_guess(spark):
    # Caller falls back to a row hash, which keeps every row instead of merging them away.
    df = frame(spark, [(1, 5.0)] * 20 + [(2, 6.0)] * 20, ["student_id", "score"])
    assert infer_primary_key(df, "t") is None


def test_second_id_like_column_is_used_when_the_first_repeats(spark):
    rows = [(i % 3, f"u{i}", i) for i in range(60)]
    df = frame(spark, rows, ["valid_flag", "user_id", "n"])
    assert infer_primary_key(df, "t") == "user_id"


def test_empty_dataset_keeps_the_first_candidate(spark):
    df = spark.createDataFrame([], "student_id int, course string")
    assert infer_primary_key(df, "t") == "student_id"


def test_id_candidates_order():
    assert id_candidates(["name", "user_id", "id", "paid"], "t") == ["id", "user_id", "paid"]
    assert id_candidates(["a", "b"], "t") == []
