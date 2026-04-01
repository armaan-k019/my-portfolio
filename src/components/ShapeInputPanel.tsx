'use client';

import { useState } from 'react';
import type { RoomShape, Vector3D } from '@/types';
import { getDefaultRoom } from '@/lib/geometry';
import { parseNaturalLanguageResponse } from '@/lib/geometry';
import VertexTable from '@/components/VertexTable';

// ─── Preset rooms ──────────────────────────────────────────────────────────────

const PRESETS: Record<string, () => RoomShape> = {
  rectangle: getDefaultRoom,
  lshaped: () => {
    // L-shaped room: union of two rectangles in the XZ plane, 4m tall
    // Rectangle A: (0–10) × (0–6), Rectangle B: (0–5) × (6–12)
    const vertices: Vector3D[] = [
      // Bottom (y=0)
      { x: 0,  y: 0, z: 0  }, // 0
      { x: 10, y: 0, z: 0  }, // 1
      { x: 10, y: 0, z: 6  }, // 2
      { x: 5,  y: 0, z: 6  }, // 3
      { x: 5,  y: 0, z: 12 }, // 4
      { x: 0,  y: 0, z: 12 }, // 5
      // Top (y=4)
      { x: 0,  y: 4, z: 0  }, // 6
      { x: 10, y: 4, z: 0  }, // 7
      { x: 10, y: 4, z: 6  }, // 8
      { x: 5,  y: 4, z: 6  }, // 9
      { x: 5,  y: 4, z: 12 }, // 10
      { x: 0,  y: 4, z: 12 }, // 11
    ];
    const faces = [
      // Bottom (−Y)
      { a: 0, b: 1, c: 3 }, { a: 1, b: 2, c: 3 },
      { a: 0, b: 3, c: 5 }, { a: 3, b: 4, c: 5 },
      // Top (+Y)
      { a: 6, b: 9, c: 7 }, { a: 7, b: 9, c: 8 },
      { a: 6, b: 11, c: 9 }, { a: 9, b: 11, c: 10 },
      // Front z=0 (−Z)
      { a: 0, b: 6, c: 1 }, { a: 1, b: 6, c: 7 },
      // Right x=10 (+X)
      { a: 1, b: 7, c: 2 }, { a: 2, b: 7, c: 8 },
      // Inner step z=6, x=5..10 (+Z partial)
      { a: 2, b: 8, c: 3 }, { a: 3, b: 8, c: 9 },
      // Inner step x=5, z=6..12 (+X partial)
      { a: 3, b: 9, c: 4 }, { a: 4, b: 9, c: 10 },
      // Back z=12 (+Z)
      { a: 4, b: 10, c: 5 }, { a: 5, b: 10, c: 11 },
      // Left x=0 (−X)
      { a: 5, b: 11, c: 0 }, { a: 0, b: 11, c: 6 },
    ];
    return { vertices, faces };
  },
  trapezoidal: () => {
    // Trapezoidal room: front wall 6m wide, back wall 12m wide, 8m deep, 4m tall
    const vertices: Vector3D[] = [
      // Bottom (y=0)
      { x: 2,  y: 0, z: 0  }, // 0 front-left
      { x: 8,  y: 0, z: 0  }, // 1 front-right
      { x: 12, y: 0, z: 8  }, // 2 back-right
      { x: 0,  y: 0, z: 8  }, // 3 back-left
      // Top (y=4)
      { x: 2,  y: 4, z: 0  }, // 4
      { x: 8,  y: 4, z: 0  }, // 5
      { x: 12, y: 4, z: 8  }, // 6
      { x: 0,  y: 4, z: 8  }, // 7
    ];
    const faces = [
      // Bottom (−Y)
      { a: 0, b: 1, c: 3 }, { a: 1, b: 2, c: 3 },
      // Top (+Y)
      { a: 4, b: 7, c: 5 }, { a: 5, b: 7, c: 6 },
      // Front (−Z)
      { a: 0, b: 4, c: 1 }, { a: 1, b: 4, c: 5 },
      // Back (+Z)
      { a: 3, b: 2, c: 7 }, { a: 2, b: 6, c: 7 },
      // Left
      { a: 0, b: 3, c: 4 }, { a: 3, b: 7, c: 4 },
      // Right
      { a: 1, b: 5, c: 2 }, { a: 2, b: 5, c: 6 },
    ];
    return { vertices, faces };
  },
};

// ─── Component ─────────────────────────────────────────────────────────────────

interface ShapeInputPanelProps {
  roomShape: RoomShape;
  sourcePosition: Vector3D;
  onRoomChange: (shape: RoomShape) => void;
  onSourceChange: (pos: Vector3D) => void;
}

