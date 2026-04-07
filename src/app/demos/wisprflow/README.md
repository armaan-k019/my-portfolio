# ASL Flow — Sign Language to Text Pipeline

ASL Flow is a real-time ASL fingerspelling recognition system that runs entirely in the browser. It uses TensorFlow.js and the MediaPipe hand-pose detection model to track 21 hand keypoints from your webcam, then matches the landmark geometry against a library of ASL letter gestures using Fingerpose. Recognized letters build up words, and Claude predicts the most likely next words as you spell — displayed as tap-to-insert suggestion chips.

## Tech Stack

- **Next.js 16** (App Router)
- **TensorFlow.js** + **MediaPipe Hand Pose Detection** — real-time hand landmark detection
- **Fingerpose** — gesture recognition from hand keypoints
- **Anthropic Claude API** (claude-sonnet-4-6) — next-word prediction
- **Tailwind CSS v4**

## Environment Variables

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |

All ML inference runs in the browser — no additional ML API keys required.

## Run Locally

```bash
git clone https://github.com/armaan-k019/asl-flow
cd asl-flow
npm install
cp .env.example .env.local
# Fill in your ANTHROPIC_API_KEY in .env.local
npm run dev
# Navigate to http://localhost:3000/demos/wisprflow
```

Allow camera access when prompted.

## How It Works

On page load, the MediaPipe hand-pose model loads asynchronously via TensorFlow.js. Each animation frame, the webcam feed is analyzed and 21 3D keypoints are extracted per detected hand. Fingerpose scores each candidate gesture against a library of 26 ASL letter definitions (custom per-finger curl and direction descriptors). When a gesture holds confidently for ~400ms it is committed as a letter. The current text is sent to `/api/asl-predict` which calls Claude to return 3–5 word predictions as a JSON array.

## Screenshots

Screenshots coming soon.
