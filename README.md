# Vision-Scanner
# Vision Scanner

Upload a photo or use your camera, and the app tells you what's in it — animals, birds, insects, plants, vehicles, gadgets, and hundreds of other everyday objects. Powered by a pretrained **MobileNetV2** (ImageNet, 1000 classes) — no custom training needed.

## Features

- 📤 Upload an image, or 📷 open your device camera and capture a photo
- Instant classification with top-3 predictions and confidence scores
- Clean, dark "field scanner" UI with animated scan effects
- Offline fallback: if the API is unreachable, the UI still shows a sample result based on the filename, so the demo never looks fully broken
- `/health` endpoint for uptime monitoring

## Tech Stack

| Layer      | Tech                                  |
|------------|----------------------------------------|
| Backend    | FastAPI + TensorFlow (MobileNetV2)     |
| Frontend   | Vanilla HTML / CSS / JS (no build step)|
| Server     | Uvicorn (ASGI)                         |
| Deployment | Render                                 |

## Project Structure

```
.
├── app.py              # FastAPI backend + model inference
├── requirements.txt     # Python dependencies
├── Procfile             # Start command for Render
├── render.yaml           # Render Blueprint config (optional one-click deploy)
├── index.html            # Frontend markup
└── static/
    ├── style.css        # Frontend styling
    └── script.js         # Frontend logic (upload, camera, API calls)
```

## Running Locally

**Requirements:** Python 3.10–3.11 recommended.

```bash
# 1. Clone the repo
git clone <your-repo-url>
cd <your-repo-folder>

# 2. Create a virtual environment (recommended)
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run the app
uvicorn app:app --reload
```

Open **http://localhost:8000** in your browser.

> First run downloads ~14MB of MobileNetV2 weights (needs internet once); after that it's cached under `~/.keras`.

## API Reference

### `POST /classify`
Classify an uploaded image.

- **Body:** `multipart/form-data` with a `file` field (jpeg/png/webp/gif/bmp, max 8MB)
- **Success response:**
  ```json
  {
    "summary": "This looks like a German Shepherd.",
    "predictions": [
      { "label": "German Shepherd", "confidence": 0.87 },
      { "label": "Collie", "confidence": 0.05 },
      { "label": "Border Collie", "confidence": 0.02 }
    ]
  }
  ```
- **Low-confidence response:**
  ```json
  { "summary": "Couldn't confidently identify this. Try a clearer, closer, or better-lit shot.", "predictions": [] }
  ```
- **Error responses:** `400` (bad/unsupported file), `413` (too large), `500` (server error)

### `GET /health`
Simple health check for uptime monitors / Render.
```json
{ "status": "ok", "model_loaded": true }
```

## Deploying to Render

1. Push this repo to GitHub (keep the folder structure above — `style.css` and `script.js` **must** live inside `static/`).
2. In Render: **New → Blueprint**, connect the repo. Render will read `render.yaml` and configure everything automatically.
   - Alternatively, **New → Web Service** manually with:
     - Build command: `pip install -r requirements.txt`
     - Start command: `uvicorn app:app --host 0.0.0.0 --port $PORT`
3. Wait for the first deploy — it installs TensorFlow and downloads model weights, so the first build can take a few minutes.
4. Once live, visit your Render URL to use the app.

> **Note on plan size:** TensorFlow + MobileNetV2 need more than the free tier's 512MB RAM in some cases. `render.yaml` defaults to the `starter` plan. If you want to try the free tier first, change `plan: free` in `render.yaml` — upgrade if it crashes on startup.

## Known Limitations

- Classifies from a fixed set of 1000 ImageNet categories — won't reliably recognize things outside that set (e.g. specific human faces, brand logos).
- Cold starts on Render can be slow the first time, since the model loads into memory on boot.
- The "offline sample result" in the frontend is a name-based guess for demo purposes only — it does not analyze the actual image.

## License

Add your preferred license here (e.g. MIT).
