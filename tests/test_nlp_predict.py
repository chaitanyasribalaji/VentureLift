"""Tests for nlp_predict.py."""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "nlp_predict.py"


def run_nlp(text: str) -> dict:
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--text", text],
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)


def test_returns_required_keys():
    data = run_nlp("We help founders validate ideas with customer interviews and traction metrics.")
    for key in ("keywords", "sentiment", "clarity_score", "market_signals", "missing_information", "improved_statement"):
        assert key in data


def test_clarity_score_in_range():
    data = run_nlp("A short pitch about a fintech startup for small retailers.")
    assert 30 <= data["clarity_score"] <= 95


def test_empty_text_exits_nonzero():
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--text", ""],
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0
