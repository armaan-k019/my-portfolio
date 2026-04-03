'use client';

import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import type { RoomShape, Vector3D, SoundRay, ReceiverPoint, SurfaceGroup, MaterialType } from '@/types';

export interface StructureComponent {
  type: 'box' | 'cylinder' | 'cone' | 'sphere' | 'tapered_box' | 'arch';
  position: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  color: string;
  opacity: number;
  wireframe: boolean;
}

export interface StructureData {
  name: string;
  description: string;
  cameraPosition: { x: number; y: number; z: number };
  components: StructureComponent[];
}

export interface ThreeCanvasProps {
  roomShape: RoomShape;
  sourcePositions: Vector3D[];
  soundRays: SoundRay[];
  receiverPoints: ReceiverPoint[];
  onSourceDrag?: (index: number, newPos: Vector3D) => void;
  onReceiverDrag?: (id: string, newPos: Vector3D) => void;
  surfaceGroups?: SurfaceGroup[];
  vizMode?: 'particles' | 'static';
  structureData?: StructureData | null;
}

// ─── Ray / receiver colours ───────────────────────────────────────────────────
const RAY_COLORS = ['#FFFFFF', '#FFE566', '#FF9500', '#FF3B30', '#8B0000'];
const RECEIVER_COLORS = ['#34d399', '#60a5fa', '#f472b6', '#a78bfa', '#fb923c'];

// ─── Material → Three.js colour mapping ──────────────────────────────────────
const MATERIAL_COLORS: Record<MaterialType, number> = {
  concrete:        0x6b7280,
  brick:           0xc1513a,
  wood:            0xb5874c,
  carpet:          0x2d5a3d,
  glass:           0x7ec8e3,
  acoustic:        0x3b5ba5,
  gypsum:          0xe8e4d9,
  upholstered:     0x5b3a6b,
  acoustic_foam:   0xf97316,
  heavy_drape:     0x7c3aed,
  carpet_concrete: 0x166534,
  glass_plate:     0xbae6fd,
};

const WAVE_PERIOD = 3.0; // seconds for one full wave cycle

type WaveParticle = {
  mesh: THREE.Mesh;
  path: THREE.Vector3[];
  segLengths: number[];
  totalLen: number;
  phase: number;
};

// ─── Scene geometry builders ──────────────────────────────────────────────────

function buildGrid(): THREE.Group {
  const group = new THREE.Group();
  const size = 40, step = 1;
  const mat       = new THREE.LineBasicMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.8 });
  const matAccent = new THREE.LineBasicMaterial({ color: 0x3a3a3a, transparent: true, opacity: 0.6 });

  for (let i = -size; i <= size; i++) {
    const isAccent = i % 5 === 0;
    const m = isAccent ? matAccent : mat;
    const g1 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-size, 0, i), new THREE.Vector3(size, 0, i)]);
    const g2 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(i, 0, -size), new THREE.Vector3(i, 0, size)]);
    group.add(new THREE.Line(g1, m));
    group.add(new THREE.Line(g2, m));
  }
  return group;
}

function buildAxes(): THREE.Group {
  const group = new THREE.Group();
  for (const [x, y, z, color] of [[4,0,0,0xff4444],[0,4,0,0x44ff44],[0,0,4,0x4488ff]] as [number,number,number,number][]) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(x,y,z)]);
    group.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color })));
  }
  return group;
}

