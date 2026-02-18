const video = document.getElementById("video");
const freezeCanvas = document.getElementById("freezeCanvas");
const flashOverlay = document.getElementById("flashOverlay");
const preview = document.getElementById("preview");
const startOverlay = document.getElementById("startOverlay");
const startBtn = document.getElementById("startBtn");
const statusLine = document.getElementById("status");
const ocrOutput = document.getElementById("ocrOutput");
const ceoOverlay = document.getElementById("ceoOverlay");

const brightness = document.getElementById("brightness");
const contrast = document.getElementById("contrast");
const zoom = document.getElementById("zoom");

const brightnessVal = document.getElementById("brightnessVal");
const contrastVal = document.getElementById("contrastVal");
const zoomVal = document.getElementById("zoomVal");

const freezeBtn = document.getElementById("freezeBtn");
const torchBtn = document.getElementById("torchBtn");
const attentionBtn = document.getElementById("attentionBtn");
const resetBtn = document.getElementById("resetBtn");
const attentionModal = document.getElementById("attentionModal");
const attentionCancel = document.getElementById("attentionCancel");
const attentionConfirm = document.getElementById("attentionConfirm");
const ceoBtn = document.getElementById("ceoBtn");
const ceoModal = document.getElementById("ceoModal");
const ceoCancel = document.getElementById("ceoCancel");
const ceoStart = document.getElementById("ceoStart");
const ceoDelay = document.getElementById("ceoDelay");
const ceoScript = document.getElementById("ceoScript");
const testKeyBtn = document.getElementById("testKeyBtn");
const trayToggle = document.getElementById("trayToggle");
const tray = document.querySelector(".tray");

let stream = null;
let track = null;
let supportsTorch = false;
let supportsZoom = false;
let usingDigitalZoom = false;
let isFrozen = false;
let pinchData = null;
let attentionActive = false;
let attentionTimer = null;
let ceoTimer = null;
let ceoLines = [];
let ceoIndex = 0;

const state = {
  brightness: 1,
  contrast: 1,
  zoom: 1,
};

function setStatus(message) {
  statusLine.textContent = message || "";
}

function setOcrOutput(text) {
  if (text && text.trim()) {
    ocrOutput.textContent = text.trim();
    ocrOutput.classList.remove("hidden");
  } else {
    ocrOutput.textContent = "";
    ocrOutput.classList.add("hidden");
  }
}

function updateFilter() {
  const filter = `brightness(${state.brightness}) contrast(${state.contrast})`;
  video.style.filter = filter;
  freezeCanvas.style.filter = filter;
}

function updateValueLabels() {
  brightnessVal.textContent = state.brightness.toFixed(2);
  contrastVal.textContent = state.contrast.toFixed(2);
  zoomVal.textContent = state.zoom.toFixed(2);
}

function applyDigitalZoom(value) {
  const scale = Math.max(1, value);
  video.style.transform = `scale(${scale})`;
  freezeCanvas.style.transform = `scale(${scale})`;
}

async function applyRealZoom(value) {
  if (!track || !supportsZoom) return;
  try {
    await track.applyConstraints({ advanced: [{ zoom: value }] });
  } catch (err) {
    setStatus("Zoom not supported by this camera.");
  }
}

function setZoom(value) {
  state.zoom = value;
  if (supportsZoom) {
    applyRealZoom(value);
  } else if (usingDigitalZoom) {
    applyDigitalZoom(value);
  }
  updateValueLabels();
}

function setFlashOverlay(color, opacity) {
  flashOverlay.classList.remove("hidden");
  flashOverlay.style.background = color;
  flashOverlay.style.opacity = opacity;
}

function configureZoomCapabilities(capabilities) {
  if (capabilities && "zoom" in capabilities) {
    supportsZoom = true;
    usingDigitalZoom = false;
    zoom.min = capabilities.zoom.min ?? 1;
    zoom.max = capabilities.zoom.max ?? 3;
    zoom.step = capabilities.zoom.step ?? 0.1;
    zoom.value = Math.min(Math.max(state.zoom, zoom.min), zoom.max);
  } else {
    // iOS Safari often lacks zoom capabilities; fall back to digital zoom.
    supportsZoom = false;
    usingDigitalZoom = true;
    zoom.min = 1;
    zoom.max = 3;
    zoom.step = 0.05;
    zoom.value = 1;
    applyDigitalZoom(1);
  }
  state.zoom = parseFloat(zoom.value);
  updateValueLabels();
}

function configureTorch(capabilities) {
  supportsTorch = !!(capabilities && capabilities.torch);
  if (supportsTorch) {
    torchBtn.classList.remove("hidden");
  } else {
    torchBtn.classList.add("hidden");
  }
}

