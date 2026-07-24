from fastapi import FastAPI, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import io
import numpy as np
import warnings
warnings.filterwarnings('ignore')
from PIL import Image
import tensorflow as tf
from tensorflow.keras.applications.mobilenet_v2 import (
    MobileNetV2,
    preprocess_input,
    decode_predictions,
)

app = FastAPI()

# ---------------------------------------------------------------------------
# Model: pretrained MobileNetV2 (ImageNet weights, 1000 classes).
# Covers animals, birds, insects, plants, vehicles, devices, household
# objects, and more — no custom training required.
#
# Note: on first run this downloads ~14MB of weights from
# storage.googleapis.com, so the deploy environment needs outbound
# internet access once. After that, Keras caches them under ~/.keras.
# ---------------------------------------------------------------------------
model = MobileNetV2(weights="imagenet")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Development ke liye sabhi origins allowed hain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

IMG_SIZE = (224, 224)
# ImageNet has 1000 classes, so raw top-1 scores run lower than a small
# custom classifier's. 0.15 is a reasonable "confident enough" floor.
CONFIDENCE_THRESHOLD = 0.15


def preprocess_image(image_bytes):
    # 1. Bytes ko PIL Image mein convert karein
    img = Image.open(io.BytesIO(image_bytes))

    # 2. RGB mein convert karein (agar RGBA/PNG hai toh transparent layer hatane ke liye)
    img = img.convert("RGB")

    # 3. MobileNetV2 ke input size ke hisab se resize karein
    img = img.resize(IMG_SIZE)

    # 4. Numpy array banayein aur MobileNetV2 ke preprocessing apply karein
    img_array = np.array(img)
    img_array = np.expand_dims(img_array, axis=0)
    img_array = preprocess_input(img_array)

    return img_array


def humanize_label(raw_label):
    """Turn ImageNet-style labels (e.g. 'german_shepherd') into 'German Shepherd'."""
    return raw_label.replace("_", " ").title()


@app.post("/classify")
async def classify_image(file: UploadFile = File(...)):
    try:
        # Image bytes read karein
        image_bytes = await file.read()

        # Image ko process karein matrix mein
        processed_img = preprocess_image(image_bytes)

        # --- Model Prediction ---
        preds = model.predict(processed_img)
        decoded = decode_predictions(preds, top=5)[0]  # [(wnid, label, score), ...]

        top_label = humanize_label(decoded[0][1])
        top_confidence = float(decoded[0][2])

        if top_confidence < CONFIDENCE_THRESHOLD:
            return {
                "summary": "Couldn't confidently identify this. Try a clearer, closer, or better-lit shot.",
                "predictions": [],
            }

        predictions_list = [
            {"label": humanize_label(label), "confidence": float(score)}
            for (_, label, score) in decoded[:3]
        ]

        return {
            "summary": f"This looks like a {top_label}.",
            "predictions": predictions_list,
        }

    except Exception as e:
        return {"error": f"Something went wrong: {str(e)}"}


app.mount("/static", StaticFiles(directory="."), name="static")


@app.get('/')
def read_root():
    return FileResponse('index.html')
