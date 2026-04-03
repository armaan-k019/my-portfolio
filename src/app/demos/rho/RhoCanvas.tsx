"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export interface RhoCanvasProps {
  loadMagnitude: number;   // 1–10
  safetyFactor: number;    // 1.5–3.0
  volumeFraction: number;  // 0.1–0.5
  material: string;
  chaos: boolean;
}

// ─── Tensegrity geometry ──────────────────────────────────────────────────────

const R = 1.4;
const H = 1.8;

// 3-strut tensegrity prism
// Bottom triangle: B0, B1, B2 at 0°, 120°, 240°, y = -H/2
// Top triangle: T0, T1, T2 at 60°, 180°, 300°, y = +H/2
function buildTensegrity(
  loadMag: number,
  safetyFactor: number,
  volumeFraction: number,
  chaos: boolean,
  chaosOffset: THREE.Vector3[],
): { nodes: THREE.Vector3[]; struts: [number, number][]; cables: [number, number][]; stresses: number[] } {
  const scale = 0.8 + volumeFraction * 0.8;
  const r = R * scale;
  const h = H * scale;

  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const base = [
    new THREE.Vector3(r * Math.cos(toRad(0)),   -h / 2, r * Math.sin(toRad(0))),
    new THREE.Vector3(r * Math.cos(toRad(120)),  -h / 2, r * Math.sin(toRad(120))),
    new THREE.Vector3(r * Math.cos(toRad(240)),  -h / 2, r * Math.sin(toRad(240))),
    new THREE.Vector3(r * Math.cos(toRad(60)),    h / 2, r * Math.sin(toRad(60))),
    new THREE.Vector3(r * Math.cos(toRad(180)),   h / 2, r * Math.sin(toRad(180))),
    new THREE.Vector3(r * Math.cos(toRad(300)),   h / 2, r * Math.sin(toRad(300))),
  ];

  // Apply chaos perturbation
  const nodes = base.map((n, i) => {
    const offset = chaosOffset[i] ?? new THREE.Vector3();
    const chaosStrength = chaos ? 0.35 * (loadMag / 5) : 0;
    return new THREE.Vector3(
      n.x + offset.x * chaosStrength,
      n.y + offset.y * chaosStrength,
      n.z + offset.z * chaosStrength,
    );
  });

  // Struts (compression): diagonal members
  const struts: [number, number][] = [[0, 4], [1, 5], [2, 3]];
  // Cables (tension): top triangle, bottom triangle, saddle
  const cables: [number, number][] = [
    [0, 1], [1, 2], [2, 0], // bottom
    [3, 4], [4, 5], [5, 3], // top
    [0, 3], [1, 4], [2, 5], // saddle
  ];

  // Compute pseudo-stress for each cable based on load and member length
  const safetyNorm = safetyFactor / 3.0;
  const loadNorm = loadMag / 10.0;
  const stresses = cables.map(([a, b], i) => {
    const len = nodes[a].distanceTo(nodes[b]);
    const baseFactor = [0.3, 0.3, 0.3, 0.4, 0.4, 0.4, 0.9, 0.85, 0.8][i] ?? 0.5;
    return Math.min(1, baseFactor * loadNorm * (2.0 - safetyNorm) * (1 / len) * 2.5);
  });

  return { nodes, struts, cables, stresses };
}

// ─── SIMP density grid ────────────────────────────────────────────────────────

