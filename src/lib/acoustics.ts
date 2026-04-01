import type { Vector3D, Face, RoomShape, SoundRay } from '@/types';

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

// ─── Möller–Trumbore intersection ─────────────────────────────────────────────

const EPSILON = 1e-7;

/**
 * Returns the distance t along the ray (origin + t*direction) at which it
 * intersects the triangle (v0, v1, v2), or null if there is no intersection.
 * Uses the no-culling variant so rays from inside the room hit back-faces.
 */
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

  if (Math.abs(a) < EPSILON) return null; // Ray parallel to triangle

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

/**
 * Computes the signed volume of a closed polyhedron using the divergence theorem.
 * Returns the absolute value.
 */
export function calculateVolume(vertices: Vector3D[], faces: Face[]): number {
  let vol = 0;
  for (const face of faces) {
    const v0 = vertices[face.a];
    const v1 = vertices[face.b];
    const v2 = vertices[face.c];
    if (!v0 || !v1 || !v2) continue;
    // Signed volume contribution: (1/6) * dot(v0, cross(v1, v2))
    vol += dot(v0, cross(v1, v2));
  }
  return Math.abs(vol) / 6;
}

/**
 * Computes the total surface area of the polyhedron (sum of triangle areas).
 */
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

/**
 * Sabine's formula: RT60 = 0.161 * V / (S * alpha)
 */
export function calculateRT60(
  volume: number,
  surfaceArea: number,
  absorptionCoeff = 0.2,
): number {
  if (surfaceArea < 1e-6 || absorptionCoeff < 1e-6) return 0;
  return (0.161 * volume) / (surfaceArea * absorptionCoeff);
}

/**
 * Casts rays in a Fibonacci sphere distribution from `source`, bouncing them
 * around the room mesh using Möller–Trumbore intersections.
 */
export function castSoundRays(
  source: Vector3D,
  roomShape: RoomShape,
  numRays = 64,
  maxBounces = 5,
): SoundRay[] {
  const { vertices, faces } = roomShape;
  if (vertices.length < 3 || faces.length === 0) return [];

  // Fibonacci sphere directions
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

      if (hitFaceIdx === -1 || !isFinite(closestT)) break; // No intersection

      const hitPoint = add(origin, scale(direction, closestT));
      ray.bounces.push({ ...hitPoint });
      intensity *= 0.75;
      ray.intensity = intensity;

      // Reflect direction off face normal
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

      // Offset origin slightly along reflected direction to avoid self-intersection
      origin = add(hitPoint, scale(direction, 1e-4));
    }

    rays.push(ray);
  }

  return rays;
}
