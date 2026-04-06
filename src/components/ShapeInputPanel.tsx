'use client';

import { useState, useRef } from 'react';
import * as THREE from 'three';
import type { RoomShape, Vector3D } from '@/types';
import { getDefaultRoom } from '@/lib/geometry';
import { buildRoom } from '@/lib/MeshFactory';
import type { ShapeParams } from '@/types';
import VertexTable from '@/components/VertexTable';

// ─── Preset rooms ──────────────────────────────────────────────────────────────

const PRESETS: Record<string, () => RoomShape> = {
  rectangle: getDefaultRoom,
  lshaped: () => {
    const vertices: Vector3D[] = [
      { x: 0,  y: 0, z: 0  }, { x: 10, y: 0, z: 0  }, { x: 10, y: 0, z: 6  },
      { x: 5,  y: 0, z: 6  }, { x: 5,  y: 0, z: 12 }, { x: 0,  y: 0, z: 12 },
      { x: 0,  y: 4, z: 0  }, { x: 10, y: 4, z: 0  }, { x: 10, y: 4, z: 6  },
      { x: 5,  y: 4, z: 6  }, { x: 5,  y: 4, z: 12 }, { x: 0,  y: 4, z: 12 },
    ];
    const faces = [
      { a: 0, b: 1, c: 3 }, { a: 1, b: 2, c: 3 },
      { a: 0, b: 3, c: 5 }, { a: 3, b: 4, c: 5 },
      { a: 6, b: 9, c: 7 }, { a: 7, b: 9, c: 8 },
      { a: 6, b: 11, c: 9 }, { a: 9, b: 11, c: 10 },
      { a: 0, b: 6, c: 1 }, { a: 1, b: 6, c: 7 },
      { a: 1, b: 7, c: 2 }, { a: 2, b: 7, c: 8 },
      { a: 2, b: 8, c: 3 }, { a: 3, b: 8, c: 9 },
      { a: 3, b: 9, c: 4 }, { a: 4, b: 9, c: 10 },
      { a: 4, b: 10, c: 5 }, { a: 5, b: 10, c: 11 },
      { a: 5, b: 11, c: 0 }, { a: 0, b: 11, c: 6 },
    ];
    return { vertices, faces };
  },
  trapezoidal: () => {
    const vertices: Vector3D[] = [
      { x: 2,  y: 0, z: 0 }, { x: 8,  y: 0, z: 0 },
      { x: 12, y: 0, z: 8 }, { x: 0,  y: 0, z: 8 },
      { x: 2,  y: 4, z: 0 }, { x: 8,  y: 4, z: 0 },
      { x: 12, y: 4, z: 8 }, { x: 0,  y: 4, z: 8 },
    ];
    const faces = [
      { a: 0, b: 1, c: 3 }, { a: 1, b: 2, c: 3 },
      { a: 4, b: 7, c: 5 }, { a: 5, b: 7, c: 6 },
      { a: 0, b: 4, c: 1 }, { a: 1, b: 4, c: 5 },
      { a: 3, b: 2, c: 7 }, { a: 2, b: 6, c: 7 },
      { a: 0, b: 3, c: 4 }, { a: 3, b: 7, c: 4 },
      { a: 1, b: 5, c: 2 }, { a: 2, b: 5, c: 6 },
    ];
    return { vertices, faces };
  },
};

// ─── 3D file parsers ───────────────────────────────────────────────────────────

function bufGeomToRoomShape(geo: THREE.BufferGeometry): RoomShape {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  if (!pos) throw new Error('No position attribute in geometry');

  const vertices: Vector3D[] = [];
  const faces = [];

  if (geo.index) {
    // Indexed geometry - deduplicate vertices
    const map = new Map<string, number>();
    const getOrAdd = (i: number): number => {
      const key = `${pos.getX(i).toFixed(6)},${pos.getY(i).toFixed(6)},${pos.getZ(i).toFixed(6)}`;
      if (map.has(key)) return map.get(key)!;
      const idx = vertices.length;
      vertices.push({ x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) });
      map.set(key, idx);
      return idx;
    };
    for (let i = 0; i < geo.index.count; i += 3) {
      const a = getOrAdd(geo.index.getX(i));
      const b = getOrAdd(geo.index.getX(i + 1));
      const c = getOrAdd(geo.index.getX(i + 2));
      if (a !== b && b !== c && a !== c) faces.push({ a, b, c });
    }
  } else {
    // Non-indexed - each triple of positions is a face
    for (let i = 0; i < pos.count; i++) {
      vertices.push({ x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) });
    }
    for (let i = 0; i < vertices.length; i += 3) {
      if (i + 2 < vertices.length) faces.push({ a: i, b: i + 1, c: i + 2 });
    }
  }

  if (vertices.length < 4 || faces.length < 2)
    throw new Error('Geometry has too few vertices/faces to be a room.');
  return { vertices, faces };
}