function buildSIMPGrid(volumeFraction: number, iterations: number): number[][] {
  const W = 28;
  const H_GRID = 14;
  const grid: number[][] = Array.from({ length: H_GRID }, () => new Array(W).fill(0));

  // Simulate a cantilevered beam topology
  // Fixed left edge, load at top-right
  for (let y = 0; y < H_GRID; y++) {
    for (let x = 0; x < W; x++) {
      const xn = x / (W - 1);
      const yn = (y - H_GRID / 2) / (H_GRID / 2);

      // Main load path: diagonal from bottom-left to top-right
      const diag = 1 - Math.abs(yn + xn - 0.4) * 1.8;
      // Vertical support near fixed end
      const vert = x < 3 ? 1 : 0;
      // Horizontal top chord
      const top = y === 0 ? 1 - xn * 0.3 : 0;
      // Diagonal bracing
      const brace = Math.max(0, 1 - Math.abs(yn - xn + 0.2) * 2.5);

      const raw = Math.max(diag, vert, top, brace * 0.7);
      grid[y][x] = raw;
    }
  }

  // Apply volume fraction scaling and penalization (SIMP p=3)
  const flatMax = Math.max(...grid.flat());
  const threshold = flatMax * (1 - volumeFraction * 1.8);
  const p = 3;
  const iterFade = Math.min(1, iterations / 30);

  for (let y = 0; y < H_GRID; y++) {
    for (let x = 0; x < W; x++) {
      const raw = grid[y][x];
      let density = raw > threshold ? Math.pow((raw - threshold) / (flatMax - threshold), 1 / p) : 0;
      // Gradually sharpen with iterations
      density = density < 0.5 ? density * (1 - iterFade * 0.6) : density * (0.4 + iterFade * 0.6);
      grid[y][x] = Math.min(1, Math.max(0, density));
    }
  }

  return grid;
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function RhoCanvas({ loadMagnitude, safetyFactor, volumeFraction, material, chaos }: RhoCanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ loadMagnitude, safetyFactor, volumeFraction, material, chaos });
  const iterRef = useRef(0);

  useEffect(() => {
    stateRef.current = { loadMagnitude, safetyFactor, volumeFraction, material, chaos };
  }, [loadMagnitude, safetyFactor, volumeFraction, material, chaos]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ── Renderer ──────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    // ── Scene ─────────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.set(4.5, 2.5, 4.5);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dirLight = new THREE.DirectionalLight(0xfff5e0, 1.2);
    dirLight.position.set(3, 6, 4);
    scene.add(dirLight);

    // ── Chaos offset (random but stable per session) ───────────────────────────
    const chaosOffset = Array.from({ length: 6 }, () =>
      new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5), (Math.random() - 0.5) * 2)
    );

    // ── Grid helper ───────────────────────────────────────────────────────────
    const gridHelper = new THREE.GridHelper(6, 12, 0x1a1a20, 0x1a1a20);
    (gridHelper.material as THREE.Material).opacity = 0.5;
    (gridHelper.material as THREE.Material).transparent = true;
    gridHelper.position.y = -1.5;
    scene.add(gridHelper);

    // ── Color utility ─────────────────────────────────────────────────────────
    function stressColor(t: number): THREE.Color {
      // 0 = cool blue → 0.5 = amber → 1 = coral red
      const low  = new THREE.Color(0x4a9eff);
      const mid  = new THREE.Color(0xf5a623);
      const high = new THREE.Color(0xcc4729);
      if (t < 0.5) return low.lerp(mid, t * 2);
      return mid.lerp(high, (t - 0.5) * 2);
    }

    // ── Build scene objects ───────────────────────────────────────────────────
    let tensGroup = new THREE.Group();
    let simpGroup = new THREE.Group();
    scene.add(tensGroup);
    scene.add(simpGroup);

    function rebuildScene() {
      const s = stateRef.current;
      iterRef.current += 1;

      // Clear old geometry
      tensGroup.clear();
      simpGroup.clear();

      const { nodes, struts, cables, stresses } = buildTensegrity(
        s.loadMagnitude, s.safetyFactor, s.volumeFraction, s.chaos, chaosOffset
      );

      // Strut material (compression)
      const strutMat = new THREE.MeshStandardMaterial({ color: 0xd0cdc8, metalness: 0.7, roughness: 0.3 });

      for (const [a, b] of struts) {
        const start = nodes[a];
        const end = nodes[b];
        const dir = new THREE.Vector3().subVectors(end, start);
        const len = dir.length();
        const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

        const geo = new THREE.CylinderGeometry(0.045, 0.045, len, 8);
        const mesh = new THREE.Mesh(geo, strutMat);
        mesh.position.copy(mid);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        tensGroup.add(mesh);
      }

      // Cable lines (tension)
      for (let i = 0; i < cables.length; i++) {
        const [a, b] = cables[i];
        const stress = stresses[i] ?? 0;
        const color = stressColor(stress);

        const points = [nodes[a].clone(), nodes[b].clone()];
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({ color, linewidth: 1.5 });
        const line = new THREE.Line(geo, mat);
        tensGroup.add(line);
      }

      // Node spheres
      const nodeMat = new THREE.MeshStandardMaterial({ color: 0xfaf8f4, metalness: 0.5, roughness: 0.4 });
      for (const node of nodes) {
        const geo = new THREE.SphereGeometry(0.08, 12, 12);
        const mesh = new THREE.Mesh(geo, nodeMat);
        mesh.position.copy(node);
        tensGroup.add(mesh);
      }

      // ── SIMP grid (floating panel) ────────────────────────────────────────
      const grid = buildSIMPGrid(s.volumeFraction, iterRef.current);
      const H_GRID = grid.length;
      const W_GRID = grid[0]?.length ?? 0;
      const cellSize = 0.11;
      const gridOffsetX = -W_GRID * cellSize * 0.5;
      const gridOffsetY = -2.1;
      const gridOffsetZ = -1.8;

      const accentColor = new THREE.Color(0xcc4729);
      const emptyColor = new THREE.Color(0x111115);

      for (let y = 0; y < H_GRID; y++) {
        for (let x = 0; x < W_GRID; x++) {
          const d = grid[y]?.[x] ?? 0;
          if (d < 0.05) continue;
          const geo = new THREE.BoxGeometry(cellSize * 0.88, cellSize * 0.88, cellSize * 0.05);
          const color = emptyColor.clone().lerp(accentColor, d);
          const mat = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.4 + d * 0.55 });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(
            gridOffsetX + x * cellSize + cellSize / 2,
            gridOffsetY + (H_GRID - y) * cellSize,
            gridOffsetZ,
          );
          simpGroup.add(mesh);
        }
      }

      // SIMP panel label line (boundary)
      const panelW = W_GRID * cellSize;
      const panelH = H_GRID * cellSize;
      const boxGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(panelW, panelH, 0.01));
      const boxMat = new THREE.LineBasicMaterial({ color: 0x2a2a2d });
      const box = new THREE.LineSegments(boxGeo, boxMat);
      box.position.set(gridOffsetX + panelW / 2, gridOffsetY + panelH / 2 + cellSize, gridOffsetZ);
      simpGroup.add(box);
    }

    rebuildScene();

    // ── Mouse drag rotation ───────────────────────────────────────────────────
    const euler = new THREE.Euler(0, 0, 0, "YXZ");
    euler.y = -0.3;
    const quat = new THREE.Quaternion().setFromEuler(euler);
    const pivot = new THREE.Group();
    pivot.quaternion.copy(quat);
    scene.add(pivot);
    pivot.add(tensGroup);
    pivot.add(simpGroup);
    pivot.add(gridHelper);

    let dragging = false;
    let lastX = 0, lastY = 0;
    let autoRotateSpeed = 0.003;

    function onMouseDown(e: MouseEvent) { dragging = true; lastX = e.clientX; lastY = e.clientY; autoRotateSpeed = 0; }
    function onMouseUp() { dragging = false; autoRotateSpeed = 0.003; }
    function onMouseMove(e: MouseEvent) {
      if (!dragging) return;
      const dx = (e.clientX - lastX) * 0.008;
      const dy = (e.clientY - lastY) * 0.005;
      euler.y += dx;
      euler.x = Math.max(-0.8, Math.min(0.8, euler.x + dy));
      pivot.quaternion.setFromEuler(euler);
      lastX = e.clientX;
      lastY = e.clientY;
    }

    renderer.domElement.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);

    // ── Resize handler ────────────────────────────────────────────────────────
    const resizeObs = new ResizeObserver(() => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    resizeObs.observe(mount);

    // ── Animation loop ────────────────────────────────────────────────────────
    let frameId = 0;
    let lastRebuild = 0;
    let prevState = JSON.stringify(stateRef.current);

    function animate(t: number) {
      frameId = requestAnimationFrame(animate);

      // Auto-rotate
      euler.y += autoRotateSpeed;
      pivot.quaternion.setFromEuler(euler);

      // Rebuild if state changed (throttled)
      const stateStr = JSON.stringify(stateRef.current);
      if (stateStr !== prevState && t - lastRebuild > 200) {
        prevState = stateStr;
        lastRebuild = t;
        tensGroup = new THREE.Group();
        simpGroup = new THREE.Group();
        pivot.clear();
        pivot.add(tensGroup);
        pivot.add(simpGroup);
        pivot.add(gridHelper);
        rebuildScene();
      }

      renderer.render(scene, camera);
    }

    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
      renderer.domElement.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", onMouseMove);
      resizeObs.disconnect();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []); // runs once, reads state via ref

  return <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />;
}
