"use client";

// Replays one episode in 3D. The timeline is rebuilt from the episode's
// logged outcome, so what plays is what the policy check decided, not a
// separate physics run. Loaded with next/dynamic so three stays out of the
// shared bundle.

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { BIN, GRIP_LEN, L1, L2, MAX_OPEN, SHOULDER_Y, type Episode } from "./sim";

type Vec = [number, number, number];
interface Key {
  t: number;
  p: Vec; // fingertip center
  open: number;
  yaw: number; // wrist yaw relative to the base
}
interface Timeline {
  keys: Key[];
  attach: number | null;
  detach: number | null;
  restY: number; // where a released object comes to rest
  restAt: { x: number; z: number } | null; // bin, if placed
  tip: [number, number] | null; // distractor tip-over window
  end: number;
}

const HOME: Vec = [0.22, 0.22, 0];
const PREGRASP = 0.12;
const BIN_FLOOR = 0.012;

function buildTimeline(ep: Episode): Timeline {
  const s = ep.scene;
  const tipY = Math.max(s.h * 0.5, 0.015);
  const pre: Vec = [ep.est.x, s.h + PREGRASP, ep.est.z];
  const grasp: Vec = [ep.est.x, tipY, ep.est.z];
  const w = ep.wristYaw;
  const k = (t: number, p: Vec, open = MAX_OPEN, yaw = w): Key => ({ t, p, open, yaw });
  const start = [k(0, HOME, MAX_OPEN, 0), k(1, pre)];
  const base = { attach: null, detach: null, restY: s.h / 2, restAt: null, tip: null };

  switch (ep.symptom) {
    case "ik_fail":
      return { ...base, keys: [...start, k(1.8, pre), k(2.6, HOME, MAX_OPEN, 0)], end: 3.2 };
    case "too_wide": {
      const stop: Vec = [ep.est.x, s.h + 0.012, ep.est.z];
      return { ...base, keys: [...start, k(1.5, stop), k(1.9, stop), k(2.3, pre), k(3, HOME, MAX_OPEN, 0)], end: 3.5 };
    }
    case "contact": {
      const stop: Vec = [ep.est.x, Math.max(0.125, tipY), ep.est.z];
      return {
        ...base,
        tip: [1.35, 1.65],
        keys: [...start, k(1.35, stop), k(1.6, stop), k(1.95, pre), k(2.7, HOME, MAX_OPEN, 0)],
        end: 3.3,
      };
    }
    case "empty_close":
      return {
        ...base,
        keys: [...start, k(1.6, grasp), k(1.9, grasp, 0), k(2.5, pre, 0), k(3.2, HOME, MAX_OPEN, 0)],
        end: 3.7,
      };
    case "slip":
      return {
        ...base,
        attach: 1.9,
        detach: 2.2,
        keys: [...start, k(1.6, grasp), k(1.9, grasp, ep.graspWidth), k(2.5, pre, ep.graspWidth), k(3.2, HOME, MAX_OPEN, 0)],
        end: 3.8,
      };
    default: {
      const over: Vec = [BIN.x, s.h + 0.1, BIN.z];
      return {
        ...base,
        attach: 1.9,
        detach: 3.7,
        restY: BIN_FLOOR + s.h / 2,
        restAt: BIN,
        keys: [
          ...start,
          k(1.6, grasp),
          k(1.9, grasp, ep.graspWidth),
          k(2.5, pre, ep.graspWidth),
          k(3.4, over, ep.graspWidth, 0),
          k(3.7, over, MAX_OPEN, 0),
          k(4.4, HOME, MAX_OPEN, 0),
        ],
        end: 4.9,
      };
    }
  }
}

const ease = (x: number) => x * x * (3 - 2 * x);

function sample(keys: Key[], t: number): Key {
  if (t <= keys[0].t) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (t <= b.t) {
      const u = ease((t - a.t) / Math.max(1e-6, b.t - a.t));
      return {
        t,
        p: [a.p[0] + (b.p[0] - a.p[0]) * u, a.p[1] + (b.p[1] - a.p[1]) * u, a.p[2] + (b.p[2] - a.p[2]) * u],
        open: a.open + (b.open - a.open) * u,
        yaw: a.yaw + (b.yaw - a.yaw) * u,
      };
    }
  }
  return keys[keys.length - 1];
}