async function parseOBJ(file: File): Promise<RoomShape> {
  const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
  const text = await file.text();
  const loader = new OBJLoader();
  const group = loader.parse(text);
  const allVertices: Vector3D[] = [];
  const allFaces: { a: number; b: number; c: number }[] = [];

  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const geo = child.geometry as THREE.BufferGeometry;
    const offset = allVertices.length;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    if (!pos) return;
    if (geo.index) {
      for (let i = 0; i < pos.count; i++) allVertices.push({ x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) });
      for (let i = 0; i < geo.index.count; i += 3) {
        allFaces.push({ a: offset + geo.index.getX(i), b: offset + geo.index.getX(i + 1), c: offset + geo.index.getX(i + 2) });
      }
    } else {
      for (let i = 0; i < pos.count; i++) allVertices.push({ x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) });
      for (let i = 0; i < pos.count; i += 3) allFaces.push({ a: offset + i, b: offset + i + 1, c: offset + i + 2 });
    }
  });

  if (allVertices.length < 4 || allFaces.length < 2) throw new Error('OBJ file contains no usable mesh geometry.');
  return { vertices: allVertices, faces: allFaces };
}

async function parseSTL(file: File): Promise<RoomShape> {
  const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
  const buf = await file.arrayBuffer();
  const loader = new STLLoader();
  const geo = loader.parse(buf);
  return bufGeomToRoomShape(geo);
}

async function parseDXF(file: File): Promise<RoomShape> {
  const text = await file.text();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DxfParser = require('dxf-parser');
  const parser = new DxfParser();
  const dxf = parser.parseSync(text) as {
    entities: Array<{
      type: string;
      vertices?: Array<{ x: number; y: number; z?: number }>;
    }>;
  };

  const vertices: Vector3D[] = [];
  const faces: { a: number; b: number; c: number }[] = [];

  for (const entity of dxf.entities ?? []) {
    if (entity.type === '3DFACE' && entity.vertices) {
      const base = vertices.length;
      for (const v of entity.vertices.slice(0, 4)) {
        vertices.push({ x: v.x, y: v.y, z: v.z ?? 0 });
      }
      faces.push({ a: base, b: base + 1, c: base + 2 });
      if (entity.vertices.length >= 4) faces.push({ a: base, b: base + 2, c: base + 3 });
    }
  }

  if (vertices.length < 4) throw new Error('DXF contains no 3DFACE entities. Only 3DFACE geometry is supported.');
  return { vertices, faces };
}

async function parse3DM(file: File): Promise<RoomShape> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/parse-3dm', { method: 'POST', body: formData });
  const data = await res.json() as { vertices?: Vector3D[]; faces?: { a: number; b: number; c: number }[]; error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? 'Failed to parse .3dm file');
  if (!data.vertices || !data.faces) throw new Error('Invalid response from parse-3dm');
  return { vertices: data.vertices, faces: data.faces };
}

