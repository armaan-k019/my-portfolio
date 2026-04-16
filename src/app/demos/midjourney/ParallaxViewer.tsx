"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

interface Props {
  imageDataUrl: string;
  depthMapDataUrl: string;
}

export default function ParallaxViewer({ imageDataUrl, depthMapDataUrl }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080808);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 100);
    camera.position.set(0, 0, 2.8);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Lights — ambient + subtle directional to give displaced geometry some shading
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.3);
    dirLight.position.set(2, 2, 3);
    scene.add(dirLight);

    // Load both textures
    const loader = new THREE.TextureLoader();
    const imageTex = loader.load(imageDataUrl);
    const depthTex = loader.load(depthMapDataUrl);

    // 16:9 plane with 128×128 subdivision for smooth displacement
    const geo = new THREE.PlaneGeometry(3.2, 1.8, 128, 128);
    const mat = new THREE.MeshStandardMaterial({
      map: imageTex,
      displacementMap: depthTex,
      displacementScale: 0.4,
      displacementBias: -0.12,
      metalness: 0,
      roughness: 1,
    });

    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);

    // Interaction state
    let isDragging = false;
    let prevX = 0;
    let prevY = 0;
    let targetRotX = 0;
    let targetRotY = 0;
    let currentRotX = 0;
    let currentRotY = 0;
    let lastActivityTime = Date.now();
    let autoAngle = 0;
    let animId: number;

    const clampX = (v: number) => Math.max(-0.45, Math.min(0.45, v));
    const clampY = (v: number) => Math.max(-0.7, Math.min(0.7, v));

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
      lastActivityTime = Date.now();
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      targetRotY = clampY(targetRotY + (e.clientX - prevX) * 0.006);
      targetRotX = clampX(targetRotX + (e.clientY - prevY) * 0.006);
      prevX = e.clientX;
      prevY = e.clientY;
      lastActivityTime = Date.now();
    };
    const onMouseUp = () => { isDragging = false; };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      isDragging = true;
      prevX = e.touches[0].clientX;
      prevY = e.touches[0].clientY;
      lastActivityTime = Date.now();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!isDragging || e.touches.length !== 1) return;
      targetRotY = clampY(targetRotY + (e.touches[0].clientX - prevX) * 0.006);
      targetRotX = clampX(targetRotX + (e.touches[0].clientY - prevY) * 0.006);
      prevX = e.touches[0].clientX;
      prevY = e.touches[0].clientY;
      lastActivityTime = Date.now();
    };
    const onTouchEnd = () => { isDragging = false; };

    renderer.domElement.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    renderer.domElement.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);

    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    function animate() {
      animId = requestAnimationFrame(animate);

      const idle = !isDragging && Date.now() - lastActivityTime > 2500;
      if (idle) {
        autoAngle += 0.007;
        targetRotY = Math.sin(autoAngle) * 0.22;
        targetRotX = Math.sin(autoAngle * 0.55) * 0.07;
      }

      currentRotX += (targetRotX - currentRotX) * 0.08;
      currentRotY += (targetRotY - currentRotY) * 0.08;
      mesh.rotation.x = currentRotX;
      mesh.rotation.y = currentRotY;

      renderer.render(scene, camera);
    }

    animate();

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      renderer.domElement.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      geo.dispose();
      mat.dispose();
      imageTex.dispose();
      depthTex.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [imageDataUrl, depthMapDataUrl]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full cursor-grab active:cursor-grabbing select-none"
      style={{ touchAction: "none" }}
    />
  );
}
