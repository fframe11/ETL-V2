import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ensure_env_keys import ensure, main

FULL = ("SESSION_SECRET_KEY=a\nALERT_WEBHOOK_SECRET=b\nINGEST_SERVICE_KEY=c\n"
        "TRIGGER_SHARED_SECRET=d\nGROQ_API_KEY=gsk_x\n")


def test_complete_file_is_left_untouched():
    assert ensure(FULL) == (FULL, [], [])


def test_empty_and_absent_local_secrets_are_generated():
    text = ("# comment\nADMIN_USERNAME=admin\nSESSION_SECRET_KEY=\nALERT_WEBHOOK_SECRET=b\n"
            "INGEST_SERVICE_KEY=c\nGROQ_API_KEY=gsk_x\n")
    new_text, created, missing = ensure(text, generate=lambda: "GENERATED")
    assert created == ["SESSION_SECRET_KEY", "TRIGGER_SHARED_SECRET"]
    assert missing == []
    assert new_text == ("# comment\nADMIN_USERNAME=admin\nSESSION_SECRET_KEY=GENERATED\nALERT_WEBHOOK_SECRET=b\n"
                        "INGEST_SERVICE_KEY=c\nGROQ_API_KEY=gsk_x\nTRIGGER_SHARED_SECRET=GENERATED\n")


def test_groq_key_is_reported_and_never_invented():
    text = FULL.replace("GROQ_API_KEY=gsk_x\n", "GROQ_API_KEY=\n")
    assert ensure(text) == (text, [], ["GROQ_API_KEY"])


def test_main_writes_once_and_prints_no_value(tmp_path, capsys):
    env = tmp_path / ".env"
    env.write_text("ALERT_WEBHOOK_SECRET=keepme\n", encoding="utf-8")
    assert main([str(env)]) == 1  # GROQ_API_KEY is still missing
    first = env.read_text(encoding="utf-8")
    generated = first.split("SESSION_SECRET_KEY=")[1].split("\n")[0]
    out = capsys.readouterr().out
    assert "ALERT_WEBHOOK_SECRET=keepme" in first and len(generated) >= 32
    assert "keepme" not in out and generated not in out
    main([str(env)])
    assert env.read_text(encoding="utf-8") == first


def test_check_mode_never_writes(tmp_path):
    env = tmp_path / ".env"
    env.write_text("X=1\n", encoding="utf-8")
    assert main(["--check", str(env)]) == 1
    assert env.read_text(encoding="utf-8") == "X=1\n"
