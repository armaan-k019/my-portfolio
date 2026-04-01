'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { RoomShape, Vector3D, AcousticMetrics, SoundRay } from '@/types';
import { getDefaultRoom } from '@/lib/geometry';
import { calculateVolume, calculateSurfaceArea, calculateRT60, castSoundRays } from '@/lib/acoustics';
import ShapeInputPanel from '@/components/ShapeInputPanel';
import MetricsPanel from '@/components/MetricsPanel';

// Three.js canvas — no SSR
const ThreeCanvas = dynamic(() => import('@/components/ThreeCanvas'), { ssr: false });

// ─── Default state ─────────────────────────────────────────────────────────────

const DEFAULT_ROOM = getDefaultRoom();
const DEFAULT_SOURCE: Vector3D = { x: 5, y: 2, z: 4 };

function computeMetrics(shape: RoomShape, rays: SoundRay[]): AcousticMetrics {
  const volume = calculateVolume(shape.vertices, shape.faces);
  const surfaceArea = calculateSurfaceArea(shape.vertices, shape.faces);
  const rt60 = calculateRT60(volume, surfaceArea);
  const earlyReflections = rays.reduce((sum, r) => sum + r.bounces.length, 0);
  return { volume, surfaceArea, rt60, earlyReflections };
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AcousticFormPage() {
  const [roomShape, setRoomShape] = useState<RoomShape>(DEFAULT_ROOM);
  const [sourcePosition, setSourcePosition] = useState<Vector3D>(DEFAULT_SOURCE);
  const [soundRays, setSoundRays] = useState<SoundRay[]>([]);
  const [metrics, setMetrics] = useState<AcousticMetrics>(() =>
    computeMetrics(DEFAULT_ROOM, []),
  );

  // Recompute rays and metrics whenever room or source changes
  useEffect(() => {
    const rays = castSoundRays(sourcePosition, roomShape, 64, 5);
    setSoundRays(rays);
    setMetrics(computeMetrics(roomShape, rays));
  }, [roomShape, sourcePosition]);

  const handleSourceDrag = useCallback((newPos: Vector3D) => {
    setSourcePosition(newPos);
  }, []);

  // Shape description for Claude analysis
  const shapeDescription = `Room with ${roomShape.vertices.length} vertices and ${roomShape.faces.length} triangular faces. Volume: ${metrics.volume.toFixed(1)} m³.`;

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex flex-col">
      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-[#E8E0D4] px-6 py-4">
        <div className="max-w-screen-2xl mx-auto flex items-center gap-4 flex-wrap">
          <div className="flex flex-col">
            <h1 className="font-bold text-xl text-[#2C1810] leading-tight">Acoustic Form</h1>
            <p className="text-xs text-[#6B6054]">Early-stage acoustic simulation for architects</p>
          </div>

          <div className="flex items-center gap-2 ml-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#1E3A5F]/10 text-[#1E3A5F] border border-[#1E3A5F]/20">
              CS × Architecture
            </span>
          </div>

          <div className="flex items-center gap-2 ml-auto flex-wrap">
            {['Three.js', 'Next.js', 'Claude API'].map((tech) => (
              <span
                key={tech}
                className="px-2.5 py-0.5 rounded-md text-xs font-medium bg-[#F5F0E8] text-[#6B6054] border border-[#E8E0D4]"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* ─── Three-column layout ─────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden max-w-screen-2xl w-full mx-auto p-4 gap-4">
        {/* Left — shape input */}
        <aside className="w-80 flex-shrink-0 overflow-y-auto">
          <ShapeInputPanel
            roomShape={roomShape}
            sourcePosition={sourcePosition}
            onRoomChange={setRoomShape}
            onSourceChange={setSourcePosition}
          />
        </aside>

        {/* Center — Three.js canvas */}
        <main className="flex-1 min-w-0 rounded-xl overflow-hidden border border-[#E8E0D4] shadow-sm bg-white/30">
          <ThreeCanvas
            roomShape={roomShape}
            sourcePosition={sourcePosition}
            soundRays={soundRays}
            onSourceDrag={handleSourceDrag}
          />
        </main>

        {/* Right — metrics panel */}
        <aside className="w-72 flex-shrink-0 overflow-y-auto">
          <MetricsPanel metrics={metrics} shapeDescription={shapeDescription} />
        </aside>
      </div>

      {/* ─── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-[#E8E0D4] px-6 py-3 bg-white/40">
        <p className="text-center text-xs text-[#6B6054]">
          © {new Date().getFullYear()} Acoustic Form — portfolio project by Armaan Kazi
        </p>
      </footer>
    </div>
  );
}
