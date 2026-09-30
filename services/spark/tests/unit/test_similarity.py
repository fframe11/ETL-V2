import pytest

from sdoqap.semantic.similarity import char_ngrams, hybrid_similarity, ngram_cosine


def test_char_ngrams():
    assert char_ngrams(" AbC ") == ["ab", "bc"]
    assert char_ngrams("a") == []


def test_ngram_cosine_bounds():
    assert ngram_cosine("apple", "apple") == pytest.approx(1.0)
    assert ngram_cosine("ab", "cd") == 0.0
    assert ngram_cosine("a", "abc") == 0.0


def test_identical_and_case_insensitive_is_one():
    assert hybrid_similarity("Data Warehouse", " data warehouse ") == 1.0


def test_substring_scores_at_least_the_substring_weight():
    assert hybrid_similarity("warehouse", "data warehouse") >= 0.4


def test_unrelated_strings_score_low():
    assert hybrid_similarity("apple", "zebra") < 0.2


def test_engine_standardizer_uses_the_shared_function():
    import spark_quality_engine as eng
    std = eng.LocalSemanticStandardizer({"fruit": "Fruit"}, 0.5, "Other")
    for a, b in [("apple juice", "apple"), ("ข้าวผัด", "ข้าวผัดกุ้ง"), ("x", "y")]:
        assert std.hybrid_similarity(a, b) == hybrid_similarity(a, b)
