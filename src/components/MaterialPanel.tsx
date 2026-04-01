'use client';

import type { SurfaceGroup, MaterialType } from '@/types';
import { MATERIAL_DATA } from '@/lib/acoustics';

interface MaterialPanelProps {
  groups: SurfaceGroup[];
  onChange: (groups: SurfaceGroup[]) => void;
}

const MATERIAL_OPTIONS: MaterialType[] = [
  'concrete', 'brick', 'wood', 'carpet', 'glass', 'acoustic', 'gypsum', 'upholstered',
];

export default function MaterialPanel({ groups, onChange }: MaterialPanelProps) {
  function setMaterial(index: number, material: MaterialType) {
    const next = groups.map((g, i) => (i === index ? { ...g, material } : g));
    onChange(next);
  }

  return (
    <div className="bg-white/80 rounded-xl border border-[#E8E0D4] shadow-sm p-4 space-y-3">
      <h3 className="font-semibold text-xs text-[#2C1810]">Surface Materials</h3>
      <p className="text-xs text-[#6B6054]">
        Assign absorption materials to each surface group for accurate RT60 calculations.
      </p>
      <div className="space-y-2">
        {groups.map((group, i) => (
          <div key={group.label} className="flex items-center gap-2">
            <span className="text-xs text-[#2C1810] w-16 shrink-0 font-medium">{group.label}</span>
            <select
              value={group.material}
              onChange={(e) => setMaterial(i, e.target.value as MaterialType)}
              className="flex-1 px-2 py-1.5 text-xs border border-[#E8E0D4] rounded-lg bg-white text-[#2C1810] focus:outline-none focus:border-[#FF6B35]"
            >
              {MATERIAL_OPTIONS.map((m) => (
                <option key={m} value={m}>{MATERIAL_DATA[m].name}</option>
              ))}
            </select>
            <span className="text-xs text-[#6B6054] w-10 text-right shrink-0" title="α at 500 Hz">
              α{(MATERIAL_DATA[group.material].bands[2]).toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
