'use client';

import { useState, useEffect } from 'react';
import type { SurfaceGroup, MaterialType } from '@/types';
import { MATERIAL_DATA } from '@/lib/acoustics';

interface MaterialPanelProps {
  groups: SurfaceGroup[];
  onChange: (groups: SurfaceGroup[]) => void;
}

const MATERIAL_OPTIONS: MaterialType[] = [
  'concrete', 'brick', 'wood', 'carpet', 'glass', 'acoustic', 'gypsum', 'upholstered',
  'acoustic_foam', 'heavy_drape', 'carpet_concrete', 'glass_plate',
];

const MATERIAL_DOT_COLORS: Record<MaterialType, string> = {
  concrete:        '#6b7280',
  brick:           '#c1513a',
  wood:            '#b5874c',
  carpet:          '#2d5a3d',
  glass:           '#7ec8e3',
  acoustic:        '#3b5ba5',
  gypsum:          '#e8e4d9',
  upholstered:     '#5b3a6b',
  acoustic_foam:   '#f97316',
  heavy_drape:     '#7c3aed',
  carpet_concrete: '#166534',
  glass_plate:     '#bae6fd',
};

export default function MaterialPanel({ groups, onChange }: MaterialPanelProps) {
  const [flashIndex, setFlashIndex] = useState<number | null>(null);

  function setMaterial(index: number, material: MaterialType) {
    const next = groups.map((g, i) => (i === index ? { ...g, material } : g));
    onChange(next);
    setFlashIndex(index);
  }

  useEffect(() => {
    if (flashIndex === null) return;
    const t = setTimeout(() => setFlashIndex(null), 600);
    return () => clearTimeout(t);
  }, [flashIndex]);

  return (
    <div className="bg-white/80 rounded-xl border border-[#E8E0D4] shadow-sm p-4 space-y-3">
      <h3 className="font-semibold text-xs text-[#2C1810]">Surface Materials</h3>
      <p className="text-xs text-[#6B6054]">
        Assign absorption materials to each surface group for accurate RT60 calculations.
      </p>
      <div className="space-y-2">
        {groups.map((group, i) => (
          <div
            key={group.label}
            className="flex items-center gap-2 rounded-lg px-1.5 py-0.5 transition-colors duration-500"
            style={{ backgroundColor: flashIndex === i ? 'rgba(255, 107, 53, 0.08)' : 'transparent' }}
          >
            <span
              className="w-3 h-3 rounded-sm shrink-0 border border-black/10"
              style={{ backgroundColor: MATERIAL_DOT_COLORS[group.material] }}
              title={group.material}
            />
            <span className="text-xs text-[#2C1810] w-14 shrink-0 font-medium">{group.label}</span>
            <select
              value={group.material}
              onChange={(e) => setMaterial(i, e.target.value as MaterialType)}
              className="flex-1 px-2 py-1.5 text-xs border border-[#E8E0D4] rounded-lg bg-white text-[#2C1810] focus:outline-none focus:border-[#FF6B35]"
            >
              {MATERIAL_OPTIONS.map((m) => (
                <option key={m} value={m}>{MATERIAL_DATA[m].name}</option>
              ))}
            </select>
            <span
              className="text-xs w-10 text-right shrink-0 tabular-nums transition-colors duration-300"
              style={{ color: flashIndex === i ? '#FF6B35' : '#6B6054' }}
              title="α at 500 Hz"
            >
              α{(MATERIAL_DATA[group.material].bands[2]).toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
