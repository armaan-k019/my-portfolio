'use client';

import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import type { RoomShape, Vector3D, SoundRay, ReceiverPoint } from '@/types';

export interface ThreeCanvasProps {
  roomShape: RoomShape;
  sourcePositions: Vector3D[];
  soundRays: SoundRay[];
  receiverPoints: ReceiverPoint[];
  onSourceDrag?: (index: number, newPos: Vector3D) => void;
}

// ─── Ray colours by reflection order ─────────────────────────────────────────
const RAY_COLORS = ['#FFFFFF', '#FFE566', '#FF9500', '#FF3B30', '#8B0000'];
const RECEIVER_COLORS = ['#34d399', '#60a5fa', '#f472b6', '#a78bfa', '#fb923c'];

function getRayColor(bounceIndex: number): THREE.Color {
  return new THREE.Color(RAY_COLORS[Math.min(bounceIndex, RAY_COLORS.length - 1)]);
}

// ─── Grid floor ───────────────────────────────────────────────────────────────
function buildGrid(): THREE.Group {
  const group = new THREE.Group();
  const size = 40;
  const step = 1;
  const mat = new THREE.LineBasicMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.8 });
  const matAccent = new THREE.LineBasicMaterial({ color: 0x3a3a3a, transparent: true, opacity: 0.6 });

  for (let i = -size; i <= size; i++) {
    const isAccent = i % 5 === 0;
    const pts = [new THREE.Vector3(-size, 0, i), new THREE.Vector3(size, 0, i)];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    group.add(new THREE.Line(geo, isAccent ? matAccent : mat));
    const pts2 = [new THREE.Vector3(i, 0, -size), new THREE.Vector3(i, 0, size)];
    const geo2 = new THREE.BufferGeometry().setFromPoints(pts2);
    group.add(new THREE.Line(geo2, isAccent ? matAccent : mat));
  }
  return group;
}

// ─── Axis lines (XYZ) ─────────────────────────────────────────────────────────
function buildAxes(): THREE.Group {
  const group = new THREE.Group();
  const len = 4;
  const axes: [number, number, number, number][] = [
    [len, 0, 0, 0xff4444], [0, len, 0, 0x44ff44], [0, 0, len, 0x4488ff],
  ];
  for (const [x, y, z, color] of axes) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(x, y, z),
    ]);
    group.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color })));
  }
  return group;
}

