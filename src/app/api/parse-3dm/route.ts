import rhino3dm from 'rhino3dm';
import type { Vector3D, Face } from '@/types';

export async function POST(request: Request): Promise<Response> {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof Blob)) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }

    const buf = await file.arrayBuffer();
    const arr = new Uint8Array(buf);

    const rhino = await rhino3dm();
    const doc = rhino.File3dm.fromByteArray(arr);

    const vertices: Vector3D[] = [];
    const faces: Face[] = [];

    const objects = doc.objects();
    for (let i = 0; i < objects.count; i++) {
      const obj = objects.get(i);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const geo = (obj as any).geometry();
      if (!geo || geo.objectType !== rhino.ObjectType.Mesh) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mesh = geo as any;
      const verts: number[][] = mesh.vertices().toFloatArray(3);
      const facesArr: number[][] = mesh.faces().toIntArray(4);
      const base = vertices.length;
      for (const v of verts) vertices.push({ x: v[0], y: v[1], z: v[2] });
      for (const f of facesArr) {
        faces.push({ a: base + f[0], b: base + f[1], c: base + f[2] });
        if (f[2] !== f[3]) faces.push({ a: base + f[0], b: base + f[2], c: base + f[3] });
      }
    }

    if (vertices.length < 4) {
      return Response.json({ error: '3DM file contains no mesh geometry.' }, { status: 422 });
    }

    return Response.json({ vertices, faces });
  } catch (err) {
    console.error('parse-3dm route error:', err);
    return Response.json({ error: 'Failed to parse .3dm file' }, { status: 500 });
  }
}
