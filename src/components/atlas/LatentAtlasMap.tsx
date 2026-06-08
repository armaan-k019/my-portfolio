"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import * as THREE from "three";
import {
  LOCATIONS, REGIONS, REGION_ORDER, locationByRoute,
  type AtlasLocation,
} from "@/lib/latent-atlas";

// ============================================================================
// THE LATENT ATLAS MAP (Phase 2: render only. Traversal lands in Phase 3.)
// ============================================================================
// A WebGL survey rendered with three.js and an orthographic camera. One
// THREE.Points draw call carries every location as an SDF diamond glyph in the
// region color, behind a faint graticule and per region contour rings. Labels
// are DOM overlaid with level of detail culling. Lazy loaded and mounted once
// in the root layout so it persists across navigation.

const VIEW = 1000;                 // atlas spans [-500, 500] in world units
const BASE_HALF = 560;             // half height of the default orthographic view
const MOBILE_BP = 768;

// Latent [0,1] to world units, y flipped so y=0 reads as the top of the survey.
function toWorld(x: number, y: number): [number, number] {
  return [(x - 0.5) * VIEW, (0.5 - y) * VIEW];
}
function rgb(c: string): THREE.Color {
  const [r, g, b] = c.split(",").map(Number);
  return new THREE.Color(r / 255, g / 255, b / 255);
}

// Lower priority points are hidden first when labels collide. Regions win.
const TYPE_PRIORITY: Record<string, number> = {
  region: 0, page: 1, project: 2, research: 3, demo: 4, experience: 5, field: 6,
};
// On small screens we hide the noisier point types.
const MOBILE_HIDDEN = new Set(["field", "experience"]);

