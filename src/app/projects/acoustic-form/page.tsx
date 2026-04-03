'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { RoomShape, Vector3D, AcousticMetrics, SoundRay, SurfaceGroup, ReceiverPoint } from '@/types';
import { getDefaultRoom } from '@/lib/geometry';
import {
  calculateVolume, calculateSurfaceArea, calculateRT60,
  calculateOctaveBandRT60, detectSurfaceGroups, castSoundRays,
} from '@/lib/acoustics';
import ShapeInputPanel from '@/components/ShapeInputPanel';
import MetricsPanel from '@/components/MetricsPanel';
import MaterialPanel from '@/components/MaterialPanel';

const ThreeCanvas = dynamic(() => import('@/components/ThreeCanvas'), { ssr: false });

// ─── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_ROOM = getDefaultRoom();
const DEFAULT_SOURCES: Vector3D[] = [{ x: 5, y: 2, z: 4 }];

function computeMetrics(
  shape: RoomShape,
  rays: SoundRay[],
  surfaceGroups: SurfaceGroup[],
): AcousticMetrics {
  const volume = calculateVolume(shape.vertices, shape.faces);
  const surfaceArea = calculateSurfaceArea(shape.vertices, shape.faces);
  const octaveBandRT60 = calculateOctaveBandRT60(volume, shape.vertices, shape.faces, surfaceGroups);
  const rt60 = calculateRT60(volume, surfaceArea);
  const earlyReflections = rays.reduce((sum, r) => sum + r.bounces.length, 0);
  return { volume, surfaceArea, rt60, octaveBandRT60, earlyReflections };
}

function makeReceiver(pos: Vector3D, index: number): ReceiverPoint {
  return { id: crypto.randomUUID(), position: pos, label: `R${index + 1}` };
}

// ─── How to use panel ──────────────────────────────────────────────────────────

