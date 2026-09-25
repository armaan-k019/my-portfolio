// Three.js scene for the hero section cut. Imported dynamically by
// SectionCut.tsx so three never lands in the shared bundle.
import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { massing, boxEdges, type Box } from "./massing";

const NEAR_BAND = 8;        // metres behind the cut drawn in ink, the rest in hairline
const HATCH = 0.16;         // poché hatch spacing in metres
const CUT_WIDTH = 2.5;      // cut outline, CSS px
const IDLE_AFTER = 3000;    // ms without pointer movement before the model turns
const IDLE_SPEED = 5;       // degrees of azimuth per second while idle

// Named orthographic views as [azimuth, elevation] in degrees. Azimuth -90 is
// the camera on the -X side looking along +X, so the elevation is the section
// seen face on; plan at azimuth 0 keeps +X running left to right.
const PLAN = [0, 90], AXON = [-45, 30], ELEVATION = [-90, 0];

const smooth = (t: number) => t * t * (3 - 2 * t);
// Pointer height to view: plateaus hold each named view, smoothstep blends between.
function viewAt(y: number): [number, number] {
  const seg = (a: number[], b: number[], t: number): [number, number] => {
    const k = smooth(Math.min(1, Math.max(0, t)));
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  };
  return y < 0.5 ? seg(PLAN, AXON, (y - 0.12) / 0.3) : seg(AXON, ELEVATION, (y - 0.58) / 0.3);
}

// Tailwind emits the theme tokens as hex; --color-line carries its alpha as
// an 8-digit hex (#2d5a271a), which THREE.Color does not read.
function token(name: string) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const hex = raw.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (hex) return { color: new THREE.Color(`#${hex[1]}`), alpha: hex[2] ? parseInt(hex[2], 16) / 255 : 1 };
  const rgb = raw.match(/rgba?\(([^)]+)\)/);
  if (rgb) {
    const [r, g, b, a = "1"] = rgb[1].split(",").map((s) => s.trim());
    return { color: new THREE.Color(`rgb(${r}, ${g}, ${b})`), alpha: parseFloat(a) };
  }
  return { color: new THREE.Color(raw || "#000"), alpha: 1 };
}

function lineMat(t: { color: THREE.Color; alpha: number }, clip: THREE.Plane[]) {
  return new THREE.LineBasicMaterial({
    color: t.color, opacity: t.alpha, transparent: t.alpha < 1,
    depthTest: false, depthWrite: false, clippingPlanes: clip,
  });
}

// live: pointer drives the cut, render loop runs while the hero is visible.
// reduced: fixed axonometric; the cut still follows the pointer, rendered on demand.
// static: one axonometric frame, re-rendered only on resize.
export type Mode = "live" | "reduced" | "static";

