"""Classify product/prototype images into venture-relevant business sectors.

Uses MobileNetV2 (pretrained on ImageNet) to identify objects in the image,
then maps detected objects to entrepreneurial sectors with confidence scores
and actionable insights for founders.
"""

import argparse
import base64
import json
import sys
from io import BytesIO

import numpy as np
import tensorflow as tf

# ── Sector mapping ───────────────────────────────────────────────────
# Each sector has keyword fragments matched against ImageNet class names.
# A class like "stethoscope" matches the "stethoscope" keyword in Healthtech.

SECTOR_MAP = {
    "Healthtech": {
        "keywords": [
            "stethoscope", "syringe", "pill_bottle", "medicine", "oxygen_mask",
            "neck_brace", "stretcher", "hospital", "ambulance", "band_aid",
            "thermometer", "mask", "scrub", "wheelchair",
        ],
        "description": "Healthcare, medical devices, clinical tools, and patient care technology.",
        "insights": [
            "Product appears related to healthcare or medical equipment.",
            "Consider regulatory requirements (HIPAA, FDA) for your target market.",
            "Key opportunities: telemedicine, remote monitoring, clinical workflow automation.",
        ],
    },
    "Fintech": {
        "keywords": [
            "safe", "vault", "cash_machine", "atm", "coin", "wallet",
            "abacus", "calculator", "credit_card", "piggy_bank",
        ],
        "description": "Financial services, payments, banking, and money management.",
        "insights": [
            "Product appears related to financial services or payment infrastructure.",
            "Focus on trust signals, security certifications, and compliance.",
            "Key opportunities: embedded finance, micro-lending, digital payments.",
        ],
    },
    "Foodtech": {
        "keywords": [
            "restaurant", "menu", "espresso", "coffee", "pizza", "bakery",
            "grocery", "pot", "wok", "frying_pan", "spatula", "crock_pot",
            "toaster", "microwave", "refrigerator", "mixing_bowl",
            "plate", "cup", "goblet", "wine_bottle", "beer_glass",
            "ice_cream", "pretzel", "cheeseburger", "hotdog", "burrito",
            "guacamole", "carbonara", "meat_loaf", "banana", "orange",
            "lemon", "strawberry", "pineapple", "pomegranate", "fig",
        ],
        "description": "Food production, delivery, restaurant tech, and agriculture processing.",
        "insights": [
            "Product appears related to food, beverage, or restaurant operations.",
            "Consider food safety certifications and supply chain logistics.",
            "Key opportunities: cloud kitchens, food delivery optimization, sustainable packaging.",
        ],
    },
    "Agritech": {
        "keywords": [
            "tractor", "harvester", "thresher", "plow", "hay", "barn",
            "greenhouse", "garden", "lawn_mower", "chainsaw", "hatchet",
            "corn", "mushroom", "acorn", "seed", "bee", "honeycomb",
        ],
        "description": "Agriculture technology, farming tools, and crop management.",
        "insights": [
            "Product appears related to agriculture or farming operations.",
            "Consider partnerships with farmer cooperatives and agricultural extension services.",
            "Key opportunities: precision farming, supply chain traceability, crop monitoring.",
        ],
    },
    "Mobility / Logistics": {
        "keywords": [
            "freight_car", "trailer_truck", "moving_van", "container_ship",
            "forklift", "trolleybus", "minibus", "school_bus", "cab",
            "racer", "sports_car", "convertible", "limousine", "jeep",
            "bicycle", "mountain_bike", "moped", "motor_scooter",
            "rickshaw", "shopping_cart", "barrow",
        ],
        "description": "Transportation, logistics, delivery, and mobility services.",
        "insights": [
            "Product appears related to transportation or logistics.",
            "Focus on route optimization, fleet management, or last-mile delivery.",
            "Key opportunities: EV infrastructure, micro-mobility, warehouse automation.",
        ],
    },
    "SaaS / Technology": {
        "keywords": [
            "laptop", "notebook", "desktop_computer", "monitor", "screen",
            "keyboard", "mouse", "joystick", "printer", "scanner",
            "modem", "router", "switch", "hard_disc", "CD_player",
            "iPod", "cellular_telephone", "smartphone", "dial_telephone",
            "web_site", "projector",
        ],
        "description": "Software, cloud computing, digital tools, and IT infrastructure.",
        "insights": [
            "Product appears to be in the technology or software space.",
            "Focus on user activation metrics and retention before scaling.",
            "Key opportunities: vertical SaaS, API-first platforms, AI-powered workflows.",
        ],
    },
    "Hardware / IoT": {
        "keywords": [
            "electric_fan", "space_heater", "vacuum", "washer", "dryer",
            "iron", "toaster", "remote_control", "television", "CRT_screen",
            "radio", "tape_player", "speaker", "loudspeaker", "microphone",
            "headphone", "earphone", "solar_dish", "power_drill",
            "screwdriver", "hammer", "wrench", "plunger", "rule",
            "digital_watch", "analog_clock", "stopwatch", "odometer",
            "magnetic_compass", "binoculars", "tripod", "lens_cap",
            "Polaroid_camera", "reflex_camera", "digital_camera",
        ],
        "description": "Physical products, consumer electronics, sensors, and connected devices.",
        "insights": [
            "Product appears to be a physical device or consumer electronic.",
            "Consider manufacturing costs, supply chain, and hardware margins.",
            "Key opportunities: smart home, wearables, industrial IoT, sensor networks.",
        ],
    },
    "Edtech": {
        "keywords": [
            "book_jacket", "notebook", "pencil_box", "pencil_sharpener",
            "rubber_eraser", "binder", "library", "desk", "fountain_pen",
            "ballpoint", "quill", "crayon", "paper_towel",
        ],
        "description": "Education technology, learning platforms, and skill development.",
        "insights": [
            "Product appears related to education or learning tools.",
            "Focus on measurable learning outcomes and engagement metrics.",
            "Key opportunities: micro-credentials, cohort-based learning, AI tutoring.",
        ],
    },
    "Fashion / Retail": {
        "keywords": [
            "suit", "gown", "kimono", "jean", "jersey", "T-shirt",
            "sweatshirt", "cardigan", "fur_coat", "trench_coat",
            "poncho", "sarong", "bikini", "swimming_trunks",
            "running_shoe", "sandal", "boot", "loafer", "clog",
            "sunglass", "bow_tie", "neck_brace", "wig",
            "handbag", "purse", "backpack", "wallet", "shopping_basket",
            "perfume", "lipstick", "sunscreen",
        ],
        "description": "Apparel, accessories, beauty, and retail commerce.",
        "insights": [
            "Product appears related to fashion, apparel, or retail.",
            "Consider direct-to-consumer channels and social commerce.",
            "Key opportunities: sustainable fashion, personalization, resale platforms.",
        ],
    },
    "Climate / Energy": {
        "keywords": [
            "solar_dish", "solar_panel", "windmill", "dam", "volcano",
            "geyser", "lakeside", "valley", "seashore", "coral_reef",
        ],
        "description": "Clean energy, sustainability, and environmental technology.",
        "insights": [
            "Product appears related to energy or environmental sustainability.",
            "Explore grant funding and government incentive programs.",
            "Key opportunities: carbon tracking, renewable microgrids, circular economy.",
        ],
    },
    "Entertainment / Media": {
        "keywords": [
            "cinema", "stage", "theater_curtain", "spotlight",
            "electric_guitar", "acoustic_guitar", "drum", "drumstick",
            "piano", "organ", "harmonica", "violin", "cello", "flute",
            "maraca", "marimba", "banjo", "sax", "oboe", "trombone",
            "French_horn", "cornet",
        ],
        "description": "Music, film, gaming, live events, and media production.",
        "insights": [
            "Product appears related to entertainment or media production.",
            "Consider creator economy models and content monetization.",
            "Key opportunities: live streaming, creator tools, AI-generated content.",
        ],
    },
    "Sports / Fitness": {
        "keywords": [
            "barbell", "dumbbell", "punching_bag", "basketball",
            "soccer_ball", "volleyball", "tennis_ball", "golf_ball",
            "baseball", "ping-pong_ball", "rugby_ball", "ski", "snowboard",
            "surfboard", "paddle", "racket", "balance_beam",
            "horizontal_bar", "parallel_bars",
        ],
        "description": "Fitness equipment, sports technology, and wellness platforms.",
        "insights": [
            "Product appears related to sports or physical fitness.",
            "Focus on community building and gamification of fitness goals.",
            "Key opportunities: connected fitness, recovery tech, sports analytics.",
        ],
    },
    "Construction / PropTech": {
        "keywords": [
            "crane", "forklift", "bulldozer", "steam_shovel",
            "tile_roof", "thatch", "stone_wall", "picket_fence",
            "chain_link_fence", "worm_fence", "window_shade",
            "sliding_door", "doormat", "toilet_seat", "bathtub",
            "shower_curtain", "fire_screen",
        ],
        "description": "Real estate, construction tools, and building technology.",
        "insights": [
            "Product appears related to construction or real estate.",
            "Consider regulatory approvals and building code compliance.",
            "Key opportunities: modular construction, property management software, green building.",
        ],
    },
    "Security / Defense": {
        "keywords": [
            "rifle", "assault_rifle", "revolver", "holster",
            "missile", "tank", "warplane", "aircraft_carrier",
            "bulletproof_vest", "shield", "lock", "padlock",
            "combination_lock", "chain", "prison", "fire_engine",
        ],
        "description": "Cybersecurity, physical security, and defense technology.",
        "insights": [
            "Product appears related to security or defense.",
            "Focus on compliance certifications and government procurement channels.",
            "Key opportunities: identity verification, threat detection, access control.",
        ],
    },
    "Pet / Animal Care": {
        "keywords": [
            "golden_retriever", "labrador", "poodle", "dalmatian",
            "german_shepherd", "rottweiler", "beagle", "chihuahua",
            "husky", "collie", "boxer", "bulldog", "pug",
            "tabby", "persian_cat", "siamese_cat", "tiger_cat",
            "Egyptian_cat", "hamster", "guinea_pig", "rabbit",
            "parrot", "macaw", "cockatoo", "toucan", "goldfish",
        ],
        "description": "Pet care products, veterinary tech, and animal services.",
        "insights": [
            "Product appears related to pet care or animal services.",
            "Consider subscription models for recurring pet supply needs.",
            "Key opportunities: pet health monitoring, pet insurance, on-demand vet care.",
        ],
    },
}


