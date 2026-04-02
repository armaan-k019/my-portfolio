"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import * as THREE from "three";

// ─── Spotify SDK global types ─────────────────────────────────────────────────

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: { Player: new (opts: SpotifyPlayerOptions) => SpotifyPlayer };
  }
}

interface SpotifyPlayerOptions {
  name: string;
  getOAuthToken: (cb: (t: string) => void) => void;
  volume: number;
}

interface SpotifyPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  pause(): Promise<void>;
  resume(): Promise<void>;
  getCurrentState(): Promise<SpotifyPlaybackState | null>;
  on(event: string, cb: (data: unknown) => void): void;
}

interface SpotifyPlaybackState {
  paused: boolean;
  position: number;
  duration: number;
}

// ─── Domain types ─────────────────────────────────────────────────────────────

interface SpotifyTrack {
  id: string;
  uri: string;
  name: string;
  artists: { name: string }[];
  album: { images: { url: string; width: number; height: number }[] };
  duration_ms: number;
}

interface AudioFeatures {
  tempo: number;
  energy: number;
  danceability: number;
  valence: number;
}

interface SimAudio {
  bass: number;
  mid: number;
  treble: number;
  energy: number;
  beatPulse: number;
}

// ─── PKCE helpers ─────────────────────────────────────────────────────────────

function randomVerifier(len = 96): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => chars[b % chars.length]).join("");
}

async function makeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

// ─── Spotify API helpers ──────────────────────────────────────────────────────

// DEPLOYMENT CHECKLIST FOR TEMPO:
// 1. Deploy the site to your domain
// 2. Go to developer.spotify.com → Dashboard → Tempo app → Edit
// 3. Add your production URL as a redirect URI: https://yourdomain.com/projects/tempo
// 4. Save. No code changes needed - the redirect URI is derived from window.location.origin.

const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? "";
const SCOPES = "streaming user-read-email user-read-private user-modify-playback-state";

// Always derived from the current URL - works in local dev and production without config.
const getRedirectUri = () => {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/projects/tempo`;
};

async function startSpotifyAuth() {
  const verifier = randomVerifier();
  const challenge = await makeChallenge(verifier);
  localStorage.setItem("sp_verifier", verifier);
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: getRedirectUri(),
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  window.location.href = `https://accounts.spotify.com/authorize?${p}`;
}

async function exchangeToken(code: string): Promise<string> {
  const verifier = localStorage.getItem("sp_verifier") ?? "";
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: getRedirectUri(),
    code_verifier: verifier,
  });
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json() as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok) {
    throw new Error(data.error_description ?? data.error ?? `Token exchange failed (${res.status})`);
  }
  localStorage.removeItem("sp_verifier");
  return data.access_token!;
}

