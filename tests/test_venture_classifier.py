"""Direct unit tests for predict_venture.py sector mapping logic."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from predict_venture import SECTOR_MAP, classify_image
import base64
import numpy as np
from PIL import Image
from io import BytesIO


def _make_b64():
    arr = np.random.randint(0, 256, (64, 64, 3), dtype=np.uint8)
    img = Image.fromarray(arr)
    buf = BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


class TestSectorMap:
    def test_all_sectors_have_required_keys(self):
        for sector, info in SECTOR_MAP.items():
            assert "keywords" in info, f"{sector} missing keywords"
            assert "description" in info, f"{sector} missing description"
            assert "insights" in info, f"{sector} missing insights"
            assert len(info["keywords"]) > 0, f"{sector} has no keywords"
            assert len(info["insights"]) > 0, f"{sector} has no insights"

    def test_at_least_ten_sectors(self):
        assert len(SECTOR_MAP) >= 10

    def test_sector_names_are_strings(self):
        for sector in SECTOR_MAP:
            assert isinstance(sector, str)
            assert len(sector) > 0


class TestClassifyImage:
    def test_returns_expected_structure(self):
        b64 = _make_b64()
        result = classify_image(b64)
        assert "suggested_sector" in result
        assert "sector_confidence" in result
        assert "sector_scores" in result
        assert "detected_objects" in result
        assert "venture_insights" in result

    def test_detected_objects_have_name_and_confidence(self):
        b64 = _make_b64()
        result = classify_image(b64)
        for obj in result["detected_objects"]:
            assert "object" in obj
            assert "confidence" in obj
            assert 0 <= obj["confidence"] <= 1.0

    def test_sector_scores_sum_to_one(self):
        b64 = _make_b64()
        result = classify_image(b64)
        if result["sector_scores"] and result["sector_scores"][0]["sector"] != "General / Emerging":
            total = sum(s["confidence"] for s in result["sector_scores"])
            assert abs(total - 1.0) < 0.05
