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
  popularity?: number;
}

interface AudioFeatures {
  tempo: number;
  energy: number;
  danceability: number;
  valence: number;
}

type Formation = "grid" | "sphere" | "spiral" | "cloud";

interface SongPersonality {
  particleCount: number;
  formation: Formation;
  spreadRadius: number;
  rotationSpeed: number;
  particleBaseSize: number;
  chaosFactor: number;
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
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// ─── Spotify API helpers ──────────────────────────────────────────────────────

// DEPLOYMENT CHECKLIST FOR TEMPO:
// 1. Deploy to your domain
// 2. Go to developer.spotify.com → Dashboard → Tempo app → Edit settings
// 3. Add your production URL as a redirect URI: https://yourdomain.com/projects/tempo
// 4. Set NEXT_PUBLIC_SPOTIFY_CLIENT_ID in your environment variables

const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? "";
const SCOPES = "streaming user-read-email user-read-private user-modify-playback-state";

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
  if (!res.ok) throw new Error(data.error_description ?? data.error ?? `Token exchange failed (${res.status})`);
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

// ─── Seeded PRNG (xorshift32) ─────────────────────────────────────────────────
// Each track gets a deterministic random sequence seeded by its Spotify ID.
// This means the same song always produces the same formation and layout.

function trackSeed(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = (Math.imul(h, 0x01000193) >>> 0);
  }
  return h || 1;
}

function makeRng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13; x = x >>> 0;
    x ^= x >>> 17;
    x ^= x << 5; x = x >>> 0;
    return x / 0x100000000;
  };
}

// ─── Song personality from track metadata ─────────────────────────────────────

function buildPersonality(track: SpotifyTrack, features: AudioFeatures): SongPersonality {
  const pop = (track.popularity ?? 50) / 100;
  const rng = makeRng(trackSeed(track.id));
  const formations: Formation[] = ["grid", "sphere", "spiral", "cloud"];
  const formation = formations[Math.floor(rng() * formations.length)];

  return {
    particleCount: Math.round(8000 + pop * 10000),     // 8k–18k by popularity
    formation,
    spreadRadius: 280 + features.energy * 180,          // 280–460
    rotationSpeed: 0.00012 + features.energy * 0.00035,
    particleBaseSize: 1.4 + features.energy * 1.4,      // 1.4–2.8
    chaosFactor: features.danceability * 3.0,
  };
}

// ─── Base particle positions per formation ────────────────────────────────────

function buildBasePositions(
  n: number,
  formation: Formation,
  spread: number,
  rng: () => number,
): Float32Array {
  const pos = new Float32Array(n * 3);
  const GRID = Math.ceil(Math.sqrt(n));

  for (let i = 0; i < n; i++) {
    const i3 = i * 3;
    if (formation === "grid") {
      const xi = i % GRID;
      const zi = Math.floor(i / GRID);
      const x = (xi / GRID - 0.5) * spread;
      const z = (zi / GRID - 0.5) * spread;
      pos[i3]     = x;
      pos[i3 + 1] = Math.sin(x * 0.042) * Math.cos(z * 0.042) * 18 + (rng() - 0.5) * 4;
      pos[i3 + 2] = z;
    } else if (formation === "sphere") {
      const theta = Math.acos(2 * rng() - 1);
      const phi = rng() * Math.PI * 2;
      const r = spread * 0.42 * (0.65 + rng() * 0.35);
      pos[i3]     = r * Math.sin(theta) * Math.cos(phi);
      pos[i3 + 1] = r * Math.cos(theta);
      pos[i3 + 2] = r * Math.sin(theta) * Math.sin(phi);
    } else if (formation === "spiral") {
      const t = i / n;
      const angle = t * Math.PI * 28;
      const r = t * spread * 0.48;
      pos[i3]     = r * Math.cos(angle) + (rng() - 0.5) * 18;
      pos[i3 + 1] = (t - 0.5) * spread * 0.75 + (rng() - 0.5) * 14;
      pos[i3 + 2] = r * Math.sin(angle) + (rng() - 0.5) * 18;
    } else {
      // cloud
      pos[i3]     = (rng() - 0.5) * spread;
      pos[i3 + 1] = (rng() - 0.5) * spread * 0.38;
      pos[i3 + 2] = (rng() - 0.5) * spread;
    }
  }
  return pos;
}

