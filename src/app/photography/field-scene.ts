// three scene for the photography field. Imported dynamically by
// PhotoField.tsx on this route only.
import * as THREE from "three";

export interface FieldPhoto { id: number; src: string; w: number; h: number; place: string }
export interface Place { name: string; count: number; lat: number; lng: number }

const K = 2;            // field units per degree of longitude and latitude
const CARD = 2;         // card height in field units
const NEAR = 70;        // load a cluster's thumbnails when the camera is this close
const HEIGHT = 16, BACK = 20; // camera height above the field and set-back behind its target

// Plan position of a place: equirectangular, north away from the camera.
const at = (p: Place) => new THREE.Vector2(p.lng * K, -p.lat * K);

// Next's image optimizer serves a small thumbnail for each photo.
const thumb = (src: string, w: number) => `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=75`;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function mount(
  canvas: HTMLCanvasElement,
  photos: FieldPhoto[],
  places: Place[],
  start: string,
  thumbWidth: number,
  onNearest: (p: Place) => void,
  onOpen: (id: number) => void,
) {
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 400);
  const target = new THREE.Vector3();
  const place = (name: string) => places.find((p) => p.name === name)!;

  // Cards, one per photo, scattered round their place and facing the camera.
  const geo = new THREE.PlaneGeometry(1, 1);
  const loader = new THREE.TextureLoader();
  const clusters = places.map((pl) => ({ pl, c: at(pl), cards: [] as THREE.Mesh[], loaded: false }));
  for (const cl of clusters) {
    const r = rng(cl.pl.name.length * 977 + Math.round(cl.pl.lat * 100));
    const mine = photos.filter((p) => p.place === cl.pl.name);
    mine.forEach((p, i) => {
      const a = i * 2.39996, rad = 1.1 * Math.sqrt(i + 0.5) + r() * 0.6;
      const mat = new THREE.MeshBasicMaterial({ color: 0xd8e6d8, transparent: true, depthWrite: true });
      const card = new THREE.Mesh(geo, mat);
      card.scale.set((CARD * p.w) / p.h, CARD, 1);
      card.position.set(cl.c.x + Math.cos(a) * rad, 0.4 + r() * 3, cl.c.y + Math.sin(a) * rad * 0.8);
      card.userData = { id: p.id, src: p.src };
      scene.add(card);
      cl.cards.push(card);
    });
  }

  function aim() {
    camera.position.set(target.x, HEIGHT, target.z + BACK);
    camera.lookAt(target);
    for (const cl of clusters) for (const card of cl.cards) card.quaternion.copy(camera.quaternion);
  }

  // Load thumbnails only for clusters near the camera; the rest wait.
  function loadNear() {
    for (const cl of clusters) {
      if (cl.loaded || Math.hypot(cl.c.x - target.x, cl.c.y - target.z) > NEAR) continue;
      cl.loaded = true;
      for (const card of cl.cards) {
        loader.load(thumb(card.userData.src, thumbWidth), (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          const m = card.material as THREE.MeshBasicMaterial;
          m.map = tex; m.color.set(0xffffff); m.needsUpdate = true;
          request();
        });
      }
    }
  }

  let nearest = "";
  function report() {
    let best = clusters[0], bd = Infinity;
    for (const cl of clusters) { const d = Math.hypot(cl.c.x - target.x, cl.c.y - target.z); if (d < bd) { bd = d; best = cl; } }
    if (best.pl.name !== nearest) { nearest = best.pl.name; onNearest(best.pl); }
  }

  let raf = 0;
  function request() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; renderer.render(scene, camera); }); }
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    request();
  }

  // Travel limits: the field's extent, plus a margin.
  const xs = clusters.map((c) => c.c.x), zs = clusters.map((c) => c.c.y);
  const lim = { x0: Math.min(...xs) - 10, x1: Math.max(...xs) + 10, z0: Math.min(...zs) - 10, z1: Math.max(...zs) + 10 };
  function move(dx: number, dz: number) {
    const x = Math.min(lim.x1, Math.max(lim.x0, target.x + dx)), z = Math.min(lim.z1, Math.max(lim.z0, target.z + dz));
    const moved = x !== target.x || z !== target.z;
    target.set(x, 0, z);
    aim(); loadNear(); report(); request();
    return moved;
  }

  // Drag to move; a click without a drag opens the photo under the pointer.
  let drag: { x: number; y: number; moved: number } | null = null;
  const perPx = () => (2 * Math.hypot(HEIGHT, BACK) * Math.tan((camera.fov * Math.PI) / 360)) / canvas.clientHeight;
  const down = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; canvas.setPointerCapture(e.pointerId); };
  const moveP = (e: PointerEvent) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
    move(-dx * perPx(), -dy * perPx() * 1.25);
  };
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const up = (e: PointerEvent) => {
    const d = drag; drag = null;
    if (!d || d.moved > 6) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(clusters.flatMap((c) => c.cards))[0];
    if (hit) onOpen(hit.object.userData.id);
  };
  // Scroll moves through the field; at its ends the page scrolls as usual.
  const wheel = (e: WheelEvent) => {
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (move(d * perPx(), 0)) e.preventDefault();
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", moveP);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("wheel", wheel, { passive: false });
  const ro = new ResizeObserver(resize); ro.observe(canvas);

  const s = at(place(start));
  target.set(s.x, 0, s.y);
  aim(); resize(); loadNear(); report();

  return () => {
    cancelAnimationFrame(raf); ro.disconnect();
    canvas.removeEventListener("pointerdown", down);
    canvas.removeEventListener("pointermove", moveP);
    canvas.removeEventListener("pointerup", up);
    canvas.removeEventListener("wheel", wheel);
    for (const cl of clusters) for (const card of cl.cards) { const m = card.material as THREE.MeshBasicMaterial; m.map?.dispose(); m.dispose(); }
    geo.dispose(); renderer.dispose();
  };
}
