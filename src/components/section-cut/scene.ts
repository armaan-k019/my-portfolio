// Three.js scene for the hero section cut. Imported dynamically by
// SectionCut.tsx so three never lands in the shared bundle.
import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { crossings, figure, type Model } from "./geometry";

const NEAR_BAND = 8;        // metres behind the cut drawn in ink, the rest in hairline
const HATCH = 0.16;         // poché hatch spacing in metres
const CUT_WIDTH = 2.5;      // cut outline, CSS px
const TRAIL = 8;            // earlier cut positions kept as a fading wake
const TRAIL_MS = 600;       // how long a wake section takes to fade out
const TRAIL_STEP = 1.2;     // metres the cut must move before it leaves a wake
const IDLE_AFTER = 8000;    // ms without pointer movement before the model turns
const IDLE_RAMP = 2500;     // ms over which the idle turn eases up to speed
const IDLE_SPEED = 5;       // degrees of azimuth per second at full speed

// Named orthographic views as [azimuth, elevation] in degrees. Azimuth -90 is
// the camera on the -X side looking along +X, so the elevation is the section
// seen face on; plan at azimuth 0 keeps +X running left to right.
const PLAN = [0, 90], AXON = [-45, 30], ELEVATION = [-90, 0];

const smooth = (t: number) => t * t * (3 - 2 * t);
// Pointer height to view: plateaus hold each named view, smoothstep blends
// between. The axonometric holds across the middle 40% of the hero so the view
// stays put unless the pointer clearly moves up or down.
function viewAt(y: number): [number, number] {
  const seg = (a: number[], b: number[], t: number): [number, number] => {
    const k = smooth(Math.min(1, Math.max(0, t)));
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  };
  return y < 0.5 ? seg(PLAN, AXON, (y - 0.1) / 0.2) : seg(AXON, ELEVATION, (y - 0.7) / 0.2);
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

export interface Readout { cut: HTMLElement; view: HTMLElement; ptr: HTMLElement }

export function mount(canvas: HTMLCanvasElement, host: HTMLElement, mode: Mode, readout: Readout, m: Model) {
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

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(m.lines, 3));
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
  // Cut buffers are allocated once and rewritten in place as the pointer
  // moves; they only grow (by doubling, disposing the old GPU buffers) when a
  // cut needs more room than they have.
  const outlineGeo = new LineSegmentsGeometry();
  const outlineMat = new LineMaterial({ color: cut.color, linewidth: CUT_WIDTH, transparent: true, depthTest: false });
  const outline = new LineSegments2(outlineGeo, outlineMat);
  site.renderOrder = 0; far.renderOrder = 1; near.renderOrder = 2; hatch.renderOrder = 3; outline.renderOrder = 4;
  scene.add(site, far, near, hatch, outline);

  // People share the building's near and far materials and cutting planes,
  // so the cut reveals them exactly as it reveals the structure. Walkers only
  // move in live mode; the other modes show the standing figures alone.
  const walkers = mode === "live" ? m.people?.walkers ?? [] : [];
  const standing = m.people?.standing ?? [];
  const peopleGeo = new THREE.BufferGeometry();
  const peopleBuf = new Float32Array((walkers.length + standing.length) * 8 * 6);
  peopleGeo.setAttribute("position", new THREE.BufferAttribute(peopleBuf, 3));
  const peopleNear = new THREE.LineSegments(peopleGeo, near.material);
  const peopleFar = new THREE.LineSegments(peopleGeo, far.material);
  peopleNear.frustumCulled = peopleFar.frustumCulled = false;
  peopleNear.renderOrder = 2; peopleFar.renderOrder = 1;
  scene.add(peopleNear, peopleFar);
  const figs: number[] = [];
  function placePeople(t: number) {
    figs.length = 0;
    for (const w of walkers) figure(figs, w(t));
    for (const s of standing) figure(figs, s);
    peopleBuf.set(figs);
    (peopleGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  }
  placePeople(0);

  const bx = m.bounds;
  const center = new THREE.Vector3(
    (bx.min[0] + bx.max[0]) / 2, (bx.min[1] + bx.max[1]) / 2, (bx.min[2] + bx.max[2]) / 2,
  );
  const radius = new THREE.Vector3(...bx.max).sub(new THREE.Vector3(...bx.min)).length() / 2;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, radius * 8);

  let hatchCap = 0;
  hatch.frustumCulled = false;
  outline.frustumCulled = false;
  function writeHatch(pts: number[]) {
    const n = pts.length / 3;
    if (n > hatchCap) {
      hatchCap = Math.max(n, hatchCap * 2, 1024);
      hatchGeo.dispose();
      hatchGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(hatchCap * 3), 3));
    }
    const attr = hatchGeo.getAttribute("position") as THREE.BufferAttribute;
    (attr.array as Float32Array).set(pts);
    attr.needsUpdate = true;
    hatchGeo.setDrawRange(0, n);
  }
  // Write heavy-line segments into a LineSegments2 in place; its buffer only
  // grows (by doubling, disposing the old one) when it runs out of room.
  const caps = new WeakMap<LineSegments2, number>();
  function fillSegs(obj: LineSegments2, segs: number[]) {
    const n = segs.length / 6;
    const cap = caps.get(obj) ?? 0;
    // A fresh geometry has no instance buffer yet, so allocate on first use
    // even when there is nothing to draw.
    if (n > cap || cap === 0) {
      const next = Math.max(n, cap * 2, 256);
      caps.set(obj, next);
      obj.geometry.dispose();
      const g = new LineSegmentsGeometry();
      g.setPositions(new Float32Array(next * 6));
      obj.geometry = g;
    }
    const g = obj.geometry as LineSegmentsGeometry;
    // setPositions lays each segment out as start xyz then end xyz, the same
    // order the cut writes, in one interleaved buffer.
    const data = (g.getAttribute("instanceStart") as THREE.InterleavedBufferAttribute).data;
    (data.array as Float32Array).set(segs);
    data.needsUpdate = true;
    g.instanceCount = n;
  }

  // The wake: earlier cut sections that fade out over TRAIL_MS, live mode only.
  const trail = mode === "live" ? Array.from({ length: TRAIL }, () => {
    const mat = new LineMaterial({ color: cut.color, linewidth: 1.25, transparent: true, depthTest: false, opacity: 0 });
    const obj = new LineSegments2(new LineSegmentsGeometry(), mat);
    obj.frustumCulled = false;
    obj.renderOrder = 3.5;
    obj.visible = false;
    scene.add(obj);
    return { obj, mat, born: -Infinity };
  }) : [];
  let trailAt = NaN, trailNext = 0;
  function leaveWake(x: number, segs: number[]) {
    if (!trail.length || Math.abs(x - trailAt) < TRAIL_STEP) return;
    trailAt = x;
    const slot = trail[trailNext];
    trailNext = (trailNext + 1) % TRAIL;
    fillSegs(slot.obj, segs);
    slot.born = performance.now();
  }
  function fadeWake(now: number) {
    for (const t of trail) {
      const k = 1 - (now - t.born) / TRAIL_MS;
      t.obj.visible = k > 0;
      t.mat.opacity = Math.max(0, k) * 0.55;
    }
  }

  let station = NaN;
  function setCut(x: number) {
    if (Math.abs(x - station) < 1e-4) return;
    station = x;
    keepBehind.constant = -x;
    nearEnd.constant = x + NEAR_BAND;
    farStart.constant = -(x + NEAR_BAND);

    const rects: number[] = [];
    const hatchPts: number[] = [];
    for (const p of m.solids) {
      const zs = crossings(p.poly, x);
      for (let i = 0; i + 1 < zs.length; i += 2) sectionOf(x, p.y0, p.y1, zs[i], zs[i + 1], rects, hatchPts);
    }
    if (m.shells) {
      const { outer, inner } = m.shells;
      for (let t = 0; t < outer.length; t += 9) {
        const a = triCut(outer, t, x), b = triCut(inner, t, x);
        if (!a || !b) continue;
        rects.push(...a, ...b);
        hatchPts.push((a[0] + a[3]) / 2, (a[1] + a[4]) / 2, (a[2] + a[5]) / 2, (b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
      }
    }
    fillSegs(outline, rects);
    writeHatch(hatchPts);
    leaveWake(x, rects);
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
    const half = radius * 1.05;
    // Wide canvases put the model right of centre, clear of the hero text.
    const c = aspect > 1.3 ? 0.72 : 0.5;
    const width = 2 * half * aspect;
    camera.left = -c * width; camera.right = (1 - c) * width;
    camera.top = half; camera.bottom = -half;
    camera.updateProjectionMatrix();
    outlineMat.resolution.set(w, h);
    for (const t of trail) t.mat.resolution.set(w, h);
  }

  function render() { renderer.render(scene, camera); }

  // Pointer X across the hero sweeps the cut from just before the building to
  // just short of its far end, so some of the model always remains.
  const cutMin = bx.min[0] - 0.5, cutMax = bx.max[0] - 1;
  let pointer: { x: number; y: number } | null = null;
  let client: { x: number; y: number } | null = null;   // null once the pointer leaves
  let lastMove = performance.now();
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    const r = host.getBoundingClientRect();
    pointer = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    client = { x: e.clientX, y: e.clientY };
    lastMove = performance.now();
    if (mode === "reduced") request();
  };
  const onLeave = () => { client = null; if (mode === "reduced") request(); };

  // The station whose section sits under the cursor: project the model's X
  // axis (through its centre) to the canvas and find where the cursor falls
  // along it, clamped to the model's ends. Seen end on (the elevation) the
  // axis collapses to a point and no station is under the cursor, so the
  // mapping blends to the cursor's share of the canvas width instead.
  const axisA = new THREE.Vector3(), axisB = new THREE.Vector3();
  function stationUnder(cx: number, cy: number, share: number) {
    const r = canvas.getBoundingClientRect();
    const toPx = (v: THREE.Vector3) => v.project(camera).set((v.x + 1) / 2 * r.width, (1 - v.y) / 2 * r.height, 0);
    toPx(axisA.set(bx.min[0], center.y, center.z));
    toPx(axisB.set(bx.max[0], center.y, center.z));
    const ux = axisB.x - axisA.x, uy = axisB.y - axisA.y, len2 = ux * ux + uy * uy;
    const px = cx - r.left, py = cy - r.top;
    const along = len2 > 1 ? ((px - axisA.x) * ux + (py - axisA.y) * uy) / len2 : 0;
    const projected = bx.min[0] + along * (bx.max[0] - bx.min[0]);
    const fallback = cutMin + Math.min(1, Math.max(0, share)) * (cutMax - cutMin);
    const k = Math.min(1, Math.max(0, (Math.sqrt(len2) - 40) / 120));
    return Math.min(cutMax, Math.max(cutMin, projected * k + fallback * (1 - k)));
  }

  // Camera state in degrees. Live mode eases toward the pointer's view and
  // adds an idle orbit; the other modes hold the axonometric.
  let az = AXON[0], el = AXON[1], orbit = 0, last = performance.now();

  function frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    if (mode === "live") {
      const [tAz, tEl] = pointer ? viewAt(pointer.y) : [AXON[0], AXON[1]];
      const k = 1 - Math.exp(-8 * dt);
      az += (tAz - az) * k;
      el += (tEl - el) * k;
      const idle = now - lastMove - IDLE_AFTER;
      if (idle > 0) orbit += IDLE_SPEED * smooth(Math.min(1, idle / IDLE_RAMP)) * dt;
      else {
        orbit = ((((orbit + 180) % 360) + 360) % 360) - 180; // unwind the short way
        orbit *= Math.exp(-3 * dt);
      }
    }
    aim(az + orbit, el);
    // The camera is placed first so the cursor is projected against this frame.
    // Once the pointer leaves the hero the cut stays where it was left.
    if (pointer && client) setCut(stationUnder(client.x, client.y, pointer.x));
    else if (!pointer) setCut(m.featured);
    fadeWake(now);
    if (walkers.length) placePeople(now / 1000);
    render();
    report();
  }

  // Readout, derived from the scene as rendered this frame. The DOM is only
  // written when a formatted string changes.
  const shown = { cut: "", view: "", ptr: "" };
  const write = (k: keyof Readout, v: string) => { if (shown[k] !== v) readout[k].textContent = shown[k] = v; };
  const f = (n: number, d: number) => (n < 0 ? "-" : "+") + Math.abs(n).toFixed(d);
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hit = new THREE.Vector3();
  const cutPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const offset = new THREE.Vector3();

  function report() {
    write("cut", `x ${f(station, 2)} m`);
    offset.copy(camera.position).sub(center).normalize();
    const cAz = THREE.MathUtils.radToDeg(Math.atan2(offset.x, offset.z));
    const cEl = THREE.MathUtils.radToDeg(Math.asin(offset.y));
    write("view", `az ${f(cAz, 1)}\u00b0  el ${f(cEl, 1)}\u00b0`);

    let p = "";
    if (client) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((client.x - r.left) / r.width) * 2 - 1, -((client.y - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      // Intersect whichever plane faces the camera more squarely.
      const d = ray.ray.direction;
      cutPlane.constant = -station;
      const plane = Math.abs(d.x) >= Math.abs(d.y) ? cutPlane : ground;
      if (ray.ray.intersectPlane(plane, hit)) {
        if (plane === cutPlane) hit.x = station; // on the plane by construction; avoid float drift
        p = `${f(hit.x, 2)} ${f(hit.y, 2)} ${f(hit.z, 2)}`;
      }
    }
    write("ptr", p);
  }

  // Loop control: live mode runs continuously while visible; the other modes
  // only render on request.
  let raf = 0, visible = true;
  const running = () => mode === "live" && visible && document.visibilityState === "visible";
  function tick() { raf = 0; frame(); if (running()) raf = requestAnimationFrame(tick); }
  function request() { if (!raf) raf = requestAnimationFrame(tick); }

  // intersectionRatio, not isIntersecting: when the hero only touches the
  // viewport edge it counts as intersecting and the loop would keep running.
  const io = new IntersectionObserver(([e]) => {
    visible = e.intersectionRatio > 0;
    if (running()) request();
  }, { threshold: [0, 0.001] });
  const onVis = () => { if (running()) request(); };
  const ro = new ResizeObserver(() => { resize(); request(); });
  io.observe(host);
  ro.observe(canvas);
  document.addEventListener("visibilitychange", onVis);
  if (mode !== "static") {
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
  }

  resize();
  request();

  return () => {
    cancelAnimationFrame(raf);
    io.disconnect(); ro.disconnect();
    document.removeEventListener("visibilitychange", onVis);
    host.removeEventListener("pointermove", onMove);
    host.removeEventListener("pointerleave", onLeave);
    renderer.dispose();
    geo.dispose(); siteGeo.dispose(); hatchGeo.dispose(); outline.geometry.dispose(); peopleGeo.dispose();
    for (const t of trail) { t.obj.geometry.dispose(); t.mat.dispose(); }
    outlineMat.dispose();
  };
}

// The segment where triangle t of a flat mesh crosses the plane x = cut.
function triCut(tri: number[], t: number, x: number): number[] | null {
  const pts: number[] = [];
  for (let e = 0; e < 3; e++) {
    const i = t + e * 3, j = t + ((e + 1) % 3) * 3;
    const xa = tri[i], xb = tri[j];
    if ((xa <= x && xb > x) || (xb <= x && xa > x)) {
      const k = (x - xa) / (xb - xa);
      pts.push(x, tri[i + 1] + k * (tri[j + 1] - tri[i + 1]), tri[i + 2] + k * (tri[j + 2] - tri[i + 2]));
    }
  }
  return pts.length === 6 ? pts : null;
}

// One interval of a prism's section: a rectangle in YZ on the plane x = cut,
// pushed as four outline segments plus a 45 degree hatch clipped to it.
function sectionOf(x: number, y0: number, y1: number, z0: number, z1: number, rects: number[], hatch: number[]) {
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
