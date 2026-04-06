'use client';

import type { Vector3D } from '@/types';

interface VertexTableProps {
  vertices: Vector3D[];
  onChange: (vertices: Vector3D[]) => void;
}

export default function VertexTable({ vertices, onChange }: VertexTableProps) {
  function handleChange(index: number, axis: keyof Vector3D, raw: string) {
    const value = parseFloat(raw);
    if (isNaN(value)) return;
    const next = vertices.map((v, i) =>
      i === index ? { ...v, [axis]: value } : v,
    );
    onChange(next);
  }

  function handleDelete(index: number) {
    onChange(vertices.filter((_, i) => i !== index));
  }

  function handleAdd() {
    onChange([...vertices, { x: 0, y: 0, z: 0 }]);
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-[#D8E6D8]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#FFFFFF] border-b border-[#D8E6D8]">
              <th className="px-2 py-1.5 text-left text-[#4A6B4A] font-medium w-8">#</th>
              <th className="px-2 py-1.5 text-left text-[#4A6B4A] font-medium">X</th>
              <th className="px-2 py-1.5 text-left text-[#4A6B4A] font-medium">Y</th>
              <th className="px-2 py-1.5 text-left text-[#4A6B4A] font-medium">Z</th>
              <th className="px-2 py-1.5 w-8" />
            </tr>
          </thead>
          <tbody>
            {vertices.map((v, i) => (
              <tr key={i} className="border-b border-[#D8E6D8] last:border-0 hover:bg-[#FAF7F2]">
                <td className="px-2 py-1 text-[#4A6B4A] text-xs">{i}</td>
                {(['x', 'y', 'z'] as const).map((axis) => (
                  <td key={axis} className="px-1 py-1">
                    <input
                      type="number"
                      step="0.1"
                      value={v[axis]}
                      onChange={(e) => handleChange(i, axis, e.target.value)}
                      className="w-16 px-1.5 py-0.5 border border-[#D8E6D8] rounded text-xs focus:outline-none focus:border-[#2D5A27] bg-white"
                    />
                  </td>
                ))}
                <td className="px-1 py-1">
                  <button
                    onClick={() => handleDelete(i)}
                    className="text-[#4A6B4A] hover:text-red-500 text-xs px-1 py-0.5 rounded hover:bg-red-50 transition-colors"
                    title="Delete vertex"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {vertices.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-[#4A6B4A] text-xs">
                  No vertices. Add some below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <button
        onClick={handleAdd}
        className="w-full py-1.5 border border-dashed border-[#A8C0A8] rounded-lg text-xs text-[#4A6B4A] hover:border-[#2D5A27] hover:text-[#2D5A27] transition-colors"
      >
        + Add Vertex
      </button>
    </div>
  );
}