async function apiGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Spotify API ${res.status}`);
  return res.json() as Promise<T>;
}

async function startPlayback(deviceId: string, uri: string, token: string) {
  await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ uris: [uri] }),
  });
}

// ─── Color helpers ────────────────────────────────────────────────────────────

// Extract a palette of up to 4 distinct vibrant colors from an album art URL.
// Samples each quadrant of the image and picks the most saturated pixel in each.
function sampleAlbumPalette(url: string): Promise<[number, number, number][]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const SIZE = 40;
      const c = document.createElement("canvas");
      c.width = c.height = SIZE;
      const ctx = c.getContext("2d");
      if (!ctx) { resolve([[0.3, 0.3, 1.0]]); return; }
      ctx.drawImage(img, 0, 0, SIZE, SIZE);

      // Sample one vibrant color from each quadrant
      const half = SIZE / 2;
      const regions = [
        { x: 0, y: 0 }, { x: half, y: 0 },
        { x: 0, y: half }, { x: half, y: half },
      ];

      const palette: [number, number, number][] = [];
      for (const { x, y } of regions) {
        const d = ctx.getImageData(x, y, half, half).data;
        let bestR = 128, bestG = 128, bestB = 200, bestSat = -1;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const sat = max > 20 ? (max - min) / max : 0;
          if (sat > bestSat) { bestSat = sat; bestR = r; bestG = g; bestB = b; }
        }
        palette.push([bestR / 255, bestG / 255, bestB / 255]);
      }
      resolve(palette);
    };
    img.onerror = () => resolve([[0.3, 0.3, 1.0]]);
    img.src = url;
  });
}

function hslToRgb01(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, bv = 0;
  if (h < 60)       { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; bv = x; }
  else if (h < 240) { g = x; bv = c; }
  else if (h < 300) { r = x; bv = c; }
  else              { r = c; bv = x; }
  return [r + m, g + m, bv + m];
}

function energyToHue(e: number): number {
  if (e < 0.3) return 240 + (e / 0.3) * 40;        // 240-280 blues/purples
  if (e < 0.6) return 160 + ((e - 0.3) / 0.3) * 40; // 160-200 teals
  if (e < 0.8) return 30  + ((e - 0.6) / 0.2) * 30; // 30-60 yellows/oranges
  return 320 + ((e - 0.8) / 0.2) * 40;              // 320-360 reds/magentas
}

function hexToRgb01(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

// ─── Three.js scene builder ───────────────────────────────────────────────────

const N = 18000;
const GRID = Math.ceil(Math.sqrt(N));
const SPREAD = 480;

interface SceneObjects {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  posAttr: THREE.BufferAttribute;
  colAttr: THREE.BufferAttribute;
  material: THREE.PointsMaterial;
  baseY: Float32Array;
}

function buildScene(canvas: HTMLCanvasElement): SceneObjects {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.0025);

  const camera = new THREE.PerspectiveCamera(
    60, window.innerWidth / window.innerHeight, 0.1, 2000
  );
  camera.position.set(0, 70, 210);
  camera.lookAt(0, 0, 0);

  const positions = new Float32Array(N * 3);
  const colors    = new Float32Array(N * 3);
  const baseY     = new Float32Array(N);

  for (let i = 0; i < N; i++) {
    const xi = i % GRID;
    const zi = Math.floor(i / GRID);
    const x  = (xi / GRID - 0.5) * SPREAD;
    const z  = (zi / GRID - 0.5) * SPREAD;
    const y  =
      Math.sin(x * 0.042) * Math.cos(z * 0.042) * 18 +
      Math.sin(x * 0.018 + z * 0.014) * 9 +
      (Math.random() - 0.5) * 5;
    positions[i * 3]     = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    baseY[i] = y;
    colors[i * 3]     = 0.25;
    colors[i * 3 + 1] = 0.25;
    colors[i * 3 + 2] = 0.9;
  }

  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  const colAttr  = new THREE.BufferAttribute(colors, 3);
  geo.setAttribute("position", posAttr);
  geo.setAttribute("color", colAttr);

  const material = new THREE.PointsMaterial({
    size: 2.2,
    vertexColors: true,
    transparent: true,
    opacity: 0.88,
    sizeAttenuation: true,
    depthWrite: false,
  });

  scene.add(new THREE.Points(geo, material));
  return { renderer, scene, camera, posAttr, colAttr, material, baseY };
}

// ─── Simulated audio from Spotify audio features ──────────────────────────────

function simAudio(nowMs: number, startMs: number, f: AudioFeatures): SimAudio {
  const elapsed = (nowMs - startMs) / 1000;
  const beatSec = 60 / f.tempo;
  const phase   = (elapsed % beatSec) / beatSec;
  // sharp attack, quick decay for beat pulse
  const beatPulse = Math.pow(Math.max(0, Math.sin(phase * Math.PI * 2 - Math.PI * 0.5) + 0.15), 3);

  const bass   = Math.min(1, beatPulse * 0.75 * f.danceability + Math.sin(elapsed * 0.28) * 0.25 * f.energy);
  const mid    = (0.5 + 0.5 * Math.sin(elapsed * 0.67 + 1.1)) * f.energy * 0.85;
  const treble = (0.4 + 0.4 * Math.sin(elapsed * 1.4 + 2.3))  * (0.3 + f.valence * 0.5);
  const energy = bass * 0.4 + mid * 0.4 + treble * 0.2;

  return { bass, mid, treble, energy, beatPulse };
}

// ─── Component ────────────────────────────────────────────────────────────────

type AppState = "loading" | "connect" | "exchanging" | "search" | "playing" | "error";

function TempoInner() {
  const [appState,    setAppState]    = useState<AppState>("loading");
  const [query,       setQuery]       = useState("");
  const [results,     setResults]     = useState<SpotifyTrack[]>([]);
  const [searching,   setSearching]   = useState(false);
  const [noResults,   setNoResults]   = useState(false);
  const [track,       setTrack]       = useState<SpotifyTrack | null>(null);
  const [token,       setToken]       = useState<string | null>(null);
  const [isPlaying,   setIsPlaying]   = useState(false);
  const [progress,    setProgress]    = useState(0);
  const [hudVisible,  setHudVisible]  = useState(true);
  const [error,       setError]       = useState("");
  const [isPremium,   setIsPremium]   = useState(true);
  const [loading,     setLoading]     = useState(false);
  const [loadingMsg,  setLoadingMsg]  = useState("");
  const [userColor,   setUserColor]   = useState("#5588ff");
  const [useCustom,   setUseCustom]   = useState(false);

  // stable refs for values used inside animation loop / async closures
  const tokenRef        = useRef<string | null>(null);
  const featuresRef     = useRef<AudioFeatures>({ tempo: 120, energy: 0.6, danceability: 0.6, valence: 0.5 });
  const albumPaletteRef = useRef<[number, number, number][]>([[0.3, 0.3, 1.0]]);
  const startMsRef      = useRef(0);
  const progressRef     = useRef(0);
  const useCustomRef    = useRef(false);
  const userColorRef    = useRef("#5588ff");
  const curColorRef     = useRef<[number, number, number]>([0.25, 0.25, 0.9]);
  const isPlayingRef    = useRef(false);

  // DOM / Three.js refs
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const playerRef     = useRef<SpotifyPlayer | null>(null);
  const deviceIdRef   = useRef("");
  const animIdRef     = useRef(0);
  const hudTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // keep refs in sync
  useEffect(() => { tokenRef.current     = token; },     [token]);
  useEffect(() => { progressRef.current  = progress; },  [progress]);
  useEffect(() => { useCustomRef.current = useCustom; }, [useCustom]);
  useEffect(() => { userColorRef.current = userColor; }, [userColor]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // ── OAuth callback on mount ──────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code  = params.get("code");
    const oauthErr = params.get("error");

    // Already have a valid token from a previous session
    const stored = sessionStorage.getItem("sp_token");
    if (stored) {
      setToken(stored);
      tokenRef.current = stored;
      setAppState("search");
      return;
    }

    if (oauthErr) {
      setError(`Spotify auth error: ${oauthErr}`);
      window.history.replaceState({}, "", "/projects/tempo");
      setAppState("error");
      return;
    }

    if (code) {
      setAppState("exchanging");
      window.history.replaceState({}, "", "/projects/tempo");
      exchangeToken(code)
        .then((t) => {
          sessionStorage.setItem("sp_token", t);
          setToken(t);
          tokenRef.current = t;
          setAppState("search");
        })
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : "Auth failed. Please try connecting again.");
          setAppState("error");
        });
      return;
    }

    setAppState("connect");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Debounced search ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!query.trim() || query.length < 2) { setResults([]); setNoResults(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!tokenRef.current) return;
      setSearching(true);
      try {
        const data = await apiGet<{ tracks: { items: SpotifyTrack[] } }>(
          `/search?q=${encodeURIComponent(query)}&type=track&limit=6`, tokenRef.current
        );
        setResults(data.tracks.items);
        setNoResults(data.tracks.items.length === 0);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 350);
  }, [query]);

  // ── Init Spotify SDK ─────────────────────────────────────────────────────
  const initPlayer = useCallback((accessToken: string) => {
    if (playerRef.current) return;

    const create = () => {
      if (!window.Spotify) return;
      const p = new window.Spotify.Player({
        name: "Tempo",
        getOAuthToken: (cb) => cb(accessToken),
        volume: 0.8,
      });
      p.on("ready", (d: unknown) => {
        deviceIdRef.current = (d as { device_id: string }).device_id;
      });
      p.on("account_error", () => {
        setIsPremium(false);
        setError("Tempo requires a Spotify Premium account for playback.");
      });
      p.on("authentication_error", () => {
        sessionStorage.removeItem("sp_token");
        setToken(null);
        setError("Spotify session expired. Please reconnect.");
      });
      p.on("player_state_changed", (s: unknown) => {
        if (!s) return;
        const state = s as SpotifyPlaybackState;
        setIsPlaying(!state.paused);
        if (state.duration > 0) { setProgress(state.position / state.duration); progressRef.current = state.position / state.duration; }
      });
      p.connect();
      playerRef.current = p;
    };

    window.onSpotifyWebPlaybackSDKReady = create;
    if (document.getElementById("sp-sdk")) { if (window.Spotify) create(); return; }
    const s = document.createElement("script");
    s.id = "sp-sdk";
    s.src = "https://sdk.scdn.co/spotify-player.js";
    document.head.appendChild(s);
  }, []);

  // ── Play a track ─────────────────────────────────────────────────────────
  const playTrack = useCallback(async (t: SpotifyTrack) => {
    if (!tokenRef.current) { sessionStorage.setItem("sp_pending", JSON.stringify(t)); await startSpotifyAuth(); return; }
    setLoading(true); setLoadingMsg("Loading visualization…"); setTrack(t);
    try {
      initPlayer(tokenRef.current);
      // wait for SDK device (up to 8s)
      let attempts = 0;
      while (!deviceIdRef.current && attempts < 27) { await new Promise(r => setTimeout(r, 300)); attempts++; }
      if (!deviceIdRef.current) throw new Error("Could not connect to Spotify player. Make sure you have Spotify Premium.");

      // audio features
      try {
        const f = await apiGet<AudioFeatures>(`/audio-features/${t.id}`, tokenRef.current!);
        featuresRef.current = f;
      } catch { /* keep defaults */ }

      // album color palette
      const imgUrl = t.album.images[0]?.url;
      if (imgUrl) {
        albumPaletteRef.current = await sampleAlbumPalette(imgUrl);
      }

      await startPlayback(deviceIdRef.current, t.uri, tokenRef.current!);
      startMsRef.current = Date.now();
      setAppState("playing");
      setIsPlaying(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Playback failed.");
    } finally {
      setLoading(false);
    }
  }, [initPlayer]);

  // play pending track after auth redirect
  useEffect(() => {
    if (!token) return;
    const pending = sessionStorage.getItem("sp_pending");
    if (!pending) return;
    sessionStorage.removeItem("sp_pending");
    try { playTrack(JSON.parse(pending) as SpotifyTrack); } catch { /* */ }
  }, [token, playTrack]);

  // ── Three.js animation ───────────────────────────────────────────────────
  useEffect(() => {
    if (appState !== "playing" || !canvasRef.current) return;

    const { renderer, scene, camera, posAttr, colAttr, material, baseY } =
      buildScene(canvasRef.current);

    let camAngle    = 0;
    let rippleR     = 0;
    let rippleOn    = false;
    let lastBeat    = 0;
    const lerp      = (a: number, b: number, t: number) => a + (b - a) * t;

    let paletteT = 0;

    function frame() {
      animIdRef.current = requestAnimationFrame(frame);

      // Freeze all updates while paused; keep rAF loop alive to resume smoothly
      if (!isPlayingRef.current) return;

      const f    = featuresRef.current;
      const audio = simAudio(Date.now(), startMsRef.current, f);

      // ── palette cycling: blend between adjacent palette colors every ~10s ──
      paletteT += 0.0008;
      const palette  = albumPaletteRef.current;
      const pLen     = palette.length;
      const pPhase   = paletteT % pLen;
      const pIdx     = Math.floor(pPhase);
      const pFrac    = pPhase - pIdx;
      const pA       = palette[pIdx % pLen];
      const pB       = palette[(pIdx + 1) % pLen];
      const ar = lerp(pA[0], pB[0], pFrac);
      const ag = lerp(pA[1], pB[1], pFrac);
      const ab = lerp(pA[2], pB[2], pFrac);

      // ── target color ──────────────────────────────────────────────────
      const hue   = energyToHue(audio.energy);
      const [hr, hg, hb] = hslToRgb01(hue, 0.8, 0.5);
      let tr = hr * 0.55 + ar * 0.45;
      let tg = hg * 0.55 + ag * 0.45;
      let tb = hb * 0.55 + ab * 0.45;
      if (useCustomRef.current) {
        const [ur, ug, ub] = hexToRgb01(userColorRef.current);
        tr = tr * 0.62 + ur * 0.38;
        tg = tg * 0.62 + ug * 0.38;
        tb = tb * 0.62 + ub * 0.38;
      }
      curColorRef.current[0] = lerp(curColorRef.current[0], tr, 0.018);
      curColorRef.current[1] = lerp(curColorRef.current[1], tg, 0.018);
      curColorRef.current[2] = lerp(curColorRef.current[2], tb, 0.018);
      const [cr, cg, cb] = curColorRef.current;

      // ── beat detection → ripple ────────────────────────────────────────
      if (audio.beatPulse > 0.68 && lastBeat <= 0.68) { rippleR = 0; rippleOn = true; }
      lastBeat = audio.beatPulse;
      if (rippleOn) { rippleR += 2.8; if (rippleR > SPREAD * 0.72) rippleOn = false; }

      // ── update particles ──────────────────────────────────────────────
      for (let i = 0; i < N; i++) {
        const xi = i % GRID;
        const zi = Math.floor(i / GRID);
        const x  = (xi / GRID - 0.5) * SPREAD;
        const z  = (zi / GRID - 0.5) * SPREAD;
        const dist = Math.sqrt(x * x + z * z);

        const wave  = Math.sin(dist * 0.048 - Date.now() * 0.00095 * f.tempo / 60) * audio.bass * 28;
        const swirl = Math.sin(Date.now() * 0.00045 + xi * 0.09) * audio.mid * 7;
        const ripple = rippleOn && Math.abs(dist - rippleR) < 22
          ? Math.exp(-Math.abs(dist - rippleR) * 0.12) * 28 * audio.beatPulse : 0;

        posAttr.setY(i, baseY[i] + wave + swirl + ripple);

        const bright = 1 + audio.treble * Math.max(0, 1 - dist / (SPREAD * 0.55)) * 0.9;
        colAttr.setXYZ(i, Math.min(1, cr * bright), Math.min(1, cg * bright), Math.min(1, cb * bright));
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;

      // ── material size pulse ───────────────────────────────────────────
      material.size = 1.9 + audio.treble * 1.6 + audio.beatPulse * 1.1;

      // ── camera orbit ──────────────────────────────────────────────────
      camAngle += 0.00028 + audio.mid * 0.00018;
      const camR = 200 + audio.bass * 22;
      const camH = 65  + audio.bass * 18;
      camera.position.set(Math.sin(camAngle) * camR, camH, Math.cos(camAngle) * camR);
      camera.lookAt(0, audio.bass * 6, 0);

      renderer.render(scene, camera);
    }

    animIdRef.current = requestAnimationFrame(frame);

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animIdRef.current);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
    };
  }, [appState]);

  // ── Player state polling ─────────────────────────────────────────────────
  useEffect(() => {
    if (appState !== "playing") return;
    const id = setInterval(async () => {
      const s = await playerRef.current?.getCurrentState();
      if (s) { setIsPlaying(!s.paused); if (s.duration > 0) setProgress(s.position / s.duration); }
    }, 800);
    return () => clearInterval(id);
  }, [appState]);

  // ── HUD auto-hide ────────────────────────────────────────────────────────
  const resetHud = useCallback(() => {
    setHudVisible(true);
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    hudTimerRef.current = setTimeout(() => setHudVisible(false), 3000);
  }, []);

  useEffect(() => {
    if (appState !== "playing") return;
    resetHud();
    window.addEventListener("mousemove", resetHud);
    return () => { window.removeEventListener("mousemove", resetHud); if (hudTimerRef.current) clearTimeout(hudTimerRef.current); };
  }, [appState, resetHud]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => { cancelAnimationFrame(animIdRef.current); playerRef.current?.disconnect(); };
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSelect = (t: SpotifyTrack) => { setResults([]); setQuery(""); playTrack(t); };

  const handleToggle = async () => {
    if (!playerRef.current) return;
    if (isPlaying) await playerRef.current.pause(); else await playerRef.current.resume();
  };

  const handleBack = () => {
    playerRef.current?.pause();
    setAppState("search"); setTrack(null); setQuery(""); setResults([]);
  };

  const thumbUrl = track?.album.images.find((i) => i.width <= 300)?.url ?? track?.album.images[0]?.url;
  const artist   = track?.artists.map((a) => a.name).join(", ") ?? "";

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen overflow-hidden font-sans">

      {/* ── Non-playing states - portfolio cream background ──────────────── */}
      <AnimatePresence>
        {appState !== "playing" && (
          <motion.div key="search" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}
            className="min-h-screen flex flex-col bg-cream text-brown">

            {/* Nav bar - matches rest of site */}
            <div className="max-w-5xl mx-auto w-full px-6 pt-8 pb-4">
              <Link href="/#projects" className="text-sm text-terracotta hover:text-terracotta-dark transition-colors">
                &larr; Back to projects
              </Link>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center px-6 pb-16">
              <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
                className="w-full max-w-md">

                {/* Title */}
                <div className="mb-8">
                  <p className="text-xs font-semibold tracking-widest uppercase text-terracotta mb-3">Project</p>
                  <h1 className="text-3xl font-semibold text-darkblue tracking-tight mb-1">Tempo</h1>
                  <p className="text-brown-light text-base">A generative music visualization experience.</p>
                </div>

                {/* Premium disclaimer */}
                <div className="mb-5 px-4 py-3 rounded-xl border border-tan/30 bg-white/40 space-y-1.5">
                  <p className="text-xs text-brown-light leading-relaxed">
                    <span className="font-semibold text-brown">Requires Spotify Premium.</span>{" "}
                    In-browser audio streaming is a Spotify Premium feature. Free accounts cannot use the Web Playback SDK.
                  </p>
                  <p className="text-xs text-brown-light leading-relaxed">
                    <span className="font-semibold text-brown">Your own account.</span>{" "}
                    Clicking &ldquo;Connect Spotify&rdquo; opens Spotify&apos;s login page where you authorize with your own credentials. No account is shared.
                  </p>
                </div>

                {/* Loading / exchanging spinner */}
                {(appState === "loading" || appState === "exchanging") && (
                  <div className="mb-5 flex items-center justify-center gap-3 py-2">
                    <div className="w-4 h-4 border-2 border-terracotta/30 border-t-terracotta rounded-full animate-spin" />
                    <p className="text-sm text-brown-light">
                      {appState === "exchanging" ? "Connecting to Spotify…" : ""}
                    </p>
                  </div>
                )}

                {/* Error state */}
                {appState === "error" && error && (
                  <div className="mb-4 p-3 rounded-lg bg-terracotta/10 border border-terracotta/20 text-sm text-terracotta">
                    {error}
                    {!isPremium && (
                      <p className="mt-1 text-xs text-terracotta/70">
                        Upgrade to Spotify Premium to use Tempo&apos;s audio streaming.
                      </p>
                    )}
                    <button onClick={() => { setError(""); setAppState("connect"); }}
                      className="mt-2 text-xs underline text-terracotta/80 hover:text-terracotta">
                      Try again
                    </button>
                  </div>
                )}

                {/* Connect button */}
                {appState === "connect" && (
                  <div className="mb-5">
                    <button onClick={() => startSpotifyAuth()}
                      className="w-full px-5 py-2.5 text-sm font-medium bg-terracotta text-white rounded-lg hover:bg-terracotta-dark transition-colors">
                      Connect with Spotify
                    </button>
                    <p className="text-xs text-brown-light mt-2 text-center">You&apos;ll be redirected to Spotify to sign in, then brought back here.</p>
                  </div>
                )}

                {/* Loading track */}
                {loading && appState === "search" && (
                  <div className="mb-5 flex items-center justify-center gap-3 py-2">
                    <div className="w-4 h-4 border-2 border-terracotta/30 border-t-terracotta rounded-full animate-spin" />
                    <p className="text-sm text-brown-light">{loadingMsg}</p>
                  </div>
                )}

                {/* Search input */}
                {appState === "search" && (
                  <div className="relative mb-4">
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search for a song…"
                      autoFocus
                      className="w-full rounded-lg border border-tan/40 bg-cream-dark/20 px-3 py-2.5 text-sm text-brown placeholder:text-brown-light/50 focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta/50 transition-colors"
                    />
                    {searching && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="w-4 h-4 border-2 border-terracotta/30 border-t-terracotta rounded-full animate-spin" />
                      </div>
                    )}

                    {/* Dropdown results */}
                    <AnimatePresence>
                      {results.length > 0 && (
                        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                          className="absolute top-full left-0 right-0 mt-1.5 rounded-xl border border-tan/30 bg-white/90 backdrop-blur-sm overflow-hidden z-10 shadow-lg">
                          {results.map((t, idx) => (
                            <button key={t.id} onClick={() => handleSelect(t)}
                              className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-tan/10 transition-colors ${idx > 0 ? "border-t border-tan/20" : ""}`}>
                              {t.album.images[2]?.url && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={t.album.images[2].url} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                              )}
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-darkblue truncate">{t.name}</p>
                                <p className="text-xs text-brown-light truncate">{t.artists.map(a => a.name).join(", ")}</p>
                              </div>
                            </button>
                          ))}
                        </motion.div>
                      )}
                      {noResults && query.length > 1 && !searching && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                          className="absolute top-full left-0 right-0 mt-1.5 rounded-xl border border-tan/30 bg-white/90 px-4 py-4 text-sm text-brown-light text-center">
                          No results for &ldquo;{query}&rdquo;
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* Custom color preference */}
                {appState === "search" && (
                  <div className="px-4 py-3.5 rounded-xl border border-tan/30 bg-white/40">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2.5 cursor-pointer select-none flex-1"
                        onClick={() => setUseCustom(!useCustom)}>
                        <div className={`w-8 h-4 rounded-full transition-colors relative shrink-0 ${useCustom ? "bg-terracotta" : "bg-tan/30"}`}>
                          <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all shadow-sm ${useCustom ? "left-4" : "left-0.5"}`} />
                        </div>
                        <span className="text-xs font-semibold uppercase tracking-wide text-brown-light">Color preference</span>
                      </div>
                      {useCustom && (
                        <input type="color" value={userColor} onChange={(e) => setUserColor(e.target.value)}
                          className="w-7 h-7 rounded-lg cursor-pointer border-0 bg-transparent p-0 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-brown-light/70 mt-2 leading-relaxed">
                      Tempo generates colors from the music&apos;s energy and album art. A color preference adds a personal tint and the system handles the rest.
                    </p>
                  </div>
                )}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Visualization state ──────────────────────────────────────────── */}
      <AnimatePresence>
        {appState === "playing" && (
          <motion.div key="viz" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.9 }} className="fixed inset-0">
            <canvas ref={canvasRef} className="block w-full h-full" />

            {/* HUD */}
            <AnimatePresence>
              {hudVisible && (
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
                  transition={{ duration: 0.25 }}
                  className="absolute bottom-0 left-0 right-0 px-6 py-6 flex items-center gap-4"
                  style={{ background: "linear-gradient(to top, rgba(10,11,13,0.85) 0%, transparent 100%)" }}>

                  {thumbUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbUrl} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0 shadow-xl" />
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "#F5F0E8" }}>{track?.name}</p>
                    <p className="text-xs truncate" style={{ color: "#6B5244" }}>{artist}</p>
                    <div className="mt-2 h-0.5 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(212,169,106,0.15)" }}>
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${progress * 100}%`, backgroundColor: "#C1513A" }} />
                    </div>
                  </div>

                  {/* Play/pause */}
                  <button onClick={handleToggle}
                    className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors shrink-0"
                    style={{ backgroundColor: "rgba(193,81,58,0.15)", border: "1px solid rgba(193,81,58,0.3)" }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = "rgba(193,81,58,0.28)")}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = "rgba(193,81,58,0.15)")}>
                    {isPlaying ? (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" style={{ color: "#C1513A" }}>
                        <rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24" style={{ color: "#C1513A" }}>
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>

                  {/* Back to search */}
                  <button onClick={handleBack}
                    className="text-xs transition-colors shrink-0 px-2 py-1"
                    style={{ color: "#6B5244" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#F5F0E8")}
                    onMouseLeave={e => (e.currentTarget.style.color = "#6B5244")}>
                    ← Search
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function TempoPage() {
  if (!CLIENT_ID) {
    return (
      <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-6 text-center">
        <p className="text-lg font-semibold text-darkblue mb-2">Spotify integration is currently unavailable.</p>
        <p className="text-sm text-brown-light max-w-sm">Please check back soon.</p>
        <Link href="/#projects" className="mt-8 text-sm text-terracotta hover:text-terracotta-dark transition-colors">
          &larr; Back to projects
        </Link>
      </div>
    );
  }
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-terracotta/30 border-t-terracotta rounded-full animate-spin" />
      </div>
    }>
      <TempoInner />
    </Suspense>
  );
}
