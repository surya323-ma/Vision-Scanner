import os
import io
import warnings

warnings.filterwarnings("ignore")

import numpy as np
from PIL import Image, UnidentifiedImageError

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

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
# Render's containers are ephemeral on redeploy, so this download can
# happen again after each deploy — that's expected and fine.
# ---------------------------------------------------------------------------
model = MobileNetV2(weights="imagenet")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # wildcard origins + credentials don't mix in browsers anyway
    allow_methods=["*"],
    allow_headers=["*"],
)

IMG_SIZE = (224, 224)
# ImageNet has 1000 classes, so raw top-1 scores run lower than a small
# custom classifier's. 0.15 is a reasonable "confident enough" floor.
CONFIDENCE_THRESHOLD = 0.15

MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # 8 MB
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"}


def preprocess_image(image_bytes):
    img = Image.open(io.BytesIO(image_bytes))
    img = img.convert("RGB")
    img = img.resize(IMG_SIZE)

    img_array = np.array(img)
    img_array = np.expand_dims(img_array, axis=0)
    img_array = preprocess_input(img_array)

    return img_array


def humanize_label(raw_label):
    """Turn ImageNet-style labels (e.g. 'german_shepherd') into 'German Shepherd'."""
    return raw_label.replace("_", " ").title()


@app.get("/health")
def health_check():
    """Render (and any uptime monitor) can hit this to confirm the app + model are ready."""
    return {"status": "ok", "model_loaded": model is not None}


@app.post("/classify")
async def classify_image(file: UploadFile = File(...)):
    # --- Basic validation before we touch the model ---
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")

    image_bytes = await file.read()

    if len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    if len(image_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image too large (max 8MB).")

    try:
        processed_img = preprocess_image(image_bytes)
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="Could not read this file as an image.")

    try:
        preds = model.predict(processed_img, verbose=0)
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

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Something went wrong: {str(e)}")


# Only expose the static ASSETS folder (css/js), never the project root —
# mounting "." would let anyone download app.py, requirements.txt, etc.
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def read_root():
    return FileResponse("index.html")