async function parseIFC(file: File): Promise<RoomShape> {
  const WebIFC = await import('web-ifc');
  const api = new WebIFC.IfcAPI();
  await api.Init();
  const buf = await file.arrayBuffer();
  const modelID = api.OpenModel(new Uint8Array(buf));

  const vertices: Vector3D[] = [];
  const faces: { a: number; b: number; c: number }[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  api.StreamAllMeshes(modelID, (flatMesh: any) => {
    const geoms = flatMesh.geometries;
    for (let gi = 0; gi < geoms.size(); gi++) {
      const geom = geoms.get(gi);
      const meshData = api.GetGeometry(modelID, geom.geometryExpressID);
      const vBuf = api.GetVertexArray(meshData.GetVertexData(), meshData.GetVertexDataSize());
      const iBuf = api.GetIndexArray(meshData.GetIndexData(), meshData.GetIndexDataSize());
      const base = vertices.length;
      // Vertex stride is 6 floats: x,y,z,nx,ny,nz
      for (let i = 0; i < vBuf.length; i += 6) {
        vertices.push({ x: vBuf[i], y: vBuf[i + 1], z: vBuf[i + 2] });
      }
      for (let i = 0; i < iBuf.length; i += 3) {
        faces.push({ a: base + iBuf[i], b: base + iBuf[i + 1], c: base + iBuf[i + 2] });
      }
      meshData.delete();
    }
  });

  api.CloseModel(modelID);
  if (vertices.length < 4) throw new Error('IFC file contains no geometry.');
  return { vertices, faces };
}

// ─── Transform helpers ─────────────────────────────────────────────────────────

function applyTransform(
  shape: RoomShape,
  scale: number,
  rotX: number,
  rotY: number,
  rotZ: number,
): RoomShape {
  // Compute centroid
  const n = shape.vertices.length;
  const cx = shape.vertices.reduce((s, v) => s + v.x, 0) / n;
  const cy = shape.vertices.reduce((s, v) => s + v.y, 0) / n;
  const cz = shape.vertices.reduce((s, v) => s + v.z, 0) / n;

  const rx = (rotX * Math.PI) / 180;
  const ry = (rotY * Math.PI) / 180;
  const rz = (rotZ * Math.PI) / 180;
  const [cosX, sinX] = [Math.cos(rx), Math.sin(rx)];
  const [cosY, sinY] = [Math.cos(ry), Math.sin(ry)];
  const [cosZ, sinZ] = [Math.cos(rz), Math.sin(rz)];

  const vertices: Vector3D[] = shape.vertices.map(({ x, y, z }) => {
    // Translate to centroid
    let px = x - cx, py = y - cy, pz = z - cz;
    // Rotate Z
    let tx = px * cosZ - py * sinZ; let ty = px * sinZ + py * cosZ;
    px = tx; py = ty;
    // Rotate X
    let ty2 = py * cosX - pz * sinX; let tz2 = py * sinX + pz * cosX;
    py = ty2; pz = tz2;
    // Rotate Y
    let tx3 = px * cosY + pz * sinY; let tz3 = -px * sinY + pz * cosY;
    px = tx3; pz = tz3;
    // Scale and translate back
    return { x: px * scale + cx, y: py * scale + cy, z: pz * scale + cz };
  });

  return { vertices, faces: shape.faces };
}

// ─── Import tab ────────────────────────────────────────────────────────────────

type ImportStatus = 'idle' | 'parsing' | 'ready' | 'error';

function FileImportTab({ onRoomChange }: { onRoomChange: (s: RoomShape) => void }) {
  const [status, setStatus]     = useState<ImportStatus>('idle');
  const [msg, setMsg]           = useState('');
  const [rawShape, setRawShape] = useState<RoomShape | null>(null);
  const [scale, setScale]       = useState(1.0);
  const [rotX, setRotX]         = useState(0);
  const [rotY, setRotY]         = useState(0);
  const [rotZ, setRotZ]         = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    // Crash guard: reject oversized files before parsing
    const MAX_BYTES = 50 * 1024 * 1024; // 50 MB
    if (file.size > MAX_BYTES) {
      setStatus('error');
      setMsg(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 50 MB.`);
      return;
    }
    setStatus('parsing');
    setMsg(`Parsing ${file.name}…`);
    try {
      let shape: RoomShape;
      if (ext === 'obj') shape = await parseOBJ(file);
      else if (ext === 'stl') shape = await parseSTL(file);
      else if (ext === 'dxf') shape = await parseDXF(file);
      else if (ext === '3dm') shape = await parse3DM(file);
      else if (ext === 'ifc') shape = await parseIFC(file);
      else throw new Error(`Unsupported format: .${ext}`);
      // Crash guard: reject meshes with too many polygons
      const MAX_FACES = 100_000;
      if (shape.faces.length > MAX_FACES) {
        setStatus('error');
        setMsg(`Model has ${shape.faces.length.toLocaleString()} polygons - maximum is ${MAX_FACES.toLocaleString()}. Please simplify the mesh before importing.`);
        return;
      }
      setRawShape(shape);
      setScale(1.0);
      setRotX(0); setRotY(0); setRotZ(0);
      setStatus('ready');
      setMsg(`${file.name}: ${shape.faces.length} polygons, ${shape.vertices.length} vertices`);
    } catch (err) {
      setStatus('error');
      setMsg(err instanceof Error ? err.message : 'Failed to parse file.');
    }
  }

  function handleApply() {
    if (!rawShape) return;
    onRoomChange(applyTransform(rawShape, scale, rotX, rotY, rotZ));
  }

  return (
    <div className="space-y-3">
      <div
        className="border-2 border-dashed border-[#D8E6D8] rounded-xl p-6 text-center cursor-pointer hover:border-[#2D5A27]/60 transition-colors"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".obj,.stl,.dxf,.ifc,.3dm"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <p className="text-xs font-medium text-[#1A2A1A]">Drop or click to import</p>
        <p className="text-xs text-[#4A6B4A] mt-1">.obj .stl .dxf .ifc .3dm</p>
      </div>

      {status === 'parsing' && (
        <div className="flex items-center gap-2 text-xs text-[#4A6B4A]">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-[#2D5A27] border-t-transparent animate-spin" />
          {msg}
        </div>
      )}
      {status === 'error' && (
        <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{msg}</p>
      )}

      {status === 'ready' && rawShape && (
        <div className="space-y-3 border border-[#D8E6D8] rounded-xl p-3 bg-white/60">
          <p className="text-xs text-green-700">{msg}</p>

          {/* Scale */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-[11px] font-medium text-[#1A2A1A]">Scale</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={scale}
                onChange={e => setScale(Math.max(0.01, parseFloat(e.target.value) || 1))}
                className="w-16 text-[11px] text-right px-1.5 py-0.5 border border-[#D8E6D8] rounded bg-white text-[#1A2A1A] focus:outline-none focus:border-[#2D5A27]"
              />
            </div>
            <input
              type="range" min="0.01" max="10" step="0.01"
              value={scale}
              onChange={e => setScale(parseFloat(e.target.value))}
              className="w-full h-1.5 accent-[#2D5A27] cursor-pointer"
            />
          </div>

          {/* Rotation */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-[#1A2A1A]">Rotation (degrees)</p>
            {([['X', rotX, setRotX], ['Y', rotY, setRotY], ['Z', rotZ, setRotZ]] as [string, number, (v: number) => void][]).map(([axis, val, setter]) => (
              <div key={axis} className="flex items-center gap-2">
                <span className="text-[11px] text-[#4A6B4A] w-3">{axis}</span>
                <input
                  type="range" min="-180" max="180" step="1"
                  value={val}
                  onChange={e => setter(parseInt(e.target.value))}
                  className="flex-1 h-1.5 accent-[#2D5A27] cursor-pointer"
                />
                <input
                  type="number" min="-180" max="180" step="1"
                  value={val}
                  onChange={e => setter(parseInt(e.target.value) || 0)}
                  className="w-14 text-[11px] text-right px-1.5 py-0.5 border border-[#D8E6D8] rounded bg-white text-[#1A2A1A] focus:outline-none focus:border-[#2D5A27]"
                />
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleApply}
              className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-[#2D5A27] text-white hover:bg-[#e55e2b] transition-colors"
            >
              Apply to scene
            </button>
            <button
              onClick={() => { setRotX(0); setRotY(0); setRotZ(0); setScale(1); }}
              className="px-3 py-1.5 text-xs rounded-lg border border-[#D8E6D8] text-[#4A6B4A] hover:border-[#2D5A27] hover:text-[#2D5A27] transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      <div className="text-xs text-[#4A6B4A] leading-relaxed">
        <p className="font-medium text-[#1A2A1A] mb-1">Supported formats</p>
        <ul className="space-y-0.5">
          <li><span className="font-mono">.obj/.stl</span>: Standard mesh (Three.js)</li>
          <li><span className="font-mono">.dxf</span>: Drawing Exchange Format (3DFACE entities)</li>
          <li><span className="font-mono">.3dm</span>: Rhino 3D (mesh objects)</li>
          <li><span className="font-mono">.ifc</span>: Industry Foundation Classes</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────

interface ShapeInputPanelProps {
  roomShape: RoomShape;
  sourcePosition: Vector3D;
  onRoomChange: (shape: RoomShape) => void;
  onSourceChange: (pos: Vector3D) => void;
  maxBounces: number;
  onMaxBouncesChange: (n: number) => void;
  vizMode: 'particles' | 'static';
  onVizModeChange: (mode: 'particles' | 'static') => void;
}

export default function ShapeInputPanel({
  roomShape,
  sourcePosition,
  onRoomChange,
  onSourceChange,
  maxBounces,
  onMaxBouncesChange,
  vizMode,
  onVizModeChange,
}: ShapeInputPanelProps) {
  const [tab, setTab] = useState<'describe' | 'manual' | 'import'>('describe');
  const [description, setDescription] = useState('');
  const [generating, setGenerating] = useState(false);
  const [descError, setDescError] = useState<string | null>(null);
  const [localVertices, setLocalVertices] = useState<Vector3D[]>(roomShape.vertices);

  async function handleGenerate() {
    if (!description.trim()) return;
    setGenerating(true);
    setDescError(null);
    try {
      const res = await fetch('/api/parse-shape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });
      const data = await res.json() as Partial<ShapeParams> & { error?: string };
      if (!res.ok || data.error) {
        setDescError(data.error ?? 'Failed to parse room description.');
        return;
      }
      if (!data.archetype || !data.dimensions) {
        setDescError('Unexpected response from server. Try a different description.');
        return;
      }
      const roomShape = buildRoom(data as ShapeParams);
      onRoomChange(roomShape);
      setLocalVertices(roomShape.vertices);
    } catch (err) {
      console.error('parse-shape fetch error:', err);
      setDescError('Network error. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  function handleApplyVertices() {
    const newShape: RoomShape = {
      vertices: localVertices,
      faces: roomShape.faces.filter(
        (f) => f.a < localVertices.length && f.b < localVertices.length && f.c < localVertices.length,
      ),
    };
    onRoomChange(newShape);
  }

  function handlePreset(key: string) {
    const fn = PRESETS[key];
    if (!fn) return;
    const shape = fn();
    onRoomChange(shape);
    setLocalVertices(shape.vertices);
  }

  function handleSourceAxis(axis: keyof Vector3D, raw: string) {
    const value = parseFloat(raw);
    if (isNaN(value)) return;
    onSourceChange({ ...sourcePosition, [axis]: Math.max(-50, Math.min(50, value)) });
  }

  const TAB_LABELS = { describe: 'Describe', manual: 'Manual', import: 'Import 3D' };

  return (
    <div className="flex flex-col gap-4">
      {/* Tab switcher */}
      <div className="bg-white/80 rounded-xl border border-[#D8E6D8] shadow-sm overflow-hidden">
        <div className="flex border-b border-[#D8E6D8]">
          {(['describe', 'manual', 'import'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-xs font-medium transition-colors focus:outline-none ${
                tab === t
                  ? 'bg-white text-[#2D5A27] border-b-2 border-[#2D5A27]'
                  : 'text-[#4A6B4A] hover:text-[#1A2A1A]'
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="p-4">
          {tab === 'describe' && (
            <div className="space-y-3">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. A concert hall 30m long, 20m wide, 15m tall with a curved ceiling"
                rows={5}
                className="w-full px-3 py-2 text-xs border border-[#D8E6D8] rounded-lg resize-none focus:outline-none focus:border-[#2D5A27] bg-white text-[#1A2A1A] placeholder-[#A8C0A8]"
                style={{ minHeight: 100 }}
              />
              {descError && (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{descError}</p>
              )}
              <button
                onClick={handleGenerate}
                disabled={generating || !description.trim()}
                className="w-full py-2 px-4 rounded-lg bg-[#2D5A27] text-white text-xs font-medium hover:bg-[#e55e2b] disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {generating ? (
                  <>
                    <span className="inline-block h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Generating…
                  </>
                ) : 'Generate Shape'}
              </button>
            </div>
          )}

          {tab === 'manual' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <select
                  defaultValue=""
                  onChange={(e) => handlePreset(e.target.value)}
                  className="flex-1 px-2 py-1.5 text-xs border border-[#D8E6D8] rounded-lg bg-white text-[#1A2A1A] focus:outline-none focus:border-[#2D5A27]"
                >
                  <option value="" disabled>Load preset…</option>
                  <option value="rectangle">Rectangle (10×8×4)</option>
                  <option value="lshaped">L-Shaped Room</option>
                  <option value="trapezoidal">Trapezoidal Room</option>
                </select>
              </div>
              <VertexTable vertices={localVertices} onChange={setLocalVertices} />
              <div className="flex gap-2">
                <button
                  onClick={handleApplyVertices}
                  className="flex-1 py-1.5 rounded-lg bg-[#2D5A27] text-white text-xs font-medium hover:bg-[#e55e2b] transition-colors"
                >
                  Apply
                </button>
                <button
                  onClick={() => {
                    const shape = getDefaultRoom();
                    onRoomChange(shape);
                    setLocalVertices(shape.vertices);
                  }}
                  className="flex-1 py-1.5 rounded-lg border border-[#D8E6D8] text-xs text-[#4A6B4A] hover:border-[#2D5A27] hover:text-[#2D5A27] transition-colors focus:outline-none"
                >
                  Reset
                </button>
              </div>
            </div>
          )}

          {tab === 'import' && (
            <FileImportTab onRoomChange={(shape) => { onRoomChange(shape); setLocalVertices(shape.vertices); }} />
          )}
        </div>
      </div>

      {tab === 'describe' && (
        <button
          onClick={() => {
            const shape = getDefaultRoom();
            onRoomChange(shape);
            setLocalVertices(shape.vertices);
          }}
          className="w-full py-1.5 rounded-lg border border-[#D8E6D8] text-xs text-[#4A6B4A] hover:border-[#2D5A27] hover:text-[#2D5A27] transition-colors bg-white/80 focus:outline-none"
        >
          Reset to Default Room
        </button>
      )}

      {/* Sound source position */}
      <div className="bg-white/80 rounded-xl border border-[#D8E6D8] shadow-sm p-4 space-y-3">
        <h3 className="font-semibold text-xs text-[#1A2A1A]">Sound Source Position</h3>
        <div className="grid grid-cols-3 gap-2">
          {(['x', 'y', 'z'] as const).map((axis) => (
            <div key={axis} className="flex flex-col gap-1">
              <label className="text-xs text-[#4A6B4A] font-medium uppercase">{axis}</label>
              <input
                type="number"
                step="0.1"
                value={sourcePosition[axis]}
                onChange={(e) => handleSourceAxis(axis, e.target.value)}
                className="w-full px-2 py-1.5 border border-[#D8E6D8] rounded-lg text-xs focus:outline-none focus:border-[#2D5A27] bg-white text-[#1A2A1A]"
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-[#4A6B4A]">Position in meters from origin</p>
      </div>

      {/* Ray settings */}
      <div className="bg-white/80 rounded-xl border border-[#D8E6D8] shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-xs text-[#1A2A1A]">Ray Bounces</h3>
          <span className="text-xs font-medium text-[#2D5A27]">{maxBounces}</span>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          value={maxBounces}
          onChange={(e) => onMaxBouncesChange(Number(e.target.value))}
          className="w-full accent-[#2D5A27]"
        />
        <p className="text-xs text-[#4A6B4A]">Number of reflections to simulate (1–10)</p>

        <div className="flex items-center justify-between pt-1 border-t border-[#D8E6D8]">
          <span className="text-xs text-[#1A2A1A] font-medium">Ray visualization</span>
          <div className="flex rounded-lg border border-[#D8E6D8] overflow-hidden text-[11px]">
            {(['static', 'particles'] as const).map((m) => (
              <button
                key={m}
                onClick={() => onVizModeChange(m)}
                className={`px-2.5 py-1 font-medium transition-colors ${
                  vizMode === m
                    ? 'bg-[#2D5A27] text-white'
                    : 'bg-white text-[#4A6B4A] hover:text-[#1A2A1A]'
                }`}
              >
                {m === 'static' ? '- static' : '◉ particles'}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
