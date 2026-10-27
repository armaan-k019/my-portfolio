"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Modal from "./Modal";

export interface SketchbookEntry {
  src: string;
  caption?: string;
}

// The sketchbook is a small "latent space": every page is a card floating in
// one shared 3D scene, and each view (sphere, orbit, scatter, grid) is just a
// different set of target positions. Cards ease toward their targets every
// frame, so switching views morphs the whole set instead of cutting.

type View = "sphere" | "orbit" | "scatter" | "grid";

const VIEWS: { id: View; label: string }[] = [
  { id: "sphere", label: "3D" },
  { id: "orbit", label: "Orbit" },
  { id: "scatter", label: "Scatter" },
  { id: "grid", label: "Grid" },
];

const CARD_ASPECT = 1.6; // height / width, close to the scanned pages
const FOCAL = 900; // perspective distance in px
const EASE = 0.085; // how quickly cards chase their targets each frame
const AUTO_SPIN = 0.0018; // radians per frame when idle
const DRAG_THRESHOLD = 6; // px of movement before a press counts as a drag

interface Vec {
  x: number;
  y: number;
  z: number;
  rot: number; // in-plane rotation, degrees
}

interface Layout {
  w: number;
  h: number;
  card: number; // card width in px
}

// Deterministic per-index noise so scatter positions are stable across renders.
function hash(i: number, salt: number): number {
  const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function pageLabel(entry: SketchbookEntry): string {
  const match = entry.src.match(/(\d+)\.\w+$/);
  return match ? `p. ${Number(match[1])}` : "";
}

// Positions in the scene's own frame, before the camera rotation.
function sceneTargets(view: View, n: number, layout: Layout): Vec[] {
  const { w, h, card } = layout;
  const out: Vec[] = [];

  if (view === "sphere") {
    const r = Math.min(w, h) * 0.4;
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = 1 - (2 * (i + 0.5)) / n;
      const ring = Math.sqrt(1 - y * y);
      const t = golden * i;
      out.push({ x: Math.cos(t) * ring * r, y: y * r, z: Math.sin(t) * ring * r, rot: 0 });
    }
    return out;
  }

  if (view === "orbit") {
    const r = Math.min(w * 0.34, h * 0.5);
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      out.push({ x: Math.cos(t) * r, y: Math.sin(t * 3) * card * 0.35, z: Math.sin(t) * r, rot: 0 });
    }
    return out;
  }

  if (view === "scatter") {
    const spanX = w / 2 - card * 0.6;
    const spanY = h / 2 - card * CARD_ASPECT * 0.55;
    for (let i = 0; i < n; i++) {
      out.push({
        x: (hash(i, 1) * 2 - 1) * spanX,
        y: (hash(i, 2) * 2 - 1) * spanY,
        z: (hash(i, 3) * 2 - 1) * 120,
        rot: (hash(i, 4) * 2 - 1) * 14,
      });
    }
    return out;
  }

  const { cols, size } = gridFit(n, w, h);
  const rows = Math.ceil(n / cols);
  const gap = size * 0.12;
  const cellW = size + gap;
  const cellH = size * CARD_ASPECT + gap;
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    out.push({
      x: (c - (cols - 1) / 2) * cellW,
      y: (r - (rows - 1) / 2) * cellH,
      z: 0,
      rot: 0,
    });
  }
  return out;
}

// Pick the column count that gives the largest cards that still fit the stage.
function gridFit(n: number, w: number, h: number): { cols: number; size: number } {
  let best = { cols: 1, size: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const byW = (w * 0.94) / (cols * 1.12);
    const byH = (h * 0.94) / (rows * (CARD_ASPECT + 0.12));
    const size = Math.min(byW, byH);
    if (size > best.size) best = { cols, size };
  }
  return best;
}

function rotate(p: Vec, yaw: number, pitch: number): Vec {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x1 = p.x * cy - p.z * sy;
  const z1 = p.x * sy + p.z * cy;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return { x: x1, y: p.y * cp - z1 * sp, z: p.y * sp + z1 * cp, rot: p.rot };
}