async function startCamera() {
  setStatus("");
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus("Camera API not available.");
    return;
  }
  if (location.protocol !== "https:" && location.hostname !== "localhost") {
    setStatus("HTTPS required for camera access.");
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    track = stream.getVideoTracks()[0];

    const capabilities = track.getCapabilities ? track.getCapabilities() : null;
    configureZoomCapabilities(capabilities);
    configureTorch(capabilities);

    startOverlay.style.display = "none";
    updateFilter();
  } catch (err) {
    const name = err && err.name ? err.name : "Error";
    if (name === "NotAllowedError") {
      setStatus("Camera permission denied.");
    } else if (name === "NotFoundError") {
      setStatus("No camera found.");
    } else {
      setStatus("Unable to start camera.");
    }
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
    track = null;
  }
}

function drawFrameToCanvas() {
  if (!video.videoWidth || !video.videoHeight) return;
  const rect = preview.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;

  const canvasWidth = rect.width * ratio;
  const canvasHeight = rect.height * ratio;
  freezeCanvas.width = canvasWidth;
  freezeCanvas.height = canvasHeight;

  const ctx = freezeCanvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const videoAspect = video.videoWidth / video.videoHeight;
  const canvasAspect = canvasWidth / canvasHeight;

  let drawWidth = canvasWidth;
  let drawHeight = canvasHeight;
  let offsetX = 0;
  let offsetY = 0;

  if (videoAspect > canvasAspect) {
    drawHeight = canvasHeight;
    drawWidth = canvasHeight * videoAspect;
    offsetX = -(drawWidth - canvasWidth) / 2;
  } else {
    drawWidth = canvasWidth;
    drawHeight = canvasWidth / videoAspect;
    offsetY = -(drawHeight - canvasHeight) / 2;
  }

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);
}

function setFrozen(nextFrozen) {
  isFrozen = nextFrozen;
  if (isFrozen) {
    drawFrameToCanvas();
    freezeCanvas.style.display = "block";
    freezeCanvas.setAttribute("aria-hidden", "false");
    freezeBtn.textContent = "Unfreeze";
  } else {
    freezeCanvas.style.display = "none";
    freezeCanvas.setAttribute("aria-hidden", "true");
    freezeBtn.textContent = "Freeze Frame";
    setOcrOutput("");
    if (attentionActive) stopAttentionPattern();
  }
}

async function toggleTorch() {
  if (!track || !supportsTorch) return;
  const enabled = torchBtn.dataset.enabled === "true";
  try {
    await track.applyConstraints({ advanced: [{ torch: !enabled }] });
    torchBtn.dataset.enabled = (!enabled).toString();
    torchBtn.textContent = !enabled ? "Torch On" : "Torch";
  } catch (err) {
    setStatus("Torch not available on this device.");
  }
}