function buildFaceGeo(roomShape: RoomShape, faces: { a: number; b: number; c: number }[]): THREE.BufferGeometry {
  const { vertices } = roomShape;
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
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals,   3));
  return geo;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function ThreeCanvas({
  roomShape, sourcePositions, soundRays, receiverPoints,
  onSourceDrag, onReceiverDrag, surfaceGroups,
  vizMode: vizModeProp = 'static',
  structureData,
}: ThreeCanvasProps) {
  const containerRef       = useRef<HTMLDivElement>(null);
  const sceneRef           = useRef<THREE.Scene | null>(null);
  const cameraRef          = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef        = useRef<THREE.WebGLRenderer | null>(null);
  const animFrameRef       = useRef<number>(0);

  // Room mesh refs
  const roomMeshRef        = useRef<THREE.Mesh | null>(null);
  const wireframeRef       = useRef<THREE.LineSegments | null>(null);
  const surfaceMeshGroupRef = useRef<THREE.Group | null>(null);
  const structureGroupRef  = useRef<THREE.Group | null>(null);

  // Object groups
  const sourceGroupRef     = useRef<THREE.Group | null>(null);
  const receiverGroupRef   = useRef<THREE.Group | null>(null);

  // Ray lines + wave particles
  const rayLinesGroupRef   = useRef<THREE.Group | null>(null);
  const rayLineMatsRef     = useRef<THREE.LineBasicMaterial[]>([]);
  const waveGroupRef       = useRef<THREE.Group | null>(null);
  const waveParticlesRef   = useRef<WaveParticle[]>([]);
  const particleGeoRef     = useRef<THREE.SphereGeometry | null>(null);

  // Viz mode (controlled by parent via prop)
  const vizModeRef = useRef<'particles' | 'static'>(vizModeProp);
  useEffect(() => { vizModeRef.current = vizModeProp; }, [vizModeProp]);

  // Prop refs (for stable closures in mouse handlers)
  const receiverPointsRef  = useRef(receiverPoints);
  const onReceiverDragRef  = useRef(onReceiverDrag);
  useEffect(() => { receiverPointsRef.current = receiverPoints; }, [receiverPoints]);
  useEffect(() => { onReceiverDragRef.current = onReceiverDrag; }, [onReceiverDrag]);

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
  const dragReceiverRef = useRef({
    active: false, receiverId: '', originalY: 0, plane: new THREE.Plane(),
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

    scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    scene.add(buildGrid());
    scene.add(buildAxes());

    const rayLinesGroup = new THREE.Group();
    scene.add(rayLinesGroup);
    rayLinesGroupRef.current = rayLinesGroup;

    const waveGroup = new THREE.Group();
    scene.add(waveGroup);
    waveGroupRef.current = waveGroup;

    const sourceGroup = new THREE.Group();
    scene.add(sourceGroup);
    sourceGroupRef.current = sourceGroup;

    const receiverGroup = new THREE.Group();
    scene.add(receiverGroup);
    receiverGroupRef.current = receiverGroup;

    const surfaceMeshGroup = new THREE.Group();
    scene.add(surfaceMeshGroup);
    surfaceMeshGroupRef.current = surfaceMeshGroup;

    const structureGroup = new THREE.Group();
    scene.add(structureGroup);
    structureGroupRef.current = structureGroup;

    const resizeObserver = new ResizeObserver(() => {
      const w2 = container.clientWidth, h2 = container.clientHeight;
      renderer.setSize(w2, h2);
      camera.aspect = w2 / h2;
      camera.updateProjectionMatrix();
    });
    resizeObserver.observe(container);

    function animate(timestamp: number) {
      animFrameRef.current = requestAnimationFrame(animate);
      const elapsed = timestamp * 0.001;
      const mode = vizModeRef.current;

      if (mode === 'static') {
        // Pulse static line opacity, hide particles
        const lineOpacity = 0.28 + 0.28 * Math.sin(elapsed * Math.PI);
        for (const mat of rayLineMatsRef.current) mat.opacity = lineOpacity;
        if (waveGroupRef.current) waveGroupRef.current.visible = false;
      } else {
        // Keep lines dim, show + animate particles
        for (const mat of rayLineMatsRef.current) mat.opacity = 0.07;
        if (waveGroupRef.current) waveGroupRef.current.visible = true;

        for (const p of waveParticlesRef.current) {
          if (p.totalLen < 0.01) continue;
          const t = ((elapsed + p.phase) % WAVE_PERIOD) / WAVE_PERIOD;
          const targetDist = t * p.totalLen;

          let accDist = 0;
          let segIdx = 0;
          const tempPos = new THREE.Vector3();
          tempPos.copy(p.path[0]);

          for (let j = 0; j < p.segLengths.length; j++) {
            if (accDist + p.segLengths[j] >= targetDist) {
              const localT = (targetDist - accDist) / Math.max(p.segLengths[j], 1e-6);
              tempPos.lerpVectors(p.path[j], p.path[j + 1], Math.min(1, localT));
              segIdx = j;
              break;
            }
            accDist += p.segLengths[j];
            segIdx = j;
          }

          p.mesh.position.copy(tempPos);
          const mat = p.mesh.material as THREE.MeshBasicMaterial;
          mat.color.set(RAY_COLORS[Math.min(segIdx, RAY_COLORS.length - 1)]);

          let opacity = Math.pow(0.65, segIdx);
          if (t < 0.05) opacity *= t / 0.05;
          else if (t > 0.8) opacity *= (1 - (t - 0.8) / 0.2);
          mat.opacity = Math.max(0, opacity);
        }
      }

      renderer.render(scene, camera);
    }
    animFrameRef.current = requestAnimationFrame(animate);

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
      if (!cameraRef.current) return;

      if (e.shiftKey) {
        orbitRef.current.isPanning = true;
        orbitRef.current.lastX = e.clientX;
        orbitRef.current.lastY = e.clientY;
        setActiveMode('orbit');
        return;
      }

      getMouseNDC(e);
      raycaster.setFromCamera(mouse, cameraRef.current);

      // Source drag (highest priority)
      if (sourceGroupRef.current && onSourceDrag) {
        const hits = raycaster.intersectObjects(sourceGroupRef.current.children);
        if (hits.length > 0) {
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
      }

      // Receiver drag
      if (receiverGroupRef.current && onReceiverDragRef.current) {
        const hits = raycaster.intersectObjects(receiverGroupRef.current.children);
        if (hits.length > 0) {
          const idx = receiverGroupRef.current.children.indexOf(hits[0].object);
          const rp = receiverPointsRef.current[idx];
          if (rp) {
            dragReceiverRef.current = {
              active: true, receiverId: rp.id, originalY: rp.position.y,
              plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -rp.position.y),
            };
            setActiveMode('drag');
            e.stopPropagation();
            return;
          }
        }
      }

      orbitRef.current.isDragging = true;
      orbitRef.current.lastX = e.clientX;
      orbitRef.current.lastY = e.clientY;
      setActiveMode('orbit');
    }

    function onMouseMove(e: MouseEvent) {
      if (!cameraRef.current) return;
      getMouseNDC(e);
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

      if (dragReceiverRef.current.active && onReceiverDragRef.current) {
        const target = new THREE.Vector3();
        raycaster.ray.intersectPlane(dragReceiverRef.current.plane, target);
        if (target) {
          onReceiverDragRef.current(dragReceiverRef.current.receiverId, {
            x: target.x, y: dragReceiverRef.current.originalY, z: target.z,
          });
        }
        return;
      }

      const dx = e.clientX - orbitRef.current.lastX;
      const dy = e.clientY - orbitRef.current.lastY;

      if (orbitRef.current.isPanning && cameraRef.current) {
        const camera = cameraRef.current;
        camera.updateMatrixWorld();
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
      dragReceiverRef.current.active = false;
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

  // ─── Room mesh + surface groups ────────────────────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Clear existing room meshes
    if (roomMeshRef.current)   { scene.remove(roomMeshRef.current); roomMeshRef.current.geometry.dispose(); roomMeshRef.current = null; }
    if (wireframeRef.current)  { scene.remove(wireframeRef.current); wireframeRef.current.geometry.dispose(); wireframeRef.current = null; }
    const smg = surfaceMeshGroupRef.current;
    if (smg) {
      while (smg.children.length > 0) {
        const child = smg.children[0] as THREE.Mesh;
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
        smg.remove(child);
      }
    }

    if (roomShape.vertices.length < 3 || roomShape.faces.length === 0) return;
    setFaceCount(roomShape.faces.length);

    if (surfaceGroups && surfaceGroups.length > 0 && smg) {
      // Per-group colored meshes
      for (const group of surfaceGroups) {
        const subFaces = group.faceIndices.map(i => roomShape.faces[i]).filter(Boolean);
        if (subFaces.length === 0) continue;
        const geo = buildFaceGeo(roomShape, subFaces);
        const color = MATERIAL_COLORS[group.material] ?? 0x2d4a6e;
        const mat = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.30, side: THREE.DoubleSide });
        smg.add(new THREE.Mesh(geo, mat));
      }
    } else {
      // Single default mesh
      const geo = buildFaceGeo(roomShape, roomShape.faces);
      const mat = new THREE.MeshLambertMaterial({ color: 0x2d4a6e, transparent: true, opacity: 0.18, side: THREE.DoubleSide });
      const solid = new THREE.Mesh(geo, mat);
      scene.add(solid);
      roomMeshRef.current = solid;
    }

    // Wireframe always shown
    const fullGeo = buildFaceGeo(roomShape, roomShape.faces);
    const edgesGeo = new THREE.EdgesGeometry(fullGeo);
    fullGeo.dispose();
    const wire = new THREE.LineSegments(edgesGeo, new THREE.LineBasicMaterial({ color: 0x5b8fd4, linewidth: 1 }));
    scene.add(wire);
    wireframeRef.current = wire;
  }, [roomShape, surfaceGroups]);

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
      const geo = new THREE.SphereGeometry(0.18, 14, 14);
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(rp.position.x, rp.position.y, rp.position.z);
      group.add(mesh);
    });
  }, [receiverPoints]);

  // ─── Wave particles + dim ray lines ────────────────────────────────────────
  useEffect(() => {
    // Clear ray lines
    const linesGroup = rayLinesGroupRef.current;
    if (linesGroup) {
      while (linesGroup.children.length > 0) {
        const child = linesGroup.children[0] as THREE.Line;
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
        linesGroup.remove(child);
      }
    }
    rayLineMatsRef.current = [];

    // Clear old particles
    const waveGroup = waveGroupRef.current;
    if (waveGroup) {
      while (waveGroup.children.length > 0) {
        const child = waveGroup.children[0] as THREE.Mesh;
        (child.material as THREE.Material).dispose();
        waveGroup.remove(child);
      }
    }
    if (particleGeoRef.current) {
      particleGeoRef.current.dispose();
      particleGeoRef.current = null;
    }
    waveParticlesRef.current = [];

    if (soundRays.length === 0) return;

    // Static ray lines (dim in particle mode, pulsing in static mode)
    if (linesGroup) {
      const dimMats = RAY_COLORS.map(c =>
        new THREE.LineBasicMaterial({ color: new THREE.Color(c), transparent: true, opacity: 0.07 }),
      );
      rayLineMatsRef.current = dimMats;
      for (const ray of soundRays) {
        const path = [
          new THREE.Vector3(ray.origin.x, ray.origin.y, ray.origin.z),
          ...ray.bounces.map(b => new THREE.Vector3(b.x, b.y, b.z)),
        ];
        if (path.length < 2) continue;
        for (let i = 0; i < path.length - 1; i++) {
          const geo = new THREE.BufferGeometry().setFromPoints([path[i], path[i + 1]]);
          linesGroup.add(new THREE.Line(geo, dimMats[Math.min(i, dimMats.length - 1)]));
        }
      }
    }

    // Wave particles
    if (!waveGroup) return;
    const sharedGeo = new THREE.SphereGeometry(0.1, 6, 6);
    particleGeoRef.current = sharedGeo;
    const newParticles: WaveParticle[] = [];

    soundRays.forEach((ray, i) => {
      const path: THREE.Vector3[] = [
        new THREE.Vector3(ray.origin.x, ray.origin.y, ray.origin.z),
        ...ray.bounces.map(b => new THREE.Vector3(b.x, b.y, b.z)),
      ];
      if (path.length < 2) return;

      const segLengths: number[] = [];
      let totalLen = 0;
      for (let j = 0; j < path.length - 1; j++) {
        const len = path[j].distanceTo(path[j + 1]);
        segLengths.push(len);
        totalLen += len;
      }
      if (totalLen < 0.01) return;

      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(RAY_COLORS[0]),
        transparent: true,
        opacity: 1.0,
      });
      const mesh = new THREE.Mesh(sharedGeo, mat);
      mesh.position.copy(path[0]);
      waveGroup.add(mesh);

      newParticles.push({
        mesh, path, segLengths, totalLen,
        phase: (i / Math.max(soundRays.length, 1)) * WAVE_PERIOD,
      });
    });

    waveParticlesRef.current = newParticles;
  }, [soundRays]);

  // ─── Structure generator ───────────────────────────────────────────────────
  useEffect(() => {
    const structureGroup = structureGroupRef.current;
    if (!structureGroup) return;

    // Clear existing structure
    while (structureGroup.children.length > 0) {
      const child = structureGroup.children[0];
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      } else if (child instanceof THREE.Group) {
        child.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            (obj.material as THREE.Material).dispose();
          }
        });
      }
      structureGroup.remove(child);
    }

    // Show/hide room elements based on whether structureData is present
    const hasStructure = !!structureData;
    if (roomMeshRef.current) roomMeshRef.current.visible = !hasStructure;
    if (wireframeRef.current) wireframeRef.current.visible = !hasStructure;
    if (surfaceMeshGroupRef.current) surfaceMeshGroupRef.current.visible = !hasStructure;
    if (sourceGroupRef.current) sourceGroupRef.current.visible = !hasStructure;
    if (receiverGroupRef.current) receiverGroupRef.current.visible = !hasStructure;
    if (rayLinesGroupRef.current) rayLinesGroupRef.current.visible = !hasStructure;
    if (waveGroupRef.current) waveGroupRef.current.visible = !hasStructure;

    if (!structureData) {
      structureGroup.visible = false;
      return;
    }

    structureGroup.visible = true;

    function buildComponent(comp: StructureComponent): THREE.Object3D {
      const color = new THREE.Color(comp.color);
      const { x: sx, y: sy, z: sz } = comp.scale;

      if (comp.type === 'arch') {
        const group = new THREE.Group();
        const archGeo = new THREE.TorusGeometry(sx / 2, sz / 4, 8, 16, Math.PI);
        const archMat = comp.wireframe
          ? new THREE.MeshBasicMaterial({ color, wireframe: true })
          : new THREE.MeshStandardMaterial({ color, opacity: comp.opacity, transparent: comp.opacity < 1, roughness: 0.8, metalness: 0.1 });
        const arch = new THREE.Mesh(archGeo, archMat);
        arch.rotation.z = Math.PI;
        arch.position.y = sy / 2;
        group.add(arch);
        const pillarGeo = new THREE.CylinderGeometry(sz / 4, sz / 4, sy / 2, 8);
        for (const dx of [-sx / 2, sx / 2]) {
          const pillar = new THREE.Mesh(pillarGeo, archMat.clone());
          pillar.position.set(dx, sy / 4, 0);
          group.add(pillar);
        }
        group.position.set(comp.position.x, comp.position.y, comp.position.z);
        group.rotation.set(comp.rotation.x, comp.rotation.y, comp.rotation.z);
        return group;
      }

      let geo: THREE.BufferGeometry;
      switch (comp.type) {
        case 'box':
          geo = new THREE.BoxGeometry(sx, sy, sz);
          break;
        case 'cylinder':
          geo = new THREE.CylinderGeometry(sx / 2, sx / 2, sy, 16);
          break;
        case 'cone':
          geo = new THREE.ConeGeometry(sx / 2, sy, 12);
          break;
        case 'sphere':
          geo = new THREE.SphereGeometry(sx / 2, 16, 16);
          break;
        case 'tapered_box':
          geo = new THREE.CylinderGeometry(sx * 0.4, sx * 0.6, sy, 4);
          break;
        default:
          geo = new THREE.BoxGeometry(sx, sy, sz);
      }

      const mat = comp.wireframe
        ? new THREE.MeshBasicMaterial({ color, wireframe: true })
        : new THREE.MeshStandardMaterial({ color, opacity: comp.opacity, transparent: comp.opacity < 1, roughness: 0.8, metalness: 0.1 });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(comp.position.x, comp.position.y, comp.position.z);
      mesh.rotation.set(comp.rotation.x, comp.rotation.y, comp.rotation.z);
      return mesh;
    }

    for (const comp of structureData.components) {
      structureGroup.add(buildComponent(comp));
    }

    // Move camera to the cameraPosition from structureData
    const cp = structureData.cameraPosition;
    const dist = Math.sqrt(cp.x * cp.x + cp.y * cp.y + cp.z * cp.z);
    orbitRef.current.radius = dist > 0 ? dist : 32;
    orbitRef.current.theta = Math.atan2(cp.x, cp.z);
    const horizontalDist = Math.sqrt(cp.x * cp.x + cp.z * cp.z);
    orbitRef.current.phi = Math.atan2(horizontalDist, cp.y);
    orbitRef.current.panTarget.set(0, 0, 0);
    if (cameraRef.current) updateCamera(cameraRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureData]);

  return (
    <div className="relative w-full h-full bg-[#1a1a1a]">
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ cursor: dragSourceRef.current.active || dragReceiverRef.current.active ? 'crosshair' : orbitRef.current.isDragging ? 'grabbing' : 'grab' }}
      />

      {/* Top-right: viewport label */}
      <div className="absolute top-3 right-3">
        <span className="text-[10px] text-white/30 font-mono select-none pointer-events-none uppercase tracking-widest">
          Perspective
        </span>
      </div>

      {/* Axis legend */}
      <div className="absolute bottom-8 left-3 flex flex-col gap-0.5 pointer-events-none select-none">
        <div className="flex items-center gap-1.5"><span className="w-3 h-px bg-[#ff4444] inline-block" /><span className="text-[9px] text-white/40 font-mono">X</span></div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-px bg-[#44ff44] inline-block" /><span className="text-[9px] text-white/40 font-mono">Y</span></div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-px bg-[#4488ff] inline-block" /><span className="text-[9px] text-white/40 font-mono">Z</span></div>
      </div>

      {/* Ray colour legend */}
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

      {/* Receiver legend */}
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

      {/* Status bar */}
      <div className="absolute bottom-0 left-0 right-0 h-7 bg-[#111]/80 border-t border-white/5 flex items-center px-3 gap-4 pointer-events-none select-none">
        <span className="text-[10px] text-white/30 font-mono">
          {activeMode === 'drag' ? 'DRAG' : 'ORBIT'}
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
          drag: orbit · shift+drag: pan · scroll: zoom · click src/rcvr: drag
        </span>
      </div>
    </div>
  );
}