export function mount(canvas: HTMLCanvasElement, host: HTMLElement, mode: Mode) {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.localClippingEnabled = true;

  const ink = token("--color-ink");
  const hair = token("--color-line");
  const cut = token("--color-terracotta");

  const m = massing();
  const structure: number[] = [];
  for (const b of m.boxes) boxEdges(b, structure);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute([...structure, ...m.detail], 3));
  const siteGeo = new THREE.BufferGeometry();
  siteGeo.setAttribute("position", new THREE.Float32BufferAttribute(m.site, 3));

  // Clipping planes keep the positive side: x >= cut, and so on.
  const keepBehind = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
  const nearEnd = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
  const farStart = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);

  const scene = new THREE.Scene();
  const far = new THREE.LineSegments(geo, lineMat(hair, [farStart]));
  const near = new THREE.LineSegments(geo, lineMat(ink, [keepBehind, nearEnd]));
  const site = new THREE.LineSegments(siteGeo, lineMat(hair, [keepBehind]));
  const hatchGeo = new THREE.BufferGeometry();
  const hatch = new THREE.LineSegments(hatchGeo, lineMat({ color: cut.color, alpha: 0.35 }, []));
  const outlineGeo = new LineSegmentsGeometry();
  const outlineMat = new LineMaterial({ color: cut.color, linewidth: CUT_WIDTH, transparent: true, depthTest: false });
  const outline = new LineSegments2(outlineGeo, outlineMat);
  site.renderOrder = 0; far.renderOrder = 1; near.renderOrder = 2; hatch.renderOrder = 3; outline.renderOrder = 4;
  scene.add(site, far, near, hatch, outline);

  const bx = m.bounds;
  const center = new THREE.Vector3(
    (bx.min[0] + bx.max[0]) / 2, (bx.min[1] + bx.max[1]) / 2, (bx.min[2] + bx.max[2]) / 2,
  );
  const radius = new THREE.Vector3(...bx.max).sub(new THREE.Vector3(...bx.min)).length() / 2;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, radius * 8);

  let station = NaN;
  function setCut(x: number) {
    if (Math.abs(x - station) < 1e-4) return;
    station = x;
    keepBehind.constant = -x;
    nearEnd.constant = x + NEAR_BAND;
    farStart.constant = -(x + NEAR_BAND);

    const rects: number[] = [];
    const hatchPts: number[] = [];
    for (const b of m.boxes) {
      if (!(b.min[0] < x && x < b.max[0])) continue;
      sectionOf(b, x, rects, hatchPts);
    }
    outlineGeo.setPositions(rects.length ? rects : [x, 0, 0, x, 0, 0]);
    hatchGeo.setAttribute("position", new THREE.Float32BufferAttribute(hatchPts, 3));
  }

  function aim(azDeg: number, elDeg: number) {
    const az = THREE.MathUtils.degToRad(azDeg), el = THREE.MathUtils.degToRad(elDeg);
    const d = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    camera.up.set(-Math.sin(el) * Math.sin(az), Math.cos(el), -Math.sin(el) * Math.cos(az));
    camera.position.copy(center).addScaledVector(d, radius * 4);
    camera.lookAt(center);
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    const half = radius * 0.98;
    // Wide canvases put the model right of centre, clear of the hero text.
    const c = aspect > 1.3 ? 0.68 : 0.5;
    const width = 2 * half * aspect;
    camera.left = -c * width; camera.right = (1 - c) * width;
    camera.top = half; camera.bottom = -half;
    camera.updateProjectionMatrix();
    outlineMat.resolution.set(w, h);
  }

  function render() { renderer.render(scene, camera); }

  // Pointer X across the hero sweeps the cut from just before the building to
  // just short of its far end, so some of the model always remains.
  const cutMin = bx.min[0] - 0.5, cutMax = bx.max[0] - 1;
  let pointer: { x: number; y: number } | null = null;
  let lastMove = performance.now();
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    const r = host.getBoundingClientRect();
    pointer = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    lastMove = performance.now();
    if (mode === "reduced") request();
  };

  // Camera state in degrees. Live mode eases toward the pointer's view and
  // adds an idle orbit; the other modes hold the axonometric.
  let az = AXON[0], el = AXON[1], orbit = 0, last = performance.now();

  function frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    const x = pointer ? cutMin + Math.min(1, Math.max(0, pointer.x)) * (cutMax - cutMin) : m.core;
    setCut(x);

    if (mode === "live") {
      const [tAz, tEl] = pointer ? viewAt(pointer.y) : [AXON[0], AXON[1]];
      const k = 1 - Math.exp(-8 * dt);
      az += (tAz - az) * k;
      el += (tEl - el) * k;
      if (now - lastMove > IDLE_AFTER) orbit += IDLE_SPEED * dt;
      else {
        orbit = ((((orbit + 180) % 360) + 360) % 360) - 180; // unwind the short way
        orbit *= Math.exp(-3 * dt);
      }
    }
    aim(az + orbit, el);
    render();
  }

  // Loop control: live mode runs continuously while visible; the other modes
  // only render on request.
  let raf = 0, visible = true;
  const running = () => mode === "live" && visible && document.visibilityState === "visible";
  function tick() { raf = 0; frame(); if (running()) raf = requestAnimationFrame(tick); }
  function request() { if (!raf) raf = requestAnimationFrame(tick); }

  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (running()) request(); });
  const onVis = () => { if (running()) request(); };
  const ro = new ResizeObserver(() => { resize(); request(); });
  io.observe(host);
  ro.observe(canvas);
  document.addEventListener("visibilitychange", onVis);
  if (mode !== "static") host.addEventListener("pointermove", onMove);

  resize();
  request();

  return () => {
    cancelAnimationFrame(raf);
    io.disconnect(); ro.disconnect();
    document.removeEventListener("visibilitychange", onVis);
    host.removeEventListener("pointermove", onMove);
    renderer.dispose();
    geo.dispose(); siteGeo.dispose(); hatchGeo.dispose(); outlineGeo.dispose();
    outlineMat.dispose();
  };
}

// Section of an axis-aligned box by the plane x = cut: one rectangle in YZ,
// pushed as four outline segments plus a 45 degree hatch clipped to it.
function sectionOf(b: Box, x: number, rects: number[], hatch: number[]) {
  const [, y0, z0] = b.min, [, y1, z1] = b.max;
  rects.push(
    x, y0, z0, x, y0, z1, x, y0, z1, x, y1, z1,
    x, y1, z1, x, y1, z0, x, y1, z0, x, y0, z0,
  );
  // Lines y - z = c for c spanning the rectangle, clipped to its edges.
  const cMin = y0 - z1, cMax = y1 - z0;
  for (let c = Math.ceil(cMin / HATCH) * HATCH; c <= cMax; c += HATCH) {
    const za = Math.max(z0, y0 - c), zb = Math.min(z1, y1 - c);
    if (zb - za < 1e-6) continue;
    hatch.push(x, za + c, za, x, zb + c, zb);
  }
}