def classify_image(image_base64):
    """Classify a base64 image and return venture-relevant sector analysis."""
    image_bytes = base64.b64decode(image_base64)
    image_tensor = tf.io.decode_image(image_bytes, channels=3, dtype=tf.dtypes.uint8)
    image_tensor = tf.image.resize(image_tensor, [224, 224])
    image_tensor = tf.cast(image_tensor, tf.float32)
    image_tensor = tf.keras.applications.mobilenet_v2.preprocess_input(image_tensor)
    image_tensor = tf.expand_dims(image_tensor, axis=0)

    model = tf.keras.applications.MobileNetV2(weights="imagenet")
    predictions = model.predict(image_tensor, verbose=0)
    decoded = tf.keras.applications.mobilenet_v2.decode_predictions(predictions, top=10)[0]

    # Map detected objects to sectors
    sector_scores = {}
    matched_objects = []

    for _class_id, class_name, confidence in decoded:
        name_lower = class_name.lower().replace(" ", "_")
        matched_objects.append({"object": class_name.replace("_", " "), "confidence": round(float(confidence), 4)})

        for sector, info in SECTOR_MAP.items():
            for keyword in info["keywords"]:
                if keyword.lower() in name_lower or name_lower in keyword.lower():
                    sector_scores[sector] = sector_scores.get(sector, 0) + float(confidence)
                    break

    # Normalize and sort sectors
    total = sum(sector_scores.values()) or 1.0
    sector_results = []
    for sector, raw_score in sorted(sector_scores.items(), key=lambda x: -x[1]):
        info = SECTOR_MAP[sector]
        sector_results.append({
            "sector": sector,
            "confidence": round(raw_score / total, 4),
            "description": info["description"],
            "insights": info["insights"],
        })

    # If no sector matched, provide a general fallback
    if not sector_results:
        top_object = matched_objects[0]["object"] if matched_objects else "unknown"
        sector_results.append({
            "sector": "General / Emerging",
            "confidence": 1.0,
            "description": "The image does not clearly map to a known venture sector.",
            "insights": [
                f"Detected object: {top_object}. Consider how this relates to your venture.",
                "Upload a product photo, prototype screenshot, or market-relevant image for better classification.",
                "You can also describe your venture in the text fields for NLP-based analysis.",
            ],
        })

    suggested_sector = sector_results[0]["sector"]

    return {
        "suggested_sector": suggested_sector,
        "sector_confidence": sector_results[0]["confidence"],
        "sector_scores": sector_results[:5],
        "detected_objects": matched_objects[:5],
        "venture_insights": sector_results[0]["insights"],
    }


def main():
    parser = argparse.ArgumentParser(description="Classify an image into venture-relevant sectors.")
    parser.add_argument("--image-base64", type=str, default=None, help="Base64-encoded image string")
    args = parser.parse_args()

    image_base64 = args.image_base64
    if not image_base64:
        image_base64 = sys.stdin.read().strip()

    if not image_base64:
        print(json.dumps({"error": "No image data provided."}))
        sys.exit(1)

    # Strip data URI prefix if present
    if "," in image_base64 and image_base64.startswith("data:"):
        image_base64 = image_base64.split(",", 1)[1]

    result = classify_image(image_base64)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
