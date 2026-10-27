import * as THREE from "three";
import type { StorybookConfig } from "../../../content/storybook";
import { leafCount, type Layout } from "@/lib/storybook/paginate";
import {
  PAPER, drawBackCover, drawCloth, drawEndpaper, drawFrontCover, drawShadow, drawSide, loadFonts, readFonts, type Fonts,
} from "@/lib/storybook/page-art";

// The book as a Three.js scene. Each leaf (front cover, paper sheets, back
// cover) hinges at the spine, x = 0. A paper sheet is a finely divided plane
// that bends as it turns; covers are rigid boards. Pages face +z.

export type Focus = "left" | "right";

export interface BookState {
  flipped: number;
  leaves: number;
  // Narrow screens show one page at a time; this says which one.
  focus: Focus;
  narrow: boolean;
}

interface Tween { from: number; to: number; start: number; dur: number }

interface Leaf {
  index: number;
  rigid: boolean;
  group: THREE.Group;
  meshes: THREE.Mesh[];
  geometry: THREE.BufferGeometry;
  rest?: Float32Array;
  t: number;
  target: number;
  tween: Tween | null;
  dir: number;
  grabY: number;
  dirty: boolean;
  // Paper only: the page side indices on each face, and whether their textures are built.
  sides?: [number, number];
  textured: boolean;
}

const SEG = 30;
const ROWS = 10;
const GAP = 0.0024;
const BOARD = 0.016;
const TILT = -0.4;
const PAGE_H = 1.3;
const TEX_W = 1024;

