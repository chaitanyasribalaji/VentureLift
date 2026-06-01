"""Lightweight local NLP predictor to improve on rule-based fallback.

Reads input text from stdin (or --text) and prints a JSON object with fields
similar to the app's `localNlp` output.
"""

import argparse
import json
import math
import re
import sys
from collections import Counter

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer


def extract_keywords(text, top_n=8):
    words = re.findall(r"\b[a-zA-Z]{4,}\b", text.lower())
    if not words:
        return ["startup", "customer", "innovation"]
    counts = Counter(words)
    common = [w for w, _ in counts.most_common(top_n)]

    # Use TF-IDF over single doc as heuristic: prefer rarer but informative tokens
    try:
        vec = TfidfVectorizer(ngram_range=(1, 2), max_features=2000)
        X = vec.fit_transform([text])
        scores = {t: X[0, idx] for t, idx in vec.vocabulary_.items()}
        ranked = sorted(scores.items(), key=lambda x: -x[1])
        tfidf_top = [t for t, _ in ranked[:top_n]]
        # combine frequency and tfidf
        combined = list(dict.fromkeys(common + tfidf_top))[:top_n]
        return combined
    except Exception:
        return common


def sentiment_simple(text):
    positive = set(["good", "grow", "strong", "grow", "profit", "win", "success", "positive", "improve"]) 
    negative = set(["risk", "problem", "fail", "loss", "no", "weak", "concern", "challenge"]) 
    words = set(re.findall(r"\b[a-zA-Z]{3,}\b", text.lower()))
    pos = len(words & positive)
    neg = len(words & negative)
    if pos > neg:
        return "positive and opportunity-focused"
    if neg > pos:
        return "cautious with identified risks"
    return "neutral or mixed"


def clarity_score(text):
    length = len(re.findall(r"\w+", text))
    score = max(30, min(95, 100 - abs(50 - length)))
    return int(score)


def improved_statement(text):
    # Very simple rewrite heuristic
    first_line = text.strip().split(".")
    summary = first_line[0][:200] if first_line else text[:200]
    return f"Concise: {summary.strip()}. Focus on earliest customer, clear metric of success, and one validated channel."


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--text", type=str, default=None)
    args = parser.parse_args()

    text = args.text or sys.stdin.read().strip()
    if not text:
        print(json.dumps({"error": "no text provided"}))
        sys.exit(1)

    keywords = extract_keywords(text)
    sentiment = sentiment_simple(text)
    clarity = clarity_score(text)

    result = {
        "keywords": keywords,
        "sentiment": sentiment,
        "clarity_score": clarity,
        "market_signals": [
            "Describes target users and a clear problem statement." if "customer" in text.lower() or "user" in text.lower() else "Signals need clearer customer definition.",
        ],
        "missing_information": ["Revenue model", "Acquisition channel", "User evidence"],
        "improved_statement": improved_statement(text),
    }

    print(json.dumps(result))


if __name__ == "__main__":
    main()