export default function ShapeInputPanel({
  roomShape,
  sourcePosition,
  onRoomChange,
  onSourceChange,
}: ShapeInputPanelProps) {
  const [tab, setTab] = useState<'describe' | 'manual'>('describe');
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
      const data = await res.json() as { vertices?: unknown; faces?: unknown; error?: string };
      if (!res.ok || data.error) {
        setDescError(data.error ?? 'Failed to parse room description.');
        return;
      }
      const parsed = parseNaturalLanguageResponse(data);
      if (!parsed) {
        setDescError('Claude returned an invalid room geometry. Try a different description.');
        return;
      }
      onRoomChange(parsed);
      setLocalVertices(parsed.vertices);
    } catch (err) {
      console.error('parse-shape fetch error:', err);
      setDescError('Network error. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  function handleApplyVertices() {
    // Rebuild faces using a simple ear-clipping approximation isn't viable here —
    // instead, keep the existing faces and just update vertex positions.
    // If the user adds/removes vertices, they'd need to use "Describe Room" or a preset.
    const newShape: RoomShape = {
      vertices: localVertices,
      faces: roomShape.faces.filter(
        (f) =>
          f.a < localVertices.length &&
          f.b < localVertices.length &&
          f.c < localVertices.length,
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

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto">
      {/* Tab switcher */}
      <div className="bg-white/80 rounded-xl border border-[#E8E0D4] shadow-sm overflow-hidden">
        <div className="flex border-b border-[#E8E0D4]">
          {(['describe', 'manual'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                tab === t
                  ? 'bg-white text-[#FF6B35] border-b-2 border-[#FF6B35]'
                  : 'text-[#6B6054] hover:text-[#2C1810]'
              }`}
            >
              {t === 'describe' ? 'Describe Room' : 'Manual Vertices'}
            </button>
          ))}
        </div>

        <div className="p-4">
          {tab === 'describe' ? (
            <div className="space-y-3">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. A concert hall 30m long, 20m wide, 15m tall with a curved ceiling"
                rows={4}
                className="w-full px-3 py-2 text-xs border border-[#E8E0D4] rounded-lg resize-none focus:outline-none focus:border-[#FF6B35] bg-white text-[#2C1810] placeholder-[#C8BFA8]"
              />
              {descError && (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{descError}</p>
              )}
              <button
                onClick={handleGenerate}
                disabled={generating || !description.trim()}
                className="w-full py-2 px-4 rounded-lg bg-[#FF6B35] text-white text-xs font-medium hover:bg-[#e55e2b] disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {generating ? (
                  <>
                    <span className="inline-block h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Generating…
                  </>
                ) : (
                  'Generate Shape'
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Preset dropdown */}
              <div className="flex gap-2">
                <select
                  defaultValue=""
                  onChange={(e) => handlePreset(e.target.value)}
                  className="flex-1 px-2 py-1.5 text-xs border border-[#E8E0D4] rounded-lg bg-white text-[#2C1810] focus:outline-none focus:border-[#FF6B35]"
                >
                  <option value="" disabled>
                    Load preset…
                  </option>
                  <option value="rectangle">Rectangle (10×8×4)</option>
                  <option value="lshaped">L-Shaped Room</option>
                  <option value="trapezoidal">Trapezoidal Room</option>
                </select>
              </div>

              <VertexTable vertices={localVertices} onChange={setLocalVertices} />

              <div className="flex gap-2">
                <button
                  onClick={handleApplyVertices}
                  className="flex-1 py-1.5 rounded-lg bg-[#FF6B35] text-white text-xs font-medium hover:bg-[#e55e2b] transition-colors"
                >
                  Apply
                </button>
                <button
                  onClick={() => {
                    const shape = getDefaultRoom();
                    onRoomChange(shape);
                    setLocalVertices(shape.vertices);
                  }}
                  className="flex-1 py-1.5 rounded-lg border border-[#E8E0D4] text-xs text-[#6B6054] hover:border-[#FF6B35] hover:text-[#FF6B35] transition-colors"
                >
                  Reset Default
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reset button always visible */}
      {tab === 'describe' && (
        <button
          onClick={() => {
            const shape = getDefaultRoom();
            onRoomChange(shape);
            setLocalVertices(shape.vertices);
          }}
          className="w-full py-1.5 rounded-lg border border-[#E8E0D4] text-xs text-[#6B6054] hover:border-[#FF6B35] hover:text-[#FF6B35] transition-colors bg-white/80"
        >
          Reset to Default Room
        </button>
      )}

      {/* Sound source position */}
      <div className="bg-white/80 rounded-xl border border-[#E8E0D4] shadow-sm p-4 space-y-3">
        <h3 className="font-semibold text-xs text-[#2C1810]">Sound Source Position</h3>
        <div className="grid grid-cols-3 gap-2">
          {(['x', 'y', 'z'] as const).map((axis) => (
            <div key={axis} className="flex flex-col gap-1">
              <label className="text-xs text-[#6B6054] font-medium uppercase">{axis}</label>
              <input
                type="number"
                step="0.1"
                value={sourcePosition[axis]}
                onChange={(e) => handleSourceAxis(axis, e.target.value)}
                className="w-full px-2 py-1.5 border border-[#E8E0D4] rounded-lg text-xs focus:outline-none focus:border-[#FF6B35] bg-white text-[#2C1810]"
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-[#6B6054]">Position in meters from origin</p>
      </div>
    </div>
  );
}