export default function LatentAtlasMap() {
  const mountRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const reticleRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  const [hover, setHover] = useState<{ loc: AtlasLocation; x: number; y: number } | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    const labelLayer = labelsRef.current;
    if (!mount || !labelLayer) return;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let mobile = window.innerWidth < MOBILE_BP;

    // Which locations are drawn (mobile hides the noisier types).
    const visible: AtlasLocation[] = LOCATIONS.filter((l) => !(mobile && MOBILE_HIDDEN.has(l.type)));

    // ---- renderer / scene / camera -----------------------------------------
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(new THREE.Color("#F7F2E8"), 1);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";

    const scene = new THREE.Scene();
    let W = mount.clientWidth, H = mount.clientHeight;
    const camera = new THREE.OrthographicCamera(-BASE_HALF, BASE_HALF, BASE_HALF, -BASE_HALF, -1000, 1000);
    // camera.position pans; camera.zoom zooms. Default centered, zoomed to fit.
    camera.position.set(0, 0, 10);
    camera.zoom = 1;

    function applyAspect() {
      W = mount!.clientWidth; H = mount!.clientHeight;
      renderer.setSize(W, H, false);
      const aspect = W / H;
      camera.left = -BASE_HALF * aspect;
      camera.right = BASE_HALF * aspect;
      camera.top = BASE_HALF;
      camera.bottom = -BASE_HALF;
      camera.updateProjectionMatrix();
    }
    applyAspect();

    // ---- graticule ----------------------------------------------------------
    {
      const pts: number[] = [];
      const minor: number[] = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const [wx] = toWorld(t, 0);
        const [, wyTop] = toWorld(0, 0);
        const [, wyBot] = toWorld(0, 1);
        const arr = i % 3 === 0 ? pts : minor;
        arr.push(wx, wyTop, 0, wx, wyBot, 0);
        const [, wy] = toWorld(0, t);
        const [wxL] = toWorld(0, 0);
        const [wxR] = toWorld(1, 0);
        arr.push(wxL, wy, 0, wxR, wy, 0);
      }
      const mk = (arr: number[], opacity: number) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
        const m = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity });
        scene.add(new THREE.LineSegments(g, m));
      };
      mk(minor, 0.06);
      mk(pts, 0.1);
    }

    // ---- contour rings per region ------------------------------------------
    REGION_ORDER.forEach((id) => {
      const r = REGIONS[id];
      const [cx, cy] = toWorld(r.center.x, r.center.y);
      const color = rgb(r.color);
      [80, 140, 200, 260].forEach((radius, ring) => {
        const seg = 64;
        const arr: number[] = [];
        for (let i = 0; i < seg; i++) {
          const a0 = (i / seg) * Math.PI * 2;
          const a1 = ((i + 1) / seg) * Math.PI * 2;
          arr.push(cx + Math.cos(a0) * radius, cy + Math.sin(a0) * radius, 0);
          arr.push(cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius, 0);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
        const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.18 - ring * 0.035 });
        scene.add(new THREE.LineSegments(g, m));
      });
    });

    // ---- points (one draw call) --------------------------------------------
    const N = visible.length;
    const positions = new Float32Array(N * 3);
    const colors = new Float32Array(N * 3);
    const sizes = new Float32Array(N);
    const seeds = new Float32Array(N);
    visible.forEach((l, i) => {
      const [wx, wy] = toWorld(l.x, l.y);
      positions[i * 3] = wx; positions[i * 3 + 1] = wy; positions[i * 3 + 2] = 0;
      const c = rgb(REGIONS[l.region].color);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      sizes[i] = l.type === "page" ? 11 : 8;
      seeds[i] = (i * 137.5) % 6.28;
    });
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geom.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geom.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uZoom: { value: 1 },
        uDpr: { value: dpr },
        uReduce: { value: reduceMotion ? 1 : 0 },
      },
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute vec3 aColor; attribute float aSize; attribute float aSeed;
        uniform float uTime, uZoom, uDpr, uReduce;
        varying vec3 vColor;
        void main(){
          vColor = aColor;
          vec3 p = position;
          if (uReduce < 0.5) { p.x += sin(uTime*0.3 + aSeed)*4.0; p.y += cos(uTime*0.27 + aSeed)*4.0; }
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
          gl_PointSize = clamp(aSize * uZoom, 4.0, 24.0) * uDpr;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        void main(){
          vec2 p = gl_PointCoord*2.0 - 1.0;
          float d = abs(p.x) + abs(p.y);            // diamond distance
          float fill = 1.0 - smoothstep(0.78, 0.92, d);
          float stroke = smoothstep(0.86,0.92,d) * (1.0 - smoothstep(0.96,1.06,d));
          float halo = exp(-d*1.8) * 0.22;
          vec3 col = mix(vColor, vColor*0.55, stroke);
          float a = max(fill, halo*(1.0 - fill));
          if (a < 0.01) discard;
          gl_FragColor = vec4(col, a);
        }`,
    });
    const points = new THREE.Points(geom, mat);
    scene.add(points);

    // ---- DOM labels ---------------------------------------------------------
    // One span per region centroid and one per visible point. Positioned each
    // frame, shown by LOD, hidden greedily on overlap (regions win).
    interface LabelEntry { el: HTMLSpanElement; wx: number; wy: number; priority: number; type: string; }
    const labels: LabelEntry[] = [];
    const addLabel = (text: string, wx: number, wy: number, type: string, color?: string) => {
      const el = document.createElement("span");
      el.textContent = text;
      el.className = "atlas-label";
      el.style.cssText = `position:absolute;left:0;top:0;font-family:var(--font-mono),monospace;text-transform:uppercase;letter-spacing:0.08em;white-space:nowrap;pointer-events:none;will-change:transform;color:${color ?? "rgba(40,40,40,0.7)"};`;
      labelLayer.appendChild(el);
      labels.push({ el, wx, wy, priority: TYPE_PRIORITY[type] ?? 9, type });
    };
    REGION_ORDER.forEach((id) => {
      const r = REGIONS[id];
      const [wx, wy] = toWorld(r.labelPos.x, r.labelPos.y);
      addLabel(r.id, wx, wy, "region", `rgba(${r.color},0.85)`);
    });
    visible.forEach((l) => {
      const [wx, wy] = toWorld(l.x, l.y);
      addLabel(l.title, wx, wy, l.type);
    });

    // ---- projection helpers -------------------------------------------------
    const v = new THREE.Vector3();
    function project(wx: number, wy: number): [number, number] {
      v.set(wx, wy, 0).project(camera);
      return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H];
    }

    function layoutLabels() {
      const zoom = camera.zoom;
      const fontPx = Math.max(10, Math.min(13, 9 + zoom * 2));
      // LOD: how many point labels to show based on zoom.
      const showPointLabels = zoom > 1.6 ? 999 : zoom > 1.0 ? 12 : 0;
      const ranked = labels
        .map((L) => {
          const [sx, sy] = project(L.wx, L.wy);
          const dx = sx - W / 2, dy = sy - H / 2;
          return { L, sx, sy, dist: Math.hypot(dx, dy) };
        })
        .sort((a, b) => a.L.priority - b.L.priority || a.dist - b.dist);

      const occupied: Array<[number, number, number, number]> = [];
      let pointShown = 0, total = 0;
      for (const { L, sx, sy } of ranked) {
        let show = sx > -40 && sx < W + 40 && sy > -20 && sy < H + 20;
        if (show && L.type !== "region") {
          if (pointShown >= showPointLabels || total >= 30) show = false;
        }
        if (show) {
          const w = L.el.offsetWidth || L.el.textContent!.length * fontPx * 0.6;
          const h = fontPx + 4;
          const bx = sx + 7, by = sy - h / 2;
          const clash = occupied.some(([ox, oy, ow, oh]) => bx < ox + ow && bx + w > ox && by < oy + oh && by + h > oy);
          if (clash) show = false;
          else {
            occupied.push([bx, by, w, h]);
            L.el.style.transform = `translate(${bx}px, ${by}px)`;
            L.el.style.fontSize = `${fontPx}px`;
            L.el.style.opacity = L.type === "region" ? "1" : "0.7";
            total++;
            if (L.type !== "region") pointShown++;
          }
        }
        L.el.style.display = show ? "block" : "none";
      }
    }

    // ---- you are here reticle ----------------------------------------------
    function updateReticle() {
      const cur = locationByRoute(pathRef.current);
      const el = reticleRef.current;
      if (!el) return;
      if (!cur) { el.style.display = "none"; return; }
      const [wx, wy] = toWorld(cur.x, cur.y);
      const [sx, sy] = project(wx, wy);
      el.style.display = "block";
      el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%)`;
    }

    // ---- interaction: hover, click, zoom, pan ------------------------------
    let mx = -9999, my = -9999;
    const screenPositions = new Float32Array(N * 2);
    function refreshScreenPositions() {
      visible.forEach((l, i) => {
        const [wx, wy] = toWorld(l.x, l.y);
        const [sx, sy] = project(wx, wy);
        screenPositions[i * 2] = sx; screenPositions[i * 2 + 1] = sy;
      });
    }
    function nearestPoint(px: number, py: number): number {
      let best = -1, bestD = 18;
      for (let i = 0; i < N; i++) {
        const d = Math.hypot(screenPositions[i * 2] - px, screenPositions[i * 2 + 1] - py);
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    }

    let hoveredIdx = -1;
    const dom = renderer.domElement;
    const onMove = (e: MouseEvent) => {
      const rect = dom.getBoundingClientRect();
      mx = e.clientX - rect.left; my = e.clientY - rect.top;
      const idx = nearestPoint(mx, my);
      dom.style.cursor = idx >= 0 ? "pointer" : dragging ? "grabbing" : "default";
      if (idx !== hoveredIdx) {
        hoveredIdx = idx;
        setHover(idx >= 0 ? { loc: visible[idx], x: e.clientX, y: e.clientY } : null);
      } else if (idx >= 0) {
        setHover({ loc: visible[idx], x: e.clientX, y: e.clientY });
      }
    };
    const onClick = () => {
      if (hoveredIdx < 0) return;
      const loc = visible[hoveredIdx];
      if (loc.route) router.push(loc.route);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = dom.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      // world point under cursor before zoom
      const beforeNdc = new THREE.Vector3((px / W) * 2 - 1, -(py / H) * 2 + 1, 0).unproject(camera);
      camera.zoom = Math.max(0.6, Math.min(6, camera.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
      camera.updateProjectionMatrix();
      const afterNdc = new THREE.Vector3((px / W) * 2 - 1, -(py / H) * 2 + 1, 0).unproject(camera);
      camera.position.x += beforeNdc.x - afterNdc.x;
      camera.position.y += beforeNdc.y - afterNdc.y;
      camera.updateProjectionMatrix();
    };
    let dragging = false, dragX = 0, dragY = 0;
    const onDown = (e: MouseEvent) => {
      if (mobile || camera.zoom <= 1.001 || hoveredIdx >= 0) return;
      dragging = true; dragX = e.clientX; dragY = e.clientY;
    };
    const onUp = () => { dragging = false; };
    const onDrag = (e: MouseEvent) => {
      if (!dragging) return;
      const worldPerPx = (camera.right - camera.left) / W / camera.zoom;
      camera.position.x -= (e.clientX - dragX) * worldPerPx;
      camera.position.y += (e.clientY - dragY) * worldPerPx;
      dragX = e.clientX; dragY = e.clientY;
      camera.updateProjectionMatrix();
    };
    const onDbl = () => { camera.position.set(0, 0, 10); camera.zoom = 1; camera.updateProjectionMatrix(); };

    dom.addEventListener("mousemove", onMove);
    dom.addEventListener("click", onClick);
    dom.addEventListener("wheel", onWheel, { passive: false });
    dom.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("mousemove", onDrag);
    dom.addEventListener("dblclick", onDbl);

    const onResize = () => { mobile = window.innerWidth < MOBILE_BP; applyAspect(); };
    window.addEventListener("resize", onResize);

    // ---- render loop --------------------------------------------------------
    let raf = 0;
    const t0 = performance.now();
    function frame() {
      const t = (performance.now() - t0) / 1000;
      mat.uniforms.uTime.value = t;
      mat.uniforms.uZoom.value = camera.zoom;
      refreshScreenPositions();
      layoutLabels();
      updateReticle();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      dom.removeEventListener("mousemove", onMove);
      dom.removeEventListener("click", onClick);
      dom.removeEventListener("wheel", onWheel);
      dom.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("mousemove", onDrag);
      dom.removeEventListener("dblclick", onDbl);
      window.removeEventListener("resize", onResize);
      labels.forEach((L) => L.el.remove());
      geom.dispose(); mat.dispose(); renderer.dispose();
      if (dom.parentNode === mount) mount.removeChild(dom);
    };
  }, [router]);

  return (
    <>
      <div ref={mountRef} className="fixed inset-0 z-0" aria-hidden />
      <div ref={labelsRef} className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden />
      <div
        ref={reticleRef}
        className="fixed top-0 left-0 z-0 pointer-events-none"
        style={{ display: "none" }}
        aria-hidden
      >
        <svg width="30" height="30" viewBox="-15 -15 30 30" style={{ overflow: "visible" }}>
          <circle r="9" fill="none" stroke="var(--atlas-reticle)" strokeWidth="1.2" />
          <line x1="-14" y1="0" x2="-5" y2="0" stroke="var(--atlas-reticle)" strokeWidth="1.2" />
          <line x1="5" y1="0" x2="14" y2="0" stroke="var(--atlas-reticle)" strokeWidth="1.2" />
          <line x1="0" y1="-14" x2="0" y2="-5" stroke="var(--atlas-reticle)" strokeWidth="1.2" />
          <line x1="0" y1="5" x2="0" y2="14" stroke="var(--atlas-reticle)" strokeWidth="1.2" />
        </svg>
      </div>
      {hover && (
        <div
          className="fixed z-20 pointer-events-none card px-3 py-2"
          style={{ left: hover.x + 16, top: hover.y + 16, borderRadius: 2 }}
        >
          <p className="font-mono text-[11px] uppercase tracking-wider text-ink leading-tight">{hover.loc.title}</p>
          <p className="coord mt-0.5">{hover.loc.coord}</p>
          <p className="meta mt-0.5" style={{ color: `rgb(${REGIONS[hover.loc.region].color})` }}>
            {REGIONS[hover.loc.region].glyph} {hover.loc.region}
          </p>
        </div>
      )}
    </>
  );
}