// ─── Album color palette extraction ──────────────────────────────────────────
// Samples the album art at 50×50, clusters by hue into 5 buckets,
// and picks the most saturated pixel from each. Very dark/grey pixels skipped.

function extractPalette(url: string): Promise<[number, number, number][]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const SIZE = 50;
      const c = document.createElement("canvas");
      c.width = c.height = SIZE;
      const ctx = c.getContext("2d");
      if (!ctx) { resolve([[0.3, 0.3, 1.0]]); return; }
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      const d = ctx.getImageData(0, 0, SIZE, SIZE).data;

      // Collect vibrant pixels (skip near-black and near-grey)
      type Pixel = [number, number, number, number, number]; // r,g,b,sat,hue
      const pixels: Pixel[] = [];
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        if (max < 25) continue;
        const sat = max > 0 ? (max - min) / max : 0;
        if (sat < 0.18) continue;
        let hue = 0;
        if (max !== min) {
          if (max === r) hue = ((g - b) / (max - min) + 6) % 6 / 6;
          else if (max === g) hue = ((b - r) / (max - min) + 2) / 6;
          else hue = ((r - g) / (max - min) + 4) / 6;
        }
        pixels.push([r, g, b, sat, hue]);
      }

      if (pixels.length === 0) { resolve([[0.3, 0.3, 1.0]]); return; }

      // Bucket by hue into 5 zones, pick most saturated from each
      const BUCKETS = 5;
      const palette: [number, number, number][] = [];
      for (let b = 0; b < BUCKETS; b++) {
        const hLo = b / BUCKETS, hHi = (b + 1) / BUCKETS;
        const inBucket = pixels.filter(([,,,, h]) => h >= hLo && h < hHi);
        const candidates = inBucket.length > 0 ? inBucket : pixels;
        const best = candidates.reduce((a, c) => c[3] > a[3] ? c : a);
        palette.push([best[0] / 255, best[1] / 255, best[2] / 255]);
      }
      resolve(palette);
    };
    img.onerror = () => resolve([[0.3, 0.3, 1.0]]);
    img.src = url;
  });
}

