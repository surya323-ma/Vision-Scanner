const imageInput = document.getElementById('imageInput');
const classifyBtn = document.getElementById('classifyBtn');
const previewImage = document.getElementById('previewImage');
const cameraFeed = document.getElementById('cameraFeed');
const captureCanvas = document.getElementById('captureCanvas');
const captureBtn = document.getElementById('captureBtn');
const resetBtn = document.getElementById('resetBtn');
const cameraBtn = document.getElementById('cameraBtn');
const resultBox = document.getElementById('resultBox');
const emptyState = document.getElementById('emptyState');
const mediaFrame = document.getElementById('mediaFrame');

let currentImageDataUrl = '';
let currentImageFile = null;
let currentStream = null;

function showEmptyState() {
  emptyState.hidden = false;
}

function hideEmptyState() {
  emptyState.hidden = true;
}

function setPreviewFromDataUrl(dataUrl) {
  currentImageDataUrl = dataUrl;
  currentImageFile = null;

  previewImage.src = dataUrl;
  previewImage.hidden = false;
  previewImage.style.display = 'block';
  cameraFeed.hidden = true;

  captureBtn.style.display = 'none';
  resetBtn.style.display = 'inline-block';
  hideEmptyState();

  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
    currentStream = null;
  }
  cameraFeed.srcObject = null;
  classifyBtn.disabled = false;
}

function setPreviewFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    setPreviewFromDataUrl(reader.result);
    currentImageFile = file;
  };
  reader.readAsDataURL(file);
}

async function openCamera() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera is not supported on this browser.');
    }

    if (currentStream) {
      currentStream.getTracks().forEach((track) => track.stop());
    }

    currentStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });

    // New capture ke liye purani image ko pura saaf karein
    currentImageDataUrl = '';
    previewImage.src = '';
    previewImage.hidden = true;
    previewImage.style.display = 'none';

    // Video feed ko active karein
    cameraFeed.srcObject = currentStream;
    cameraFeed.hidden = false;

    captureBtn.style.display = 'inline-block';
    resetBtn.style.display = 'inline-block';
    hideEmptyState();

    resultBox.innerHTML = '<p class="placeholder">Frame your subject, then scan to identify it.</p>';
    classifyBtn.disabled = true;
  } catch (error) {
    resultBox.innerHTML = '<p class="error">Unable to access the camera. Please allow camera permission or use the upload option.</p>';
    console.error(error);
  }
}

function capturePhoto() {
  if (!currentStream) return;

  const width = cameraFeed.videoWidth || 640;
  const height = cameraFeed.videoHeight || 480;
  captureCanvas.width = width;
  captureCanvas.height = height;

  const context = captureCanvas.getContext('2d');
  context.drawImage(cameraFeed, 0, 0, width, height);
  const dataUrl = captureCanvas.toDataURL('image/png');
  setPreviewFromDataUrl(dataUrl);
  currentImageFile = null;
}

function resetApp() {
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
    currentStream = null;
  }

  cameraFeed.srcObject = null;
  cameraFeed.hidden = true;

  currentImageDataUrl = '';
  currentImageFile = null;
  previewImage.src = '';
  previewImage.hidden = true;
  previewImage.style.display = 'none';
  imageInput.value = '';

  captureBtn.style.display = 'none';
  resetBtn.style.display = 'none';
  classifyBtn.disabled = true;

  showEmptyState();
  resultBox.innerHTML = '<p class="placeholder">Upload an image or open your camera, then scan to identify the subject.</p>';
}

function buildSampleResult(fileName = '') {
  const lowerName = fileName.toLowerCase();
  let label = 'Unidentified subject';

  if (lowerName.includes('dog') || lowerName.includes('puppy')) {
    label = 'Dog';
  } else if (lowerName.includes('cat') || lowerName.includes('kitten')) {
    label = 'Cat';
  } else if (lowerName.includes('bird')) {
    label = 'Bird';
  } else if (lowerName.includes('plant') || lowerName.includes('leaf') || lowerName.includes('flower')) {
    label = 'Plant';
  } else if (lowerName.includes('face') || lowerName.includes('person') || lowerName.includes('selfie')) {
    label = 'Human face';
  } else if (lowerName.includes('phone') || lowerName.includes('laptop') || lowerName.includes('device')) {
    label = 'Device';
  }

  return {
    summary: `${label} detected (offline sample — API unreachable)`,
    predictions: [
      { label, confidence: 0.93 },
      { label: 'Background', confidence: 0.05 },
      { label: 'Unclassified', confidence: 0.02 },
    ],
  };
}

