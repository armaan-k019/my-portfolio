"use client";

import { useEffect, useRef, useState } from "react";
import { communityColor, type CorvidNode } from "@/lib/corvid";

// The corpus graph from the corvid snapshot: one point per paper, colored by
// community, with the paper-to-paper edges as faint lines. Drag to orbit,
// scroll to zoom, hover a point for its title. Three.js loads only when this
// component mounts, so no other page pays for it.

const BG = "#121A16"; // corvid's ground
const EDGE_ALPHA = 0.16;
const POINT_BASE = 0.007;
const POINT_INFLUENCE = 0.0025;
const POINT_MAX = 0.02;
const AUTO_ROTATE_SPEED = 0.35;

interface Props {
  nodes: CorvidNode[];
  edges: [number, number][];
  highlight: number | null; // community to emphasize, or null
}

export default function CorvidGraph({ nodes, edges, highlight }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const highlightRef = useRef<(c: number | null) => void>(() => {});
  const [hover, setHover] = useState<{ x: number; y: number; label: string } | null>(null);

  useEffect(() => {
    highlightRef.current(highlight);
  }, [highlight]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (disposed) return;

      // Center the cloud and scale it to a unit radius.
      const center = new THREE.Vector3();
      for (const n of nodes) center.add(new THREE.Vector3(...n.p));
      center.divideScalar(Math.max(1, nodes.length));
      let radius = 0;
      for (const n of nodes) radius = Math.max(radius, new THREE.Vector3(...n.p).distanceTo(center));
      const scale = radius > 0 ? 1 / radius : 1;
      const pos = nodes.map((n) => new THREE.Vector3(...n.p).sub(center).multiplyScalar(scale));

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(BG);
      mount.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(BG, 0.25);
      const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 50);
      camera.position.set(0, 0.25, 2.7);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.minDistance = 1.2;
      controls.maxDistance = 7;
      controls.autoRotate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      controls.autoRotateSpeed = AUTO_ROTATE_SPEED;

      // Edges: one LineSegments, vertex colors blended from both ends.
      const edgePos = new Float32Array(edges.length * 6);
      const edgeCol = new Float32Array(edges.length * 6);
      const c = new THREE.Color();
      edges.forEach(([a, b], i) => {
        pos[a].toArray(edgePos, i * 6);
        pos[b].toArray(edgePos, i * 6 + 3);
        c.set(communityColor(nodes[a].community)).toArray(edgeCol, i * 6);
        c.set(communityColor(nodes[b].community)).toArray(edgeCol, i * 6 + 3);
      });
      const edgeGeo = new THREE.BufferGeometry();
      edgeGeo.setAttribute("position", new THREE.BufferAttribute(edgePos, 3));
      edgeGeo.setAttribute("color", new THREE.BufferAttribute(edgeCol, 3));
      const edgeMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: EDGE_ALPHA, depthWrite: false, blending: THREE.AdditiveBlending });
      scene.add(new THREE.LineSegments(edgeGeo, edgeMat));

      // Points: one small sphere instance per paper.
      const sphere = new THREE.SphereGeometry(1, 10, 8);
      const pointMat = new THREE.MeshBasicMaterial({ transparent: true });
      const points = new THREE.InstancedMesh(sphere, pointMat, nodes.length);
      const m = new THREE.Matrix4();
      const baseColors = nodes.map((n) => new THREE.Color(communityColor(n.community)));
      nodes.forEach((n, i) => {
        const s = Math.min(POINT_MAX, POINT_BASE + POINT_INFLUENCE * Math.log1p(n.influence));
        m.makeScale(s, s, s).setPosition(pos[i]);
        points.setMatrixAt(i, m);
        points.setColorAt(i, baseColors[i]);
      });
      scene.add(points);

      const dim = new THREE.Color(BG);
      highlightRef.current = (h) => {
        nodes.forEach((n, i) => {
          const col = h === null || n.community === h ? baseColors[i] : baseColors[i].clone().lerp(dim, 0.8);
          points.setColorAt(i, col);
        });
        if (points.instanceColor) points.instanceColor.needsUpdate = true;
        edgeMat.opacity = h === null ? EDGE_ALPHA : EDGE_ALPHA * 0.4;
      };
      highlightRef.current(highlight);

      const resize = () => {
        const w = mount.clientWidth;
        const h = mount.clientHeight;
        renderer.setSize(w, h);
        camera.aspect = w / Math.max(1, h);
        camera.updateProjectionMatrix();
      };
      resize();
      // Narrow panels (phones) start farther back so the whole cloud fits.
      if (camera.aspect < 1) camera.position.setLength(2.7 / Math.max(0.5, camera.aspect));
      const ro = new ResizeObserver(resize);
      ro.observe(mount);

      // Hover: raycast the instanced points.
      const ray = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      const onMove = (e: PointerEvent) => {
        const r = renderer.domElement.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const hit = ray.intersectObject(points)[0];
        if (hit && hit.instanceId !== undefined) {
          setHover({ x: e.clientX - r.left, y: e.clientY - r.top, label: nodes[hit.instanceId].label });
          controls.autoRotate = false;
        } else {
          setHover(null);
        }
      };
      const onLeave = () => setHover(null);
      renderer.domElement.addEventListener("pointermove", onMove);
      renderer.domElement.addEventListener("pointerleave", onLeave);

      let raf = 0;
      const loop = () => {
        raf = requestAnimationFrame(loop);
        controls.update();
        renderer.render(scene, camera);
      };
      loop();

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        renderer.domElement.removeEventListener("pointermove", onMove);
        renderer.domElement.removeEventListener("pointerleave", onLeave);
        controls.dispose();
        edgeGeo.dispose();
        edgeMat.dispose();
        sphere.dispose();
        pointMat.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
    // The graph data is static for the page's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  return (
    <div ref={mountRef} className="relative h-full w-full cursor-grab active:cursor-grabbing">
      {hover && (
        <div
          className="pointer-events-none absolute z-10 max-w-xs rounded-sm bg-[#18221D]/95 px-2.5 py-1.5 text-[12px] leading-snug text-[#EFF4EF]"
          style={{ left: Math.min(hover.x + 12, (mountRef.current?.clientWidth ?? 400) - 240), top: hover.y + 12 }}
        >
          {hover.label}
        </div>
      )}
    </div>
  );
}