function hexToRgb01(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

// ─── Per-frame audio simulation ───────────────────────────────────────────────
// The Spotify Web Playback SDK routes audio through its own internal Web Audio
// context — there is no standard <audio> element to tap with createMediaElementSource.
// We simulate reactive audio from the track's audio-features + a high-res beat model,
// seeded by track ID so every song produces a distinct, consistent visual.

interface FrameAudio {
  bass: number;
  mids: number;
  treble: number;
  energy: number;
  isBeat: boolean;
  // 64 simulated frequency bins [0,1] — low to high
  freqBins: Float32Array;
}

function simulateFrame(
  nowMs: number,
  startMs: number,
  features: AudioFeatures,
  prevBass: number,
): FrameAudio {
  const elapsed = (nowMs - startMs) / 1000;
  const beatSec = 60 / Math.max(features.tempo, 40);
  const phase = (elapsed % beatSec) / beatSec;

  // Sharp attack, fast decay
  const beatPulse = Math.pow(Math.max(0, Math.sin(phase * Math.PI * 2 - Math.PI * 0.5) + 0.12), 3);
  const bass   = Math.min(1, beatPulse * 0.82 * features.danceability + Math.sin(elapsed * 0.28) * 0.18 * features.energy);
  const mids   = (0.5 + 0.5 * Math.sin(elapsed * 0.67 + 1.1)) * features.energy * 0.85;
  const treble = (0.4 + 0.4 * Math.sin(elapsed * 1.4 + 2.3)) * (0.3 + features.valence * 0.5);
  const energy = bass * 0.4 + mids * 0.35 + treble * 0.25;
  const isBeat = bass > prevBass + 0.14;

  // Simulate 64 freq bins mapping low→high
  const freqBins = new Float32Array(64);
  for (let i = 0; i < 64; i++) {
    const t = i / 64;
    if (t < 0.15) {
      freqBins[i] = bass * (1 - t / 0.15 * 0.35) + Math.sin(elapsed * 9 + i * 1.3) * 0.08;
    } else if (t < 0.6) {
      freqBins[i] = mids * (0.75 + Math.sin(elapsed * 3.2 + i * 0.6) * 0.25);
    } else {
      freqBins[i] = treble * (0.55 + Math.sin(elapsed * 5.5 + i * 0.35) * 0.45);
    }
    freqBins[i] = Math.max(0, Math.min(1, freqBins[i]));
  }

  return { bass, mids, treble, energy, isBeat, freqBins };
}

// ─── Three.js scene ───────────────────────────────────────────────────────────

interface SceneObjects {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  posAttr: THREE.BufferAttribute;
  colAttr: THREE.BufferAttribute;
  material: THREE.PointsMaterial;
  basePos: Float32Array;
  n: number;
}

function buildScene(
  canvas: HTMLCanvasElement,
  personality: SongPersonality,
  trackId: string,
): SceneObjects {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 1);

  const scene = new THREE.Scene();
  const fogDensity = 0.0018 + (1 - personality.spreadRadius / 460) * 0.0014;
  scene.fog = new THREE.FogExp2(0x000000, fogDensity);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 65, personality.spreadRadius * 0.58);
  camera.lookAt(0, 0, 0);

  const n = personality.particleCount;
  const rng = makeRng(trackSeed(trackId));
  const basePos = buildBasePositions(n, personality.formation, personality.spreadRadius, rng);

  const positions = new Float32Array(basePos);
  const colors    = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = 0.15; colors[i * 3 + 1] = 0.15; colors[i * 3 + 2] = 0.6;
  }

  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  const colAttr  = new THREE.BufferAttribute(colors, 3);
  geo.setAttribute("position", posAttr);
  geo.setAttribute("color", colAttr);

  const material = new THREE.PointsMaterial({
    size: personality.particleBaseSize,
    vertexColors: true,
    transparent: true,
    opacity: 0.87,
    sizeAttenuation: true,
    depthWrite: false,
  });

  scene.add(new THREE.Points(geo, material));
  return { renderer, scene, camera, posAttr, colAttr, material, basePos, n };
}

// ─── Component ────────────────────────────────────────────────────────────────

type AppState = "loading" | "connect" | "exchanging" | "search" | "playing" | "error";

