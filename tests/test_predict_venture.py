"""Tests for predict_venture.py (venture sector image classifier)."""

import base64
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "predict_venture.py"


def make_test_image_b64() -> str:
    array = np.random.randint(0, 256, (224, 224, 3), dtype=np.uint8)
    image = Image.fromarray(array)
    from io import BytesIO

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def test_predict_returns_venture_fields():
    image_b64 = make_test_image_b64()
    result = subprocess.run(
        [sys.executable, str(SCRIPT)],
        input=image_b64,
        capture_output=True,
        text=True,
        check=True,
        timeout=120,
    )
    data = json.loads(result.stdout)
    assert "suggested_sector" in data
    assert "sector_confidence" in data
    assert "sector_scores" in data
    assert "detected_objects" in data
    assert "venture_insights" in data
    assert isinstance(data["sector_scores"], list)
    assert isinstance(data["detected_objects"], list)
    assert isinstance(data["venture_insights"], list)


def test_sector_confidence_is_valid():
    image_b64 = make_test_image_b64()
    result = subprocess.run(
        [sys.executable, str(SCRIPT)],
        input=image_b64,
        capture_output=True,
        text=True,
        check=True,
        timeout=120,
    )
    data = json.loads(result.stdout)
    assert 0 <= data["sector_confidence"] <= 1.0


def test_empty_input_exits_nonzero():
    result = subprocess.run(
        [sys.executable, str(SCRIPT)],
        input="",
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode != 0
