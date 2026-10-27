"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SkillGraph, SkillNode } from "@/lib/skills-graph";
import { SKILLS_REPO_URL } from "@/lib/skills-graph";
import { layoutGraph, type Vec3 } from "./constellation-layout";

// The ark-skills graph as a slowly turning 3D constellation: every skill,
// agent, and hook is a glowing node clustered by family, references are
// curved threads with light running along them. Hover or tap a node to light
// up its neighborhood; the panel beside it reads out what that node is.
// Three.js loads only when this component mounts.

const BG = "#0A100D";
const KIND_LABEL: Record<SkillNode["kind"], string> = { skill: "Skill", agent: "Subagent", hook: "Hook" };
const CURVE_SEGMENTS = 18;
const AMBIENT_PULSES = 14;

type Focus = { selected: string | null; hovered: string | null; family: string | null };

interface SceneApi {
  setFocus: (f: Focus) => void;
}

export default function SkillsConstellation({ graph }: { graph: SkillGraph }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<SceneApi | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [family, setFamily] = useState<string | null>(null);
  const [noWebGL, setNoWebGL] = useState(false);
  const focusRef = useRef<Focus>({ selected: null, hovered: null, family: null });

  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const familyLabel = useMemo(() => new Map(graph.families.map((f) => [f.id, f.label])), [graph]);

  useEffect(() => {
    focusRef.current = { selected, hovered, family };
    apiRef.current?.setFocus(focusRef.current);
  }, [selected, hovered, family]);

  useEffect(() => {
    const mount = mountRef.current;
    const overlay = overlayRef.current;
    if (!mount || !overlay) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (disposed) return;

      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true });
      } catch {
        setNoWebGL(true);
        return;
      }
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(BG);
      mount.insertBefore(renderer.domElement, overlay);
      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(BG, 0.028);
      const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
      camera.position.set(0, 4, 27);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.minDistance = 8;
      controls.maxDistance = 44;
      controls.autoRotate = !reduced;
      controls.autoRotateSpeed = 0.45;

      scene.add(new THREE.AmbientLight(0xffffff, 0.55));
      const key = new THREE.PointLight(0xffffff, 60, 0, 1.6);
      key.position.set(6, 10, 14);
      scene.add(key);

      const layout = layoutGraph(graph);
      const nodes = graph.nodes;
      const nodeIndex = new Map(nodes.map((n, i) => [n.id, i]));
      const vec = (p: Vec3) => new THREE.Vector3(p[0], p[1], p[2]);
      const pos = nodes.map((n) => vec(layout.positions.get(n.id)!));
      const neighbors = nodes.map(() => new Set<number>());
      graph.edges.forEach((e) => {
        const s = nodeIndex.get(e.source)!, t = nodeIndex.get(e.target)!;
        neighbors[s].add(t);
        neighbors[t].add(s);
      });

      // A soft round sprite, shared by node halos, pulses, and stars.
      const glowCanvas = document.createElement("canvas");
      glowCanvas.width = glowCanvas.height = 64;
      const g2 = glowCanvas.getContext("2d")!;
      const grad = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g2.fillStyle = grad;
      g2.fillRect(0, 0, 64, 64);
      const glowTex = new THREE.CanvasTexture(glowCanvas);

      // Stars: a faint field far behind the graph.
      const starCount = 700;
      const starPos = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount; i++) {
        const v = new THREE.Vector3().randomDirection().multiplyScalar(45 + Math.random() * 40);
        v.toArray(starPos, i * 3);
      }
      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
      const starMat = new THREE.PointsMaterial({ size: 0.35, map: glowTex, color: 0x5d7a6a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      const stars = new THREE.Points(starGeo, starMat);
      scene.add(stars);

      // Nodes: a lit sphere plus an additive halo each.
      const sphereGeo = new THREE.SphereGeometry(1, 28, 20);
      const meshes = nodes.map((n, i) => {
        const color = new THREE.Color(n.color);
        const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.35, metalness: 0.15, transparent: true });
        const m = new THREE.Mesh(sphereGeo, mat);
        const r = layout.radius.get(n.id)!;
        m.scale.setScalar(r);
        m.position.copy(pos[i]);
        m.userData.index = i;
        scene.add(m);
        return m;
      });
      const halos = nodes.map((n, i) => {
        const mat = new THREE.SpriteMaterial({ map: glowTex, color: n.color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
        const s = new THREE.Sprite(mat);
        const r = layout.radius.get(n.id)!;
        s.scale.setScalar(r * 6);
        s.position.copy(pos[i]);
        scene.add(s);
        return s;
      });

      // Edges: each reference is a curve bowed away from the center, drawn as
      // line segments with a gradient from its source's color to its target's.
      const curves = graph.edges.map((e) => {
        const a = pos[nodeIndex.get(e.source)!], b = pos[nodeIndex.get(e.target)!];
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const out = mid.lengthSq() > 1e-4 ? mid.clone().normalize() : new THREE.Vector3(0, 1, 0);
        const control = mid.clone().addScaledVector(out, mid.length() * 0.18 + a.distanceTo(b) * 0.15 + 0.4);
        return new THREE.QuadraticBezierCurve3(a, control, b);
      });
      const segs = graph.edges.length * CURVE_SEGMENTS;
      const edgePos = new Float32Array(segs * 6);
      const edgeBase = new Float32Array(segs * 6);
      const edgeCol = new Float32Array(segs * 6);
      const cA = new THREE.Color(), cB = new THREE.Color(), cMix = new THREE.Color();
      curves.forEach((curve, ei) => {
        const pts = curve.getPoints(CURVE_SEGMENTS);
        const e = graph.edges[ei];
        cA.set(byId.get(e.source)!.color);
        cB.set(byId.get(e.target)!.color);
        for (let s = 0; s < CURVE_SEGMENTS; s++) {
          const o = (ei * CURVE_SEGMENTS + s) * 6;
          pts[s].toArray(edgePos, o);
          pts[s + 1].toArray(edgePos, o + 3);
          cMix.copy(cA).lerp(cB, s / CURVE_SEGMENTS).toArray(edgeBase, o);
          cMix.copy(cA).lerp(cB, (s + 1) / CURVE_SEGMENTS).toArray(edgeBase, o + 3);
        }
      });
      const edgeGeo = new THREE.BufferGeometry();
      edgeGeo.setAttribute("position", new THREE.BufferAttribute(edgePos, 3));
      edgeGeo.setAttribute("color", new THREE.BufferAttribute(edgeCol, 3));
      const edgeMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      scene.add(new THREE.LineSegments(edgeGeo, edgeMat));

      // Pulses: points of light that travel source to target along a curve.
      const maxPulses = Math.max(AMBIENT_PULSES, graph.edges.length);
      const pulsePos = new Float32Array(maxPulses * 3);
      const pulseCol = new Float32Array(maxPulses * 3);
      const pulseGeo = new THREE.BufferGeometry();
      pulseGeo.setAttribute("position", new THREE.BufferAttribute(pulsePos, 3));
      pulseGeo.setAttribute("color", new THREE.BufferAttribute(pulseCol, 3));
      const pulseMat = new THREE.PointsMaterial({ size: 0.55, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      scene.add(new THREE.Points(pulseGeo, pulseMat));
      let pulses: { edge: number; t: number; speed: number }[] = [];
      const randomPulse = () => ({ edge: Math.floor(Math.random() * graph.edges.length), t: Math.random(), speed: 0.12 + Math.random() * 0.14 });

      // Labels are HTML, positioned each frame, so they stay crisp at any size.
      const familyMembers = new Map<string, number[]>();
      nodes.forEach((n, i) => familyMembers.set(n.family, [...(familyMembers.get(n.family) ?? []), i]));
      const familyLabelPos = new Map<string, InstanceType<typeof THREE.Vector3>>();
      for (const [fid, members] of familyMembers) {
        const c = new THREE.Vector3();
        members.forEach((i) => c.add(pos[i]));
        c.divideScalar(members.length);
        let spread = 0;
        members.forEach((i) => (spread = Math.max(spread, pos[i].distanceTo(c))));
        familyLabelPos.set(fid, c.clone().add(c.clone().setLength(spread + 1.1)).add(new THREE.Vector3(0, -0.4, 0)));
      }
      const mk = (text: string, style: string) => {
        const el = document.createElement("span");
        el.textContent = text;
        el.style.cssText = `position:absolute;left:0;top:0;white-space:nowrap;will-change:transform;transition:opacity .35s;${style}`;
        overlay.appendChild(el);
        return el;
      };
      const familyEls = graph.families.map((f) => ({
        id: f.id,
        el: mk(f.label.toUpperCase(), "font-family:var(--font-mono);font-size:10px;letter-spacing:.18em;color:#7E9A8A;"),
      }));
      const nodeEls = nodes.map((n) =>
        mk(n.name, "font-family:var(--font-mono);font-size:11px;color:#E6EEE8;padding:1px 6px;border-radius:2px;background:rgba(10,16,13,.72);"),
      );

      // Which nodes and edges are lit, from the current focus.
      const nodeLevel = new Float32Array(nodes.length).fill(1);
      const nodeTarget = new Float32Array(nodes.length).fill(1);
      const labelTarget = new Float32Array(nodes.length);
      const edgeLevel = new Float32Array(graph.edges.length).fill(0.22);
      const edgeTarget = new Float32Array(graph.edges.length).fill(0.22);
      let focusNode: number | null = null;
      let litEdges: number[] = [];
      const applyFocus = (f: Focus) => {
        const id = f.hovered ?? f.selected;
        focusNode = id ? nodeIndex.get(id) ?? null : null;
        litEdges = [];
        nodes.forEach((n, i) => {
          if (focusNode !== null) {
            const on = i === focusNode || neighbors[focusNode].has(i);
            nodeTarget[i] = on ? 1 : 0.12;
            labelTarget[i] = on ? 1 : 0;
          } else if (f.family) {
            nodeTarget[i] = n.family === f.family ? 1 : 0.15;
            labelTarget[i] = n.family === f.family ? 1 : 0;
          } else {
            nodeTarget[i] = 1;
            labelTarget[i] = 0;
          }
        });
        graph.edges.forEach((e, ei) => {
          const s = nodeIndex.get(e.source)!, t = nodeIndex.get(e.target)!;
          let lvl = 0.22;
          if (focusNode !== null) lvl = s === focusNode || t === focusNode ? 1 : 0.03;
          else if (f.family) lvl = byId.get(e.source)!.family === f.family || byId.get(e.target)!.family === f.family ? 0.75 : 0.04;
          edgeTarget[ei] = lvl;
          if (focusNode !== null && lvl === 1) litEdges.push(ei);
        });
        familyEls.forEach(({ id, el }) => {
          const focusFamily = focusNode !== null ? nodes[focusNode].family : f.family;
          el.style.opacity = focusFamily && focusFamily !== id ? "0.25" : "1";
        });
        // no pulses for reduced motion, and none to place on a graph without edges
        pulses = reduced || !graph.edges.length
          ? []
          : litEdges.length
            ? litEdges.flatMap((edge) => [0, 0.5].map((t0) => ({ edge, t: t0, speed: 0.45 })))
            : Array.from({ length: AMBIENT_PULSES }, randomPulse);
        controls.autoRotate = !reduced && f.selected === null && f.hovered === null;
      };
      apiRef.current = { setFocus: applyFocus };
      applyFocus(focusRef.current);

      const resize = () => {
        const w = mount.clientWidth, h = mount.clientHeight;
        renderer.setSize(w, h);
        camera.aspect = w / Math.max(1, h);
        camera.updateProjectionMatrix();
      };
      resize();
      if (camera.aspect < 1) camera.position.setLength(27 / Math.max(0.6, camera.aspect));
      const ro = new ResizeObserver(resize);
      ro.observe(mount);

      // Pointer: hover lights a node, a click or tap selects it, a click on
      // empty space clears. A drag (orbit) is not a click.
      const ray = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      const pick = (e: PointerEvent) => {
        const r = renderer.domElement.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const hit = ray.intersectObjects(meshes)[0];
        return hit ? nodes[hit.object.userData.index as number].id : null;
      };
      let down: { x: number; y: number } | null = null;
      const onMove = (e: PointerEvent) => {
        if (e.pointerType !== "mouse") return;
        const id = pick(e);
        renderer.domElement.style.cursor = id ? "pointer" : "grab";
        setHovered((prev) => (prev === id ? prev : id));
      };
      const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
      const onUp = (e: PointerEvent) => {
        if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
        const id = pick(e);
        setSelected((prev) => (id === null ? null : prev === id ? null : id));
        setFamily(null);
      };
      const onLeave = () => setHovered(null);
      const el = renderer.domElement;
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerdown", onDown);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointerleave", onLeave);

      const clock = new THREE.Clock();
      const target = new THREE.Vector3();
      const proj = new THREE.Vector3();
      let raf = 0;
      const placeLabel = (span: HTMLSpanElement, p: InstanceType<typeof THREE.Vector3>, w: number, h: number, opacity: number) => {
        proj.copy(p).project(camera);
        const visible = proj.z < 1 && opacity > 0.02;
        span.style.display = visible ? "block" : "none";
        if (!visible) return;
        // kept inside the panel so a label near the edge never clips
        const half = span.offsetWidth / 2 + 8;
        const x = Math.min(w - half, Math.max(half, ((proj.x + 1) / 2) * w));
        span.style.transform = `translate(-50%, 0) translate(${x}px, ${((1 - proj.y) / 2) * h}px)`;
      };
      const loop = () => {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.05, clock.getDelta());
        const ease = 1 - Math.pow(0.001, dt);

        // ease the orbit center toward the selected node, or back home
        const sel = focusRef.current.selected;
        target.set(0, 0, 0);
        if (sel && nodeIndex.has(sel)) target.copy(pos[nodeIndex.get(sel)!]).multiplyScalar(0.6);
        controls.target.lerp(target, reduced ? 1 : ease * 0.6);
        controls.update();

        const t = clock.elapsedTime;
        nodes.forEach((n, i) => {
          nodeLevel[i] += (nodeTarget[i] - nodeLevel[i]) * ease;
          const isFocus = i === focusNode;
          const breathe = 1 + Math.sin(t * 1.6 + i) * 0.04 + (isFocus ? 0.25 : 0);
          const r = layout.radius.get(n.id)!;
          meshes[i].scale.setScalar(r * breathe);
          const mat = meshes[i].material as InstanceType<typeof THREE.MeshStandardMaterial>;
          mat.opacity = 0.25 + nodeLevel[i] * 0.75;
          mat.emissiveIntensity = 0.2 + nodeLevel[i] * (isFocus ? 1.1 : 0.45);
          halos[i].material.opacity = nodeLevel[i] * (isFocus ? 0.95 : 0.5);
          halos[i].scale.setScalar(r * (isFocus ? 9 : 6) * breathe);
        });
        let dirty = false;
        for (let ei = 0; ei < edgeLevel.length; ei++) {
          const next = edgeLevel[ei] + (edgeTarget[ei] - edgeLevel[ei]) * ease;
          if (Math.abs(next - edgeLevel[ei]) > 1e-4 || edgeCol[ei * CURVE_SEGMENTS * 6] === 0) {
            edgeLevel[ei] = next;
            const o = ei * CURVE_SEGMENTS * 6;
            for (let k = 0; k < CURVE_SEGMENTS * 6; k++) edgeCol[o + k] = edgeBase[o + k] * next;
            dirty = true;
          }
        }
        if (dirty) edgeGeo.attributes.color.needsUpdate = true;

        // pulses: advance, wrap, and (when ambient) hop to a new edge
        const p3 = new THREE.Vector3();
        for (let k = 0; k < maxPulses; k++) {
          const pulse = pulses[k];
          if (!pulse) {
            pulsePos[k * 3 + 1] = 9999;
            continue;
          }
          pulse.t += pulse.speed * dt;
          if (pulse.t > 1) {
            if (litEdges.length) pulse.t -= 1;
            else Object.assign(pulse, randomPulse(), { t: 0 });
          }
          curves[pulse.edge].getPoint(pulse.t, p3).toArray(pulsePos, k * 3);
          const e = graph.edges[pulse.edge];
          const fade = Math.sin(Math.PI * pulse.t);
          cMix.set(byId.get(e.source)!.color).lerp(cB.set(byId.get(e.target)!.color), pulse.t);
          cMix.multiplyScalar(litEdges.length ? fade : fade * 0.7).toArray(pulseCol, k * 3);
        }
        pulseGeo.attributes.position.needsUpdate = true;
        pulseGeo.attributes.color.needsUpdate = true;
        stars.rotation.y += dt * 0.004;

        renderer.render(scene, camera);

        const w = mount.clientWidth, h = mount.clientHeight;
        familyEls.forEach(({ id, el: span }) => placeLabel(span, familyLabelPos.get(id)!, w, h, 1));
        nodes.forEach((n, i) => {
          const span = nodeEls[i];
          const lbl = labelTarget[i];
          span.style.opacity = String(lbl);
          span.style.fontWeight = i === focusNode ? "600" : "400";
          const below = pos[i].clone().add(new THREE.Vector3(0, -(layout.radius.get(n.id)! + 0.25), 0));
          placeLabel(span, below, w, h, lbl);
        });
      };
      const stop = () => {
        cancelAnimationFrame(raf);
        raf = 0;
      };
      const io = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) {
          if (!raf) {
            clock.getDelta();
            loop();
          }
        } else stop();
      });
      io.observe(mount);

      cleanup = () => {
        stop();
        io.disconnect();
        ro.disconnect();
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerdown", onDown);
        el.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointerleave", onLeave);
        controls.dispose();
        meshes.forEach((m) => (m.material as InstanceType<typeof THREE.Material>).dispose());
        halos.forEach((s) => s.material.dispose());
        [sphereGeo, edgeGeo, pulseGeo, starGeo].forEach((g) => g.dispose());
        [edgeMat, pulseMat, starMat].forEach((m) => m.dispose());
        glowTex.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        overlay.replaceChildren();
        apiRef.current = null;
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [graph, byId]);

  const shown = byId.get(hovered ?? selected ?? "") ?? null;
  const counts = {
    skill: graph.nodes.filter((n) => n.kind === "skill").length,
    agent: graph.nodes.filter((n) => n.kind === "agent").length,
    hook: graph.nodes.filter((n) => n.kind === "hook").length,
  };

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-0 overflow-hidden rounded-sm border border-[#1F2B24] bg-[#0A100D] text-[#E6EEE8]">
      <div
        ref={mountRef}
        role="img"
        aria-label={`A 3D map of ${graph.nodes.length} skills, subagents, and hooks, grouped into ${graph.families.length} families, with ${graph.edges.length} references between them.`}
        className="relative h-[62vh] min-h-[440px] lg:h-[72vh] cursor-grab active:cursor-grabbing touch-none"
      >
        <div ref={overlayRef} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" />
        {noWebGL && (
          <p className="meta absolute inset-0 flex items-center justify-center px-6 text-center text-[#9FB0A6]">
            This browser has WebGL turned off, so the graph can&apos;t be drawn here. Every skill is listed below.
          </p>
        )}
        <p className="pointer-events-none absolute left-4 bottom-3 font-mono text-[10px] tracking-[0.14em] uppercase text-[#6F8578]">
          Drag to orbit · scroll to zoom · tap a node
        </p>
      </div>

      <aside className="border-t lg:border-t-0 lg:border-l border-[#1F2B24] p-5 lg:h-[72vh] lg:overflow-y-auto">
        {shown ? (
          <NodeDetail
            node={shown}
            graph={graph}
            familyLabel={familyLabel.get(shown.family) ?? shown.family}
            byId={byId}
            onPick={(id) => {
              setSelected(id);
              setHovered(null);
              setFamily(null);
            }}
            onClear={selected ? () => setSelected(null) : undefined}
          />
        ) : (
          <div>
            <p className="text-sm leading-relaxed text-[#C9D6CE]">
              {counts.skill} skills, {counts.agent} subagents, and {counts.hook} hooks, with {graph.edges.length} references between them.
            </p>
            <p className="mt-6 font-mono text-[10px] tracking-[0.16em] uppercase text-[#6F8578] mb-3">Families</p>
            <ul className="space-y-1">
              {graph.families.map((f) => {
                const on = family === f.id;
                const size = graph.nodes.filter((n) => n.family === f.id).length;
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        setSelected(null);
                        setFamily(on ? null : f.id);
                      }}
                      className={`flex w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left text-sm transition-colors ${on ? "bg-white/[0.06] text-white" : "text-[#C9D6CE] hover:bg-white/[0.04]"}`}
                    >
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: f.color, boxShadow: `0 0 10px ${f.color}` }} />
                      {f.label}
                      <span className="ml-auto font-mono text-xs text-[#6F8578]">{size}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-6 text-sm leading-relaxed text-[#9FB0A6]">
              Size follows each file&apos;s length. Pick a family, or hover or tap a node to see what it does and what it references.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

function NodeDetail({
  node,
  graph,
  familyLabel,
  byId,
  onPick,
  onClear,
}: {
  node: SkillNode;
  graph: SkillGraph;
  familyLabel: string;
  byId: Map<string, SkillNode>;
  onPick: (id: string) => void;
  onClear?: () => void;
}) {
  const out = graph.edges.filter((e) => e.source === node.id).map((e) => byId.get(e.target)!);
  const inc = graph.edges.filter((e) => e.target === node.id).map((e) => byId.get(e.source)!);
  const list = (title: string, items: SkillNode[]) =>
    items.length > 0 && (
      <div className="mt-5">
        <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#6F8578] mb-2">
          {title} <span className="text-[#9FB0A6]">{items.length}</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {items.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onPick(n.id)}
              className="rounded-full border border-[#2A3a31] px-2 py-0.5 text-xs text-[#C9D6CE] hover:border-[#4C6658] hover:text-white transition-colors"
            >
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: n.color }} />
              {n.name}
            </button>
          ))}
        </div>
      </div>
    );

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-[10px] tracking-[0.16em] uppercase" style={{ color: node.color }}>
          {KIND_LABEL[node.kind]}
        </span>
        <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#6F8578]">· {familyLabel}</span>
        {onClear && (
          <button type="button" onClick={onClear} className="ml-auto font-mono text-[10px] uppercase tracking-[0.14em] text-[#9FB0A6] hover:text-white">
            Clear
          </button>
        )}
      </div>
      <h3 className="font-display text-2xl font-semibold text-white break-words">{node.name}</h3>
      <p className="mt-1 font-mono text-[11px] text-[#9FB0A6]">
        {node.lines} lines{node.vendored ? " · vendored" : ""}
        {node.evalStatus && node.evalStatus !== "unmeasured" ? ` · ${node.evalStatus}` : ""}
      </p>
      {node.description && <p className="mt-4 text-sm leading-relaxed text-[#C9D6CE]">{node.description}</p>}
      {list("References", out)}
      {list("Referenced by", inc)}
      {node.path && (
        <a
          href={`${SKILLS_REPO_URL}/blob/main/${node.path}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-block font-mono text-[11px] text-[#4ADE80] hover:underline"
        >
          Read the source ↗
        </a>
      )}
    </div>
  );
}
