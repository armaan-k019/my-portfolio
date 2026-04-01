import type { Vector3D, Face, RoomShape } from '@/types';

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

function length(v: Vector3D): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function normalize(v: Vector3D): Vector3D {
  const len = length(v);
  if (len < 1e-10) return { x: 0, y: 1, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Safely parses Claude's JSON response into a RoomShape.
 * Returns null if the JSON is malformed or missing required fields.
 */
export function parseNaturalLanguageResponse(json: unknown): RoomShape | null {
  try {
    if (typeof json !== 'object' || json === null) return null;
    const obj = json as Record<string, unknown>;

    if (!Array.isArray(obj.vertices) || !Array.isArray(obj.faces)) return null;

    const vertices: Vector3D[] = [];
    for (const v of obj.vertices) {
      if (
        typeof v !== 'object' ||
        v === null ||
        typeof (v as Record<string, unknown>).x !== 'number' ||
        typeof (v as Record<string, unknown>).y !== 'number' ||
        typeof (v as Record<string, unknown>).z !== 'number'
      ) {
        return null;
      }
      vertices.push({
        x: (v as Record<string, unknown>).x as number,
        y: (v as Record<string, unknown>).y as number,
        z: (v as Record<string, unknown>).z as number,
      });
    }

    const faces: Face[] = [];
    for (const f of obj.faces) {
      if (
        typeof f !== 'object' ||
        f === null ||
        typeof (f as Record<string, unknown>).a !== 'number' ||
        typeof (f as Record<string, unknown>).b !== 'number' ||
        typeof (f as Record<string, unknown>).c !== 'number'
      ) {
        return null;
      }
      const face = f as Record<string, unknown>;
      const a = face.a as number;
      const b = face.b as number;
      const c = face.c as number;
      if (a < 0 || b < 0 || c < 0 || a >= vertices.length || b >= vertices.length || c >= vertices.length) {
        return null;
      }
      faces.push({ a, b, c });
    }

    if (vertices.length < 4 || faces.length < 4) return null;
    return { vertices, faces };
  } catch (err) {
    console.error('parseNaturalLanguageResponse error:', err);
    return null;
  }
}

/**
 * Returns a closed rectangular room: 10m × 8m × 4m.
 * 8 vertices, 12 triangular faces, CCW wound for outward normals.
 *
 * Vertex layout:
 *   Bottom (y=0): v0(0,0,0) v1(10,0,0) v2(10,0,8) v3(0,0,8)
 *   Top    (y=4): v4(0,4,0) v5(10,4,0) v6(10,4,8) v7(0,4,8)
 */
export function getDefaultRoom(): RoomShape {
  const vertices: Vector3D[] = [
    // Bottom ring (y = 0)
    { x: 0,  y: 0, z: 0 }, // 0
    { x: 10, y: 0, z: 0 }, // 1
    { x: 10, y: 0, z: 8 }, // 2
    { x: 0,  y: 0, z: 8 }, // 3
    // Top ring (y = 4)
    { x: 0,  y: 4, z: 0 }, // 4
    { x: 10, y: 4, z: 0 }, // 5
    { x: 10, y: 4, z: 8 }, // 6
    { x: 0,  y: 4, z: 8 }, // 7
  ];

  // All faces wound CCW for outward normals (verified by cross product)
  const faces: Face[] = [
    // Bottom (normal −Y)
    { a: 0, b: 1, c: 3 },
    { a: 1, b: 2, c: 3 },
    // Top (normal +Y)
    { a: 4, b: 7, c: 5 },
    { a: 5, b: 7, c: 6 },
    // Front z=0 (normal −Z)
    { a: 0, b: 4, c: 1 },
    { a: 1, b: 4, c: 5 },
    // Back z=8 (normal +Z)
    { a: 3, b: 2, c: 7 },
    { a: 2, b: 6, c: 7 },
    // Left x=0 (normal −X)
    { a: 0, b: 3, c: 4 },
    { a: 3, b: 7, c: 4 },
    // Right x=10 (normal +X)
    { a: 1, b: 5, c: 2 },
    { a: 2, b: 5, c: 6 },
  ];

  return { vertices, faces };
}

/**
 * Computes a unit normal vector per face using the cross product of the first two edges.
 */
export function computeFaceNormals(vertices: Vector3D[], faces: Face[]): Vector3D[] {
  return faces.map((face) => {
    const v0 = vertices[face.a];
    const v1 = vertices[face.b];
    const v2 = vertices[face.c];
    if (!v0 || !v1 || !v2) return { x: 0, y: 1, z: 0 };
    const edge1 = sub(v1, v0);
    const edge2 = sub(v2, v0);
    return normalize(cross(edge1, edge2));
  });
}
