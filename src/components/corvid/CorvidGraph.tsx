"use client";

import { useEffect, useRef, useState } from "react";
import type * as THREEType from "three";
import { communityColor, communityLabel, type CorvidNode } from "@/lib/corvid";

// The corpus graph from the corvid snapshot, drawn the way the lab draws it:
// soft glowing points sized by influence, faint community-hued edges plus warm
// arced bridges between fields, a layered cloud of light per field with its
// name floating above it, star dust behind, and a light bloom. Drag to orbit,
// scroll to zoom, hover a point for its title. Three.js loads only when this
// component mounts, so no other page pays for it.
//
// The constants below are copied from the lab's own field
// (kazi_lab apps/web/components/web/web-graph-3d.tsx) so the two match.

const BG = 0x121a16; // corvid's ground
const LAYOUT_SCALE = 52;
const CAMERA_START = 72;
const PIXEL_RATIO_CAP = 2;
const FOG_DENSITY = 0.006;

const POINT_SIZE_MIN = 2.8;
const POINT_SIZE_MAX = 8.0;
const POINT_SIZE_SCALE = 300;
const HOVER_SCALE = 1.45;
const DIM_ALPHA = 0.14;
const LEGEND_DIM = 0.55; // dim mix for papers outside the emphasized field

const MAX_EDGES_DRAWN = 3000;
const INTRA_TOP_K = 4;
const INTRA_ALPHA = 0.1;
const BRIDGE_ALPHA = 0.34;
const BRIDGE_COLOR = 0xd8b088;
const BRIDGE_ARC_SEGMENTS = 10;
const BRIDGE_ARC_LIFT = 0.14;

const CLOUD_LAYERS = 4;
const CLOUD_SPRITE_OPACITY = 0.06;
const CLOUD_BASE_SCALE = 1.2;
const CLOUD_LAYER_SCALES = [0.8, 1.0, 1.15, 1.3];
const CLOUD_JITTER = 0.4;
const CLOUD_FADE_MS = 600;
const CLOUD_DRIFT_SCALE = 0.018;
const CLOUD_DRIFT_POS = 0.5;
const CLOUD_DRIFT_PERIOD_MS_MIN = 8000;
const CLOUD_DRIFT_PERIOD_MS_MAX = 15000;
const CLOUD_INSIDE_FADE = 1.15;

const LABEL_COLOR = "#e9e6de";
const LABEL_MAX_OPACITY = 0.85;
const LABEL_FADE_NEAR = 14;
const LABEL_FADE_RANGE = 14;
const LABEL_WORLD_HEIGHT = 3.2;

const ORBIT_ROTATE_SPEED = -0.9; // negative: grab-the-world orbit, as in the lab
const DAMPING_FACTOR = 0.06;
const IDLE_ROTATE_DELAY_MS = 5000;
const IDLE_ROTATE_SPEED = 0.4;
const IDLE_ROTATE_EASE = 0.02;
const RAY_POINT_THRESHOLD = 1.5;

const BLOOM_STRENGTH = 0.5;
const BLOOM_RADIUS = 0.55;
const BLOOM_THRESHOLD = 0.6;

const PULSE_CYCLE_S = 7;
const PULSE_DENSITY_INTRA = 0.05;
const PULSE_DENSITY_BRIDGE = 0.3;
const PULSE_WINDOW_FRAC = 0.22;
const PULSE_SIGMA = 0.07;
const PULSE_GAIN = 1.5;

const STAR_COUNT = 240;
const STAR_ALPHA = 0.32;
const STAR_SIZE = 1.1;
const STAR_COUNTER_ROTATE = 0.004;

const EDGE_PROX_BOOST = 0.35;
const EDGE_PROX_FALLOFF = 45;