function TempoInner() {
  const [appState,   setAppState]   = useState<AppState>("loading");
  const [query,      setQuery]      = useState("");
  const [results,    setResults]    = useState<SpotifyTrack[]>([]);
  const [searching,  setSearching]  = useState(false);
  const [noResults,  setNoResults]  = useState(false);
  const [track,      setTrack]      = useState<SpotifyTrack | null>(null);
  const [token,      setToken]      = useState<string | null>(null);
  const [isPlaying,  setIsPlaying]  = useState(false);
  const [progress,   setProgress]   = useState(0);
  const [hudVisible, setHudVisible] = useState(true);
  const [error,      setError]      = useState("");
  const [isPremium,  setIsPremium]  = useState(true);
  const [loading,    setLoading]    = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [userColor,  setUserColor]  = useState("#5588ff");
  const [useCustom,  setUseCustom]  = useState(false);
  // For displaying formation badge during visualization
  const [formation,  setFormation]  = useState<Formation | null>(null);

  // Refs for animation loop (avoid stale closures)
  const tokenRef       = useRef<string | null>(null);
  const featuresRef    = useRef<AudioFeatures>({ tempo: 120, energy: 0.6, danceability: 0.6, valence: 0.5 });
  const paletteRef     = useRef<[number, number, number][]>([[0.3, 0.3, 1.0]]);
  const personalityRef = useRef<SongPersonality | null>(null);
  const trackIdRef     = useRef<string>("");
  const startMsRef     = useRef(0);
  const progressRef    = useRef(0);
  const useCustomRef   = useRef(false);
  const userColorRef   = useRef("#5588ff");
  const isPlayingRef   = useRef(false);
  const curColorRef    = useRef<[number, number, number]>([0.15, 0.15, 0.6]);

  // DOM/Three refs
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const playerRef   = useRef<SpotifyPlayer | null>(null);
  const deviceIdRef = useRef("");
  const animIdRef   = useRef(0);
  const hudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // keep refs in sync with state
  useEffect(() => { tokenRef.current     = token; },     [token]);
  useEffect(() => { progressRef.current  = progress; },  [progress]);
  useEffect(() => { useCustomRef.current = useCustom; }, [useCustom]);
  useEffect(() => { userColorRef.current = userColor; }, [userColor]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // ── OAuth callback on mount ──────────────────────────────────────────────
  useEffect(() => {
    const params   = new URLSearchParams(window.location.search);
    const code     = params.get("code");
    const oauthErr = params.get("error");

    const stored = sessionStorage.getItem("sp_token");
    if (stored) {
      setToken(stored); tokenRef.current = stored;
      setAppState("search"); return;
    }
    if (oauthErr) {
      setError(`Spotify auth error: ${oauthErr}`);
      window.history.replaceState({}, "", "/projects/tempo");
      setAppState("error"); return;
    }
    if (code) {
      setAppState("exchanging");
      window.history.replaceState({}, "", "/projects/tempo");
      exchangeToken(code)
        .then((t) => {
          sessionStorage.setItem("sp_token", t);
          setToken(t); tokenRef.current = t;
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

  // ── Init Spotify SDK player ───────────────────────────────────────────────
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
        if (state.duration > 0) {
          const p = state.position / state.duration;
          setProgress(p); progressRef.current = p;
        }
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
    if (!tokenRef.current) {
      sessionStorage.setItem("sp_pending", JSON.stringify(t));
      await startSpotifyAuth();
      return;
    }
    setLoading(true); setLoadingMsg("Connecting player…"); setTrack(t);
    trackIdRef.current = t.id;
    try {
      initPlayer(tokenRef.current);
      // wait for SDK device (up to 8s)
      let attempts = 0;
      while (!deviceIdRef.current && attempts < 27) { await new Promise(r => setTimeout(r, 300)); attempts++; }
      if (!deviceIdRef.current) throw new Error("Could not connect to Spotify player. Make sure you have Spotify Premium.");

      setLoadingMsg("Analyzing track…");
      // Fetch audio features + full track details (for popularity) in parallel
      const [featResult, trackResult] = await Promise.allSettled([
        apiGet<AudioFeatures>(`/audio-features/${t.id}`, tokenRef.current!),
        apiGet<SpotifyTrack & { popularity: number }>(`/tracks/${t.id}`, tokenRef.current!),
      ]);

      if (featResult.status === "fulfilled") featuresRef.current = featResult.value;

      const fullTrack: SpotifyTrack = trackResult.status === "fulfilled"
        ? { ...t, popularity: trackResult.value.popularity }
        : t;

      // Build song personality (deterministic from track ID + features)
      const personality = buildPersonality(fullTrack, featuresRef.current);
      personalityRef.current = personality;
      setFormation(personality.formation);

      setLoadingMsg("Building visualization…");
      // Extract color palette from album art
      const imgUrl = t.album.images[0]?.url;
      if (imgUrl) {
        const p = await extractPalette(imgUrl);
        paletteRef.current = p;
        curColorRef.current = [...p[0]];
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

  // ── Three.js animation loop ───────────────────────────────────────────────
  useEffect(() => {
    if (appState !== "playing" || !canvasRef.current || !personalityRef.current) return;

    const personality  = personalityRef.current;
    const currentTrackId = trackIdRef.current;

    const { renderer, scene, camera, posAttr, colAttr, material, basePos, n } =
      buildScene(canvasRef.current, personality, currentTrackId);

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    let camAngle  = 0;
    let prevBass  = 0;
    let paletteT  = 0;
    // Camera shake
    let shakeX = 0, shakeY = 0, shakeDecay = 0;
    // Burst spread
    let burstScale = 1;

    function frame() {
      animIdRef.current = requestAnimationFrame(frame);
      // Freeze all visual updates while paused — rAF loop stays alive for smooth resume
      if (!isPlayingRef.current) return;

      const audio = simulateFrame(Date.now(), startMsRef.current, featuresRef.current, prevBass);
      prevBass = audio.bass;

      // ── Palette cycling (cycle through album colors, energy-modulated speed) ──
      paletteT += 0.0006 + audio.energy * 0.0012;
      const palette = paletteRef.current;
      const pLen    = palette.length;
      const pPhase  = paletteT % pLen;
      const pIdx    = Math.floor(pPhase);
      const pFrac   = pPhase - pIdx;
      const pA = palette[pIdx % pLen];
      const pB = palette[(pIdx + 1) % pLen];
      let tr = lerp(pA[0], pB[0], pFrac);
      let tg = lerp(pA[1], pB[1], pFrac);
      let tb = lerp(pA[2], pB[2], pFrac);

      if (useCustomRef.current) {
        const [ur, ug, ub] = hexToRgb01(userColorRef.current);
        tr = tr * 0.58 + ur * 0.42;
        tg = tg * 0.58 + ug * 0.42;
        tb = tb * 0.58 + ub * 0.42;
      }
      // Smooth lerp toward target color
      curColorRef.current[0] = lerp(curColorRef.current[0], tr, 0.022);
      curColorRef.current[1] = lerp(curColorRef.current[1], tg, 0.022);
      curColorRef.current[2] = lerp(curColorRef.current[2], tb, 0.022);
      const [cr, cg, cb] = curColorRef.current;

      // ── Beat-reactive effects ─────────────────────────────────────────────
      if (audio.isBeat) {
        const intensity = audio.bass;
        shakeX    = (Math.random() - 0.5) * 7 * intensity;
        shakeY    = (Math.random() - 0.5) * 4.5 * intensity;
        shakeDecay = 0.82;
        burstScale = 1 + intensity * 0.28;
      }
      shakeX    *= shakeDecay;
      shakeY    *= shakeDecay;
      shakeDecay *= 0.88;
      burstScale  = lerp(burstScale, 1, 0.1);

      // ── Update particles — each mapped to a frequency bin ─────────────────
      const now   = Date.now();
      const BINS  = audio.freqBins.length;
      const chaos = personality.chaosFactor;

      for (let i = 0; i < n; i++) {
        const i3 = i * 3;
        const bx = basePos[i3], by = basePos[i3 + 1], bz = basePos[i3 + 2];

        // Map particle index → frequency bin
        const binIdx  = Math.floor((i / n) * BINS);
        const freqVal = audio.freqBins[binIdx];

        // Vertical: bass wave + freq amplitude displacement
        const dist = Math.sqrt(bx * bx + bz * bz);
        const wave = Math.sin(dist * 0.046 - now * 0.00092 * featuresRef.current.tempo / 60) * audio.bass * 32;
        const freqDisp = freqVal * 9 * (1 + audio.energy * 0.8);

        // Horizontal: mid-frequency drift scaled by danceability
        const drift = Math.sin(now * 0.00042 + i * 0.088) * audio.mids * chaos * 2.8;

        // Depth: treble modulation
        const depth = Math.cos(now * 0.00031 + i * 0.052) * audio.treble * chaos * 2.2;

        posAttr.setXYZ(
          i,
          bx * burstScale + drift,
          by + wave + freqDisp,
          bz * burstScale + depth,
        );

        // Color: palette color + brightness driven by freq value + beat flash
        const beatFlash = audio.isBeat ? audio.bass * 0.75 : 0;
        const bright    = 1 + audio.treble * freqVal * 1.6 + beatFlash;
        const falloff   = Math.max(0.25, 1 - dist / (personality.spreadRadius * 0.68));
        colAttr.setXYZ(
          i,
          Math.min(1, cr * bright * falloff),
          Math.min(1, cg * bright * falloff),
          Math.min(1, cb * bright * falloff),
        );
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;

      // ── Particle size pulse ───────────────────────────────────────────────
      material.size = personality.particleBaseSize * (0.88 + audio.treble * 0.7 + audio.bass * 0.55);
      if (audio.isBeat) material.size *= 1 + audio.bass * 0.45;

      // ── Camera orbit + beat shake ─────────────────────────────────────────
      camAngle += personality.rotationSpeed + audio.mids * 0.00011;
      const camR = personality.spreadRadius * 0.56 + audio.bass * 22;
      const camH = 62 + audio.bass * 22;
      camera.position.set(
        Math.sin(camAngle) * camR + shakeX,
        camH + shakeY,
        Math.cos(camAngle) * camR,
      );
      camera.lookAt(0, audio.bass * 7, 0);

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
      if (s) {
        setIsPlaying(!s.paused);
        if (s.duration > 0) setProgress(s.position / s.duration);
      }
    }, 800);
    return () => clearInterval(id);
  }, [appState]);

  // ── HUD auto-hide ────────────────────────────────────────────────────────
  const resetHud = useCallback(() => {
    setHudVisible(true);
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    hudTimerRef.current = setTimeout(() => setHudVisible(false), 4000);
  }, []);

  useEffect(() => {
    if (appState !== "playing") return;
    resetHud();
    window.addEventListener("mousemove", resetHud);
    window.addEventListener("touchstart", resetHud);
    return () => {
      window.removeEventListener("mousemove", resetHud);
      window.removeEventListener("touchstart", resetHud);
      if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    };
  }, [appState, resetHud]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animIdRef.current);
      playerRef.current?.disconnect();
    };
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSelect = (t: SpotifyTrack) => { setResults([]); setQuery(""); playTrack(t); };

  const handleToggle = async () => {
    if (!playerRef.current) return;
    if (isPlaying) await playerRef.current.pause();
    else await playerRef.current.resume();
  };

  const handleBack = () => {
    playerRef.current?.pause();
    setAppState("search");
    setTrack(null);
    setQuery("");
    setResults([]);
    setFormation(null);
  };

  const thumbUrl = track?.album.images.find((i) => i.width <= 300)?.url ?? track?.album.images[0]?.url;
  const artist   = track?.artists.map((a) => a.name).join(", ") ?? "";

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen overflow-hidden font-sans">

      {/* ── Non-playing states ────────────────────────────────────────────── */}
      <AnimatePresence>
        {appState !== "playing" && (
          <motion.div key="search" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}
            className="min-h-screen flex flex-col bg-cream text-brown">

            <div className="max-w-5xl mx-auto w-full px-6 pt-8 pb-4">
              <Link href="/#projects" className="text-sm text-terracotta hover:text-terracotta-dark transition-colors">
                &larr; Back to projects
              </Link>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center px-6 pb-16">
              <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
                className="w-full max-w-md">

                <div className="mb-8">
                  <p className="text-xs font-semibold tracking-widest uppercase text-terracotta mb-3">Project</p>
                  <h1 className="text-3xl font-semibold text-darkblue tracking-tight mb-1">Tempo</h1>
                  <p className="text-brown-light text-base">A generative music visualization experience.</p>
                </div>

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

                {(appState === "loading" || appState === "exchanging") && (
                  <div className="mb-5 flex items-center justify-center gap-3 py-2">
                    <div className="w-4 h-4 border-2 border-terracotta/30 border-t-terracotta rounded-full animate-spin" />
                    <p className="text-sm text-brown-light">
                      {appState === "exchanging" ? "Connecting to Spotify…" : ""}
                    </p>
                  </div>
                )}

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

                {appState === "connect" && (
                  <div className="mb-5">
                    <button onClick={() => startSpotifyAuth()}
                      className="w-full px-5 py-2.5 text-sm font-medium bg-terracotta text-white rounded-lg hover:bg-terracotta-dark transition-colors">
                      Connect with Spotify
                    </button>
                    <p className="text-xs text-brown-light mt-2 text-center">
                      You&apos;ll be redirected to Spotify to sign in, then brought back here.
                    </p>
                  </div>
                )}

                {loading && appState === "search" && (
                  <div className="mb-5 flex items-center justify-center gap-3 py-2">
                    <div className="w-4 h-4 border-2 border-terracotta/30 border-t-terracotta rounded-full animate-spin" />
                    <p className="text-sm text-brown-light">{loadingMsg}</p>
                  </div>
                )}

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

                {appState === "search" && (
                  <div className="px-4 py-3.5 rounded-xl border border-tan/30 bg-white/40">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2.5 cursor-pointer select-none flex-1"
                        onClick={() => setUseCustom(!useCustom)}>
                        <div className={`w-8 h-4 rounded-full transition-colors relative shrink-0 ${useCustom ? "bg-terracotta" : "bg-tan/30"}`}>
                          <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all shadow-sm ${useCustom ? "left-4" : "left-0.5"}`} />
                        </div>
                        <span className="text-xs font-semibold uppercase tracking-wide text-brown-light">Color tint</span>
                      </div>
                      {useCustom && (
                        <input type="color" value={userColor} onChange={(e) => setUserColor(e.target.value)}
                          className="w-7 h-7 rounded-lg cursor-pointer border-0 bg-transparent p-0 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-brown-light/70 mt-2 leading-relaxed">
                      Colors are extracted from the album art and vary with the music&apos;s energy. A color tint shifts the palette toward your pick.
                    </p>
                  </div>
                )}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Visualization state ───────────────────────────────────────────── */}
      <AnimatePresence>
        {appState === "playing" && (
          <motion.div key="viz" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.9 }} className="fixed inset-0">
            <canvas ref={canvasRef} className="block w-full h-full" />

            {/* Back button — always visible top-left */}
            <button
              onClick={handleBack}
              className="absolute top-5 left-5 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                backgroundColor: "rgba(10,11,13,0.6)",
                color: "#8B7D74",
                border: "1px solid rgba(255,255,255,0.09)",
                backdropFilter: "blur(10px)",
              }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = "rgba(193,81,58,0.28)"; e.currentTarget.style.color = "#F5F0E8"; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = "rgba(10,11,13,0.6)"; e.currentTarget.style.color = "#8B7D74"; }}
            >
              ← Search
            </button>

            {/* Formation badge — top-right */}
            {formation && (
              <div
                className="absolute top-5 right-5 px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-widest"
                style={{
                  backgroundColor: "rgba(10,11,13,0.6)",
                  color: "#5B4F48",
                  border: "1px solid rgba(255,255,255,0.07)",
                  backdropFilter: "blur(10px)",
                }}
              >
                {formation}
              </div>
            )}

            {/* HUD — slides up from bottom, auto-hides */}
            <AnimatePresence>
              {hudVisible && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 16 }}
                  transition={{ duration: 0.25 }}
                  className="absolute bottom-0 left-0 right-0 px-6 py-6 flex items-center gap-4"
                  style={{ background: "linear-gradient(to top, rgba(6,7,9,0.92) 0%, transparent 100%)" }}
                >
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
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = "rgba(193,81,58,0.3)")}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = "rgba(193,81,58,0.15)")}
                  >
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
