"""Load a trained Keras CNN and predict CIFAR-10 classes from a base64 image."""

import argparse
import base64
import json
import sys
from pathlib import Path

import tensorflow as tf

CIFAR10_LABELS = [
    "airplane",
    "automobile",
    "bird",
    "cat",
    "deer",
    "dog",
    "frog",
    "horse",
    "ship",
    "truck",
]


def parse_args():
    parser = argparse.ArgumentParser(description="Infer CIFAR-10 labels from a base64 image.")
    parser.add_argument("--model-path", type=Path, required=True, help="Path to the .keras model file")
    parser.add_argument("--image-base64", type=str, default=None, help="Base64-encoded image string")
    return parser.parse_args()


def load_image(image_base64):
    image_bytes = base64.b64decode(image_base64)
    image_tensor = tf.io.decode_image(image_bytes, channels=3, dtype=tf.dtypes.uint8)
    image_tensor = tf.image.resize(image_tensor, [32, 32])
    image_tensor = tf.cast(image_tensor, tf.float32) / 255.0
    image_tensor = tf.expand_dims(image_tensor, axis=0)
    return image_tensor


def main():
    args = parse_args()
    image_base64 = args.image_base64
    if not image_base64:
        image_base64 = sys.stdin.read().strip()

    if not image_base64:
        print(json.dumps({"error": "No image data provided."}))
        sys.exit(1)

    model = tf.keras.models.load_model(str(args.model_path))
    image_tensor = load_image(image_base64)

    predictions = model.predict(image_tensor)
    probabilities = predictions[0].tolist()
    predicted_index = int(tf.math.argmax(predictions[0]).numpy())
    predicted_label = CIFAR10_LABELS[predicted_index]

    result = {
        "predicted_index": predicted_index,
        "predicted_label": predicted_label,
        "probabilities": probabilities,
        "labels": CIFAR10_LABELS,
    }
    print(json.dumps(result))


if __name__ == "__main__":
    main()