export default function SketchbookGrid({ entries }: { entries: SketchbookEntry[] }) {
  const [view, setView] = useState<View>("sphere");
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [layout, setLayout] = useState<Layout>({ w: 1024, h: 620, card: 70 });

  const stageRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = useRef<Vec[]>([]);
  const camera = useRef({ yaw: 0, pitch: -0.18, yawVel: 0, pitchVel: 0 });
  const pointer = useRef({ down: false, moved: false, x: 0, y: 0, startX: 0, startY: 0, px: 0, py: 0 });
  const visible = useRef(false);
  const hoveredRef = useRef<number | null>(null);
  const reducedMotion = useRef(false);

  const n = entries.length;
  const targets = useMemo(() => sceneTargets(view, n, layout), [view, n, layout]);

  useEffect(() => {
    hoveredRef.current = hovered;
  }, [hovered]);

  // Size the stage and cards from the container width.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const card = Math.max(38, Math.min(84, Math.min(w, h) * 0.11));
      setLayout({ w, h, card });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Only animate while the stage is on screen. Cards start collapsed at the
  // center and burst outward the first time the section scrolls into view.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(([entry]) => {
      visible.current = entry.isIntersecting;
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (current.current.length !== n) {
      current.current = Array.from({ length: n }, () => ({ x: 0, y: 0, z: -400, rot: 0 }));
    }
  }, [n]);

  useEffect(() => {
    let frame = 0;
    const spins = view === "sphere" || view === "orbit";

    const tick = () => {
      frame = requestAnimationFrame(tick);
      if (!visible.current) return;
      const cam = camera.current;
      const still = reducedMotion.current;

      if (spins) {
        if (!pointer.current.down) {
          cam.yawVel += ((still ? 0 : AUTO_SPIN) - cam.yawVel) * 0.03;
          cam.pitchVel *= 0.9;
        }
        cam.yaw += cam.yawVel;
        const basePitch = view === "orbit" ? -0.32 : -0.18;
        cam.pitch += cam.pitchVel;
        cam.pitch += (basePitch - cam.pitch) * (pointer.current.down ? 0 : 0.02);
        cam.pitch = Math.max(-1.1, Math.min(1.1, cam.pitch));
      }

      // Gentle parallax from the cursor in the flat views.
      const parallaxX = spins ? 0 : pointer.current.px * 18;
      const parallaxY = spins ? 0 : pointer.current.py * 12;
      const ease = still ? 1 : EASE;

      for (let i = 0; i < n; i++) {
        const el = cardRefs.current[i];
        const t = targets[i];
        if (!el || !t) continue;
        const goal = spins ? rotate(t, cam.yaw, cam.pitch) : t;
        const c = current.current[i];
        c.x += (goal.x - c.x) * ease;
        c.y += (goal.y - c.y) * ease;
        c.z += (goal.z - c.z) * ease;
        c.rot += (goal.rot - c.rot) * ease;

        const depth = FOCAL / (FOCAL - c.z);
        const isHover = hoveredRef.current === i;
        const scale = depth * (isHover ? 1.35 : 1);
        const x = c.x * depth + parallaxX * depth;
        const y = c.y * depth + parallaxY * depth;
        const near = Math.max(0, Math.min(1, (c.z + 400) / 800));
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) rotate(${c.rot.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
        el.style.opacity = (spins ? 0.28 + near * 0.72 : 1).toFixed(3);
        el.style.zIndex = String(isHover ? 5000 : Math.round(c.z + 2000));
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [n, targets, view]);

  const onPointerDown = (e: React.PointerEvent) => {
    const p = pointer.current;
    p.down = true;
    p.moved = false;
    p.x = p.startX = e.clientX;
    p.y = p.startY = e.clientY;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const rect = stageRef.current?.getBoundingClientRect();
    const p = pointer.current;
    if (rect) {
      p.px = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      p.py = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    }
    if (!p.down) return;
    if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > DRAG_THRESHOLD) p.moved = true;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    const cam = camera.current;
    cam.yawVel = dx * 0.006;
    cam.pitchVel = -dy * 0.004;
  };

  const endDrag = () => {
    pointer.current.down = false;
  };

  const open = (i: number) => {
    if (pointer.current.moved) return;
    setSelected(i);
  };

  const step = useCallback(
    (delta: number) => setSelected((s) => (s === null ? s : (s + delta + n) % n)),
    [n],
  );

  useEffect(() => {
    if (selected === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, step]);

  const spins = view === "sphere" || view === "orbit";
  const active = selected === null ? null : entries[selected];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-1" role="tablist" aria-label="Sketchbook view">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              className={`font-mono text-[11px] uppercase tracking-[0.14em] px-3 py-1.5 border transition-colors cursor-pointer ${
                view === v.id
                  ? "border-darkblue text-darkblue bg-cream-dark"
                  : "border-transparent text-brown-light hover:text-darkblue"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <p className="meta">
          {n} pages · {spins ? "drag to spin, " : ""}click a page to open
        </p>
      </div>

      <div
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => {
          endDrag();
          pointer.current.px = 0;
          pointer.current.py = 0;
        }}
        className={`relative h-[520px] md:h-[640px] overflow-hidden border border-[var(--color-line)] bg-cream-dark select-none ${
          spins ? "cursor-grab active:cursor-grabbing" : ""
        }`}
        style={{ touchAction: "pan-y" }}
      >
        <div className="absolute inset-0 pointer-events-none opacity-60 [background-image:radial-gradient(var(--color-line)_1px,transparent_1px)] [background-size:22px_22px]" />
        {entries.map((entry, i) => (
          <button
            key={entry.src}
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
            onClick={() => open(i)}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
            onFocus={() => setHovered(i)}
            onBlur={() => setHovered((h) => (h === i ? null : h))}
            aria-haspopup="dialog"
            aria-label={`Open sketchbook ${pageLabel(entry) || "page"}`}
            className="absolute left-1/2 top-1/2 bg-white shadow-[0_6px_18px_-6px_rgba(22,36,26,0.35)] ring-1 ring-black/5 cursor-pointer will-change-transform transition-shadow hover:shadow-[0_14px_30px_-8px_rgba(22,36,26,0.5)]"
            style={{ width: layout.card, height: layout.card * CARD_ASPECT, opacity: 0 }}
            draggable={false}
          >
            <Image
              src={entry.src}
              alt={entry.caption ?? "Sketchbook page"}
              fill
              sizes="180px"
              className="object-cover pointer-events-none"
              draggable={false}
            />
            {hovered === i && (
              <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 font-mono text-[9px] text-darkblue whitespace-nowrap">
                {pageLabel(entry)}
              </span>
            )}
          </button>
        ))}
      </div>

      <Modal open={active !== null} onClose={() => setSelected(null)} panelClassName="max-w-3xl">
        {active && (
          <figure>
            <Image
              src={active.src}
              alt={active.caption ?? "Sketchbook page"}
              width={1200}
              height={1600}
              sizes="(max-width: 768px) 100vw, 768px"
              className="w-full h-auto max-h-[75vh] object-contain"
            />
            <figcaption className="flex items-center justify-between gap-4 mt-3 font-mono text-[11px] text-brown-light">
              <button onClick={() => step(-1)} className="px-2 py-1 hover:text-darkblue cursor-pointer" aria-label="Previous page">
                ← prev
              </button>
              <span>{active.caption ?? `${(selected ?? 0) + 1} / ${n}`}</span>
              <button onClick={() => step(1)} className="px-2 py-1 hover:text-darkblue cursor-pointer" aria-label="Next page">
                next →
              </button>
            </figcaption>
          </figure>
        )}
      </Modal>
    </>
  );
}
