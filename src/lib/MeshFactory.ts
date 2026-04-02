import * as THREE from 'three';
import type { ShapeParams, RoomShape, Vector3D, Face } from '@/types';
import { getDefaultRoom } from '@/lib/geometry';

// ─── Internal helpers ──────────────────────────────────────────────────────────

function clamp(val: number | undefined, min: number, max: number, def: number): number {
  if (val === undefined || val === null || !isFinite(val as number)) return def;
  return Math.max(min, Math.min(max, val as number));
}

/** Combine multiple BufferGeometries (any mix of indexed / non-indexed) into one non-indexed geometry. */
function combineGeos(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const allPositions: number[] = [];
  for (const geo of geos) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      allPositions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    }
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(allPositions, 3));
  return result;
}

/**
 * Convert a (possibly indexed) BufferGeometry → RoomShape.
 * Deduplicates vertices within 0.1 mm so the topology is connected.
 */
function bufferGeoToRoomShape(geo: THREE.BufferGeometry): RoomShape {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const vertices: Vector3D[] = [];
  const faces: Face[] = [];
  const map = new Map<string, number>();

  const getOrAdd = (i: number): number => {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
    const existing = map.get(key);
    if (existing !== undefined) return existing;
    const idx = vertices.length;
    vertices.push({ x, y, z });
    map.set(key, idx);
    return idx;
  };

  for (let i = 0; i < pos.count; i += 3) {
    const a = getOrAdd(i);
    const b = getOrAdd(i + 1);
    const c = getOrAdd(i + 2);
    if (a !== b && b !== c && a !== c) faces.push({ a, b, c });
  }

  if (vertices.length < 4 || faces.length < 2) {
    console.warn('[MeshFactory] Geometry too sparse, using fallback room');
    return getDefaultRoom();
  }

  return { vertices, faces };
}

// ─── Archetype builders ────────────────────────────────────────────────────────

function buildOrthogonal(d: ShapeParams['dimensions']): RoomShape {
  const l = clamp(d.length, 2, 200, 10);
  const w = clamp(d.width,  2, 200, 8);
  const h = clamp(d.height, 1, 60,  4);
  const geo = new THREE.BoxGeometry(l, h, w);
  geo.translate(l / 2, h / 2, w / 2);
  return bufferGeoToRoomShape(geo);
}

function buildCylinder(d: ShapeParams['dimensions']): RoomShape {
  const r = clamp(d.radius, 1, 100, 5);
  const h = clamp(d.height, 1, 60,  4);
  // CylinderGeometry centered at origin; translate so floor is at y=0
  const geo = new THREE.CylinderGeometry(r, r, h, 64, 1, false);
  geo.translate(0, h / 2, 0);
  return bufferGeoToRoomShape(geo);
}

function buildDome(d: ShapeParams['dimensions']): RoomShape {
  const r  = clamp(d.radius, 1, 100, 5);
  const dh = clamp(d.height, 0, 60,  0); // optional cylindrical drum below dome

  const geos: THREE.BufferGeometry[] = [];

  // Hemisphere: SphereGeometry(r, widthSegs, heightSegs, phiStart, phiLen, thetaStart, thetaLen)
  // theta=0 → north pole (+Y), theta=π/2 → equator (y=0 relative to sphere center)
  // After translate(0, dh, 0): equator at y=dh, apex at y=dh+r
  const hemi = new THREE.SphereGeometry(r, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2);
  hemi.translate(0, dh, 0);
  geos.push(hemi);

  if (dh > 0.01) {
    // Cylindrical drum wall (open top+bottom)
    const drum = new THREE.CylinderGeometry(r, r, dh, 64, 1, true);
    drum.translate(0, dh / 2, 0); // y=0..dh
    geos.push(drum);
  }

  // Floor circle in XZ plane at y=0
  const floor = new THREE.CircleGeometry(r, 64);
  floor.rotateX(-Math.PI / 2);
  geos.push(floor);

  return bufferGeoToRoomShape(combineGeos(geos));
}

function buildPitched(d: ShapeParams['dimensions']): RoomShape {
  // Shape cross-section in XY plane, extruded along +Z (length)
  const w  = clamp(d.width,       2, 200, 8);  // building width (X)
  const l  = clamp(d.length,      2, 200, 10); // building length (Z, extrude depth)
  const h  = clamp(d.height,      1, 60,  4);  // eave height
  const ph = clamp(d.peak_height, 0, 60,  2);  // ridge rise above eave

  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(w, 0);
  shape.lineTo(w, h);
  shape.lineTo(w / 2, h + ph);
  shape.lineTo(0, h);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, { depth: l, bevelEnabled: false });
  return bufferGeoToRoomShape(geo);
}

function buildBarrelVault(d: ShapeParams['dimensions']): RoomShape {
  // Rectangular floor plan with semicircular arched ceiling
  // Cross-section in XY plane: rectangle (0..w, 0..h) + semicircle on top
  const w  = clamp(d.width,  2, 200, 8);
  const l  = clamp(d.length, 2, 200, 10);
  const h  = clamp(d.height, 0, 60,  0);  // side wall height below arch spring line
  const archRadius = w / 2;               // arch is always a semicircle (radius = half-width)

  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(w, 0);
  shape.lineTo(w, h);
  // Semicircle: center at (w/2, h), from angle 0 (right) to π (left), counter-clockwise
  shape.absarc(w / 2, h, archRadius, 0, Math.PI, true);
  shape.closePath(); // closes back to (0, 0)

  const geo = new THREE.ExtrudeGeometry(shape, { depth: l, bevelEnabled: false });
  return bufferGeoToRoomShape(geo);
}

// ─── Public API ────────────────────────────────────────────────────────────────

/** Build a RoomShape from a ShapeParams archetype + dimensions. */
export function buildRoom(params: ShapeParams): RoomShape {
  try {
    switch (params.archetype) {
      case 'orthogonal':   return buildOrthogonal(params.dimensions);
      case 'cylinder':     return buildCylinder(params.dimensions);
      case 'dome':         return buildDome(params.dimensions);
      case 'pitched':      return buildPitched(params.dimensions);
      case 'barrel_vault': return buildBarrelVault(params.dimensions);
      default:             return buildOrthogonal(params.dimensions);
    }
  } catch (err) {
    console.error('[MeshFactory] buildRoom error:', err);
    return getDefaultRoom();
  }
}
