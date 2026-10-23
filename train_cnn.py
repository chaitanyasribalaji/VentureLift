"""Train or retrain TensorFlow CNN models for VentureLift.

Supports:
1) --mode prototype (default): Trains the Entrepreneurial Prototype Matcher CNN with real-world products catalog.
2) --mode cifar10: Trains the original minimal CIFAR-10 model.
"""

import argparse
import os
from pathlib import Path

# Suppress TF verbose logging
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

import tensorflow as tf


def build_cifar_model(input_shape=(32, 32, 3), num_classes=10):
    return tf.keras.Sequential(
        [
            tf.keras.layers.Conv2D(32, (3, 3), activation="relu", input_shape=input_shape),
            tf.keras.layers.MaxPooling2D((2, 2)),
            tf.keras.layers.Conv2D(64, (3, 3), activation="relu"),
            tf.keras.layers.MaxPooling2D((2, 2)),
            tf.keras.layers.Conv2D(128, (3, 3), activation="relu"),
            tf.keras.layers.Flatten(),
            tf.keras.layers.Dropout(0.4),
            tf.keras.layers.Dense(128, activation="relu"),
            tf.keras.layers.Dense(num_classes, activation="softmax"),
        ]
    )


def load_cifar10():
    (x_train, y_train), (x_test, y_test) = tf.keras.datasets.cifar10.load_data()
    x_train = x_train.astype("float32") / 255.0
    x_test = x_test.astype("float32") / 255.0
    return x_train, y_train, x_test, y_test


def parse_args():
    parser = argparse.ArgumentParser(description="Train CNN model for VentureLift.")
    parser.add_argument("--mode", type=str, choices=["prototype", "cifar10"], default="prototype", help="Training mode")
    parser.add_argument("--epochs", type=int, default=8, help="Number of training epochs")
    parser.add_argument("--batch-size", type=int, default=32, help="Training batch size")
    parser.add_argument("--output-dir", type=Path, default=Path("models"), help="Directory to save the model")
    parser.add_argument("--model-name", type=str, default="cnn_prototype.keras", help="Model filename to save")
    return parser.parse_args()


def main():
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    if args.mode == "prototype":
        from train_cnn_prototype import main as train_prototype
        print("Launching Prototype Matcher & Real-World Product CNN training...")
        train_prototype()
        return

    print("Loading CIFAR-10 dataset...")
    x_train, y_train, x_test, y_test = load_cifar10()

    print(f"Training samples: {x_train.shape[0]}, test samples: {x_test.shape[0]}")
    print("Building model...")
    model = build_cifar_model(input_shape=x_train.shape[1:], num_classes=10)

    model.compile(
        optimizer="adam",
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )

    model.summary()

    print(f"Training for {args.epochs} epochs, batch size {args.batch_size}...")
    model.fit(
        x_train,
        y_train,
        epochs=args.epochs,
        batch_size=args.batch_size,
        validation_split=0.2,
        shuffle=True,
    )

    print("Evaluating model on test data...")
    test_loss, test_acc = model.evaluate(x_test, y_test, verbose=2)
    print(f"Test accuracy: {test_acc:.4f}, Test loss: {test_loss:.4f}")

    model_path = args.output_dir / args.model_name
    print(f"Saving trained model to {model_path}...")
    model.save(model_path)
    print("Model saved successfully.")


if __name__ == "__main__":
    main()