const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class BookScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 1, 0.05, 50);
  private root = new THREE.Group();
  private leaves: Leaf[] = [];
  private shadow: THREE.Mesh;
  private paperMaterial = new THREE.MeshStandardMaterial({ color: PAPER, roughness: 0.92 });
  private disposables: { dispose(): void }[] = [];
  private fonts: Fonts | null = null;
  private raf = 0;
  private last = 0;
  private W: number;
  private H = PAGE_H;
  private texH: number;

  private flipped = 0;
  private focus: Focus = "right";
  private narrow = false;
  private offsetX = 0;
  private focusX = 0;
  private openness = 0;
  private parallax = new THREE.Vector2();
  private parallaxGoal = new THREE.Vector2();
  private peeked: Leaf | null = null;
  private pointer: { id: number; x: number; y: number; local: THREE.Vector3 | null; leaf: Leaf | null; dragging: boolean } | null = null;
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane();
  private ro: ResizeObserver;
  private disposed = false;

  constructor(
    private host: HTMLElement,
    private config: StorybookConfig,
    private layout: Layout,
    private reduced: boolean,
    private onChange: (s: BookState) => void,
  ) {
    this.W = PAGE_H * (config.page.width / config.page.height);
    this.texH = Math.round(TEX_W * (config.page.height / config.page.width));

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.style.touchAction = "none";
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(0xfff8ee, 0x2a3a2a, 1.45));
    const key = new THREE.DirectionalLight(0xfff4e6, 1.7);
    key.position.set(-1.6, 2.4, 3.2);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xdfe9ff, 0.35);
    fill.position.set(2, -1, 2);
    this.scene.add(fill);

    this.root.rotation.x = TILT;
    this.scene.add(this.root);

    const shadowTex = new THREE.CanvasTexture(drawShadow());
    const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat);
    this.shadow.position.z = -0.05;
    this.root.add(this.shadow);
    this.disposables.push(shadowTex, shadowMat, this.shadow.geometry, this.paperMaterial);

    this.buildLeaves();
    this.offsetX = this.goalOffset();
    this.root.position.x = this.offsetX;

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.bindPointer();

    this.fonts = readFonts();
    loadFonts(this.fonts).finally(() => {
      if (this.disposed) return;
      this.dressCovers();
      this.syncTextures();
    });

    this.raf = requestAnimationFrame(this.tick);
    this.emit();
  }

  // Public controls.

  next() {
    // A page under the hand owns the stack until it is released.
    if (this.pointer?.dragging) return;
    const n = this.leaves.length;
    if (this.narrow && this.isOpen() && this.focus === "left") {
      this.focus = "right";
      return this.emit();
    }
    if (this.flipped >= n) return;
    this.turn(this.flipped, 1, 0);
    this.flipped++;
    // After the first leaf the left side is the inside cover, so stay right.
    this.focus = this.flipped === 1 ? "right" : "left";
    this.afterTurn();
  }

  prev() {
    if (this.pointer?.dragging) return;
    const n = this.leaves.length;
    if (this.narrow && this.isOpen() && this.focus === "right" && this.flipped > 1) {
      this.focus = "left";
      return this.emit();
    }
    if (this.flipped <= 0) return;
    this.flipped--;
    this.turn(this.flipped, 0, 0);
    // At the last sheet the right side is the inside back cover, so stay left.
    this.focus = this.flipped === n - 1 ? "left" : "right";
    this.afterTurn();
  }

  // Turns leaves one after another until `flipped` leaves are turned.
  goTo(flipped: number, focus: Focus = "right") {
    if (this.pointer?.dragging) return;
    const goal = clamp(flipped, 0, this.leaves.length);
    const step = this.reduced ? 0 : 0.11;
    let k = 0;
    while (this.flipped < goal) this.turn(this.flipped++, 1, step * k++);
    while (this.flipped > goal) this.turn(--this.flipped, 0, step * k++);
    this.focus = focus;
    this.afterTurn();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.unbindPointer();
    for (const leaf of this.leaves) this.releaseTextures(leaf);
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // Construction.

  private buildLeaves() {
    const n = leafCount(this.layout.sides.length);
    const { W, H } = this;
    for (let i = 0; i < n; i++) {
      const rigid = i === 0 || i === n - 1;
      const group = new THREE.Group();
      let geometry: THREE.BufferGeometry;
      let meshes: THREE.Mesh[];
      let rest: Float32Array | undefined;
      if (rigid) {
        // Boards overhang the page block a little at the head, tail and fore edge.
        geometry = new THREE.BoxGeometry(W + 0.035, H + 0.05, BOARD);
        geometry.translate((W + 0.035) / 2, 0, i === 0 ? BOARD / 2 : -BOARD / 2);
        const board = new THREE.MeshStandardMaterial({ color: "#1C3A1B", roughness: 0.85 });
        // Box faces: +x, -x, +y, -y, +z, -z. The art faces are filled once fonts load.
        const faces = [board.clone(), board.clone()];
        meshes = [new THREE.Mesh(geometry, [board, board, board, board, ...faces])];
        this.disposables.push(board, ...faces);
      } else {
        geometry = new THREE.PlaneGeometry(W, H, SEG, ROWS);
        geometry.translate(W / 2, 0, 0);
        rest = Float32Array.from(geometry.attributes.position.array as ArrayLike<number>);
        meshes = [
          new THREE.Mesh(geometry, this.paperMaterial),
          new THREE.Mesh(geometry, this.paperMaterial),
        ];
      }
      for (const m of meshes) group.add(m);
      this.root.add(group);
      this.disposables.push(geometry);
      this.leaves.push({
        index: i, rigid, group, meshes, geometry, rest,
        t: 0, target: 0, tween: null, dir: 1, grabY: 0.3, dirty: true,
        sides: rigid ? undefined : [2 * (i - 1), 2 * (i - 1) + 1],
        textured: false,
      });
    }
  }

  private canvasTexture(canvas: HTMLCanvasElement, mirror = false) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    if (mirror) {
      // The back of a sheet is seen from behind, so its texture runs right to left.
      tex.repeat.set(-1, 1);
      tex.offset.set(1, 0);
    }
    return tex;
  }

  // Covers stamp their logo after it loads, so the texture is refreshed then.
  private setBoardFace(mesh: THREE.Mesh, face: number, draw: (onUpdate: () => void) => HTMLCanvasElement) {
    const mats = mesh.material as THREE.MeshStandardMaterial[];
    let tex: THREE.CanvasTexture | null = null;
    const canvas = draw(() => { if (tex) tex.needsUpdate = true; });
    tex = this.canvasTexture(canvas);
    mats[face].map = tex;
    mats[face].color.set("#ffffff");
    mats[face].needsUpdate = true;
    this.disposables.push(tex);
  }

  private dressCovers() {
    if (!this.fonts) return;
    const f = this.fonts;
    const w = TEX_W, h = this.texH;
    const front = this.leaves[0].meshes[0];
    const back = this.leaves[this.leaves.length - 1].meshes[0];
    const clothTex = this.canvasTexture(drawCloth(256, 256));
    clothTex.wrapS = clothTex.wrapT = THREE.RepeatWrapping;
    for (const mesh of [front, back]) {
      const mats = mesh.material as THREE.MeshStandardMaterial[];
      mats[0].map = clothTex;
      mats[0].color.set("#ffffff");
      mats[0].needsUpdate = true;
    }
    this.disposables.push(clothTex);
    const cover = this.config.cover;
    this.setBoardFace(front, 4, (u) => drawFrontCover(w, h, cover, f, u));
    this.setBoardFace(front, 5, () => drawEndpaper(w, h, false));
    this.setBoardFace(back, 4, () => drawEndpaper(w, h, true));
    this.setBoardFace(back, 5, (u) => drawBackCover(w, h, cover, u));
  }

  // Page textures are built only near the open spread, so a long book stays light on memory.
  private syncTextures() {
    if (!this.fonts) return;
    for (const leaf of this.leaves) {
      if (leaf.rigid || !leaf.sides) continue;
      // Leaves still turning keep their art, so a long jump never shows blank paper.
      const d = Math.abs(leaf.index - this.flipped);
      if ((d <= 3 || leaf.tween) && !leaf.textured) this.buildTextures(leaf);
      else if (d > 5 && !leaf.tween && leaf.textured) this.releaseTextures(leaf);
    }
  }

  private buildTextures(leaf: Leaf) {
    const f = this.fonts;
    if (!f || !leaf.sides) return;
    leaf.textured = true;
    leaf.sides.forEach((sideIndex, k) => {
      const side = this.layout.sides[sideIndex];
      let tex: THREE.CanvasTexture | null = null;
      const canvas = drawSide(side, TEX_W, this.texH, f, () => { if (tex) tex.needsUpdate = true; });
      tex = this.canvasTexture(canvas, k === 1);
      leaf.meshes[k].material = new THREE.MeshStandardMaterial({
        map: tex, roughness: 0.92, side: k === 0 ? THREE.FrontSide : THREE.BackSide,
      });
    });
  }

  private releaseTextures(leaf: Leaf) {
    if (leaf.rigid || !leaf.textured) return;
    for (const m of leaf.meshes) {
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.map?.dispose();
      mat.dispose();
    }
    leaf.meshes[0].material = this.paperMaterial;
    leaf.meshes[1].material = this.paperMaterial;
    leaf.textured = false;
  }

  // Motion.

  private turn(i: number, to: number, delay: number) {
    const leaf = this.leaves[i];
    if (this.peeked === leaf) this.peeked = null;
    leaf.target = to;
    leaf.dir = to > leaf.t ? 1 : -1;
    const base = leaf.rigid ? 1.05 : 0.95;
    const dur = this.reduced ? 0.001 : Math.max(0.3, base * Math.abs(to - leaf.t));
    leaf.tween = { from: leaf.t, to, start: performance.now() / 1000 + delay, dur };
  }

  private nudge(leaf: Leaf, to: number) {
    leaf.dir = to > leaf.t ? 1 : -1;
    leaf.tween = { from: leaf.t, to, start: performance.now() / 1000, dur: 0.35 };
  }

  private afterTurn() {
    this.syncTextures();
    this.emit();
  }

  private isOpen() {
    return this.flipped > 0 && this.flipped < this.leaves.length;
  }

  private goalOffset() {
    if (this.flipped === 0) return -this.W / 2;
    if (this.flipped === this.leaves.length) return this.W / 2;
    return 0;
  }

  private emit() {
    this.onChange({ flipped: this.flipped, leaves: this.leaves.length, focus: this.focus, narrow: this.narrow });
  }

  private pose(leaf: Leaf) {
    const n = this.leaves.length;
    const restZ = (n - leaf.index) * GAP;
    const flatZ = leaf.index * GAP;
    leaf.group.position.z = restZ + (flatZ - restZ) * leaf.t;
    if (leaf.rigid) {
      leaf.group.rotation.y = -Math.PI * leaf.t;
      return;
    }
    const pos = leaf.geometry.attributes.position as THREE.BufferAttribute;
    const rest = leaf.rest!;
    const { W, H } = this;
    const t = leaf.t;
    const dragging = this.pointer?.dragging && this.pointer.leaf === leaf;
    // The free edge leads the spine through the turn, more so under the hand.
    const lead = (dragging ? 0.34 : 0.24) * Math.sin(Math.PI * t) * leaf.dir;
    const dx = W / SEG;
    for (let r = 0; r <= ROWS; r++) {
      const y = rest[(r * (SEG + 1)) * 3 + 1];
      const yN = (y + H / 2) / H;
      const rowLead = lead * (0.7 + 0.6 * (1 - Math.abs(yN - leaf.grabY)));
      let px = 0, pz = 0;
      for (let c = 0; c <= SEG; c++) {
        const k = (r * (SEG + 1) + c) * 3;
        if (c > 0) {
          const s = (c - 0.5) / SEG;
          const a = Math.PI * clamp(t + rowLead * s, 0, 1);
          px += Math.cos(a) * dx;
          pz += Math.sin(a) * dx;
        }
        pos.array[k] = px;
        pos.array[k + 1] = y;
        pos.array[k + 2] = pz;
      }
    }
    pos.needsUpdate = true;
    leaf.geometry.computeVertexNormals();
    leaf.geometry.computeBoundingSphere();
  }

  private tick = (ms: number) => {
    this.raf = requestAnimationFrame(this.tick);
    const now = ms / 1000;
    const dt = Math.min(0.1, this.last ? now - this.last : 0.016);
    this.last = now;

    for (const leaf of this.leaves) {
      const tw = leaf.tween;
      if (tw) {
        const p = clamp((performance.now() / 1000 - tw.start) / tw.dur, 0, 1);
        leaf.t = tw.from + (tw.to - tw.from) * easeInOut(p);
        if (p >= 1) {
          leaf.tween = null;
          this.syncTextures();
        }
        leaf.dirty = true;
      }
      if (leaf.dirty) {
        this.pose(leaf);
        leaf.dirty = false;
      }
    }

    const ease = 1 - Math.exp(-dt * (this.reduced ? 60 : 4.5));
    this.offsetX += (this.goalOffset() - this.offsetX) * ease;
    this.root.position.x = this.offsetX;
    this.openness += ((this.isOpen() ? 1 : 0) - this.openness) * ease;
    // The shadow covers one board when shut and the whole spread when open.
    const closedSide = this.flipped === this.leaves.length ? -1 : 1;
    this.shadow.scale.set(this.W * (1 + this.openness) + 0.45, this.H + 0.4, 1);
    this.shadow.position.x = (closedSide * this.W / 2) * (1 - this.openness);

    const goalFocus = this.narrow && this.isOpen() ? this.offsetX + (this.focus === "left" ? -this.W / 2 : this.W / 2) : 0;
    this.focusX += (goalFocus - this.focusX) * ease;

    if (!this.reduced) this.parallax.lerp(this.parallaxGoal, 1 - Math.exp(-dt * 3));
    this.root.rotation.y = this.parallax.x * 0.07;
    this.root.rotation.x = TILT + this.parallax.y * 0.05;
    this.camera.position.x = this.focusX;
    this.camera.lookAt(this.focusX, -0.07, 0);

    this.renderer.render(this.scene, this.camera);
  };

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    const aspect = w / h;
    const wasNarrow = this.narrow;
    this.narrow = aspect < 1.05;
    this.camera.aspect = aspect;
    const half = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const needW = this.narrow ? this.W * 1.06 : this.W * 2 * 1.16;
    // Extra height leaves room for the header and the control bar.
    const needH = this.H * 1.32;
    const dist = Math.max(needW / 2 / (half * aspect), needH / 2 / half);
    this.camera.position.set(this.focusX, 0, dist);
    this.camera.updateProjectionMatrix();
    if (wasNarrow !== this.narrow) this.emit();
  }

  // Pointer: drag a page to turn it, click either page, hover a fore edge to lift its corner.

  private toLocal(e: PointerEvent): THREE.Vector3 | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    this.root.updateMatrixWorld();
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
    this.plane.setFromNormalAndCoplanarPoint(normal, this.root.position);
    const hit = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.plane, hit)) return null;
    return this.root.worldToLocal(hit);
  }

  private onBook(p: THREE.Vector3) {
    if (Math.abs(p.y) > this.H / 2 + 0.03) return false;
    if (this.flipped === 0) return p.x > 0 && p.x < this.W + 0.04;
    if (this.flipped === this.leaves.length) return p.x < 0 && p.x > -this.W - 0.04;
    return Math.abs(p.x) < this.W + 0.04;
  }

  // The leaf a pointer at this point would turn: the top of the right stack, or the left.
  private leafAt(p: THREE.Vector3): Leaf | null {
    if (!this.onBook(p)) return null;
    if (p.x >= 0) return this.flipped < this.leaves.length ? this.leaves[this.flipped] : null;
    return this.flipped > 0 ? this.leaves[this.flipped - 1] : null;
  }

  private onMove = (e: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.parallaxGoal.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -(((e.clientY - rect.top) / rect.height) * 2 - 1));
    const p = this.toLocal(e);
    const ptr = this.pointer;

    if (ptr && ptr.id === e.pointerId) {
      const moved = Math.hypot(e.clientX - ptr.x, e.clientY - ptr.y);
      if (!this.narrow && !ptr.dragging && moved > 6 && ptr.leaf) {
        ptr.dragging = true;
        if (this.peeked === ptr.leaf) this.peeked = null;
        ptr.leaf.tween = null;
      }
      if (ptr.dragging && ptr.leaf && p) {
        const leaf = ptr.leaf;
        const t = clamp((this.W - p.x) / (2 * this.W), 0, 1);
        leaf.dir = t >= leaf.t ? 1 : -1;
        leaf.t = t;
        leaf.dirty = true;
      }
      return;
    }

    // Hover: lift the corner of whichever page is under the pointer near its fore edge.
    const leaf = p && !this.narrow && Math.abs(p.x) > this.W * 0.62 ? this.leafAt(p) : null;
    this.renderer.domElement.style.cursor = p && this.leafAt(p) ? "grab" : "default";
    if (this.reduced || leaf === this.peeked) return;
    if (this.peeked) this.nudge(this.peeked, this.peeked.target);
    this.peeked = null;
    if (leaf && !leaf.tween && p) {
      leaf.grabY = clamp((p.y + this.H / 2) / this.H, 0, 1);
      this.nudge(leaf, leaf.target === 0 ? 0.055 : 0.945);
      this.peeked = leaf;
    }
  };

  private onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const local = this.toLocal(e);
    const leaf = local ? this.leafAt(local) : null;
    if (leaf && local) leaf.grabY = clamp((local.y + this.H / 2) / this.H, 0, 1);
    this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, local, leaf, dragging: false };
    this.renderer.domElement.setPointerCapture(e.pointerId);
    if (leaf) this.renderer.domElement.style.cursor = "grabbing";
  };

  private onUp = (e: PointerEvent) => {
    const ptr = this.pointer;
    if (!ptr || ptr.id !== e.pointerId) return;
    this.pointer = null;
    this.renderer.domElement.style.cursor = "default";
    const dx = e.clientX - ptr.x;

    if (ptr.dragging && ptr.leaf) {
      const leaf = ptr.leaf;
      const forward = leaf.index === this.flipped;
      if (forward && leaf.t > 0.22) {
        this.turn(leaf.index, 1, 0);
        this.flipped++;
        this.focus = "right";
      } else if (!forward && leaf.t < 0.78) {
        this.turn(leaf.index, 0, 0);
        this.flipped--;
        this.focus = "right";
      } else {
        this.turn(leaf.index, leaf.target, 0);
        return;
      }
      return this.afterTurn();
    }

    if (this.narrow) {
      // Swipe, or tap either half of the screen. A tap anywhere on a shut book opens it.
      if (Math.abs(dx) > 40) return dx < 0 ? this.next() : this.prev();
      if (this.flipped === 0) return this.next();
      if (this.flipped === this.leaves.length) return this.prev();
      const rect = this.renderer.domElement.getBoundingClientRect();
      return e.clientX - rect.left > rect.width / 2 ? this.next() : this.prev();
    }
    if (ptr.leaf && ptr.local) return ptr.local.x >= 0 ? this.next() : this.prev();
  };

  private onLeave = () => {
    this.parallaxGoal.set(0, 0);
    if (this.peeked) this.nudge(this.peeked, this.peeked.target);
    this.peeked = null;
  };

  private bindPointer() {
    const el = this.renderer.domElement;
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointercancel", this.onUp);
    el.addEventListener("pointerleave", this.onLeave);
  }

  private unbindPointer() {
    const el = this.renderer.domElement;
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointerdown", this.onDown);
    el.removeEventListener("pointerup", this.onUp);
    el.removeEventListener("pointercancel", this.onUp);
    el.removeEventListener("pointerleave", this.onLeave);
  }
}
