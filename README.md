# Armaan Kazi — Portfolio

A personal portfolio built with Next.js 16, featuring an interactive 3D acoustic simulation tool.

---

## Acoustic Form

An early-stage room-acoustic simulator for architects. Describe a room in plain English (or edit vertices by hand), and the tool computes reverb time (RT60) and visualises sound-ray propagation in 3D.

**Screenshot placeholder**

![Acoustic Form preview](./public/acoustic-form-preview.png)

### Features

- **3D Room Visualisation** — interactive Three.js canvas with manual orbit controls (drag to rotate, scroll to zoom)
- **Sound Ray Tracing** — Fibonacci sphere distribution, Möller–Trumbore intersection, per-bounce colour gradient, pulsing opacity animation
- **Acoustic Metrics** — volume (divergence theorem), surface area, RT60 (Sabine's formula), early-reflection count
- **Natural Language Room Parser** — describe a room in plain English; Claude converts it to a 3D mesh
- **Manual Vertex Editor** — editable vertex table with preset rooms (Rectangle, L-Shaped, Trapezoidal)
- **Claude Acoustic Analysis** — expert 3-4 sentence acoustic report powered by Claude claude-opus-4-6

---

## Setup

### Prerequisites

- Node.js ≥ 18
- An Anthropic API key

### Install

```bash
npm install
```

### Environment

Create `.env.local` in the project root:

```
ANTHROPIC_API_KEY=sk-ant-...
```

### Run

```bash
npm run dev
```

Open [http://localhost:3000/projects/acoustic-form](http://localhost:3000/projects/acoustic-form) to view the simulator.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| 3D | Three.js |
| AI | Claude claude-opus-4-6 via `@anthropic-ai/sdk` |
| Styling | Tailwind CSS v4 |
| Animation | Framer Motion |
| Content | MDX + gray-matter |

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── parse-shape/route.ts       # POST: NL → RoomShape via Claude
│   │   └── acoustic-summary/route.ts  # POST: metrics → analysis via Claude
│   └── projects/acoustic-form/
│       └── page.tsx                   # Main simulator page
├── components/
│   ├── ThreeCanvas.tsx                # Three.js renderer (SSR-disabled)
│   ├── ShapeInputPanel.tsx            # Left panel (describe / manual)
│   ├── VertexTable.tsx                # Editable vertex table
│   └── MetricsPanel.tsx               # Right panel with Claude analysis
├── lib/
│   ├── acoustics.ts                   # Volume, RT60, ray casting
│   └── geometry.ts                    # Room helpers, face normals
└── types/
    └── index.ts                       # Shared TypeScript types
```

---

© 2025 Armaan Kazi
