"""Direct unit tests for individual functions in nlp_predict.py.

The existing test_nlp_predict.py exercises the script via subprocess.
These tests import the functions directly for faster, more granular coverage
of extract_keywords, sentiment_simple, clarity_score, and improved_statement.
"""

import sys
from pathlib import Path

# Make the repo root importable so we can import nlp_predict as a module.
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from nlp_predict import extract_keywords, sentiment_simple, clarity_score, improved_statement


# ── extract_keywords ─────────────────────────────────────────────────


class TestExtractKeywords:
    def test_returns_list(self):
        result = extract_keywords("We help clinics automate follow-up reminders for patients.")
        assert isinstance(result, list)

    def test_respects_top_n(self):
        text = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda"
        result = extract_keywords(text, top_n=3)
        assert len(result) <= 3

    def test_filters_short_words(self):
        result = extract_keywords("a an the is it at of to by")
        # All words are <4 chars, so fallback defaults should appear
        assert len(result) > 0

    def test_returns_defaults_for_empty_words(self):
        result = extract_keywords("a b c")
        assert "startup" in result or "customer" in result or "innovation" in result

    def test_returns_relevant_keywords(self):
        text = "fintech startup payments mobile wallet banking transactions"
        result = extract_keywords(text, top_n=5)
        assert any(k in ["fintech", "startup", "payments", "mobile", "wallet", "banking", "transactions"] for k in result)


# ── sentiment_simple ─────────────────────────────────────────────────


class TestSentimentSimple:
    def test_positive_sentiment(self):
        result = sentiment_simple("The product is strong and growing with good profit margins.")
        assert "positive" in result.lower()

    def test_negative_sentiment(self):
        result = sentiment_simple("The risk of failure is high due to weak market and many problems.")
        assert "cautious" in result.lower() or "risk" in result.lower()

    def test_neutral_sentiment(self):
        result = sentiment_simple("The team is building a product for customers.")
        assert "neutral" in result.lower() or "mixed" in result.lower()

    def test_returns_string(self):
        result = sentiment_simple("anything")
        assert isinstance(result, str)
        assert len(result) > 0


# ── clarity_score ────────────────────────────────────────────────────


class TestClarityScore:
    def test_score_is_integer(self):
        result = clarity_score("A simple pitch about a product.")
        assert isinstance(result, int)

    def test_score_clamped_low(self):
        # Very short text
        result = clarity_score("Hi")
        assert result >= 30

    def test_score_clamped_high(self):
        # Very long text (>100 words)
        text = " ".join(["word"] * 200)
        result = clarity_score(text)
        assert result <= 95

    def test_medium_text_scores_well(self):
        text = " ".join(["word"] * 50)
        result = clarity_score(text)
        assert result >= 80

    def test_score_in_valid_range(self):
        result = clarity_score("A fintech startup for small retailers that tracks cash flow.")
        assert 30 <= result <= 95


# ── improved_statement ───────────────────────────────────────────────


class TestImprovedStatement:
    def test_returns_string(self):
        result = improved_statement("We help clinics.")
        assert isinstance(result, str)

    def test_starts_with_concise(self):
        result = improved_statement("We build tools for founders.")
        assert result.startswith("Concise:")

    def test_includes_guidance(self):
        result = improved_statement("A platform for mentors.")
        assert "customer" in result.lower() or "metric" in result.lower() or "channel" in result.lower()

    def test_truncates_long_input(self):
        long_text = "A" * 500 + ". Second sentence."
        result = improved_statement(long_text)
        # The summary portion should be truncated to 200 chars
        assert len(result) < 500

    def test_handles_empty_input(self):
        result = improved_statement("")
        assert isinstance(result, str)
        assert len(result) > 0
