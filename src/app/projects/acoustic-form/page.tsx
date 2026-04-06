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
import type { StructureData } from '@/components/ThreeCanvas';

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
    <div className="bg-white/80 rounded-xl border border-[#D8E6D8] shadow-sm">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#FFFFFF]/60 transition-colors"
      >
        <span className="font-semibold text-xs text-[#1A2A1A]">How to use</span>
        <span className="text-[#7A9B7A] text-xs">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-[#D8E6D8]">
          <ol className="space-y-3 mt-3">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="shrink-0 w-4 h-4 rounded-full bg-[#FF6B35]/15 text-[#FF6B35] text-[9px] font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <div>
                  <p className="text-xs font-medium text-[#1A2A1A] leading-snug">{s.label}</p>
                  <p className="text-[11px] text-[#4A6B4A] leading-relaxed mt-0.5">{s.detail}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="border-t border-[#D8E6D8] pt-3">
            <p className="text-[10px] font-semibold text-[#7A9B7A] uppercase tracking-wider mb-2">Viewport controls</p>
            <div className="space-y-1">
              {controls.map(c => (
                <div key={c.key} className="flex items-center justify-between">
                  <span className="text-[11px] font-mono bg-[#FFFFFF] text-[#1A2A1A] px-1.5 py-0.5 rounded">{c.key}</span>
                  <span className="text-[11px] text-[#4A6B4A]">{c.action}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[10px] text-[#7A9B7A] italic border-t border-[#D8E6D8] pt-3">
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
    <div className="bg-white/80 rounded-xl border border-[#D8E6D8] shadow-sm">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#FFFFFF]/60 transition-colors"
      >
        <span className="font-semibold text-xs text-[#1A2A1A]">How it works</span>
        <span className="text-[#7A9B7A] text-xs">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-[#D8E6D8] mt-0">
          {/* Sabine's Formula */}
          <div className="mt-3">
            <p className="text-xs font-semibold text-[#1A2A1A] mb-1">Sabine&apos;s Formula</p>
            <div className="bg-[#FFFFFF] rounded-lg px-3 py-2 mb-2 text-center">
              <span className="text-xs font-mono text-[#1A2A1A]">RT60 = 0.161 &times; V / A</span>
            </div>
            <p className="text-[11px] text-[#4A6B4A] leading-relaxed">
              <strong className="text-[#1A2A1A]">V</strong> is the room volume in m³.{' '}
              <strong className="text-[#1A2A1A]">A</strong> is the total acoustic absorption in sabins (m²),
              calculated as the sum of each surface&apos;s area multiplied by its absorption coefficient α.
              The constant 0.161 comes from the speed of sound (343 m/s) and the natural logarithm of 10⁶.
            </p>
          </div>

          {/* Absorption coefficient */}
          <div className="border-t border-[#D8E6D8] pt-3">
            <p className="text-xs font-semibold text-[#1A2A1A] mb-1">Absorption Coefficient (α)</p>
            <p className="text-[11px] text-[#4A6B4A] leading-relaxed">
              α ranges from 0 (perfect reflector, e.g. bare concrete α ≈ 0.02) to 1 (perfect absorber, e.g.
              acoustic foam α ≈ 0.95). Each material has a different α at each octave band - carpet absorbs
              more at high frequencies, while concrete absorbs almost nothing across the spectrum.
            </p>
          </div>

          {/* Octave bands */}
          <div className="border-t border-[#D8E6D8] pt-3">
            <p className="text-xs font-semibold text-[#1A2A1A] mb-1">Octave Band Analysis</p>
            <p className="text-[11px] text-[#4A6B4A] leading-relaxed">
              RT60 is calculated separately at six octave bands: 125, 250, 500, 1k, 2k, and 4k Hz.
              Each band uses that material&apos;s α value at that frequency, giving a frequency-dependent
              reverberation profile. Speech intelligibility is most sensitive to the 500 Hz – 2 kHz range.
            </p>
          </div>

          {/* Ray casting */}
          <div className="border-t border-[#D8E6D8] pt-3">
            <p className="text-xs font-semibold text-[#1A2A1A] mb-1">Ray Casting</p>
            <p className="text-[11px] text-[#4A6B4A] leading-relaxed">
              Sound rays are emitted in a uniform spherical pattern from each source using the Fibonacci
              sphere algorithm. Each ray is traced through the room, reflecting off the nearest triangle
              face using the law of reflection (angle of incidence = angle of reflection). The number of
              reflections detected is the early reflections count shown in the metrics.
            </p>
          </div>

          {/* Early reflections */}
          <div className="border-t border-[#D8E6D8] pt-3">
            <p className="text-xs font-semibold text-[#1A2A1A] mb-1">Early Reflections</p>
            <p className="text-[11px] text-[#4A6B4A] leading-relaxed">
              Early reflections are sound paths that reach the listener within ~50ms of the direct sound.
              They reinforce spatial impression and perceived room size. A high early reflection count
              with a long RT60 can indicate a reverberant, diffuse space - common in concert halls and
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

  const [structureInput, setStructureInput]               = useState("");
  const [structureData, setStructureData]                 = useState<StructureData | null>(null);
  const [structureName, setStructureName]                 = useState("");
  const [structureDescription, setStructureDescription]   = useState("");
  const [structureComponentCount, setStructureComponentCount] = useState(0);
  const [structureGenerating, setStructureGenerating]     = useState(false);
  const [structureError, setStructureError]               = useState("");
  const [structureOpen, setStructureOpen]                 = useState(false);

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

  const generateStructure = async (name: string) => {
    if (!name.trim()) return;
    setStructureGenerating(true);
    setStructureError("");
    try {
      const res = await fetch("/api/generate-structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed");
      if (!data.components || !Array.isArray(data.components)) throw new Error("Could not interpret that structure - try a different name");
      setStructureData(data);
      setStructureName(data.name || name);
      setStructureDescription(data.description || "");
      setStructureComponentCount(data.components.length);
      if (data._warning) setStructureError(data._warning);
    } catch (err) {
      setStructureError(err instanceof Error ? err.message : "Could not interpret that structure - try a different name");
    } finally {
      setStructureGenerating(false);
    }
  };

  const shapeDescription =
    `Room with ${roomShape.vertices.length} vertices and ${roomShape.faces.length} triangular faces. ` +
    `Volume: ${metrics.volume.toFixed(1)} m³. ` +
    `Sources: ${sourcePositions.length}. Receivers: ${receiverPoints.length}.`;

  return (
    <div className="h-screen bg-[#FFFFFF] flex flex-col overflow-hidden">

      {/* ─── Mobile message ──────────────────────────────────────────────────── */}
      <div className="lg:hidden flex flex-col items-center justify-center h-full px-8 text-center gap-4">
        <div className="w-12 h-12 rounded-full bg-[#FF6B35]/10 flex items-center justify-center">
          <svg className="w-6 h-6 text-[#FF6B35]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-[#1A2A1A]">Desktop required</h2>
        <p className="text-sm text-[#4A6B4A] max-w-xs leading-relaxed">
          Acoustic Form uses a three-panel layout with a 3D viewport. Please open it on a laptop or desktop for the full experience.
        </p>
        <Link href="/#projects" className="mt-2 text-sm text-[#FF6B35] hover:text-[#e55e2b] transition-colors">
          &larr; Back to projects
        </Link>
      </div>

      {/* ─── Three-column layout (desktop only) ─────────────────────────────── */}
      <div className="hidden lg:flex flex-1 min-h-0 max-w-screen-2xl w-full mx-auto p-4 gap-4">

        {/* Left - title + how to use + shape input */}
        <aside className="w-72 flex-shrink-0 overflow-y-auto min-h-0 flex flex-col gap-3 pb-4">

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
            <p className="text-xs text-[#4A6B4A]">Early-stage acoustic simulation for architects</p>
          </div>

          <HowToUsePanel />

          <HowItWorksPanel />

          {/* Structure Generator panel */}
          <div className="bg-white/80 rounded-xl border border-[#D8E6D8] shadow-sm">
            <button
              onClick={() => setStructureOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#FFFFFF]/60 transition-colors focus:outline-none"
            >
              <span className="font-semibold text-xs text-[#1A2A1A]">Generate Preformed Structure</span>
              <span className="text-[#7A9B7A] text-xs">{structureOpen ? '−' : '+'}</span>
            </button>

            {structureOpen && (
              <div className="px-4 pb-4 space-y-3 border-t border-[#D8E6D8] pt-3">
                <div className="flex flex-col gap-2">
                  <textarea
                    value={structureInput}
                    onChange={e => setStructureInput(e.target.value)}
                    placeholder="e.g. ziggurat, Eiffel Tower, castle... or paste a detailed description"
                    rows={4}
                    className="w-full px-2 py-1.5 text-xs border border-[#D8E6D8] rounded-lg focus:outline-none focus:border-[#FF6B35] bg-white text-[#1A2A1A] placeholder:text-[#7A9B7A] resize-y leading-relaxed"
                  />
                  <button
                    onClick={() => generateStructure(structureInput)}
                    disabled={structureGenerating || !structureInput.trim()}
                    className="self-end px-3 py-1.5 text-xs rounded-lg bg-[#FF6B35]/10 text-[#FF6B35] font-medium hover:bg-[#FF6B35]/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none"
                  >
                    {structureGenerating ? "..." : "Generate"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {([
                    { label: "Ziggurat", description: "A stepped Mesopotamian temple interior with a single ceremonial chamber at the top. Thick mud-brick walls approximately 3 meters deep, low ceiling height of 4 meters, a single narrow entrance corridor 12 meters long leading to the main chamber which is 8 meters wide and 10 meters deep. Stone floor, massive flat ceiling, minimal openings." },
                    { label: "Eiffel Tower", description: "The interior observation deck of the Eiffel Tower at the first level. An open rectangular platform 15 meters wide and 60 meters long with a low glass and iron ceiling 3 meters above. Perforated metal grating floor, exposed iron lattice walls on all sides with large open sections. Highly reverberant metal surfaces with significant wind exposure through openings." },
                    { label: "Castle", description: "A medieval great hall interior 25 meters long, 12 meters wide, and 10 meters tall. Thick stone walls 2 meters deep, a hammer-beam timber roof structure, a large stone fireplace on the north wall, three narrow lancet windows on each long wall, and a raised dais at the east end. Stone flagstone floor, exposed timber ceiling." },
                    { label: "Cathedral", description: "A Gothic cathedral nave interior 40 meters long, 18 meters wide, and 28 meters tall at the vault crown. Pointed stone ribbed vaulting overhead, thick stone columns dividing the nave from side aisles, large stained glass clerestory windows, a stone floor, and an apse at the east end. Extremely long reverberation time expected due to hard parallel surfaces and height." },
                    { label: "Pyramid", description: "The King's Chamber inside the Great Pyramid of Giza. A rectangular room 10.5 meters long, 5.2 meters wide, and 5.8 meters tall. Massive granite block walls and ceiling with no openings except a narrow entrance shaft. Completely sealed stone surfaces on all six faces. Expected to produce strong flutter echo between parallel granite walls." },
                    { label: "Pagoda", description: "A traditional Japanese pagoda interior at the ground floor level. A square room 8 meters per side with a central wooden column, exposed timber beam ceiling 4 meters above, wooden plank floor, and shoji screen partitions on three sides with a single wooden door. Predominantly wood surfaces with some plaster walls." },
                    { label: "Colosseum", description: "The hypogeum level beneath the Colosseum arena floor. A network of corridors and chambers 6 meters wide, 4 meters tall, with barrel-vaulted brick ceilings. Stone and brick surfaces throughout, multiple corridor intersections creating complex reflection patterns. The space is partially open to the arena above through wooden trap door openings." },
                    { label: "Lighthouse", description: "The interior of a lighthouse tower stairwell. A circular space 4 meters in diameter rising 30 meters vertically with a cast iron spiral staircase. Smooth painted stone walls curving continuously, metal stair treads, glass lantern room at the top. Strong cylindrical resonance expected." },
                  ] as const).map(({ label, description }) => (
                    <button
                      key={label}
                      onClick={() => setStructureInput(description)}
                      disabled={structureGenerating}
                      className="text-[10px] px-2 py-0.5 rounded-full border border-[#D8E6D8] text-[#4A6B4A] hover:border-[#FF6B35] hover:text-[#FF6B35] transition-colors disabled:opacity-40 focus:outline-none"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {structureGenerating && (
                  <p className="text-[11px] text-[#7A9B7A] italic">Interpreting structure...</p>
                )}
                {structureError && (
                  <p className="text-[11px] text-red-500">{structureError}</p>
                )}
                {structureData && !structureGenerating && (
                  <div className="space-y-1 pt-1 border-t border-[#D8E6D8]">
                    <p className="text-xs font-semibold text-[#1A2A1A]">{structureName}</p>
                    <p className="text-[11px] text-[#4A6B4A]">{structureDescription}</p>
                    <p className="text-[10px] text-[#7A9B7A]">Built from {structureComponentCount} primitives</p>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => generateStructure(structureName)}
                        className="text-[10px] px-2 py-1 rounded bg-[#FF6B35]/10 text-[#FF6B35] font-medium hover:bg-[#FF6B35]/20 transition-colors focus:outline-none"
                      >
                        Regenerate
                      </button>
                      <button
                        onClick={() => { setStructureData(null); setStructureName(""); setStructureDescription(""); setStructureError(""); }}
                        className="text-[10px] px-2 py-1 rounded bg-[#FFFFFF] text-[#4A6B4A] hover:bg-[#EDE8DE] transition-colors focus:outline-none"
                      >
                        Reset to default room
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

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
        <main className="flex-1 min-w-0 min-h-0 rounded-xl overflow-hidden border border-[#D8E6D8] shadow-sm">
          <ThreeCanvas
            roomShape={roomShape}
            sourcePositions={sourcePositions}
            soundRays={soundRays}
            receiverPoints={receiverPoints}
            onSourceDrag={handleSourceDrag}
            onReceiverDrag={handleReceiverDrag}
            surfaceGroups={surfaceGroups}
            vizMode={vizMode}
            structureData={structureData}
          />
        </main>

        {/* Right - materials + sources + receivers + metrics */}
        <aside className="w-72 flex-shrink-0 overflow-y-auto min-h-0 flex flex-col gap-3 pb-4">

          <MaterialPanel
            groups={surfaceGroups}
            onChange={(g) => { setSurfaceGroups(g); setMaterialVersion(v => v + 1); }}
          />

          {/* ─── Sources ──────────────────────────────────────────────────────── */}
          <div className="bg-white/80 rounded-xl border border-[#D8E6D8] shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#D8E6D8]">
              <h3 className="font-semibold text-xs text-[#1A2A1A]">Sound Sources</h3>
              <button
                onClick={addSource}
                disabled={sourcePositions.length >= 3}
                className="text-[10px] px-2 py-0.5 rounded bg-[#FF6B35]/10 text-[#FF6B35] font-medium hover:bg-[#FF6B35]/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                + Add
              </button>
            </div>
            <div className="px-4 py-3 space-y-2">
              {sourcePositions.map((src, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-[#1A2A1A]">
                  <span className="w-3.5 h-3.5 rounded-full bg-[#FF6B35] shrink-0" />
                  <span className="flex-1 font-medium">S{i + 1}</span>
                  <span className="text-[10px] text-[#7A9B7A] tabular-nums">
                    {src.x.toFixed(1)}, {src.y.toFixed(1)}, {src.z.toFixed(1)}
                  </span>
                  {i > 0 && (
                    <button onClick={() => removeSource(i)} className="text-[#7A9B7A] hover:text-red-500 transition-colors leading-none">×</button>
                  )}
                </div>
              ))}
              <p className="text-[10px] text-[#7A9B7A] pt-1">Drag orange spheres in the 3D view. Max 3.</p>
            </div>
          </div>

          {/* ─── Receivers ────────────────────────────────────────────────────── */}
          <div className="bg-white/80 rounded-xl border border-[#D8E6D8] shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#D8E6D8]">
              <h3 className="font-semibold text-xs text-[#1A2A1A]">Receiver Points</h3>
              <button
                onClick={addReceiver}
                disabled={receiverPoints.length >= 5}
                className="text-[10px] px-2 py-0.5 rounded bg-[#1E3A5F]/10 text-[#1E3A5F] font-medium hover:bg-[#1E3A5F]/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                + Add
              </button>
            </div>
            <div className="px-4 py-3 space-y-2">
              {receiverPoints.length === 0 && (
                <p className="text-[10px] text-[#7A9B7A] italic">No receivers added.</p>
              )}
              {receiverPoints.map((rp, i) => (
                <div key={rp.id} className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-[#1A2A1A]">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: ['#34d399','#60a5fa','#f472b6','#a78bfa','#fb923c'][i] }}
                    />
                    <span className="flex-1 font-medium">{rp.label}</span>
                    <span className="text-[10px] text-[#7A9B7A] tabular-nums">
                      {rp.position.x.toFixed(1)}, {rp.position.y.toFixed(1)}, {rp.position.z.toFixed(1)}
                    </span>
                    <button
                      onClick={() => editingReceiverId === rp.id ? setEditingReceiverId(null) : startEditReceiver(rp)}
                      className="text-[#7A9B7A] hover:text-[#FF6B35] transition-colors text-[10px]"
                      title="Edit position"
                    >
                      ✎
                    </button>
                    <button onClick={() => removeReceiver(rp.id)} className="text-[#7A9B7A] hover:text-red-500 transition-colors leading-none">×</button>
                  </div>
                  {editingReceiverId === rp.id && (
                    <div className="pl-5 space-y-1.5">
                      <div className="grid grid-cols-3 gap-1">
                        {(['x', 'y', 'z'] as const).map(axis => (
                          <div key={axis} className="flex flex-col gap-0.5">
                            <label className="text-[9px] uppercase text-[#7A9B7A] font-medium">{axis}</label>
                            <input
                              type="number"
                              step="0.1"
                              value={editPos[axis]}
                              onChange={e => setEditPos(p => ({ ...p, [axis]: parseFloat(e.target.value) || 0 }))}
                              className="w-full px-1.5 py-1 text-[11px] border border-[#D8E6D8] rounded focus:outline-none focus:border-[#FF6B35] bg-white text-[#1A2A1A]"
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
              <p className="text-[10px] text-[#7A9B7A] pt-1">Coloured spheres in 3D view. Max 5.</p>
            </div>
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
