# Acoustic Form — Structural Acoustics Visualizer

Acoustic Form is a browser-based 3D acoustic simulation tool for architectural spaces. Define a closed 3D shape by inputting vertices manually, uploading a .3DM (Rhino) file, or describing a famous space in natural language (Claude generates the geometry). The tool then visualizes sound wave propagation within the volume using Three.js, computes RT60 reverberation times per octave band, and shows how surface materials affect acoustic behavior.

## Tech Stack

- **Next.js 16** (App Router)
- **Three.js** — 3D mesh rendering and acoustic ray visualization
- **Anthropic Claude API** (claude-sonnet-4-6) — geometry generation from natural language + acoustic analysis
- **rhino3dm** — parsing .3DM files in the browser
- **Tailwind CSS v4**

## Environment Variables

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |

## Run Locally

```bash
git clone https://github.com/armaan-k019/acoustic-form
cd acoustic-form
npm install
cp .env.example .env.local
# Fill in your ANTHROPIC_API_KEY in .env.local
npm run dev
# Navigate to http://localhost:3000/projects/acoustic-form
```

## How It Works

Vertices are passed to `/api/parse-shape` or `/api/parse-3dm` to extract a closed polyhedron, then rendered via Three.js with surface groups color-coded by material type. Ray-casting simulates sound propagation: rays originate from a source point, bounce off surfaces using the law of reflection (adjusted by material absorption coefficients), and decay over distance. The `/api/acoustic-summary` route sends octave-band RT60 values and surface data to Claude, which returns a plain-English acoustic assessment. The `/api/generate-structure` route accepts a building name and returns JSON geometry for the interior shell.

## Screenshots

Screenshots coming soon.