// ─── Room geometry ─────────────────────────────────────────────────────────────
function buildRoomGeometry(roomShape: RoomShape): THREE.BufferGeometry {
  const { vertices, faces } = roomShape;
  const positions: number[] = [];
  const normals: number[] = [];

  for (const face of faces) {
    const v0 = vertices[face.a], v1 = vertices[face.b], v2 = vertices[face.c];
    if (!v0 || !v1 || !v2) continue;
    const ax = v1.x - v0.x, ay = v1.y - v0.y, az = v1.z - v0.z;
    const bx = v2.x - v0.x, by = v2.y - v0.y, bz = v2.z - v0.z;
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    for (const v of [v0, v1, v2]) {
      positions.push(v.x, v.y, v.z);
      normals.push(nx / len, ny / len, nz / len);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geo;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function ThreeCanvas({
  roomShape, sourcePositions, soundRays, receiverPoints, onSourceDrag,
}: ThreeCanvasProps) {
  const containerRef   = useRef<HTMLDivElement>(null);
  const sceneRef       = useRef<THREE.Scene | null>(null);
  const cameraRef      = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef    = useRef<THREE.WebGLRenderer | null>(null);
  const animFrameRef   = useRef<number>(0);
  const roomMeshRef    = useRef<THREE.Mesh | null>(null);
  const wireframeRef   = useRef<THREE.LineSegments | null>(null);
  const sourceGroupRef = useRef<THREE.Group | null>(null);
  const receiverGroupRef = useRef<THREE.Group | null>(null);
  const rayGroupRef    = useRef<THREE.Group | null>(null);

  // Status bar info
  const [hoverPos, setHoverPos]   = useState<Vector3D | null>(null);
  const [faceCount, setFaceCount] = useState(0);
  const [activeMode, setActiveMode] = useState<'orbit' | 'drag'>('orbit');

  const orbitRef = useRef({
    theta: Math.PI / 4, phi: Math.PI / 3.5, radius: 32,
    isDragging: false, isPanning: false, lastX: 0, lastY: 0,
    panTarget: new THREE.Vector3(0, 0, 0),
  });
  const dragSourceRef = useRef({
    active: false, sourceIndex: -1, plane: new THREE.Plane(),
  });

  function updateCamera(camera: THREE.PerspectiveCamera) {
    const { theta, phi, radius, panTarget } = orbitRef.current;
    camera.position.set(
      panTarget.x + radius * Math.sin(phi) * Math.sin(theta),
      panTarget.y + radius * Math.cos(phi),
      panTarget.z + radius * Math.sin(phi) * Math.cos(theta),
    );
    camera.lookAt(panTarget);
  }

  // ─── Scene init ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const container = containerRef.current;
    if (!container) return;

    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#1a1a1a');
    scene.fog = new THREE.Fog('#1a1a1a', 60, 120);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 500);
    updateCamera(camera);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights - subtle for dark viewport
    scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    // Grid + axes
    scene.add(buildGrid());
    scene.add(buildAxes());

    // Groups
    const rayGroup = new THREE.Group();
    scene.add(rayGroup);
    rayGroupRef.current = rayGroup;

    const sourceGroup = new THREE.Group();
    scene.add(sourceGroup);
    sourceGroupRef.current = sourceGroup;

    const receiverGroup = new THREE.Group();
    scene.add(receiverGroup);
    receiverGroupRef.current = receiverGroup;

    const resizeObserver = new ResizeObserver(() => {
      const w2 = container.clientWidth, h2 = container.clientHeight;
      renderer.setSize(w2, h2);
      camera.aspect = w2 / h2;
      camera.updateProjectionMatrix();
    });
    resizeObserver.observe(container);

    let t = Date.now();
    function animate() {
      animFrameRef.current = requestAnimationFrame(animate);
      const elapsed = (Date.now() - t) / 1000;
      const opacity = 0.3 + 0.3 * Math.sin(elapsed * Math.PI);
      rayGroup.children.forEach((child) => {
        const line = child as THREE.Line;
        if (line.material instanceof THREE.LineBasicMaterial) line.material.opacity = opacity;
      });
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      resizeObserver.disconnect();
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Mouse events ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = rendererRef.current?.domElement;
    if (!canvas) return;
    const canvasEl = canvas as HTMLCanvasElement;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    function getMouseNDC(e: MouseEvent) {
      const rect = canvasEl.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function onMouseDown(e: MouseEvent) {
      if (!cameraRef.current || !sourceGroupRef.current) return;
      // Shift+click → pan mode (don't test source hits)
      if (e.shiftKey) {
        orbitRef.current.isPanning = true;
        orbitRef.current.lastX = e.clientX;
        orbitRef.current.lastY = e.clientY;
        setActiveMode('orbit');
        return;
      }
      getMouseNDC(e);
      raycaster.setFromCamera(mouse, cameraRef.current);
      const hits = raycaster.intersectObjects(sourceGroupRef.current.children);
      if (hits.length > 0 && onSourceDrag) {
        const mesh = hits[0].object as THREE.Mesh;
        const idx = sourceGroupRef.current.children.indexOf(mesh);
        dragSourceRef.current = {
          active: true, sourceIndex: idx,
          plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -mesh.position.y),
        };
        setActiveMode('drag');
        e.stopPropagation();
        return;
      }
      orbitRef.current.isDragging = true;
      orbitRef.current.lastX = e.clientX;
      orbitRef.current.lastY = e.clientY;
      setActiveMode('orbit');
    }

    function onMouseMove(e: MouseEvent) {
      if (!cameraRef.current) return;
      getMouseNDC(e);
      // Update status bar world position on ground plane
      raycaster.setFromCamera(mouse, cameraRef.current);
      const wp = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(groundPlane, wp)) {
        setHoverPos({ x: wp.x, y: wp.y, z: wp.z });
      }

      if (dragSourceRef.current.active && onSourceDrag) {
        const target = new THREE.Vector3();
        raycaster.ray.intersectPlane(dragSourceRef.current.plane, target);
        if (target) {
          const srcMesh = sourceGroupRef.current?.children[dragSourceRef.current.sourceIndex] as THREE.Mesh | undefined;
          onSourceDrag(dragSourceRef.current.sourceIndex, { x: target.x, y: srcMesh?.position.y ?? 0, z: target.z });
        }
        return;
      }

      const dx = e.clientX - orbitRef.current.lastX;
      const dy = e.clientY - orbitRef.current.lastY;

      if (orbitRef.current.isPanning && cameraRef.current) {
        const camera = cameraRef.current;
        camera.updateMatrixWorld(); // must be fresh before reading column vectors
        const speed = orbitRef.current.radius * 0.0015;
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
        const up    = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
        orbitRef.current.panTarget.addScaledVector(right, -dx * speed);
        orbitRef.current.panTarget.addScaledVector(up,     dy * speed);
        orbitRef.current.lastX = e.clientX;
        orbitRef.current.lastY = e.clientY;
        updateCamera(camera);
        return;
      }

      if (!orbitRef.current.isDragging) return;
      orbitRef.current.lastX = e.clientX;
      orbitRef.current.lastY = e.clientY;
      orbitRef.current.theta -= dx * 0.005;
      orbitRef.current.phi = Math.max(0.05, Math.min(Math.PI * 0.48, orbitRef.current.phi + dy * 0.005));
      if (cameraRef.current) updateCamera(cameraRef.current);
    }

    function onMouseUp() {
      orbitRef.current.isDragging = false;
      orbitRef.current.isPanning = false;
      dragSourceRef.current.active = false;
      setActiveMode('orbit');
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      orbitRef.current.radius = Math.max(4, Math.min(120, orbitRef.current.radius + e.deltaY * 0.04));
      if (cameraRef.current) updateCamera(cameraRef.current);
    }

    canvasEl.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvasEl.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      canvasEl.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvasEl.removeEventListener('wheel', onWheel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSourceDrag]);

  // ─── Room mesh ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (roomMeshRef.current) { scene.remove(roomMeshRef.current); roomMeshRef.current.geometry.dispose(); }
    if (wireframeRef.current) { scene.remove(wireframeRef.current); wireframeRef.current.geometry.dispose(); }
    if (roomShape.vertices.length < 3 || roomShape.faces.length === 0) return;

    setFaceCount(roomShape.faces.length);

    const geo = buildRoomGeometry(roomShape);
    const solidMat = new THREE.MeshLambertMaterial({
      color: 0x2d4a6e, transparent: true, opacity: 0.18, side: THREE.DoubleSide,
    });
    const solid = new THREE.Mesh(geo, solidMat);
    scene.add(solid);
    roomMeshRef.current = solid;

    const edgesGeo = new THREE.EdgesGeometry(geo);
    const wireMat = new THREE.LineBasicMaterial({ color: 0x5b8fd4, linewidth: 1 });
    const wire = new THREE.LineSegments(edgesGeo, wireMat);
    scene.add(wire);
    wireframeRef.current = wire;
  }, [roomShape]);

  // ─── Source spheres ────────────────────────────────────────────────────────
  useEffect(() => {
    const group = sourceGroupRef.current;
    if (!group) return;
    while (group.children.length > sourcePositions.length) {
      const child = group.children[group.children.length - 1] as THREE.Mesh;
      (child.material as THREE.Material).dispose();
      child.geometry.dispose();
      group.remove(child);
    }
    while (group.children.length < sourcePositions.length) {
      const geo = new THREE.SphereGeometry(0.22, 16, 16);
      const mat = new THREE.MeshStandardMaterial({ color: 0xff6b35, emissive: 0xff6b35, emissiveIntensity: 0.8 });
      group.add(new THREE.Mesh(geo, mat));
    }
    sourcePositions.forEach((pos, i) => {
      (group.children[i] as THREE.Mesh).position.set(pos.x, pos.y, pos.z);
    });
  }, [sourcePositions]);

  // ─── Receiver markers ──────────────────────────────────────────────────────
  useEffect(() => {
    const group = receiverGroupRef.current;
    if (!group) return;
    while (group.children.length > 0) {
      const child = group.children[0] as THREE.Mesh;
      (child.material as THREE.Material).dispose();
      child.geometry.dispose();
      group.remove(child);
    }
    receiverPoints.forEach((rp, i) => {
      const color = new THREE.Color(RECEIVER_COLORS[i % RECEIVER_COLORS.length]);
      const geo = new THREE.SphereGeometry(0.16, 12, 12);
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(rp.position.x, rp.position.y, rp.position.z);
      group.add(mesh);
    });
  }, [receiverPoints]);

  // ─── Sound rays ────────────────────────────────────────────────────────────
  useEffect(() => {
    const rayGroup = rayGroupRef.current;
    if (!rayGroup) return;
    while (rayGroup.children.length > 0) {
      const child = rayGroup.children[0] as THREE.Line;
      child.geometry.dispose();
      if (child.material instanceof THREE.LineBasicMaterial) child.material.dispose();
      rayGroup.remove(child);
    }
    for (const ray of soundRays) {
      const points: THREE.Vector3[] = [
        new THREE.Vector3(ray.origin.x, ray.origin.y, ray.origin.z),
        ...ray.bounces.map((b) => new THREE.Vector3(b.x, b.y, b.z)),
      ];
      if (points.length < 2) continue;
      for (let i = 0; i < points.length - 1; i++) {
        const geo = new THREE.BufferGeometry().setFromPoints([points[i], points[i + 1]]);
        const mat = new THREE.LineBasicMaterial({ color: getRayColor(i), transparent: true, opacity: 0.6 });
        rayGroup.add(new THREE.Line(geo, mat));
      }
    }
  }, [soundRays]);

  return (
    <div className="relative w-full h-full bg-[#1a1a1a]">
      {/* ─── Three.js canvas ───────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ cursor: dragSourceRef.current.active ? 'crosshair' : orbitRef.current.isDragging ? 'grabbing' : 'grab' }}
      />

      {/* ─── Top-right viewport label ──────────────────────────────────────── */}
      <div className="absolute top-3 right-3 text-[10px] text-white/30 font-mono select-none pointer-events-none uppercase tracking-widest">
        Perspective
      </div>

      {/* ─── Axis legend (bottom-left corner) ─────────────────────────────── */}
      <div className="absolute bottom-8 left-3 flex flex-col gap-0.5 pointer-events-none select-none">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-px bg-[#ff4444] inline-block" />
          <span className="text-[9px] text-white/40 font-mono">X</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-px bg-[#44ff44] inline-block" />
          <span className="text-[9px] text-white/40 font-mono">Y</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-px bg-[#4488ff] inline-block" />
          <span className="text-[9px] text-white/40 font-mono">Z</span>
        </div>
      </div>

      {/* ─── Ray colour legend ─────────────────────────────────────────────── */}
      <div className="absolute top-3 left-3 flex flex-col gap-1 pointer-events-none select-none">
        <p className="text-[9px] text-white/30 font-mono uppercase tracking-widest mb-0.5">Reflections</p>
        {RAY_COLORS.map((color, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="w-4 h-px inline-block" style={{ backgroundColor: color }} />
            <span className="text-[9px] text-white/40 font-mono">
              {i === 0 ? 'Direct' : i === RAY_COLORS.length - 1 ? `${i}+` : `${i}×`}
            </span>
          </div>
        ))}
      </div>

      {/* ─── Receiver legend ───────────────────────────────────────────────── */}
      {receiverPoints.length > 0 && (
        <div className="absolute top-3 left-24 flex flex-col gap-1 pointer-events-none select-none">
          <p className="text-[9px] text-white/30 font-mono uppercase tracking-widest mb-0.5">Receivers</p>
          {receiverPoints.map((rp, i) => (
            <div key={rp.id} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: RECEIVER_COLORS[i % RECEIVER_COLORS.length] }} />
              <span className="text-[9px] text-white/40 font-mono">{rp.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ─── Status bar ────────────────────────────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 h-7 bg-[#111]/80 border-t border-white/5 flex items-center px-3 gap-4 pointer-events-none select-none">
        <span className="text-[10px] text-white/30 font-mono">
          {activeMode === 'drag' ? 'DRAG SOURCE' : 'ORBIT'}
        </span>
        <span className="text-[10px] text-white/20 font-mono">|</span>
        <span className="text-[10px] text-white/30 font-mono">
          {faceCount} faces · {roomShape.vertices.length} vertices
        </span>
        {hoverPos && (
          <>
            <span className="text-[10px] text-white/20 font-mono">|</span>
            <span className="text-[10px] text-white/30 font-mono tabular-nums">
              x {hoverPos.x.toFixed(2)} &nbsp; z {hoverPos.z.toFixed(2)}
            </span>
          </>
        )}
        <span className="ml-auto text-[10px] text-white/20 font-mono">
          drag: orbit · shift+drag: pan · scroll: zoom · click source: move
        </span>
      </div>
    </div>
  );
}