function HowToUsePanel() {
  const [open, setOpen] = useState(false);

  const steps = [
    {
      label: 'Define the room',
      detail: 'Use "Describe" to generate a shape from text, "Manual" to enter vertices, or "Import 3D" to load .obj, .stl, .dxf, or .3dm files.',
    },
    {
      label: 'Assign materials',
      detail: 'Under Surface Materials, set floor, ceiling, and wall absorptions. The α value shown is the 500 Hz absorption coefficient.',
    },
    {
      label: 'Place sources',
      detail: 'Click "+ Add" to add up to 3 sound sources. Drag the orange spheres in the 3D view to reposition them.',
    },
    {
      label: 'Add receivers',
      detail: 'Optionally add up to 5 receiver points (coloured spheres). These represent listener positions.',
    },
    {
      label: 'Read the metrics',
      detail: 'The right panel shows RT60 per octave band (125 Hz – 4 kHz) using Sabine\'s formula with your assigned materials.',
    },
    {
      label: 'Get Claude\'s analysis',
      detail: 'Click "Analyze Acoustics" to get a plain-English acoustic assessment and design recommendations. Export as PDF.',
    },
  ];

  const controls = [
    { key: 'Drag', action: 'Orbit camera' },
    { key: 'Shift + drag', action: 'Pan camera' },
    { key: 'Scroll', action: 'Zoom' },
    { key: 'Click source', action: 'Drag to move' },
  ];

  return (
    <div className="bg-white/80 rounded-xl border border-[#E8E0D4] shadow-sm">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#F5F0E8]/60 transition-colors"
      >
        <span className="font-semibold text-xs text-[#2C1810]">How to use</span>
        <span className="text-[#9B8E85] text-xs">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-[#E8E0D4]">
          <ol className="space-y-3 mt-3">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="shrink-0 w-4 h-4 rounded-full bg-[#FF6B35]/15 text-[#FF6B35] text-[9px] font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <div>
                  <p className="text-xs font-medium text-[#2C1810] leading-snug">{s.label}</p>
                  <p className="text-[11px] text-[#6B6054] leading-relaxed mt-0.5">{s.detail}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="border-t border-[#E8E0D4] pt-3">
            <p className="text-[10px] font-semibold text-[#9B8E85] uppercase tracking-wider mb-2">Viewport controls</p>
            <div className="space-y-1">
              {controls.map(c => (
                <div key={c.key} className="flex items-center justify-between">
                  <span className="text-[11px] font-mono bg-[#F5F0E8] text-[#2C1810] px-1.5 py-0.5 rounded">{c.key}</span>
                  <span className="text-[11px] text-[#6B6054]">{c.action}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[10px] text-[#9B8E85] italic border-t border-[#E8E0D4] pt-3">
            Calculations use Sabine&rsquo;s formula. Results are indicative only and not a substitute for professional acoustic analysis.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── How it works panel ────────────────────────────────────────────────────────

function HowItWorksPanel() {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white/80 rounded-xl border border-[#E8E0D4] shadow-sm">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#F5F0E8]/60 transition-colors"
      >
        <span className="font-semibold text-xs text-[#2C1810]">How it works</span>
        <span className="text-[#9B8E85] text-xs">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-[#E8E0D4] mt-0">
          {/* Sabine's Formula */}
          <div className="mt-3">
            <p className="text-xs font-semibold text-[#2C1810] mb-1">Sabine&apos;s Formula</p>
            <div className="bg-[#F5F0E8] rounded-lg px-3 py-2 mb-2 text-center">
              <span className="text-xs font-mono text-[#2C1810]">RT60 = 0.161 &times; V / A</span>
            </div>
            <p className="text-[11px] text-[#6B6054] leading-relaxed">
              <strong className="text-[#2C1810]">V</strong> is the room volume in m³.{' '}
              <strong className="text-[#2C1810]">A</strong> is the total acoustic absorption in sabins (m²),
              calculated as the sum of each surface&apos;s area multiplied by its absorption coefficient α.
              The constant 0.161 comes from the speed of sound (343 m/s) and the natural logarithm of 10⁶.
            </p>
          </div>

          {/* Absorption coefficient */}
          <div className="border-t border-[#E8E0D4] pt-3">
            <p className="text-xs font-semibold text-[#2C1810] mb-1">Absorption Coefficient (α)</p>
            <p className="text-[11px] text-[#6B6054] leading-relaxed">
              α ranges from 0 (perfect reflector, e.g. bare concrete α ≈ 0.02) to 1 (perfect absorber, e.g.
              acoustic foam α ≈ 0.95). Each material has a different α at each octave band — carpet absorbs
              more at high frequencies, while concrete absorbs almost nothing across the spectrum.
            </p>
          </div>

          {/* Octave bands */}
          <div className="border-t border-[#E8E0D4] pt-3">
            <p className="text-xs font-semibold text-[#2C1810] mb-1">Octave Band Analysis</p>
            <p className="text-[11px] text-[#6B6054] leading-relaxed">
              RT60 is calculated separately at six octave bands: 125, 250, 500, 1k, 2k, and 4k Hz.
              Each band uses that material&apos;s α value at that frequency, giving a frequency-dependent
              reverberation profile. Speech intelligibility is most sensitive to the 500 Hz – 2 kHz range.
            </p>
          </div>

          {/* Ray casting */}
          <div className="border-t border-[#E8E0D4] pt-3">
            <p className="text-xs font-semibold text-[#2C1810] mb-1">Ray Casting</p>
            <p className="text-[11px] text-[#6B6054] leading-relaxed">
              Sound rays are emitted in a uniform spherical pattern from each source using the Fibonacci
              sphere algorithm. Each ray is traced through the room, reflecting off the nearest triangle
              face using the law of reflection (angle of incidence = angle of reflection). The number of
              reflections detected is the early reflections count shown in the metrics.
            </p>
          </div>

          {/* Early reflections */}
          <div className="border-t border-[#E8E0D4] pt-3">
            <p className="text-xs font-semibold text-[#2C1810] mb-1">Early Reflections</p>
            <p className="text-[11px] text-[#6B6054] leading-relaxed">
              Early reflections are sound paths that reach the listener within ~50ms of the direct sound.
              They reinforce spatial impression and perceived room size. A high early reflection count
              with a long RT60 can indicate a reverberant, diffuse space — common in concert halls and
              cathedrals. A low count with short RT60 indicates a dry, absorptive space suited for speech.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AcousticFormPage() {
  const [roomShape, setRoomShape]           = useState<RoomShape>(DEFAULT_ROOM);
  const [sourcePositions, setSourcePositions] = useState<Vector3D[]>(DEFAULT_SOURCES);
  const [soundRays, setSoundRays]           = useState<SoundRay[]>([]);
  const [surfaceGroups, setSurfaceGroups]   = useState<SurfaceGroup[]>(
    () => detectSurfaceGroups(DEFAULT_ROOM.vertices, DEFAULT_ROOM.faces),
  );
  const [receiverPoints, setReceiverPoints] = useState<ReceiverPoint[]>([]);
  const [maxBounces, setMaxBounces]         = useState(5);
  const [vizMode, setVizMode]               = useState<'particles' | 'static'>('static');
  const [metrics, setMetrics]               = useState<AcousticMetrics>(
    () => computeMetrics(DEFAULT_ROOM, [], detectSurfaceGroups(DEFAULT_ROOM.vertices, DEFAULT_ROOM.faces)),
  );
  const [materialVersion, setMaterialVersion] = useState(0);
  const [editingReceiverId, setEditingReceiverId] = useState<string | null>(null);
  const [editPos, setEditPos]               = useState<Vector3D>({ x: 0, y: 0, z: 0 });

  useEffect(() => {
    const newGroups = detectSurfaceGroups(roomShape.vertices, roomShape.faces);
    setSurfaceGroups(prev => newGroups.map(g => {
      const existing = prev.find(p => p.label === g.label);
      return existing ? { ...g, material: existing.material } : g;
    }));
  }, [roomShape]);

  useEffect(() => {
    const allRays: SoundRay[] = sourcePositions.flatMap(
      src => castSoundRays(src, roomShape, 64, maxBounces),
    );
    setSoundRays(allRays);
    setMetrics(computeMetrics(roomShape, allRays, surfaceGroups));
  }, [roomShape, sourcePositions, surfaceGroups, maxBounces]);

  const handleSourceDrag = useCallback((index: number, newPos: Vector3D) => {
    setSourcePositions(prev => prev.map((p, i) => (i === index ? newPos : p)));
  }, []);

  const handleReceiverDrag = useCallback((id: string, newPos: Vector3D) => {
    setReceiverPoints(prev => prev.map(r => r.id === id ? { ...r, position: newPos } : r));
  }, []);

  function addSource() {
    if (sourcePositions.length >= 3) return;
    setSourcePositions(prev => [...prev, { x: prev[0].x + 2, y: prev[0].y, z: prev[0].z + 2 }]);
  }

  function removeSource(index: number) {
    if (sourcePositions.length <= 1) return;
    setSourcePositions(prev => prev.filter((_, i) => i !== index));
  }

  function addReceiver() {
    if (receiverPoints.length >= 5) return;
    const idx = receiverPoints.length;
    setReceiverPoints(prev => [...prev, makeReceiver({ x: 3 + idx * 2, y: 1.2, z: 3 + idx }, idx)]);
  }

  function removeReceiver(id: string) {
    setReceiverPoints(prev => {
      const next = prev.filter(r => r.id !== id);
      return next.map((r, i) => ({ ...r, label: `R${i + 1}` }));
    });
    if (editingReceiverId === id) setEditingReceiverId(null);
  }

  function startEditReceiver(rp: ReceiverPoint) {
    setEditingReceiverId(rp.id);
    setEditPos({ ...rp.position });
  }

  function confirmEditReceiver() {
    setReceiverPoints(prev => prev.map(r => r.id === editingReceiverId ? { ...r, position: editPos } : r));
    setEditingReceiverId(null);
  }

  const shapeDescription =
    `Room with ${roomShape.vertices.length} vertices and ${roomShape.faces.length} triangular faces. ` +
    `Volume: ${metrics.volume.toFixed(1)} m³. ` +
    `Sources: ${sourcePositions.length}. Receivers: ${receiverPoints.length}.`;

  return (
    <div className="h-[100dvh] bg-[#F5F0E8] flex flex-col overflow-hidden">

      {/* ─── Mobile message ──────────────────────────────────────────────────── */}
      <div className="lg:hidden flex flex-col items-center justify-center min-h-0 flex-1 overflow-y-auto px-8 py-12 text-center gap-4">
        <div className="w-12 h-12 rounded-full bg-[#FF6B35]/10 flex items-center justify-center">
          <svg className="w-6 h-6 text-[#FF6B35]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-[#2C1810]">Desktop required</h2>
        <p className="text-sm text-[#6B6054] max-w-xs leading-relaxed">
          Acoustic Form uses a three-panel layout with a 3D viewport. Please open it on a laptop or desktop for the full experience.
        </p>
        <Link href="/#projects" className="mt-2 text-sm text-[#FF6B35] hover:text-[#e55e2b] transition-colors">
          &larr; Back to projects
        </Link>
      </div>

      {/* ─── Three-column layout (desktop only) ─────────────────────────────── */}
      <div className="hidden lg:flex flex-1 min-h-0 max-w-screen-2xl w-full mx-auto p-4 gap-4">

        {/* Left - title + how to use + shape input */}
        <aside className="w-72 flex-shrink-0 overflow-y-auto min-h-0 flex flex-col gap-3">

          <div>
            <Link
              href="/#projects"
              className="text-xs text-terracotta hover:text-terracotta-dark transition-colors mb-3 inline-block"
            >
              &larr; Back to projects
            </Link>
            <div className="flex items-center gap-2 mb-0.5">
              <h1 className="text-lg font-semibold text-darkblue leading-tight">Acoustic Form</h1>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#FF6B35]/15 text-[#FF6B35] border border-[#FF6B35]/30 uppercase tracking-wide">
                Beta
              </span>
            </div>
            <p className="text-xs text-[#6B6054]">Early-stage acoustic simulation for architects</p>
          </div>

          <HowToUsePanel />

          <HowItWorksPanel />

          <ShapeInputPanel
            roomShape={roomShape}
            sourcePosition={sourcePositions[0]}
            onRoomChange={setRoomShape}
            onSourceChange={(pos) => setSourcePositions(prev => [pos, ...prev.slice(1)])}
            maxBounces={maxBounces}
            onMaxBouncesChange={setMaxBounces}
            vizMode={vizMode}
            onVizModeChange={setVizMode}
          />
        </aside>

        {/* Center - Three.js canvas */}
        <main className="flex-1 min-w-0 min-h-0 rounded-xl overflow-hidden border border-[#E8E0D4] shadow-sm">
          <ThreeCanvas
            roomShape={roomShape}
            sourcePositions={sourcePositions}
            soundRays={soundRays}
            receiverPoints={receiverPoints}
            onSourceDrag={handleSourceDrag}
            onReceiverDrag={handleReceiverDrag}
            surfaceGroups={surfaceGroups}
            vizMode={vizMode}
          />
        </main>

        {/* Right - materials + sources + receivers + metrics */}
        <aside className="w-72 flex-shrink-0 overflow-y-auto min-h-0 flex flex-col gap-3">

          <MaterialPanel
            groups={surfaceGroups}
            onChange={(g) => { setSurfaceGroups(g); setMaterialVersion(v => v + 1); }}
          />

          {/* ─── Sources ──────────────────────────────────────────────────────── */}
          <div className="bg-white/80 rounded-xl border border-[#E8E0D4] shadow-sm p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-xs text-[#2C1810]">Sound Sources</h3>
              <button
                onClick={addSource}
                disabled={sourcePositions.length >= 3}
                className="text-[10px] px-2 py-0.5 rounded bg-[#FF6B35]/10 text-[#FF6B35] font-medium hover:bg-[#FF6B35]/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                + Add
              </button>
            </div>
            {sourcePositions.map((src, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-[#2C1810]">
                <span className="w-4 h-4 rounded-full bg-[#FF6B35] inline-block shrink-0" />
                <span className="flex-1">
                  S{i + 1} &nbsp;
                  <span className="text-[#9B8E85] tabular-nums">
                    ({src.x.toFixed(1)}, {src.y.toFixed(1)}, {src.z.toFixed(1)})
                  </span>
                </span>
                {i > 0 && (
                  <button onClick={() => removeSource(i)} className="text-[#9B8E85] hover:text-red-500 transition-colors">×</button>
                )}
              </div>
            ))}
            <p className="text-[10px] text-[#9B8E85]">Drag orange spheres in the 3D view. Max 3.</p>
          </div>

          {/* ─── Receivers ────────────────────────────────────────────────────── */}
          <div className="bg-white/80 rounded-xl border border-[#E8E0D4] shadow-sm p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-xs text-[#2C1810]">Receiver Points</h3>
              <button
                onClick={addReceiver}
                disabled={receiverPoints.length >= 5}
                className="text-[10px] px-2 py-0.5 rounded bg-[#1E3A5F]/10 text-[#1E3A5F] font-medium hover:bg-[#1E3A5F]/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                + Add
              </button>
            </div>
            {receiverPoints.length === 0 && (
              <p className="text-[10px] text-[#9B8E85] italic">No receivers added.</p>
            )}
            {receiverPoints.map((rp, i) => (
              <div key={rp.id} className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-[#2C1810]">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: ['#34d399','#60a5fa','#f472b6','#a78bfa','#fb923c'][i] }}
                  />
                  <span className="flex-1">
                    {rp.label} &nbsp;
                    <span className="text-[#9B8E85] tabular-nums">
                      ({rp.position.x.toFixed(1)}, {rp.position.y.toFixed(1)}, {rp.position.z.toFixed(1)})
                    </span>
                  </span>
                  <button
                    onClick={() => editingReceiverId === rp.id ? setEditingReceiverId(null) : startEditReceiver(rp)}
                    className="text-[#9B8E85] hover:text-[#FF6B35] transition-colors text-[10px] px-1"
                    title="Edit position"
                  >
                    ✎
                  </button>
                  <button onClick={() => removeReceiver(rp.id)} className="text-[#9B8E85] hover:text-red-500 transition-colors">×</button>
                </div>
                {editingReceiverId === rp.id && (
                  <div className="pl-5 space-y-1.5">
                    <div className="grid grid-cols-3 gap-1">
                      {(['x', 'y', 'z'] as const).map(axis => (
                        <div key={axis} className="flex flex-col gap-0.5">
                          <label className="text-[9px] uppercase text-[#9B8E85] font-medium">{axis}</label>
                          <input
                            type="number"
                            step="0.1"
                            value={editPos[axis]}
                            onChange={e => setEditPos(p => ({ ...p, [axis]: parseFloat(e.target.value) || 0 }))}
                            className="w-full px-1.5 py-1 text-[11px] border border-[#E8E0D4] rounded focus:outline-none focus:border-[#FF6B35] bg-white text-[#2C1810]"
                          />
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={confirmEditReceiver}
                      className="w-full py-1 text-[10px] rounded bg-[#FF6B35]/10 text-[#FF6B35] font-medium hover:bg-[#FF6B35]/20 transition-colors"
                    >
                      Apply
                    </button>
                  </div>
                )}
              </div>
            ))}
            <p className="text-[10px] text-[#9B8E85]">Shown as coloured spheres in 3D view. Max 5.</p>
          </div>

          <MetricsPanel
            metrics={metrics}
            shapeDescription={shapeDescription}
            surfaceGroups={surfaceGroups}
            materialVersion={materialVersion}
          />
        </aside>
      </div>
    </div>
  );
}
