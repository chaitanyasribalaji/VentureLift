---
name: testing-venturelift-ai
description: Test VentureLift AI validation features end-to-end (venture sector classifier, NLP analyzer). Use when verifying AI-related UI or API changes.
---

# Testing VentureLift AI Features

## Local Dev Setup

1. Ensure Node 24+ is active (`nvm use 24`) — required for `node:sqlite`
2. Install deps: `npm install` and `pip install -r requirements.txt`
3. Start the server: `PORT=3456 node server.mjs`
4. The app runs at `http://127.0.0.1:3456/`

## Demo Credentials

- **Founder**: `founder@venturelift.local` / `Founder@123`
- **Mentor**: `mentor@venturelift.local` / `Mentor@123`
- **Admin**: `admin@venturelift.local` / `Admin@123`

No external API keys are needed for local testing — AI features fall back to local heuristic mode automatically.

## Navigation to AI Features

1. Log in with any demo account
2. Click the **"AI Validation"** tab in the top navigation bar
3. The page has these panels (scroll down to see all):
   - **AI idea validation** — select a venture and run validation
   - **NLP market signal analyzer** — paste text and analyze
   - **Venture sector classifier** — upload an image to classify
   - **FAQ bot**, **Suggestion chat**, **Roadmap generator**

## Testing the Venture Sector Classifier

### UI Flow
1. Click "Choose image" to open file picker
2. Select an image file (PNG/JPG)
3. Image preview appears, "Classify sector" button becomes enabled
4. Click "Classify sector" — shows "Classifying venture sector..." loading state
5. Results appear in 4 sections:
   - **Suggested sector** with confidence percentage
   - **Venture insights** (3 actionable tips)
   - **Sector breakdown** (multiple sectors with percentages)
   - **Detected objects** (ImageNet class names with confidence)

### Generating Test Images

If you don't have real product images, generate synthetic test images with Python:

```python
from PIL import Image
import numpy as np

# Laptop-like image (triggers SaaS/Technology sector)
img = np.zeros((224, 224, 3), dtype=np.uint8)
img[40:180, 30:194] = [180, 180, 190]  # silver rectangle
img[50:170, 40:184] = [40, 40, 50]     # dark screen
Image.fromarray(img).save('/tmp/test_laptop.png')

# Food-like image (triggers different sector)
img2 = np.zeros((224, 224, 3), dtype=np.uint8)
for y in range(224):
    for x in range(224):
        dist = ((x-112)**2 + (y-112)**2)**0.5
        if dist < 80:
            img2[y, x] = [220, 140, 50]  # orange circle
Image.fromarray(img2).save('/tmp/test_food.png')
```

### Key Assertions
- Results should contain venture sector names (Healthtech, Fintech, SaaS, etc.), NOT CIFAR-10 labels (airplane, cat, truck)
- Different images should produce different sector classifications and different detected objects
- Confidence percentages should be between 0% and 100%
- The classification may take 10-20 seconds on first run (MobileNetV2 weights are downloaded and cached)

### Backend Details
- API endpoint: `POST /api/cnn-predict` with `{ "image_base64": "..." }`
- Backend calls `predict_venture.py` via `spawnSync`
- Model: MobileNetV2 pretrained on ImageNet (auto-downloaded by TensorFlow)
- Keyword matching: uses `keyword.lower() in name_lower` (one-directional substring match)

## Running Unit Tests

```bash
# Python tests (venture classifier)
python3 -m pytest tests/test_predict_venture.py tests/test_venture_classifier.py -v

# Node tests (backend + unit)
npm test
```

## Known Behaviors
- Synthetic/abstract images may not match any sector keywords, falling back to "General / Emerging"
- The file dialog in the browser may open to the last-used directory; navigate to `/tmp` if test images are stored there
- MobileNetV2 weights are cached in `~/.keras/` after first download
