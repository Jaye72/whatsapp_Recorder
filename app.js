// ── DOM ────────────────────────────────────────────────────────────────────
const startBtn     = document.getElementById('startBtn');
const stopBtn      = document.getElementById('stopBtn');
const statusEl     = document.getElementById('status');
const timerEl      = document.getElementById('timer');
const downloadCard = document.getElementById('downloadCard');
const downloadLink = document.getElementById('downloadLink');
const recordStatus = document.getElementById('recordStatus');

// ── state ──────────────────────────────────────────────────────────────────
let audioCtx       = null;
let micStream      = null;
let displayStream  = null;
let scriptProcNode = null;
let isRecording    = false;
let pcmChunks      = [];
let sampleRate     = 44100;
let timerInterval  = null;
let startTime      = null;

// ── WAV encoder ─────────────────────────────────────────────────────────────
function buildWAV(chunks, sr) {
  let totalLen = 0;
  chunks.forEach(c => (totalLen += c.length));
  const merged = new Float32Array(totalLen);
  let off = 0;
  chunks.forEach(c => { merged.set(c, off); off += c.length; });

  const buf = new ArrayBuffer(44 + merged.length * 2);
  const v   = new DataView(buf);
  const ws  = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };

  ws(0,  'RIFF');
  v.setUint32(4,  36 + merged.length * 2, true);
  ws(8,  'WAVE');
  ws(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20,  1, true);      // PCM
  v.setUint16(22,  1, true);      // mono
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true);
  v.setUint16(32,  2, true);
  v.setUint16(34, 16, true);
  ws(36, 'data');
  v.setUint32(40, merged.length * 2, true);

  let o = 44;
  for (let i = 0; i < merged.length; i++) {
    const s = Math.max(-1, Math.min(1, merged[i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    o += 2;
  }
  return new Blob([buf], { type: 'audio/wav' });
}

function getFilename() {
  const d   = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `call-${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.wav`;
}

// ── timer ──────────────────────────────────────────────────────────────────
function updateTimer() {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const s = String(elapsed % 60).padStart(2, '0');
  timerEl.textContent = `${m}:${s}`;
}

// ── cleanup ────────────────────────────────────────────────────────────────
function cleanup() {
  clearInterval(timerInterval);
  timerInterval = null;
  isRecording   = false;

  if (scriptProcNode) { scriptProcNode.disconnect(); scriptProcNode = null; }
  if (audioCtx)       { audioCtx.close(); audioCtx = null; }
  if (micStream)      { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  if (displayStream)  { displayStream.getTracks().forEach(t => t.stop()); displayStream = null; }
}

// ── recording ──────────────────────────────────────────────────────────────
async function startRecording() {
  try {
    setStatus('Requesting microphone...');

    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    setStatus('Select your call window — check "Share audio" in the dialog...');

    displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });

    const sysAudioTracks = displayStream.getAudioTracks();

    if (!sysAudioTracks.length) {
      cleanup();
      setStatus('Ready');
      alert('No call audio captured.\n\nIn the browser share dialog, check the "Share audio" checkbox before clicking Share.');
      return;
    }

    // Stop video — only need audio
    displayStream.getVideoTracks().forEach(t => t.stop());

    // Auto-stop when user clicks "Stop sharing" in browser bar
    sysAudioTracks[0].addEventListener('ended', stopRecording);

    // Build audio graph — mic + system audio mixed
    audioCtx   = new AudioContext();
    sampleRate = audioCtx.sampleRate;

    scriptProcNode = audioCtx.createScriptProcessor(4096, 1, 1);
    const silentOut = audioCtx.createGain();
    silentOut.gain.value = 0;
    silentOut.connect(audioCtx.destination);
    scriptProcNode.connect(silentOut);

    audioCtx.createMediaStreamSource(micStream).connect(scriptProcNode);
    audioCtx.createMediaStreamSource(new MediaStream(sysAudioTracks)).connect(scriptProcNode);

    pcmChunks   = [];
    isRecording = true;
    startTime   = Date.now();

    scriptProcNode.onaudioprocess = e => {
      if (isRecording) {
        pcmChunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      }
    };

    // UI → recording state
    startBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');
    downloadCard.classList.add('hidden');
    timerEl.classList.remove('hidden');
    timerEl.textContent = '00:00';
    setStatus('● Recording', '#c1121f');
    timerInterval = setInterval(updateTimer, 1000);

  } catch (err) {
    cleanup();
    setStatus('Ready');
    if (err.name !== 'NotAllowedError') {
      alert(`Error: ${err.message}`);
    }
  }
}

function stopRecording() {
  if (!isRecording && !pcmChunks.length) return;

  const chunks = pcmChunks.slice();
  cleanup();

  // UI → idle state
  startBtn.classList.remove('hidden');
  stopBtn.classList.add('hidden');
  timerEl.classList.add('hidden');
  setStatus('Ready');

  if (!chunks.length) {
    recordStatus.textContent = 'No audio was captured.';
    downloadCard.classList.remove('hidden');
    return;
  }

  const filename = getFilename();
  const blob     = buildWAV(chunks, sampleRate);
  const url      = URL.createObjectURL(blob);

  downloadLink.href        = url;
  downloadLink.download    = filename;
  downloadLink.textContent = `⬇ Download ${filename}`;
  recordStatus.textContent = `Recording saved — ${formatSize(blob.size)}`;
  downloadCard.classList.remove('hidden');
}

function setStatus(text, color = '') {
  statusEl.textContent  = text;
  statusEl.style.color  = color;
}

function formatSize(bytes) {
  return bytes > 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${(bytes / 1024).toFixed(0)} KB`;
}

// ── events ─────────────────────────────────────────────────────────────────
startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click',  stopRecording);

// ── PWA ────────────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.error('SW registration failed:', err);
    });
  });
}