// Small seeded PRNG so the clouds and stars sit in the same place every load.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const POINT_VERTEX = `
attribute float aSize;
attribute vec3 aColor;
attribute float aHighlight;
attribute float aDim;
varying vec3 vColor;
varying float vHighlight;
varying float vDim;
varying float vFog;
uniform float uFogDensity;
void main() {
  vColor = aColor;
  vHighlight = aHighlight;
  vDim = aDim;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float depth = -mv.z;
  float scale = 1.0 + ${(HOVER_SCALE - 1).toFixed(2)} * aHighlight;
  gl_PointSize = aSize * scale * (${POINT_SIZE_SCALE.toFixed(1)} / max(depth, 1.0));
  float f = uFogDensity * depth;
  vFog = exp(-f * f);
  gl_Position = projectionMatrix * mv;
}
`;
const POINT_FRAGMENT = `
varying vec3 vColor;
varying float vHighlight;
varying float vDim;
varying float vFog;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv) * 2.0;
  if (d > 1.0) discard;
  float core = smoothstep(0.38, 0.0, d);
  float glow = pow(1.0 - d, 2.4);
  float alpha = core * 1.0 + glow * 0.6;
  float grey = dot(vColor, vec3(0.299, 0.587, 0.114));
  vec3 base = mix(vColor, vec3(grey), vDim * 0.65);
  alpha *= mix(1.0, ${DIM_ALPHA.toFixed(2)}, vDim);
  vec3 col = base * (0.9 + 0.7 * vHighlight) + vec3(0.5) * core * 0.35 * (1.0 + vHighlight);
  gl_FragColor = vec4(col * alpha * vFog, alpha * vFog);
}
`;
const LINE_VERTEX = `
attribute vec3 aColor;
attribute float aAlpha;
attribute float aGrad;
attribute float aRand;
varying vec3 vColor;
varying float vAlpha;
varying float vFog;
varying float vPulse;
uniform float uFogDensity;
uniform float uTime;
uniform float uPulseDensity;
uniform float uPulseGain;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float depth = -mv.z;
  float prox = 1.0 + ${EDGE_PROX_BOOST.toFixed(2)} * exp(-depth / ${EDGE_PROX_FALLOFF.toFixed(1)});
  vAlpha = aAlpha * prox;
  float cyc = floor(uTime / ${PULSE_CYCLE_S.toFixed(1)} + aRand);
  float gate = step(fract(sin(cyc * 127.1 + aRand * 311.7) * 43758.5453), uPulseDensity);
  float sweep = fract(uTime / ${PULSE_CYCLE_S.toFixed(1)} + aRand) / ${PULSE_WINDOW_FRAC.toFixed(2)};
  float band = gate * (1.0 - step(1.0, sweep)) * exp(-pow((aGrad - sweep) / ${PULSE_SIGMA.toFixed(3)}, 2.0));
  vPulse = band * uPulseGain;
  float f = uFogDensity * depth;
  vFog = exp(-f * f);
  gl_Position = projectionMatrix * mv;
}
`;
const LINE_FRAGMENT = `
varying vec3 vColor;
varying float vAlpha;
varying float vFog;
varying float vPulse;
void main() {
  float a = min(1.0, vAlpha * (1.0 + vPulse) + 0.06 * vPulse);
  vec3 col = vColor * (1.0 + 0.9 * vPulse);
  gl_FragColor = vec4(col * a * vFog, a * vFog);
}
`;

interface Props {
  nodes: CorvidNode[];
  edges: [number, number, number][];
  highlight: number | null; // community to emphasize, or null
}

export default function CorvidGraph({ nodes, edges, highlight }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const highlightRef = useRef<(c: number | null) => void>(() => {});
  // The latest selection, so one made while three.js is still loading is
  // applied once the scene exists.
  const latestHighlight = useRef(highlight);
  const [hover, setHover] = useState<{ x: number; y: number; label: string } | null>(null);
  const [noWebGL, setNoWebGL] = useState(false);

  useEffect(() => {
    latestHighlight.current = highlight;
    highlightRef.current(highlight);
  }, [highlight]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || nodes.length === 0) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const [THREE, { OrbitControls }, { EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
        import("three"),
        import("three/examples/jsm/controls/OrbitControls.js"),
        import("three/examples/jsm/postprocessing/EffectComposer.js"),
        import("three/examples/jsm/postprocessing/RenderPass.js"),
        import("three/examples/jsm/postprocessing/UnrealBloomPass.js"),
        import("three/examples/jsm/postprocessing/OutputPass.js"),
      ]);
      if (disposed) return;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      // No WebGL (disabled, blocked, or a lost context): show a note instead
      // of an empty panel.
      let renderer: THREEType.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true });
      } catch {
        setNoWebGL(true);
        return;
      }
      const width = mount.clientWidth || 800;
      const height = mount.clientHeight || 500;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_RATIO_CAP));
      renderer.setSize(width, height);
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(BG);
      scene.fog = new THREE.FogExp2(BG, FOG_DENSITY);
      const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 2000);
      camera.position.set(0, 0, CAMERA_START);

      const composer = new EffectComposer(renderer);
      composer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_RATIO_CAP));
      composer.setSize(width, height);
      composer.addPass(new RenderPass(scene, camera));
      const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = DAMPING_FACTOR;
      controls.rotateSpeed = ORBIT_ROTATE_SPEED;
      controls.autoRotate = false;
      controls.autoRotateSpeed = 0;

      // Layout: center the cloud in a cube, as the lab does.
      let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (const { p } of nodes) {
        minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
        minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
        minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]);
      }
      const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-6);
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
      const pos = nodes.map(({ p }) => new THREE.Vector3(((p[0] - cx) / span) * LAYOUT_SCALE, ((p[1] - cy) / span) * LAYOUT_SCALE, ((p[2] - cz) / span) * LAYOUT_SCALE));
      const tmp = new THREE.Color();
      const bridgeColor = new THREE.Color(BRIDGE_COLOR);

      // Points.
      const n = nodes.length;
      const maxInfluence = Math.max(1, ...nodes.map((d) => d.influence));
      const positions = new Float32Array(n * 3);
      const colors = new Float32Array(n * 3);
      const sizes = new Float32Array(n);
      const highlights = new Float32Array(n);
      const dims = new Float32Array(n);
      nodes.forEach((d, i) => {
        pos[i].toArray(positions, i * 3);
        tmp.set(communityColor(d.community));
        if (d.bridge) tmp.lerp(bridgeColor, 0.35);
        tmp.toArray(colors, i * 3);
        sizes[i] = POINT_SIZE_MIN + (POINT_SIZE_MAX - POINT_SIZE_MIN) * Math.sqrt(d.influence / maxInfluence);
      });
      const pointGeo = new THREE.BufferGeometry();
      pointGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      pointGeo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
      pointGeo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
      const highlightAttr = new THREE.BufferAttribute(highlights, 1);
      const dimAttr = new THREE.BufferAttribute(dims, 1);
      pointGeo.setAttribute("aHighlight", highlightAttr);
      pointGeo.setAttribute("aDim", dimAttr);
      const pointMat = new THREE.ShaderMaterial({
        vertexShader: POINT_VERTEX,
        fragmentShader: POINT_FRAGMENT,
        uniforms: { uFogDensity: { value: FOG_DENSITY } },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const points = new THREE.Points(pointGeo, pointMat);
      points.renderOrder = 3;
      scene.add(points);

      // Star dust.
      const starRand = mulberry32(20260723);
      const starPositions = new Float32Array(STAR_COUNT * 3);
      for (let i = 0; i < STAR_COUNT; i++) {
        const theta = starRand() * Math.PI * 2;
        const phi = Math.acos(2 * starRand() - 1);
        const r = LAYOUT_SCALE * (4 + 4 * starRand());
        starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        starPositions[i * 3 + 2] = r * Math.cos(phi);
      }
      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
      const starMat = new THREE.PointsMaterial({ color: 0x9aa4b8, size: STAR_SIZE, sizeAttenuation: false, transparent: true, opacity: STAR_ALPHA, depthWrite: false });
      const stars = new THREE.Points(starGeo, starMat);
      scene.add(stars);

      // Edges: bridges between fields first, then each paper's strongest
      // in-field edges, capped like the lab.
      type Drawn = { a: number; b: number; w: number };
      const bridgesAll: Drawn[] = [];
      const intraAll: Drawn[] = [];
      for (const [a, b, w] of edges) {
        if (a === b) continue;
        const ca = nodes[a].community;
        const cb = nodes[b].community;
        (ca === null || cb === null || ca !== cb ? bridgesAll : intraAll).push({ a, b, w });
      }
      bridgesAll.sort((x, y) => y.w - x.w);
      intraAll.sort((x, y) => y.w - x.w);
      const perNode = new Map<number, number>();
      const intraKept: Drawn[] = [];
      for (const e of intraAll) {
        const na = perNode.get(e.a) ?? 0;
        const nb = perNode.get(e.b) ?? 0;
        if (na >= INTRA_TOP_K && nb >= INTRA_TOP_K) continue;
        perNode.set(e.a, na + 1);
        perNode.set(e.b, nb + 1);
        intraKept.push(e);
      }
      const drawnBridges = bridgesAll.slice(0, MAX_EDGES_DRAWN);
      const drawnIntra = intraKept.slice(0, MAX_EDGES_DRAWN - drawnBridges.length);
      const maxWeight = Math.max(1e-6, ...edges.map((e) => e[2]));
      const pulseRng = mulberry32(31337);

      const makeLineMat = (density: number) =>
        new THREE.ShaderMaterial({
          vertexShader: LINE_VERTEX,
          fragmentShader: LINE_FRAGMENT,
          uniforms: {
            uFogDensity: { value: FOG_DENSITY },
            uTime: { value: 0 },
            uPulseDensity: { value: reducedMotion ? 0 : density },
            uPulseGain: { value: PULSE_GAIN },
          },
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });

      const intraCount = drawnIntra.length * 2;
      const intraPos = new Float32Array(intraCount * 3);
      const intraCol = new Float32Array(intraCount * 3);
      const intraBase = new Float32Array(intraCount);
      const intraAlpha = new Float32Array(intraCount);
      const intraGrad = new Float32Array(intraCount);
      const intraRand = new Float32Array(intraCount);
      drawnIntra.forEach((e, k) => {
        const w = INTRA_ALPHA * (0.5 + 0.5 * (e.w / maxWeight));
        const r = pulseRng();
        ([e.a, e.b] as const).forEach((idx, slot) => {
          const v = k * 2 + slot;
          pos[idx].toArray(intraPos, v * 3);
          tmp.set(communityColor(nodes[idx].community)).toArray(intraCol, v * 3);
          intraBase[v] = w;
          intraAlpha[v] = w;
          intraGrad[v] = slot;
          intraRand[v] = r;
        });
      });
      const intraGeo = new THREE.BufferGeometry();
      intraGeo.setAttribute("position", new THREE.BufferAttribute(intraPos, 3));
      intraGeo.setAttribute("aColor", new THREE.BufferAttribute(intraCol, 3));
      const intraAlphaAttr = new THREE.BufferAttribute(intraAlpha, 1);
      intraGeo.setAttribute("aAlpha", intraAlphaAttr);
      intraGeo.setAttribute("aGrad", new THREE.BufferAttribute(intraGrad, 1));
      intraGeo.setAttribute("aRand", new THREE.BufferAttribute(intraRand, 1));
      const intraMat = makeLineMat(PULSE_DENSITY_INTRA);
      const intraLines = new THREE.LineSegments(intraGeo, intraMat);
      intraLines.renderOrder = 2;
      scene.add(intraLines);

      // Bridges arc gently away from the center so long spans read as bridges.
      const degree = new Map<number, number>();
      for (const [a, b] of edges) {
        degree.set(a, (degree.get(a) ?? 0) + 1);
        degree.set(b, (degree.get(b) ?? 0) + 1);
      }
      const segs = BRIDGE_ARC_SEGMENTS;
      const bridgeCount = drawnBridges.length * segs * 2;
      const bridgePos = new Float32Array(bridgeCount * 3);
      const bridgeCol = new Float32Array(bridgeCount * 3);
      const bridgeBase = new Float32Array(bridgeCount);
      const bridgeAlpha = new Float32Array(bridgeCount);
      const bridgeGrad = new Float32Array(bridgeCount);
      const bridgeRand = new Float32Array(bridgeCount);
      drawnBridges.forEach((e, k) => {
        const va = pos[e.a];
        const vb = pos[e.b];
        const mid = va.clone().add(vb).multiplyScalar(0.5);
        const lift = mid.clone();
        if (lift.lengthSq() < 1e-6) lift.set(0, 1, 0);
        lift.normalize().multiplyScalar(va.distanceTo(vb) * BRIDGE_ARC_LIFT);
        const samples = new THREE.QuadraticBezierCurve3(va.clone(), mid.add(lift), vb.clone()).getPoints(segs);
        const w = BRIDGE_ALPHA * (0.55 + 0.45 * (e.w / maxWeight));
        const towardB = (degree.get(e.b) ?? 0) >= (degree.get(e.a) ?? 0);
        const r = pulseRng();
        for (let s = 0; s < segs; s++) {
          for (let slot = 0; slot < 2; slot++) {
            const v = (k * segs + s) * 2 + slot;
            samples[s + slot].toArray(bridgePos, v * 3);
            bridgeColor.toArray(bridgeCol, v * 3);
            bridgeBase[v] = w;
            bridgeAlpha[v] = w;
            const t = (s + slot) / segs;
            bridgeGrad[v] = towardB ? t : 1 - t;
            bridgeRand[v] = r;
          }
        }
      });
      const bridgeGeo = new THREE.BufferGeometry();
      bridgeGeo.setAttribute("position", new THREE.BufferAttribute(bridgePos, 3));
      bridgeGeo.setAttribute("aColor", new THREE.BufferAttribute(bridgeCol, 3));
      const bridgeAlphaAttr = new THREE.BufferAttribute(bridgeAlpha, 1);
      bridgeGeo.setAttribute("aAlpha", bridgeAlphaAttr);
      bridgeGeo.setAttribute("aGrad", new THREE.BufferAttribute(bridgeGrad, 1));
      bridgeGeo.setAttribute("aRand", new THREE.BufferAttribute(bridgeRand, 1));
      const bridgeMat = makeLineMat(PULSE_DENSITY_BRIDGE);
      const bridgeLines = new THREE.LineSegments(bridgeGeo, bridgeMat);
      bridgeLines.renderOrder = 2;
      scene.add(bridgeLines);

      // Fields: a centroid and spread per community.
      const members = new Map<number, number[]>();
      nodes.forEach((d, i) => {
        if (d.community === null) return;
        const arr = members.get(d.community) ?? [];
        arr.push(i);
        members.set(d.community, arr);
      });
      const fields = [...members].map(([ci, idx]) => {
        const center = new THREE.Vector3();
        for (const i of idx) center.add(pos[i]);
        center.divideScalar(idx.length);
        let rms = 0;
        for (const i of idx) rms += center.distanceToSquared(pos[i]);
        return { ci, center, extent: Math.max(Math.sqrt(rms / idx.length), 2) };
      });

      // Cloud of light per field: a few soft, jittered, slowly drifting sprites.
      const cloudCanvas = document.createElement("canvas");
      cloudCanvas.width = cloudCanvas.height = 256;
      const cctx = cloudCanvas.getContext("2d")!;
      const g = cctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.25, "rgba(255,255,255,0.55)");
      g.addColorStop(0.55, "rgba(255,255,255,0.18)");
      g.addColorStop(0.85, "rgba(255,255,255,0.03)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      cctx.fillStyle = g;
      cctx.fillRect(0, 0, 256, 256);
      const cloudTex = new THREE.CanvasTexture(cloudCanvas);
      cloudTex.colorSpace = THREE.SRGBColorSpace;
      const clouds = fields.flatMap(({ ci, center, extent }) => {
        const rng = mulberry32(4242 + ci * 131);
        return Array.from({ length: CLOUD_LAYERS }, (_, layer) => {
          const mat = new THREE.SpriteMaterial({ map: cloudTex, color: communityColor(ci), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
          const sprite = new THREE.Sprite(mat);
          sprite.renderOrder = 1;
          sprite.raycast = () => {};
          const basePos = center.clone().add(new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).multiplyScalar(extent * CLOUD_JITTER));
          const baseScale = extent * 2 * CLOUD_BASE_SCALE * CLOUD_LAYER_SCALES[layer % CLOUD_LAYER_SCALES.length] * (0.92 + 0.16 * rng());
          sprite.position.copy(basePos);
          sprite.scale.setScalar(baseScale);
          scene.add(sprite);
          return {
            sprite,
            mat,
            ci,
            center,
            radius: extent * CLOUD_BASE_SCALE,
            basePos,
            baseScale,
            driftDir: new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, (rng() * 2 - 1) * 0.5).normalize(),
            phase: rng() * Math.PI * 2,
            periodMs: CLOUD_DRIFT_PERIOD_MS_MIN + rng() * (CLOUD_DRIFT_PERIOD_MS_MAX - CLOUD_DRIFT_PERIOD_MS_MIN),
          };
        });
      });

      // Field names float above each cloud.
      const labels = fields.map(({ ci, center, extent }) => {
        const text = communityLabel(ci);
        const font = "500 30px ui-sans-serif, system-ui, -apple-system, sans-serif";
        const pad = 12;
        const measure = document.createElement("canvas").getContext("2d")!;
        measure.font = font;
        const w = Math.ceil(measure.measureText(text).width) + pad * 2;
        const h = 44 + pad * 2;
        const canvas = document.createElement("canvas");
        canvas.width = w * 2;
        canvas.height = h * 2;
        const ctx = canvas.getContext("2d")!;
        ctx.scale(2, 2);
        ctx.font = font;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(0,0,0,0.85)";
        ctx.shadowBlur = 8;
        ctx.fillStyle = LABEL_COLOR;
        ctx.fillText(text, w / 2, h / 2);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: LABEL_MAX_OPACITY, depthWrite: false, depthTest: false });
        const sprite = new THREE.Sprite(mat);
        sprite.position.copy(center).add(new THREE.Vector3(0, extent * 1.15 + 1.5, 0));
        sprite.scale.set(LABEL_WORLD_HEIGHT * (w / h), LABEL_WORLD_HEIGHT, 1);
        sprite.renderOrder = 10;
        sprite.raycast = () => {};
        scene.add(sprite);
        return { sprite, mat, tex, ci, center };
      });

      // Field emphasis from the legend: dim other papers, their edges, clouds
      // and names, with the lab's factors.
      let emphasis: number | null = null;
      highlightRef.current = (h) => {
        emphasis = h;
        nodes.forEach((d, i) => (dims[i] = h === null || d.community === h ? 0 : LEGEND_DIM));
        dimAttr.needsUpdate = true;
        const apply = (drawn: Drawn[], base: Float32Array, out: Float32Array, per: number, attr: THREEType.BufferAttribute) => {
          drawn.forEach((e, k) => {
            const ca = nodes[e.a].community;
            const cb = nodes[e.b].community;
            const f = h === null ? 1 : ca === h && cb === h ? 1.4 : ca === h || cb === h ? 0.7 : 0.35;
            for (let s = 0; s < per; s++) out[k * per + s] = base[k * per + s] * f;
          });
          attr.needsUpdate = true;
        };
        apply(drawnIntra, intraBase, intraAlpha, 2, intraAlphaAttr);
        apply(drawnBridges, bridgeBase, bridgeAlpha, segs * 2, bridgeAlphaAttr);
      };
      highlightRef.current(latestHighlight.current);

      const resize = () => {
        const w = mount.clientWidth;
        const h = mount.clientHeight;
        renderer.setSize(w, h);
        composer.setSize(w, h);
        camera.aspect = w / Math.max(1, h);
        camera.updateProjectionMatrix();
      };
      resize();
      // Narrow panels (phones) start farther back so the whole cloud fits.
      if (camera.aspect < 1) camera.position.setLength(CAMERA_START / Math.max(0.5, camera.aspect));
      const ro = new ResizeObserver(resize);
      ro.observe(mount);

      // Idle auto-rotation after a few seconds without input, eased in.
      let lastInteraction = performance.now();
      const onStart = () => {
        lastInteraction = performance.now();
        controls.autoRotate = false;
        controls.autoRotateSpeed = 0;
      };
      controls.addEventListener("start", onStart);

      // Hover: raycast the points.
      const ray = new THREE.Raycaster();
      ray.params.Points = { threshold: RAY_POINT_THRESHOLD };
      const ndc = new THREE.Vector2();
      let hovered = -1;
      const setHovered = (i: number) => {
        if (i === hovered) return;
        if (hovered >= 0) highlights[hovered] = 0;
        if (i >= 0) highlights[i] = 1;
        hovered = i;
        highlightAttr.needsUpdate = true;
      };
      const onMove = (e: PointerEvent) => {
        const r = renderer.domElement.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const hit = ray.intersectObject(points)[0];
        if (hit && hit.index !== undefined) {
          setHovered(hit.index);
          setHover({ x: e.clientX - r.left, y: e.clientY - r.top, label: nodes[hit.index].label });
          onStart();
        } else {
          setHovered(-1);
          setHover(null);
        }
      };
      const onLeave = () => {
        setHovered(-1);
        setHover(null);
      };
      renderer.domElement.addEventListener("pointermove", onMove);
      renderer.domElement.addEventListener("pointerleave", onLeave);

      // Draw only while the panel is on screen.
      let raf = 0;
      let lastT = performance.now();
      const loop = () => {
        raf = requestAnimationFrame(loop);
        const now = performance.now();
        const dt = Math.min(0.05, (now - lastT) / 1000);
        lastT = now;

        if (!reducedMotion && now - lastInteraction > IDLE_ROTATE_DELAY_MS) {
          controls.autoRotate = true;
          controls.autoRotateSpeed += (IDLE_ROTATE_SPEED - controls.autoRotateSpeed) * IDLE_ROTATE_EASE;
        }

        for (const l of labels) {
          const fade = Math.min(1, Math.max(0, (camera.position.distanceTo(l.center) - LABEL_FADE_NEAR) / LABEL_FADE_RANGE));
          l.mat.opacity = LABEL_MAX_OPACITY * fade * (emphasis === null || emphasis === l.ci ? 1 : 0.35);
        }

        const fadeStep = dt * (CLOUD_SPRITE_OPACITY / (CLOUD_FADE_MS / 1000));
        for (const c of clouds) {
          let mult = emphasis === null ? 1 : c.ci === emphasis ? 1.3 : 0.35;
          if (camera.position.distanceTo(c.center) < c.radius * CLOUD_INSIDE_FADE) mult = 0;
          const target = CLOUD_SPRITE_OPACITY * mult;
          const delta = target - c.mat.opacity;
          c.mat.opacity = Math.abs(delta) <= fadeStep ? target : c.mat.opacity + Math.sign(delta) * fadeStep;
          if (!reducedMotion) {
            const t = (now / c.periodMs) * Math.PI * 2 + c.phase;
            c.sprite.scale.setScalar(c.baseScale * (1 + CLOUD_DRIFT_SCALE * Math.sin(t)));
            c.sprite.position.copy(c.basePos).addScaledVector(c.driftDir, Math.sin(t * 0.7) * CLOUD_DRIFT_POS);
          }
        }

        if (!reducedMotion) stars.rotation.y -= STAR_COUNTER_ROTATE * dt;
        intraMat.uniforms.uTime.value = now / 1000;
        bridgeMat.uniforms.uTime.value = now / 1000;

        controls.update();
        composer.render();
      };
      const stop = () => {
        cancelAnimationFrame(raf);
        raf = 0;
      };
      const io = new IntersectionObserver(([e]) => {
        if (e.isIntersecting) {
          if (!raf) {
            lastT = performance.now();
            loop();
          }
        } else {
          stop();
        }
      });
      io.observe(mount);

      cleanup = () => {
        stop();
        io.disconnect();
        ro.disconnect();
        controls.removeEventListener("start", onStart);
        renderer.domElement.removeEventListener("pointermove", onMove);
        renderer.domElement.removeEventListener("pointerleave", onLeave);
        controls.dispose();
        for (const geo of [pointGeo, starGeo, intraGeo, bridgeGeo]) geo.dispose();
        for (const mat of [pointMat, starMat, intraMat, bridgeMat]) mat.dispose();
        for (const c of clouds) c.mat.dispose();
        cloudTex.dispose();
        for (const l of labels) {
          l.mat.dispose();
          l.tex.dispose();
        }
        bloom.dispose();
        composer.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [nodes, edges]);

  return (
    <div
      ref={mountRef}
      role="img"
      aria-label={`A 3D map of ${nodes.length} papers, each colored by the field it clustered into.`}
      className="relative h-full w-full cursor-grab active:cursor-grabbing"
    >
      {noWebGL && (
        <p className="meta absolute inset-0 flex items-center justify-center px-6 text-center text-[#9FB0A6]">
          This browser has WebGL turned off, so the paper map can&apos;t be drawn here.
        </p>
      )}
      {hover && <Tooltip hover={hover} panel={mountRef.current} />}
    </div>
  );
}

// Opens below and right of the pointer, flipping above or left near the
// panel's edges so the title is never clipped.
function Tooltip({ hover, panel }: { hover: { x: number; y: number; label: string }; panel: HTMLDivElement | null }) {
  const w = panel?.clientWidth ?? 400;
  const h = panel?.clientHeight ?? 400;
  const flipX = hover.x > w - 252;
  const flipY = hover.y > h - 72;
  return (
    <div
      className="pointer-events-none absolute z-10 max-w-60 rounded-sm bg-[#18221D]/95 px-2.5 py-1.5 text-[12px] leading-snug text-[#EFF4EF]"
      style={{
        left: flipX ? undefined : hover.x + 12,
        right: flipX ? w - hover.x + 12 : undefined,
        top: flipY ? undefined : hover.y + 12,
        bottom: flipY ? h - hover.y + 12 : undefined,
      }}
    >
      {hover.label}
    </div>
  );
}
