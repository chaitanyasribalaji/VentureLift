"""Train a CIFAR-10 classifier using transfer learning (MobileNetV2 backbone).

This script implements a two-phase training workflow:
  1) Train a top classifier with the backbone frozen.
  2) Optionally unfreeze the backbone (last N layers) and fine-tune.

It uses callbacks (ModelCheckpoint, EarlyStopping, ReduceLROnPlateau) and
works with a small `--subset` for quick smoke tests.
"""

import argparse
from pathlib import Path
import sys

import tensorflow as tf


def build_transfer_model(input_shape=(160, 160, 3), num_classes=10, dropout=0.4):
    base = tf.keras.applications.MobileNetV2(include_top=False, input_shape=input_shape, weights="imagenet")
    base.trainable = False

    inputs = tf.keras.Input(shape=input_shape)
    x = tf.keras.applications.mobilenet_v2.preprocess_input(inputs)
    x = base(x, training=False)
    x = tf.keras.layers.GlobalAveragePooling2D()(x)
    x = tf.keras.layers.Dropout(dropout)(x)
    x = tf.keras.layers.Dense(256, activation="relu")(x)
    outputs = tf.keras.layers.Dense(num_classes, activation="softmax")(x)
    model = tf.keras.Model(inputs, outputs)
    return model, base


def prepare_datasets(x_train, y_train, x_test, y_test, input_size=(160, 160), batch_size=64, subset=None, augment=False):
    if subset:
        x_train = x_train[:subset]
        y_train = y_train[:subset]
        x_test = x_test[:min(len(x_test), max(100, subset // 5))]
        y_test = y_test[:len(x_test)]

    data_augmentation = tf.keras.Sequential([
        tf.keras.layers.RandomFlip("horizontal"),
        tf.keras.layers.RandomRotation(0.08),
        tf.keras.layers.RandomZoom(0.08),
    ])

    def preprocess(image, label):
        image = tf.image.resize(image, input_size)
        image = tf.cast(image, tf.float32) / 255.0
        if augment:
            image = data_augmentation(image)
        return image, label

    train_ds = tf.data.Dataset.from_tensor_slices((x_train, y_train)).shuffle(10000).map(preprocess, num_parallel_calls=tf.data.AUTOTUNE).batch(batch_size).prefetch(tf.data.AUTOTUNE)
    val_ds = tf.data.Dataset.from_tensor_slices((x_test, y_test)).map(lambda im, lb: (tf.image.resize(im, input_size) / 255.0, lb)).batch(batch_size).prefetch(tf.data.AUTOTUNE)
    return train_ds, val_ds


def parse_args():
    parser = argparse.ArgumentParser(description="Train transfer learning CNN on CIFAR-10 (two-phase)")
    parser.add_argument("--initial-epochs", type=int, default=5)
    parser.add_argument("--fine-tune-epochs", type=int, default=5)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--output-dir", type=Path, default=Path("models"))
    parser.add_argument("--model-name", type=str, default="cnn_cifar10_transfer.keras")
    parser.add_argument("--input-size", type=int, default=160)
    parser.add_argument("--unfreeze-layers", type=int, default=30, help="Number of layers at end of backbone to unfreeze when fine-tuning (0 = unfreeze all)")
    parser.add_argument("--subset", type=int, default=0, help="Train on a subset (for smoke tests). 0 = full dataset")
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--fine-tune-lr", type=float, default=1e-4)
    return parser.parse_args()


def main():
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    model_path = args.output_dir / args.model_name

    print("Loading CIFAR-10...")
    (x_train, y_train), (x_test, y_test) = tf.keras.datasets.cifar10.load_data()

    # allow subset for quick smoke tests
    subset = args.subset if args.subset > 0 else None

    print("Preparing datasets (this avoids converting entire arrays to numpy)...")
    train_ds, val_ds = prepare_datasets(x_train, y_train, x_test, y_test, input_size=(args.input_size, args.input_size), batch_size=args.batch_size, subset=subset, augment=True)

    print("Building transfer model...")
    model, base = build_transfer_model(input_shape=(args.input_size, args.input_size, 3), num_classes=10)
    model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=args.learning_rate), loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    model.summary()

    callbacks = [
        tf.keras.callbacks.ModelCheckpoint(str(model_path) + ".weights.h5", save_best_only=True, save_weights_only=True, monitor="val_loss"),
        tf.keras.callbacks.EarlyStopping(patience=4, restore_best_weights=True),
        tf.keras.callbacks.ReduceLROnPlateau(factor=0.5, patience=2),
    ]

    print(f"Training top layers for {args.initial_epochs} epochs...")
    model.fit(train_ds, epochs=args.initial_epochs, validation_data=val_ds, callbacks=callbacks)

    if args.fine_tune_epochs > 0:
        print("Preparing for fine-tuning: unfreezing backbone...")
        base.trainable = True
        if args.unfreeze_layers > 0:
            # freeze first layers, unfreeze last `unfreeze_layers`
            for layer in base.layers[:-args.unfreeze_layers]:
                layer.trainable = False
        else:
            for layer in base.layers:
                layer.trainable = True

        model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=args.fine_tune_lr), loss="sparse_categorical_crossentropy", metrics=["accuracy"])
        print(f"Fine-tuning for {args.fine_tune_epochs} epochs at lr={args.fine_tune_lr}...")
        model.fit(train_ds, epochs=args.fine_tune_epochs, validation_data=val_ds, callbacks=callbacks)

    # If checkpoint exists, load best and save as final .keras
    ckpt = str(model_path) + ".checkpoint"
    try:
        if Path(ckpt).exists():
            print("Loading best checkpoint and saving final model...")
            model.load_weights(ckpt)
    except Exception as e:
        print("Warning: could not load checkpoint:", e)

    print("Saving model to", model_path)
    model.save(model_path)
    print("Saved transfer model successfully.")


if __name__ == "__main__":
    main()
