import type { Vector3D, Face, RoomShape, SoundRay, MaterialType, SurfaceGroup, OctaveBandRT60 } from '@/types';

// ─── Vector helpers ────────────────────────────────────────────────────────────

function sub(a: Vector3D, b: Vector3D): Vector3D {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a: Vector3D, b: Vector3D): Vector3D {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a: Vector3D, b: Vector3D): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(v: Vector3D): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function normalize(v: Vector3D): Vector3D {
  const len = length(v);
  if (len < 1e-10) return { x: 0, y: 1, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function add(a: Vector3D, b: Vector3D): Vector3D {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(v: Vector3D, s: number): Vector3D {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

// ─── Material absorption data ─────────────────────────────────────────────────
// Coefficients for 6 octave bands: 125Hz, 250Hz, 500Hz, 1kHz, 2kHz, 4kHz
// Values from standard published data (ISO 354 / Beranek & Mellow)

export const MATERIAL_DATA: Record<MaterialType, { name: string; bands: number[] }> = {
  concrete:    { name: 'Concrete',           bands: [0.01, 0.02, 0.02, 0.03, 0.04, 0.05] },
  brick:       { name: 'Brick',              bands: [0.03, 0.03, 0.04, 0.05, 0.05, 0.07] },
  wood:        { name: 'Wood Panels',        bands: [0.10, 0.11, 0.13, 0.15, 0.12, 0.08] },
  carpet:      { name: 'Carpet',             bands: [0.05, 0.10, 0.20, 0.30, 0.40, 0.50] },
  glass:       { name: 'Glass',              bands: [0.03, 0.03, 0.03, 0.03, 0.03, 0.02] },
  acoustic:    { name: 'Acoustic Panels',    bands: [0.20, 0.45, 0.70, 0.80, 0.85, 0.80] },
  gypsum:          { name: 'Gypsum Board',         bands: [0.08, 0.09, 0.05, 0.04, 0.04, 0.03] },
  upholstered:     { name: 'Upholstered Seating',  bands: [0.20, 0.30, 0.45, 0.60, 0.70, 0.70] },
  acoustic_foam:   { name: 'Acoustic Foam',         bands: [0.15, 0.35, 0.70, 0.90, 0.95, 0.90] },
  heavy_drape:     { name: 'Heavy Drape',           bands: [0.14, 0.35, 0.55, 0.72, 0.70, 0.65] },
  carpet_concrete: { name: 'Carpet on Concrete',    bands: [0.02, 0.06, 0.14, 0.37, 0.60, 0.65] },
  glass_plate:     { name: 'Plate Glass',           bands: [0.18, 0.06, 0.04, 0.03, 0.02, 0.02] },
};

export const OCTAVE_BANDS = ['125 Hz', '250 Hz', '500 Hz', '1 kHz', '2 kHz', '4 kHz'] as const;

// ─── Möller–Trumbore intersection ─────────────────────────────────────────────

const EPSILON = 1e-7;

function mollerTrumbore(
  origin: Vector3D,
  direction: Vector3D,
  v0: Vector3D,
  v1: Vector3D,
  v2: Vector3D,
): number | null {
  const edge1 = sub(v1, v0);
  const edge2 = sub(v2, v0);
  const h = cross(direction, edge2);
  const a = dot(edge1, h);

  if (Math.abs(a) < EPSILON) return null;

  const f = 1.0 / a;
  const s = sub(origin, v0);
  const u = f * dot(s, h);
  if (u < -EPSILON || u > 1.0 + EPSILON) return null;

  const q = cross(s, edge1);
  const v = f * dot(direction, q);
  if (v < -EPSILON || u + v > 1.0 + EPSILON) return null;

  const t = f * dot(edge2, q);
  return t > EPSILON ? t : null;
}

// ─── Public API ────────────────────────────────────────────────────────────────

export function calculateVolume(vertices: Vector3D[], faces: Face[]): number {
  let vol = 0;
  for (const face of faces) {
    const v0 = vertices[face.a];
    const v1 = vertices[face.b];
    const v2 = vertices[face.c];
    if (!v0 || !v1 || !v2) continue;
    vol += dot(v0, cross(v1, v2));
  }
  return Math.abs(vol) / 6;
}

export function calculateSurfaceArea(vertices: Vector3D[], faces: Face[]): number {
  let area = 0;
  for (const face of faces) {
    const v0 = vertices[face.a];
    const v1 = vertices[face.b];
    const v2 = vertices[face.c];
    if (!v0 || !v1 || !v2) continue;
    const edge1 = sub(v1, v0);
    const edge2 = sub(v2, v0);
    const c = cross(edge1, edge2);
    area += length(c) / 2;
  }
  return area;
}

/** Sabine's formula: RT60 = 0.161 * V / A, where A = Σ(Si * αi) */
export function calculateRT60(
  volume: number,
  surfaceArea: number,
  absorptionCoeff = 0.2,
): number {
  if (surfaceArea < 1e-6 || absorptionCoeff < 1e-6) return 0;
  return (0.161 * volume) / (surfaceArea * absorptionCoeff);
}

/**
 * Computes RT60 per octave band using Sabine's formula with per-surface materials.
 * For each band b: A_b = Σ(area_group * alpha_material_b), RT60_b = 0.161*V / A_b
 */
export function calculateOctaveBandRT60(
  volume: number,
  vertices: Vector3D[],
  faces: Face[],
  surfaceGroups: SurfaceGroup[],
): OctaveBandRT60 {
  const NUM_BANDS = 6;
  const totalAbsorption = new Array<number>(NUM_BANDS).fill(0);

  // Area per face
  for (const group of surfaceGroups) {
    const alphas = MATERIAL_DATA[group.material].bands;
    for (const fi of group.faceIndices) {
      const face = faces[fi];
      if (!face) continue;
      const v0 = vertices[face.a];
      const v1 = vertices[face.b];
      const v2 = vertices[face.c];
      if (!v0 || !v1 || !v2) continue;
      const e1 = sub(v1, v0);
      const e2 = sub(v2, v0);
      const area = length(cross(e1, e2)) / 2;
      for (let b = 0; b < NUM_BANDS; b++) {
        totalAbsorption[b] += area * alphas[b];
      }
    }
  }

  const rt = (A: number) => (A < 1e-6 ? 0 : (0.161 * volume) / A);
  return {
    hz125:  rt(totalAbsorption[0]),
    hz250:  rt(totalAbsorption[1]),
    hz500:  rt(totalAbsorption[2]),
    hz1000: rt(totalAbsorption[3]),
    hz2000: rt(totalAbsorption[4]),
    hz4000: rt(totalAbsorption[5]),
  };
}

/**
 * Auto-detects surface groups from face normals:
 * - Floor: face normal mostly pointing down (ny < -0.5)
 * - Ceiling: face normal mostly pointing up (ny > 0.5)
 * - Walls: everything else
 */
export function detectSurfaceGroups(vertices: Vector3D[], faces: Face[]): SurfaceGroup[] {
  const floorIndices: number[] = [];
  const ceilingIndices: number[] = [];
  const wallIndices: number[] = [];

  for (let i = 0; i < faces.length; i++) {
    const face = faces[i];
    const v0 = vertices[face.a];
    const v1 = vertices[face.b];
    const v2 = vertices[face.c];
    if (!v0 || !v1 || !v2) continue;
    const normal = normalize(cross(sub(v1, v0), sub(v2, v0)));
    if (normal.y < -0.5) floorIndices.push(i);
    else if (normal.y > 0.5) ceilingIndices.push(i);
    else wallIndices.push(i);
  }

  const groups: SurfaceGroup[] = [];
  if (floorIndices.length > 0) groups.push({ label: 'Floor', faceIndices: floorIndices, material: 'concrete' });
  if (ceilingIndices.length > 0) groups.push({ label: 'Ceiling', faceIndices: ceilingIndices, material: 'concrete' });
  if (wallIndices.length > 0) groups.push({ label: 'Walls', faceIndices: wallIndices, material: 'concrete' });
  return groups;
}

/** Approximate SPL at a receiver point (simplified free-field model + early reflections). */
export function computeReceiverSPL(
  source: Vector3D,
  receiver: Vector3D,
  earlyReflectionCount: number,
): number {
  const dx = receiver.x - source.x;
  const dy = receiver.y - source.y;
  const dz = receiver.z - source.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.1;
  // Reference SPL 94 dB at 1m, -6dB per distance doubling, +early reflections boost
  const directSPL = 94 - 20 * Math.log10(dist);
  const reflectionBoost = 10 * Math.log10(1 + earlyReflectionCount * 0.05);
  return Math.max(0, directSPL + reflectionBoost);
}

export function castSoundRays(
  source: Vector3D,
  roomShape: RoomShape,
  numRays = 64,
  maxBounces = 5,
): SoundRay[] {
  const { vertices, faces } = roomShape;
  if (vertices.length < 3 || faces.length === 0) return [];

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const rays: SoundRay[] = [];

  for (let i = 0; i < numRays; i++) {
    const y = 1 - (i / (numRays - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    const dir = normalize({ x: Math.cos(theta) * r, y, z: Math.sin(theta) * r });

    const ray: SoundRay = {
      origin: { ...source },
      direction: dir,
      bounces: [],
      intensity: 1.0,
    };

    let origin = { ...source };
    let direction = { ...dir };
    let intensity = 1.0;

    for (let bounce = 0; bounce < maxBounces; bounce++) {
      let closestT = Infinity;
      let hitFaceIdx = -1;

      for (let fi = 0; fi < faces.length; fi++) {
        const face = faces[fi];
        const v0 = vertices[face.a];
        const v1 = vertices[face.b];
        const v2 = vertices[face.c];
        if (!v0 || !v1 || !v2) continue;

        const t = mollerTrumbore(origin, direction, v0, v1, v2);
        if (t !== null && t < closestT) {
          closestT = t;
          hitFaceIdx = fi;
        }
      }

      if (hitFaceIdx === -1 || !isFinite(closestT)) break;

      const hitPoint = add(origin, scale(direction, closestT));
      ray.bounces.push({ ...hitPoint });
      intensity *= 0.75;
      ray.intensity = intensity;

      const face = faces[hitFaceIdx];
      const v0 = vertices[face.a];
      const v1 = vertices[face.b];
      const v2 = vertices[face.c];
      if (!v0 || !v1 || !v2) break;

      const edge1 = sub(v1, v0);
      const edge2 = sub(v2, v0);
      const faceNormal = normalize(cross(edge1, edge2));

      const dDotN = dot(direction, faceNormal);
      direction = normalize(sub(direction, scale(faceNormal, 2 * dDotN)));
      origin = add(hitPoint, scale(direction, 1e-4));
    }

    rays.push(ray);
  }

  return rays;
}
