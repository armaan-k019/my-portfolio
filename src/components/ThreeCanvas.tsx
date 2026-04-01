'use client';

import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import type { RoomShape, Vector3D, SoundRay } from '@/types';

export interface ThreeCanvasProps {
  roomShape: RoomShape;
  sourcePosition: Vector3D;
  soundRays: SoundRay[];
  onSourceDrag?: (newPos: Vector3D) => void;
}

// ─── Ray colours by bounce depth ──────────────────────────────────────────────
const RAY_COLORS = ['#FF9500', '#FFB700', '#FFD900', '#FFFF00', '#FFFF88'];

function getRayColor(bounceIndex: number): THREE.Color {
  const hex = RAY_COLORS[Math.min(bounceIndex, RAY_COLORS.length - 1)];
  return new THREE.Color(hex);
}

// ─── Build room BufferGeometry ─────────────────────────────────────────────────
function buildRoomGeometry(roomShape: RoomShape): THREE.BufferGeometry {
  const { vertices, faces } = roomShape;
  const positions: number[] = [];
  const normals: number[] = [];

  for (const face of faces) {
    const v0 = vertices[face.a];
    const v1 = vertices[face.b];
    const v2 = vertices[face.c];
    if (!v0 || !v1 || !v2) continue;

    const ax = v1.x - v0.x, ay = v1.y - v0.y, az = v1.z - v0.z;
    const bx = v2.x - v0.x, by = v2.y - v0.y, bz = v2.z - v0.z;
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
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
  roomShape,
  sourcePosition,
  soundRays,
  onSourceDrag,
}: ThreeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Refs to Three.js objects
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animFrameRef = useRef<number>(0);

  const roomMeshRef = useRef<THREE.Mesh | null>(null);
  const wireframeRef = useRef<THREE.LineSegments | null>(null);
  const sourceMeshRef = useRef<THREE.Mesh | null>(null);
  const sourceLightRef = useRef<THREE.PointLight | null>(null);
  const rayGroupRef = useRef<THREE.Group | null>(null);

  // Orbit state
  const orbitRef = useRef({
    theta: Math.PI / 4,
    phi: Math.PI / 3,
    radius: 28,
    isDragging: false,
    lastX: 0,
    lastY: 0,
  });

  // Drag-source state
  const dragSourceRef = useRef({
    active: false,
    plane: new THREE.Plane(),
    offset: new THREE.Vector3(),
  });

  function updateCamera(camera: THREE.PerspectiveCamera) {
    const { theta, phi, radius } = orbitRef.current;
    camera.position.set(
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.cos(theta),
    );
    camera.lookAt(0, 0, 0);
  }

  // ─── Scene initialization ──────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const container = containerRef.current;
    if (!container) return;

    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#F5F0E8');
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    updateCamera(camera);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    // Ray group
    const rayGroup = new THREE.Group();
    scene.add(rayGroup);
    rayGroupRef.current = rayGroup;

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    resizeObserver.observe(container);

    // Animation loop — pulsing ray opacity
    let startTime = Date.now();
    function animate() {
      animFrameRef.current = requestAnimationFrame(animate);
      const elapsed = (Date.now() - startTime) / 1000;
      const opacity = 0.35 + 0.35 * Math.sin((elapsed * Math.PI * 2) / 2); // 2s period

      rayGroup.children.forEach((child) => {
        const line = child as THREE.Line;
        if (line.material instanceof THREE.LineBasicMaterial) {
          line.material.opacity = opacity;
        }
      });

      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      resizeObserver.disconnect();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Mouse / touch events for orbit + source drag ─────────────────────────
  useEffect(() => {
    const canvas = rendererRef.current?.domElement;
    if (!canvas) return;
    const canvasEl: HTMLCanvasElement = canvas;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    function getMouseNDC(e: MouseEvent) {
      const rect = canvasEl.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function onMouseDown(e: MouseEvent) {
      if (!cameraRef.current || !sourceMeshRef.current) return;
      getMouseNDC(e);
      raycaster.setFromCamera(mouse, cameraRef.current);
      const hits = raycaster.intersectObject(sourceMeshRef.current);
      if (hits.length > 0 && onSourceDrag) {
        // Start source drag — drag on the XZ plane at source height
        dragSourceRef.current.active = true;
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -sourceMeshRef.current.position.y);
        dragSourceRef.current.plane = plane;
        e.stopPropagation();
        return;
      }
      orbitRef.current.isDragging = true;
      orbitRef.current.lastX = e.clientX;
      orbitRef.current.lastY = e.clientY;
    }

    function onMouseMove(e: MouseEvent) {
      if (dragSourceRef.current.active && onSourceDrag && cameraRef.current) {
        getMouseNDC(e);
        raycaster.setFromCamera(mouse, cameraRef.current);
        const target = new THREE.Vector3();
        raycaster.ray.intersectPlane(dragSourceRef.current.plane, target);
        if (target) {
          onSourceDrag({ x: target.x, y: sourceMeshRef.current?.position.y ?? 0, z: target.z });
        }
        return;
      }

      if (!orbitRef.current.isDragging) return;
      const dx = e.clientX - orbitRef.current.lastX;
      const dy = e.clientY - orbitRef.current.lastY;
      orbitRef.current.lastX = e.clientX;
      orbitRef.current.lastY = e.clientY;

      orbitRef.current.theta -= dx * 0.005;
      orbitRef.current.phi = Math.max(0.1, Math.min(Math.PI - 0.1, orbitRef.current.phi + dy * 0.005));

      if (cameraRef.current) updateCamera(cameraRef.current);
    }

    function onMouseUp() {
      orbitRef.current.isDragging = false;
      dragSourceRef.current.active = false;
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      orbitRef.current.radius = Math.max(5, Math.min(100, orbitRef.current.radius + e.deltaY * 0.05));
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

  // ─── Rebuild room mesh when roomShape changes ──────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove old meshes
    if (roomMeshRef.current) { scene.remove(roomMeshRef.current); roomMeshRef.current.geometry.dispose(); }
    if (wireframeRef.current) { scene.remove(wireframeRef.current); wireframeRef.current.geometry.dispose(); }

    if (roomShape.vertices.length < 3 || roomShape.faces.length === 0) return;

    const geo = buildRoomGeometry(roomShape);

    // Solid mesh
    const solidMat = new THREE.MeshLambertMaterial({
      color: 0xc8bfa8,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    const solidMesh = new THREE.Mesh(geo, solidMat);
    scene.add(solidMesh);
    roomMeshRef.current = solidMesh;

    // Wireframe
    const edgesGeo = new THREE.EdgesGeometry(geo);
    const wireMat = new THREE.LineBasicMaterial({ color: 0x8b7d6b, linewidth: 1 });
    const wireframe = new THREE.LineSegments(edgesGeo, wireMat);
    scene.add(wireframe);
    wireframeRef.current = wireframe;
  }, [roomShape]);

  // ─── Update source sphere position ────────────────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (!sourceMeshRef.current) {
      // First time: create the sphere
      const sphereGeo = new THREE.SphereGeometry(0.25, 16, 16);
      const sphereMat = new THREE.MeshStandardMaterial({
        color: 0xff6b35,
        emissive: 0xff6b35,
        emissiveIntensity: 0.5,
      });
      const sphere = new THREE.Mesh(sphereGeo, sphereMat);
      scene.add(sphere);
      sourceMeshRef.current = sphere;

      const light = new THREE.PointLight(0xff6b35, 1, 10);
      scene.add(light);
      sourceLightRef.current = light;
    }

    sourceMeshRef.current.position.set(sourcePosition.x, sourcePosition.y, sourcePosition.z);
    if (sourceLightRef.current) {
      sourceLightRef.current.position.set(sourcePosition.x, sourcePosition.y, sourcePosition.z);
    }
  }, [sourcePosition]);

  // ─── Redraw sound rays ─────────────────────────────────────────────────────
  useEffect(() => {
    const rayGroup = rayGroupRef.current;
    if (!rayGroup) return;

    // Clear existing ray lines
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

      // Draw each segment in its bounce color
      for (let i = 0; i < points.length - 1; i++) {
        const segGeo = new THREE.BufferGeometry().setFromPoints([points[i], points[i + 1]]);
        const segMat = new THREE.LineBasicMaterial({
          color: getRayColor(i),
          transparent: true,
          opacity: 0.6,
        });
        rayGroup.add(new THREE.Line(segGeo, segMat));
      }
    }
  }, [soundRays]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ cursor: orbitRef.current.isDragging ? 'grabbing' : 'grab' }}
    />
  );
}
