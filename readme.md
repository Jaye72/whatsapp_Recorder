# Output Audio Watcher (PWA)

This Progressive Web App does two things:

1. Detects how many `audiooutput` devices the browser exposes.
2. Monitors and records a mix of microphone + speaker loopback input.

## Run

Use any static server on localhost (required for service worker + media APIs):

```powershell
cd "C:\Users\Jay\Desktop\Project\Whatsapp call recorder"
python -m http.server 8080
```

Then open `http://localhost:8080`.

## How To Use

1. Click **Grant Mic Permission** (helps reveal device labels).
2. Click **Refresh Devices** to list output devices.
3. Select **Mic** and **Speaker Loopback Input**.
4. Click **Start Audio Session** and allow permissions.
5. Watch **Audio active** status.
6. Click **Start Recording** and later **Stop Recording**.
7. Download the recorded `.webm` file.

## Important Limits

- Speaker recording without screen share works only if your OS exposes a loopback
  input device (for example `Stereo Mix`, `What U Hear`, or virtual cable input).
- If no loopback input exists, recording will be mic-only in browser context.
- `audiooutput` visibility varies by browser and OS.