function resetControls() {
  state.brightness = 1;
  state.contrast = 1;
  brightness.value = state.brightness;
  contrast.value = state.contrast;
  updateFilter();
  setZoom(1);
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

async function runAttentionPattern() {
  if (!attentionActive) return;
  const colors = ["#ffffff", "#fef08a", "#a5f3fc", "#fca5a5", "#d9f99d"];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const opacity = randomBetween(0.35, 0.9);
  setFlashOverlay(color, opacity);

  if (supportsTorch && track) {
    const enableTorch = Math.random() > 0.5;
    try {
      await track.applyConstraints({ advanced: [{ torch: enableTorch }] });
      torchBtn.dataset.enabled = enableTorch.toString();
      torchBtn.textContent = enableTorch ? "Torch On" : "Torch";
    } catch (err) {
      setStatus("Torch not available on this device.");
    }
  }

  const nextDelay = Math.floor(randomBetween(120, 520));
  attentionTimer = window.setTimeout(runAttentionPattern, nextDelay);
}

function stopAttentionPattern() {
  attentionActive = false;
  if (attentionTimer) {
    clearTimeout(attentionTimer);
    attentionTimer = null;
  }
  setFlashOverlay("#000", 0);
  flashOverlay.classList.add("hidden");
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  setOcrOutput("");
  attentionBtn.textContent = "Attention Mode";
}

function speakText(text, onEnd) {
  if (!("speechSynthesis" in window)) {
    setStatus("Speech not supported on this device.");
    if (onEnd) onEnd();
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  if (onEnd) {
    utterance.onend = () => onEnd();
    utterance.onerror = () => onEnd();
  }
  window.speechSynthesis.speak(utterance);
}

function stopCeoMode() {
  if (ceoTimer) {
    clearTimeout(ceoTimer);
    ceoTimer = null;
  }
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  ceoLines = [];
  ceoIndex = 0;
  ceoOverlay.classList.add("hidden");
  ceoOverlay.innerHTML = "";
}

function parseCeoScript(scriptText) {
  const lines = scriptText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const parsed = lines.map((line) => {
    if (line.toLowerCase().startsWith("employee:")) {
      return { role: "employee", text: line.slice(9).trim() };
    }
    if (line.toLowerCase().startsWith("you:")) {
      return { role: "you", text: line.slice(4).trim() };
    }
    return { role: "employee", text: line };
  });

  // Merge consecutive lines from the same speaker into one block.
  return parsed.reduce((acc, line) => {
    const last = acc[acc.length - 1];
    if (last && last.role === line.role) {
      last.text = `${last.text} ${line.text}`.trim();
      return acc;
    }
    acc.push({ ...line });
    return acc;
  }, []);
}

function renderCeoOverlay(lines, activeIndex) {
  if (!lines.length) {
    ceoOverlay.classList.add("hidden");
    ceoOverlay.innerHTML = "";
    return;
  }
  ceoOverlay.classList.remove("hidden");
  const start = Math.max(0, activeIndex - 1);
  const end = Math.min(lines.length, start + 3);
  const windowed = lines.slice(start, end);

  ceoOverlay.innerHTML = windowed
    .map((line, idx) => {
      const actualIndex = start + idx;
      const roleClass = line.role;
      const activeClass = actualIndex === activeIndex ? "active" : "";
      const arrow = actualIndex === activeIndex ? "<span class=\"ceo-arrow\">-></span>" : "";
      const label = line.role === "you" ? "You:" : "Employee:";
      return `<div class=\"ceo-line ${roleClass} ${activeClass}\">${arrow}<strong>${label}</strong> ${line.text}</div>`;
    })
    .join("");
  const active = ceoOverlay.querySelector(".ceo-line.active");
  if (active) {
    active.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

function estimateSpeakSeconds(text, wpm) {
  const words = text.split(/\s+/).filter(Boolean).length;
  const wordsPerSecond = Math.max(1, wpm / 60);
  const base = words / wordsPerSecond;
  return Math.max(2, base + 1);
}

function runCeoScript(script, wpm) {
  stopCeoMode();
  if (!script.length) {
    setStatus("Add a script first.");
    return;
  }
  ceoLines = script;
  ceoIndex = 0;
  const step = () => {
    if (ceoIndex >= ceoLines.length) {
      setStatus("CEO mode finished.");
      renderCeoOverlay(ceoLines, -1);
      return;
    }
    const line = ceoLines[ceoIndex];
    renderCeoOverlay(ceoLines, ceoIndex);
    ceoIndex += 1;
    if (line.role === "you") {
      setStatus(`Your line: ${line.text}`);
      const waitMs = estimateSpeakSeconds(line.text, wpm) * 1000;
      ceoTimer = setTimeout(step, waitMs);
    } else {
      setStatus(`Employee: ${line.text}`);
      let fallback = setTimeout(step, 8000);
      speakText(line.text, () => {
        clearTimeout(fallback);
        step();
      });
    }
  };

  step();
}

function generateCeoScript() {
  return [
    "You: Hello.",
    "Employee: Hi, boss. I'm sorry to bother you, but we have a problem, and the overnight rollout failed and support is overwhelmed.",
    "You: Give me the one fix that matters most.",
    "Employee: The outage hit the east region first, and now the backlog is growing.",
    "You: Do it now. I want a clean plan in writing in one hour.",
    "Employee: We need approval to pull the incident team and freeze new deployments.",
    "You: Authorize the incident team and keep me updated.",
    "You: Look, I have to go, I am at dinner grabbing a quick snack. Bye.",
  ].join("\n");
}

async function runOcrFromCanvas() {
  setStatus("Uploading for OCR...");
  const dataUrl = freezeCanvas.toDataURL("image/jpeg", 0.92);
  const base64 = dataUrl.split(",")[1];

  const response = await fetch("/api/ocr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: base64 }),
  });

  if (!response.ok) {
    throw new Error("OCR request failed");
  }
  const data = await response.json();
  if (data.error && data.error.message) {
    throw new Error(data.error.message);
  }
  return (data.text || "").trim();
}

async function testApiKey() {
  setStatus("Testing key...");
  try {
    const response = await fetch("/api/ocr", { method: "GET" });
    if (!response.ok) {
      setStatus("Key test failed.");
      return;
    }
    const data = await response.json();
    if (data && data.prefix) {
      setStatus(`Key prefix: ${data.prefix}...`);
      return;
    }
    setStatus("Key test failed.");
  } catch (err) {
    setStatus("Key test failed.");
  }
}

async function startAttentionMode() {
  if (!stream) {
    setStatus("Start the camera first.");
    return;
  }
  attentionModal.classList.add("hidden");
  setFrozen(true);
  attentionActive = true;
  flashOverlay.classList.remove("hidden");
  attentionBtn.textContent = "Stop Attention";
  runAttentionPattern();

  try {
    const text = await runOcrFromCanvas();
    if (!text) {
      setStatus("No readable text found.");
    } else {
      setStatus("Reading menu aloud.");
      setOcrOutput(text);
      speakText(text);
    }
  } catch (err) {
    const message = err && err.message ? `Unable to read text: ${err.message}` : "Unable to read text.";
    setStatus(message);
  }
}

function onPinchStart(event) {
  if (event.touches.length !== 2) return;
  const [t1, t2] = event.touches;
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  pinchData = {
    startDistance: Math.hypot(dx, dy),
    startZoom: state.zoom,
  };
}

function onPinchMove(event) {
  if (!pinchData || event.touches.length !== 2) return;
  event.preventDefault();
  const [t1, t2] = event.touches;
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  const distance = Math.hypot(dx, dy);
  const scale = distance / pinchData.startDistance;
  const min = parseFloat(zoom.min);
  const max = parseFloat(zoom.max);
  const nextZoom = Math.min(max, Math.max(min, pinchData.startZoom * scale));
  zoom.value = nextZoom;
  setZoom(nextZoom);
}

function onPinchEnd() {
  pinchData = null;
}

brightness.addEventListener("input", (event) => {
  state.brightness = parseFloat(event.target.value);
  updateFilter();
  updateValueLabels();
});

contrast.addEventListener("input", (event) => {
  state.contrast = parseFloat(event.target.value);
  updateFilter();
  updateValueLabels();
});

zoom.addEventListener("input", (event) => {
  setZoom(parseFloat(event.target.value));
});

freezeBtn.addEventListener("click", () => {
  setFrozen(!isFrozen);
});

torchBtn.addEventListener("click", toggleTorch);

resetBtn.addEventListener("click", resetControls);

startBtn.addEventListener("click", startCamera);
testKeyBtn.addEventListener("click", testApiKey);



attentionBtn.addEventListener("click", () => {
  if (attentionActive) {
    stopAttentionPattern();
    return;
  }
  attentionModal.classList.remove("hidden");
});

attentionCancel.addEventListener("click", () => {
  attentionModal.classList.add("hidden");
  stopAttentionPattern();
});

attentionConfirm.addEventListener("click", startAttentionMode);

ceoBtn.addEventListener("click", () => {
  ceoModal.classList.remove("hidden");
  ceoScript.value = generateCeoScript();
  renderCeoOverlay(parseCeoScript(ceoScript.value), -1);
});

ceoCancel.addEventListener("click", () => {
  ceoModal.classList.add("hidden");
  stopCeoMode();
});

ceoStart.addEventListener("click", () => {
  ceoModal.classList.add("hidden");
  const wpm = Math.max(80, Math.min(220, parseInt(ceoDelay.value, 10) || 140));
  const script = parseCeoScript(ceoScript.value);
  runCeoScript(script, wpm);
});

trayToggle.addEventListener("click", () => {
  const collapsed = tray.classList.toggle("collapsed");
  trayToggle.setAttribute("aria-expanded", (!collapsed).toString());
});

window.addEventListener("orientationchange", () => {
  setTimeout(() => {
    if (isFrozen) drawFrameToCanvas();
  }, 200);
});

window.addEventListener("resize", () => {
  if (isFrozen) drawFrameToCanvas();
});

// iOS Safari uses passive touch listeners by default; preventDefault is needed for custom pinch zoom.
preview.addEventListener("touchstart", onPinchStart, { passive: false });
preview.addEventListener("touchmove", onPinchMove, { passive: false });
preview.addEventListener("touchend", onPinchEnd);
preview.addEventListener("touchcancel", onPinchEnd);

updateFilter();
updateValueLabels();
setStatus("Ready.");

const defaultCeoScript = generateCeoScript();
if (!ceoScript.value) {
  ceoScript.value = defaultCeoScript;
}

ceoOverlay.classList.add("hidden");

window.addEventListener("pagehide", stopCamera);
window.addEventListener("beforeunload", stopAttentionPattern);
