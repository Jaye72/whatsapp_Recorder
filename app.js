// ── DOM ────────────────────────────────────────────────────────────────────
const startBtn     = document.getElementById('startBtn');
const stopBtn      = document.getElementById('stopBtn');
const statusEl     = document.getElementById('status');
const timerEl      = document.getElementById('timer');
const downloadCard = document.getElementById('downloadCard');
const downloadVideo = document.getElementById('downloadVideo');
const downloadAudio = document.getElementById('downloadAudio');
const recordStatus  = document.getElementById('recordStatus');

// ── state ──────────────────────────────────────────────────────────────────
let mediaRecorderVideo = null;
let mediaRecorderAudio = null;
let micStream          = null;
let displayStream      = null;
let audioCtx           = null;
let videoChunks        = [];
let audioChunks        = [];
let isRecording        = false;
let timerInterval      = null;
let startTime          = null;

// ── helpers ────────────────────────────────────────────────────────────────
function getFilename() {
  const d   = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `recording-${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.webm`;
}

function updateTimer() {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const s = String(elapsed % 60).padStart(2, '0');
  timerEl.textContent = `${m}:${s}`;
}

function setStatus(text, color = '') {
  statusEl.textContent = text;
  statusEl.style.color = color;
}

function formatSize(bytes) {
  return bytes > 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${(bytes / 1024).toFixed(0)} KB`;
}

// ── recording ──────────────────────────────────────────────────────────────
async function startRecording() {
  try {
    setStatus('Requesting microphone...');

    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    setStatus('Select screen to record — check "Share audio" in the dialog...');

    displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: true
    });

    const videoTrack     = displayStream.getVideoTracks()[0];
    const sysAudioTracks = displayStream.getAudioTracks();

    // Mix mic + system audio into one track
    audioCtx = new AudioContext();
    const dest = audioCtx.createMediaStreamDestination();
    audioCtx.createMediaStreamSource(micStream).connect(dest);
    if (sysAudioTracks.length) {
      audioCtx.createMediaStreamSource(new MediaStream(sysAudioTracks)).connect(dest);
    }

    const combined = new MediaStream([videoTrack, dest.stream.getAudioTracks()[0]]);

    // Auto-stop when user clicks "Stop sharing" in browser bar
    videoTrack.addEventListener('ended', stopRecording);

    const videoMime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : 'video/webm';
    const audioMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    videoChunks = [];
    audioChunks = [];

    mediaRecorderVideo = new MediaRecorder(combined, { mimeType: videoMime });
    mediaRecorderVideo.ondataavailable = e => { if (e.data.size > 0) videoChunks.push(e.data); };

    mediaRecorderAudio = new MediaRecorder(dest.stream, { mimeType: audioMime });
    mediaRecorderAudio.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };

    let stoppedCount = 0;
    const onBothStopped = () => { if (++stoppedCount === 2) finalizeRecording(); };
    mediaRecorderVideo.onstop = onBothStopped;
    mediaRecorderAudio.onstop = onBothStopped;

    mediaRecorderVideo.start(1000);
    mediaRecorderAudio.start(1000);

    isRecording = true;
    startTime   = Date.now();

    startBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');
    downloadCard.classList.add('hidden');
    timerEl.classList.remove('hidden');
    timerEl.textContent = '00:00';
    setStatus('● Recording', '#c1121f');
    timerInterval = setInterval(updateTimer, 1000);

  } catch (err) {
    stopCleanup();
    setStatus('Ready');
    if (err.name !== 'NotAllowedError') alert(`Error: ${err.message}`);
  }
}

function stopRecording() {
  if (!isRecording) return;
  isRecording = false;

  clearInterval(timerInterval);
  timerInterval = null;

  startBtn.classList.remove('hidden');
  stopBtn.classList.add('hidden');
  timerEl.classList.add('hidden');
  setStatus('Processing...');

  if (micStream)     { micStream.getTracks().forEach(t => t.stop());     micStream = null; }
  if (displayStream) { displayStream.getTracks().forEach(t => t.stop()); displayStream = null; }
  if (audioCtx)      { audioCtx.close(); audioCtx = null; }

  let stopped = 0;
  const tryStop = r => { if (r && r.state !== 'inactive') r.stop(); else if (++stopped === 2 && stopped < 3) finalizeRecording(); };
  if (mediaRecorderVideo && mediaRecorderVideo.state !== 'inactive') mediaRecorderVideo.stop();
  if (mediaRecorderAudio && mediaRecorderAudio.state !== 'inactive') mediaRecorderAudio.stop();
  if (!mediaRecorderVideo && !mediaRecorderAudio) finalizeRecording();
}

function stopCleanup() {
  clearInterval(timerInterval);
  timerInterval      = null;
  isRecording        = false;
  mediaRecorderVideo = null;
  mediaRecorderAudio = null;
  if (audioCtx)      { audioCtx.close(); audioCtx = null; }
  if (micStream)     { micStream.getTracks().forEach(t => t.stop());     micStream = null; }
  if (displayStream) { displayStream.getTracks().forEach(t => t.stop()); displayStream = null; }
}

function finalizeRecording() {
  mediaRecorderVideo = null;
  mediaRecorderAudio = null;
  setStatus('Ready');

  if (!videoChunks.length && !audioChunks.length) {
    recordStatus.textContent = 'No recording captured.';
    downloadCard.classList.remove('hidden');
    return;
  }

  const base = getFilename().replace('.webm', '');

  if (videoChunks.length) {
    const blob = new Blob(videoChunks, { type: 'video/webm' });
    downloadVideo.href        = URL.createObjectURL(blob);
    downloadVideo.download    = `${base}.webm`;
    downloadVideo.textContent = `⬇ Video + Audio (${formatSize(blob.size)})`;
    downloadVideo.classList.remove('hidden');
  } else {
    downloadVideo.classList.add('hidden');
  }

  if (audioChunks.length) {
    const blob = new Blob(audioChunks, { type: 'audio/webm' });
    downloadAudio.href        = URL.createObjectURL(blob);
    downloadAudio.download    = `${base}-audio.webm`;
    downloadAudio.textContent = `⬇ Audio Only (${formatSize(blob.size)})`;
    downloadAudio.classList.remove('hidden');
  } else {
    downloadAudio.classList.add('hidden');
  }

  recordStatus.textContent = 'Recording saved — choose format to download';
  downloadCard.classList.remove('hidden');
  videoChunks = [];
  audioChunks = [];
}

// ── events ─────────────────────────────────────────────────────────────────
startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click',  stopRecording);
