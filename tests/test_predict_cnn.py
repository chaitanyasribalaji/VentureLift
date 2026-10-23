"""Tests for predict_cnn.py (requires trained model)."""

import base64
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "predict_cnn.py"
MODEL = ROOT / "models" / "cnn_cifar10.keras"


def make_test_image_b64() -> str:
    array = np.random.randint(0, 256, (32, 32, 3), dtype=np.uint8)
    image = Image.fromarray(array)
    from io import BytesIO

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def test_model_file_exists():
    assert MODEL.exists(), f"Train the model first: python train_cnn.py --epochs 1 --output-dir models"


def test_predict_returns_cifar10_labels():
    image_b64 = make_test_image_b64()
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--model-path", str(MODEL), "--image-base64", image_b64],
        capture_output=True,
        text=True,
        check=True,
    )
    data = json.loads(result.stdout)
    assert "predicted_label" in data
    assert "probabilities" in data
    assert len(data["probabilities"]) == 10
    assert data["predicted_label"] in data["labels"]