function normalizeResult(payload) {
  if (Array.isArray(payload)) {
    return payload.map((item) => ({
      label: item.label || item.className || item.class_name || item.name || 'Unknown',
      confidence: item.confidence ?? item.score ?? 0,
    }));
  }

  if (payload?.predictions && Array.isArray(payload.predictions)) {
    return payload.predictions.map((item) => ({
      label: item.label || item.className || item.class_name || item.name || 'Unknown',
      confidence: item.confidence ?? item.score ?? 0,
    }));
  }

  if (payload?.labels && Array.isArray(payload.labels)) {
    return payload.labels.map((label, index) => ({
      label,
      confidence: payload.scores?.[index] ?? 0,
    }));
  }

  if (payload?.label || payload?.className || payload?.class_name) {
    return [{
      label: payload.label || payload.className || payload.class_name,
      confidence: payload.confidence ?? payload.score ?? 0.9,
    }];
  }

  return null;
}

function renderResult(payload, fallback = false) {
  const predictions = normalizeResult(payload) || [];
  const summary = payload?.summary || 'Scan complete';

  if (!predictions.length) {
    resultBox.innerHTML = `<p class="placeholder">${summary}</p>`;
    return;
  }

  resultBox.innerHTML = `
    <div class="result-card">
      <div class="result-title">${fallback ? 'Sample Reading' : 'Scan Result'}</div>
      <p>${summary}</p>
      <ul class="result-list">
        ${predictions
          .map((item, index) => {
            const pct = Math.round((item.confidence || 0) * 100);
            return `
              <li class="result-item ${index === 0 ? 'is-top' : ''}">
                <span class="result-rank">${String(index + 1).padStart(2, '0')}</span>
                <span class="result-label">${item.label}</span>
                <span class="confidence-wrap">
                  <span class="confidence-bar"><span style="width: ${pct}%;"></span></span>
                  <span class="confidence-value">${pct}%</span>
                </span>
              </li>
            `;
          })
          .join('')}
      </ul>
    </div>
  `;
}

async function classifyImage() {
  if (!currentImageDataUrl && !currentImageFile) {
    resultBox.innerHTML = '<p class="error">Please choose an image first.</p>';
    return;
  }

  classifyBtn.disabled = true;
  mediaFrame.classList.add('is-scanning');
  resultBox.innerHTML = '<p class="placeholder">Scanning subject…</p>';

  const formData = new FormData();

  if (currentImageFile) {
    formData.append('file', currentImageFile, currentImageFile.name);
  } else {
    const response = await fetch(currentImageDataUrl);
    const blob = await response.blob();
    formData.append('file', blob, 'capture.png');
  }

  try {
    const apiUrl = '/classify';
    const request = await fetch(apiUrl, {
      method: 'POST',
      body: formData,
    });

    if (!request.ok) {
      throw new Error(`API error ${request.status}`);
    }

    const payload = await request.json();

    if (payload?.error) {
      throw new Error(payload.error);
    }

    renderResult(payload, false);
  } catch (error) {
    console.warn('Using sample response because the API request failed:', error);
    renderResult(buildSampleResult(currentImageFile?.name || 'subject.png'), true);
  } finally {
    classifyBtn.disabled = false;
    mediaFrame.classList.remove('is-scanning');
  }
}

imageInput.addEventListener('change', (event) => {
  const [file] = event.target.files || [];
  if (!file) return;
  setPreviewFromFile(file);
});

cameraBtn.addEventListener('click', openCamera);
captureBtn.addEventListener('click', capturePhoto);
resetBtn.addEventListener('click', resetApp);
classifyBtn.addEventListener('click', classifyImage);

resultBox.innerHTML = '<p class="placeholder">Upload an image or open your camera, then scan to identify the subject.</p>';
classifyBtn.disabled = true;