// Two-link IK for the wrist point, elbow up, clamped at full reach.
function solve(p: Vec) {
  const [x, y, z] = p;
  const wristY = y + GRIP_LEN;
  const base = Math.atan2(-z, x);
  const r = Math.hypot(x, z);
  const dz = wristY - SHOULDER_Y;
  const d = Math.min(Math.hypot(r, dz), L1 + L2 - 1e-4);
  const c2 = Math.max(-1, Math.min(1, (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2)));
  const q2 = Math.acos(c2);
  const q1 = Math.atan2(dz, r) + Math.atan2(L2 * Math.sin(q2), L1 + L2 * Math.cos(q2));
  return { base, shoulder: q1, elbow: -q2, wrist: -(q1 - q2) };
}

interface Props {
  episode: Episode;
}

export default function ArmViewer({ episode }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const episodeRef = useRef(episode);
  const resetRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    episodeRef.current = episode;
    resetRef.current?.();
  }, [episode]);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#101214");
    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 10);
    camera.position.set(0.86, 0.66, 0.56);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0.26, 0.04, 0.04);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 0.4;
    controls.maxDistance = 2;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.update();

    const hemi = new THREE.HemisphereLight("#dfe7ef", "#2a2622", 0.6);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight("#ffffff", 2.2);
    sun.position.set(0.6, 1.4, 0.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = -0.8;
    sc.right = 0.8;
    sc.top = 0.8;
    sc.bottom = -0.8;
    scene.add(sun);

    const table = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshStandardMaterial({ color: "#2a2c2f", roughness: 0.9 }));
    table.rotation.x = -Math.PI / 2;
    table.receiveShadow = true;
    scene.add(table);
    const grid = new THREE.GridHelper(2.4, 48, "#3a3d41", "#33363a");
    grid.position.y = 0.0005;
    scene.add(grid);

    // Reach envelope at table height, for reading IK failures.
    const reach = new THREE.Mesh(
      new THREE.RingGeometry(0.574, 0.58, 96, 1, -1.25, 2.5),
      new THREE.MeshBasicMaterial({ color: "#5d6670", side: THREE.DoubleSide }),
    );
    reach.rotation.x = -Math.PI / 2;
    reach.position.y = 0.001;
    scene.add(reach);

    const metal = new THREE.MeshStandardMaterial({ color: "#c9ced4", roughness: 0.35, metalness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: "#3b4148", roughness: 0.5, metalness: 0.4 });
    const shadowed = <T extends THREE.Object3D>(o: T) => {
      o.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) c.castShadow = true;
      });
      return o;
    };

    // Arm hierarchy: base yaw, shoulder pitch, elbow pitch, wrist pitch, wrist yaw.
    const baseG = new THREE.Group();
    scene.add(baseG);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, SHOULDER_Y, 32), dark);
    column.position.y = SHOULDER_Y / 2;
    baseG.add(shadowed(column));
    const shoulder = new THREE.Group();
    shoulder.position.y = SHOULDER_Y;
    baseG.add(shoulder);
    const link = (len: number, r: number) => {
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, r * 2, r * 2), metal);
      m.position.x = len / 2;
      const j = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.35, r * 1.35, r * 2.6, 24), dark);
      j.rotation.x = Math.PI / 2;
      g.add(shadowed(m), shadowed(j));
      return g;
    };
    shoulder.add(link(L1, 0.022));
    const elbow = new THREE.Group();
    elbow.position.x = L1;
    shoulder.add(elbow);
    elbow.add(link(L2, 0.017));
    const wrist = new THREE.Group();
    wrist.position.x = L2;
    elbow.add(wrist);
    const hand = new THREE.Group();
    wrist.add(hand);
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.025, MAX_OPEN + 0.02), dark);
    palm.position.y = -0.03;
    hand.add(shadowed(palm));
    const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.018, 16), metal);
    flange.position.y = -0.009;
    hand.add(shadowed(flange));
    const fingerLen = GRIP_LEN - 0.0425;
    const fingers = [-1, 1].map(() => {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.018, fingerLen, 0.008), metal);
      f.position.y = -0.0425 - fingerLen / 2;
      hand.add(shadowed(f));
      return f;
    });

    const bin = new THREE.Group();
    const binMat = new THREE.MeshStandardMaterial({ color: "#3d5a4a", roughness: 0.8 });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(0.16, BIN_FLOOR, 0.16), binMat);
    floor.position.y = BIN_FLOOR / 2;
    bin.add(floor);
    for (const [x, z, sx, sz] of [
      [0.075, 0, 0.01, 0.16],
      [-0.075, 0, 0.01, 0.16],
      [0, 0.075, 0.16, 0.01],
      [0, -0.075, 0.16, 0.01],
    ]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.05, sz), binMat);
      wall.position.set(x, 0.025, z);
      bin.add(wall);
    }
    bin.position.set(BIN.x, 0, BIN.z);
    bin.traverse((c) => ((c as THREE.Mesh).receiveShadow = true));
    scene.add(bin);

    const objMat = new THREE.MeshStandardMaterial({ color: "#d9893b", roughness: 0.6 });
    const obj = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), objMat);
    obj.castShadow = true;
    scene.add(obj);

    const distractor = new THREE.Group();
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 28), new THREE.MeshStandardMaterial({ color: "#7b8794", roughness: 0.4, metalness: 0.3 }));
    can.position.y = 0.06;
    can.castShadow = true;
    distractor.add(can);
    scene.add(distractor);

    // Where the policy thinks the object is.
    const estRing = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.016, 32), new THREE.MeshBasicMaterial({ color: "#6fc2ff" }));
    estRing.rotation.x = -Math.PI / 2;
    scene.add(estRing);

    let tl = buildTimeline(episodeRef.current);
    let t0 = performance.now();
    let attachOffset = new THREE.Vector3();
    let attachBase = 0;
    let tipDir = new THREE.Vector3(1, 0, 0);

    const reset = () => {
      const ep = episodeRef.current;
      const s = ep.scene;
      tl = buildTimeline(ep);
      t0 = performance.now();
      obj.scale.set(s.w, s.h, s.d);
      estRing.position.set(ep.est.x, 0.002, ep.est.z);
      distractor.visible = !!s.distractor;
      if (s.distractor) {
        tipDir = new THREE.Vector3(s.distractor.x - s.x, 0, s.distractor.z - s.z).normalize();
      }
      const grasp = sample(tl.keys, tl.attach ?? 0).p;
      attachOffset = new THREE.Vector3(s.x - grasp[0], s.h / 2 - grasp[1], s.z - grasp[2]);
      attachBase = Math.atan2(-grasp[2], grasp[0]);
      sun.intensity = 0.5 + 2.2 * s.light;
      hemi.intensity = 0.15 + 0.55 * s.light;
    };
    resetRef.current = reset;
    reset();

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const ep = episodeRef.current;
      const s = ep.scene;
      const t = ((performance.now() - t0) / 1000) % tl.end;
      const k = sample(tl.keys, t);
      const q = solve(k.p);
      baseG.rotation.y = q.base;
      shoulder.rotation.z = q.shoulder;
      elbow.rotation.z = q.elbow;
      wrist.rotation.z = q.wrist;
      hand.rotation.y = k.yaw;
      fingers[0].position.z = -k.open / 2 - 0.004;
      fingers[1].position.z = k.open / 2 + 0.004;

      const held = tl.attach !== null && t >= tl.attach && (tl.detach === null || t < tl.detach);
      if (held) {
        const off = attachOffset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), q.base - attachBase);
        obj.position.set(k.p[0] + off.x, k.p[1] + off.y, k.p[2] + off.z);
        obj.rotation.set(0, s.yaw + q.base - attachBase, 0);
      } else if (tl.attach !== null && tl.detach !== null && t >= tl.detach) {
        const at = sample(tl.keys, tl.detach);
        const qd = solve(at.p);
        const off = attachOffset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), qd.base - attachBase);
        const y0 = at.p[1] + off.y;
        const dt = t - tl.detach;
        const x = tl.restAt ? tl.restAt.x : at.p[0] + off.x;
        const z = tl.restAt ? tl.restAt.z : at.p[2] + off.z;
        obj.position.set(x, Math.max(tl.restY, y0 - 4.9 * dt * dt), z);
        obj.rotation.set(0, s.yaw + qd.base - attachBase, 0);
      } else {
        obj.position.set(s.x, s.h / 2, s.z);
        obj.rotation.set(0, s.yaw, 0);
      }

      if (s.distractor) {
        const u = tl.tip ? Math.max(0, Math.min(1, (t - tl.tip[0]) / (tl.tip[1] - tl.tip[0]))) : 0;
        const ang = (Math.PI / 2) * ease(u);
        distractor.position.set(s.distractor.x + tipDir.x * 0.03 * Math.sin(ang), 0, s.distractor.z + tipDir.z * 0.03 * Math.sin(ang));
        const axis = new THREE.Vector3(tipDir.z, 0, -tipDir.x);
        distractor.quaternion.setFromAxisAngle(axis, ang);
      }

      controls.update();
      renderer.render(scene, camera);
    };
    frame();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          const mat = m.material;
          (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose());
        }
      });
      el.removeChild(renderer.domElement);
      resetRef.current = null;
    };
  }, []);

  return <div ref={mount} className="w-full h-full" />;
}
