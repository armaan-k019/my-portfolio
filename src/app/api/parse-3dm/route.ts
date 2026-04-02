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

    // Dynamic import avoids module-load failures when rhino3dm WASM is unavailable
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rhino3dmLoader: any;
    try {
      rhino3dmLoader = (await import('rhino3dm')).default;
    } catch (importErr) {
      console.error('[parse-3dm] Failed to load rhino3dm module:', importErr);
      return Response.json(
        { error: 'The .3dm parser module could not be loaded on this server. Try .obj or .stl instead.' },
        { status: 500 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rhino: any;
    try {
      rhino = await rhino3dmLoader();
    } catch (initErr) {
      console.error('[parse-3dm] Failed to initialize rhino3dm:', initErr);
      return Response.json(
        { error: 'Failed to initialize the .3dm parser. The file may be corrupt or too large.' },
        { status: 500 },
      );
    }

    let doc;
    try {
      doc = rhino.File3dm.fromByteArray(arr);
      if (!doc) throw new Error('fromByteArray returned null');
    } catch (parseErr) {
      console.error('[parse-3dm] Failed to parse file bytes:', parseErr);
      return Response.json(
        { error: 'Could not read .3dm file. Make sure it was saved from Rhino 6 or later.' },
        { status: 422 },
      );
    }

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
      return Response.json(
        { error: '3DM file contains no mesh geometry. Make sure the model has meshes (not only NURBS surfaces). In Rhino, run Mesh on your surfaces before exporting.' },
        { status: 422 },
      );
    }

    return Response.json({ vertices, faces });
  } catch (err) {
    console.error('[parse-3dm] Unexpected error:', err instanceof Error ? err.stack : err);
    return Response.json(
      { error: `Failed to parse .3dm: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
