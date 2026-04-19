"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

interface Props {
  imageUrl: string;
  showDepth: boolean;
  onDepthReady?: (depthDataUrl: string) => void;
}

export default function ParallaxViewer({ imageUrl, showDepth, onDepthReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [depthStatus, setDepthStatus] = useState<"loading" | "ready" | "error">("loading");
  const matRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const imageTexRef = useRef<THREE.Texture | null>(null);
  const depthTexRef = useRef<THREE.Texture | null>(null);

  // Sync showDepth prop → material without remounting the scene
  useEffect(() => {
    const mat = matRef.current;
    if (!mat || !imageTexRef.current || !depthTexRef.current) return;
    mat.map = showDepth ? depthTexRef.current : imageTexRef.current;
    mat.needsUpdate = true;
  }, [showDepth]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const el: HTMLDivElement = container;

    let cancelled = false;
    let animId: number;
    let renderer: THREE.WebGLRenderer | null = null;

    async function init() {
      // ── Depth estimation ───────────────────────────────────────────────────
      let depthDataUrl: string;
      try {
        const [tfjs, depthEstimation] = await Promise.all([
          import("@tensorflow/tfjs"),
          import("@tensorflow-models/depth-estimation"),
        ]);
        await tfjs.ready();

        const estimator = await depthEstimation.createEstimator(
          depthEstimation.SupportedModels.ARPortraitDepth
        );

        const imgEl = new Image();
        imgEl.crossOrigin = "anonymous";
        await new Promise<void>((resolve, reject) => {
          imgEl.onload = () => resolve();
          imgEl.onerror = reject;
          imgEl.src = imageUrl;
        });

        const depthResult = await estimator.estimateDepth(imgEl, { minDepth: 0, maxDepth: 1 });
        const depthSource = await depthResult.toCanvasImageSource();

        const offscreen = document.createElement("canvas");
        offscreen.width = imgEl.naturalWidth;
        offscreen.height = imgEl.naturalHeight;
        const ctx = offscreen.getContext("2d")!;
        ctx.drawImage(depthSource as CanvasImageSource, 0, 0, offscreen.width, offscreen.height);
        depthDataUrl = offscreen.toDataURL("image/png");
        onDepthReady?.(depthDataUrl);
      } catch {
        if (!cancelled) setDepthStatus("error");
        return;
      }

      if (cancelled) return;
      setDepthStatus("ready");

      // ── Three.js scene ─────────────────────────────────────────────────────
      const width = el.clientWidth;
      const height = el.clientHeight;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf5f4f0);

      const camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 100);
      camera.position.set(0, 0, 2.2);
      camera.lookAt(0, 0, 0);

      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      el.appendChild(renderer.domElement);

      scene.add(new THREE.AmbientLight(0xffffff, 0.9));
      const dirLight = new THREE.DirectionalLight(0xffffff, 0.3);
      dirLight.position.set(2, 2, 3);
      scene.add(dirLight);

      const loader = new THREE.TextureLoader();
      const imageTex = loader.load(imageUrl);
      const depthTex = loader.load(depthDataUrl);
      imageTexRef.current = imageTex;
      depthTexRef.current = depthTex;

      const aspect = width / height;
      const planeWidth = 3.5;
      const planeHeight = planeWidth / aspect;
      const geo = new THREE.PlaneGeometry(planeWidth * 1.2, planeHeight * 1.2, 128, 128);
      const mat = new THREE.MeshStandardMaterial({
        map: imageTex,
        displacementMap: depthTex,
        displacementScale: 0.22,
        displacementBias: -0.05,
        metalness: 0,
        roughness: 1,
      });
      matRef.current = mat;

      const mesh = new THREE.Mesh(geo, mat);
      scene.add(mesh);

      let isDragging = false;
      let prevX = 0;
      let prevY = 0;
      let targetRotX = 0;
      let targetRotY = 0;
      let lastActivityTime = Date.now();

      // Cinematic auto-pan state
      let autoPanActive = true;
      const autoPanStart = Date.now();
      const AUTO_PAN_DURATION = 3000;

      const clampX = (v: number) => Math.max(-0.2, Math.min(0.2, v));
      const clampY = (v: number) => Math.max(-0.3, Math.min(0.3, v));

      const stopAutoPan = () => {
        autoPanActive = false;
        lastActivityTime = Date.now();
      };

      const onMouseDown = (e: MouseEvent) => {
        stopAutoPan();
        isDragging = true; prevX = e.clientX; prevY = e.clientY;
      };
      const onMouseMove = (e: MouseEvent) => {
        if (!isDragging) return;
        targetRotY = clampY(targetRotY + (e.clientX - prevX) * 0.006);
        targetRotX = clampX(targetRotX + (e.clientY - prevY) * 0.006);
        prevX = e.clientX; prevY = e.clientY; lastActivityTime = Date.now();
      };
      const onMouseUp = () => { isDragging = false; };

      const onTouchStart = (e: TouchEvent) => {
        stopAutoPan();
        if (e.touches.length !== 1) return;
        isDragging = true; prevX = e.touches[0].clientX; prevY = e.touches[0].clientY;
      };
      const onTouchMove = (e: TouchEvent) => {
        if (!isDragging || e.touches.length !== 1) return;
        targetRotY = clampY(targetRotY + (e.touches[0].clientX - prevX) * 0.006);
        targetRotX = clampX(targetRotX + (e.touches[0].clientY - prevY) * 0.006);
        prevX = e.touches[0].clientX; prevY = e.touches[0].clientY; lastActivityTime = Date.now();
      };
      const onTouchEnd = () => { isDragging = false; };

      renderer.domElement.addEventListener("mousedown", onMouseDown);
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      renderer.domElement.addEventListener("touchstart", onTouchStart, { passive: true });
      window.addEventListener("touchmove", onTouchMove, { passive: true });
      window.addEventListener("touchend", onTouchEnd);

      const resizeObserver = new ResizeObserver(() => {
        if (!renderer) return;
        const w = el.clientWidth;
        const h = el.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      });
      resizeObserver.observe(el);

      function animate() {
        animId = requestAnimationFrame(animate);

        if (autoPanActive) {
          const elapsed = Date.now() - autoPanStart;
          if (elapsed >= AUTO_PAN_DURATION) {
            autoPanActive = false;
            lastActivityTime = Date.now();
            // Smoothly hand off to the user-control loop from current position
            targetRotY = camera.position.x / 0.4;
            targetRotX = -camera.position.y / 0.4;
          } else {
            const t = elapsed / AUTO_PAN_DURATION;
            camera.position.x = Math.sin(t * Math.PI * 2) * 0.3;
            camera.position.y = 0;
            camera.lookAt(0, 0, 0);
            renderer!.render(scene, camera);
            return;
          }
        }

        const idle = !isDragging && Date.now() - lastActivityTime > 2500;
        if (idle) {
          const idleElapsed = (Date.now() - lastActivityTime - 2500) * 0.001;
          targetRotY = Math.sin(idleElapsed * 0.7) * 0.15;
          targetRotX = Math.sin(idleElapsed * 0.4) * 0.05;
        }

        camera.position.x += (targetRotY * 0.4 - camera.position.x) * 0.08;
        camera.position.y += (-targetRotX * 0.4 - camera.position.y) * 0.08;
        camera.lookAt(0, 0, 0);
        renderer!.render(scene, camera);
      }

      animate();

      (renderer as unknown as Record<string, unknown>).__cleanup = () => {
        cancelAnimationFrame(animId);
        resizeObserver.disconnect();
        renderer!.domElement.removeEventListener("mousedown", onMouseDown);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        renderer!.domElement.removeEventListener("touchstart", onTouchStart);
        window.removeEventListener("touchmove", onTouchMove);
        window.removeEventListener("touchend", onTouchEnd);
        geo.dispose();
        mat.dispose();
        imageTex.dispose();
        depthTex.dispose();
        renderer!.dispose();
        if (el.contains(renderer!.domElement)) {
          el.removeChild(renderer!.domElement);
        }
      };
    }

    init();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animId);
      matRef.current = null;
      imageTexRef.current = null;
      depthTexRef.current = null;
      if (renderer) {
        const cleanup = (renderer as unknown as Record<string, unknown>).__cleanup;
        if (typeof cleanup === "function") (cleanup as () => void)();
      }
    };
  }, [imageUrl]);

  return (
    <div className="w-full h-full relative" style={{ touchAction: "none" }}>
      <div
        ref={containerRef}
        className="w-full h-full cursor-grab active:cursor-grabbing select-none"
        style={{
          opacity: depthStatus === "ready" ? 1 : 0,
          transition: "opacity 0.8s ease",
        }}
      />
      {depthStatus === "loading" && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ backgroundColor: "#f5f4f0" }}
        >
          <p className="text-xs" style={{ color: "#888880" }}>
            Initializing depth model...
          </p>
        </div>
      )}
      {depthStatus === "error" && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ backgroundColor: "#f5f4f0" }}
        >
          <p className="text-xs" style={{ color: "#ef4444" }}>
            Depth estimation failed
          </p>
        </div>
      )}
    </div>
  );
}
