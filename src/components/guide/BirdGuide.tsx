"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { BotApi, BotTuning, GuideBirdState } from "./GuideBird3D";
import { BIRD_NAMES, FIRST_QUIP, QUIPS, type BirdId, type Quip } from "@/lib/guide/quips";

// ---------------------------------------------------------------------------
// The site guide: two robot ravens, a purple one with glasses who answers, and
// a green one with a feather crest who heckles him,
// in the bottom right corner. Click either to ask about Armaan; leave them alone
// and they say something silly now and then, sometimes to each other.
// Self contained (own colors, no globals.css classes) so the folder can be
// dropped into the other sites, pointed at this site's /api/guide.
// ---------------------------------------------------------------------------

const BIRD_SIZE_PX = 104;
const BIRD_SIZE_MOBILE_PX = 76;
// The pair overlaps a little so it reads as two birds together.
const BIRD_OVERLAP_FRACTION = 0.22;
// Quips: the first comes a little after load, then occasionally, never while
// the chat is open or the tab is hidden.
const FIRST_QUIP_MS = 7_000;
const QUIP_INTERVAL_MS = 50_000;
const QUIP_JITTER_MS = 30_000;
const TYPE_MS_PER_CHAR = 24;
const BUBBLE_HOLD_BASE_MS = 2_600;
const BUBBLE_HOLD_PER_CHAR_MS = 45;
// The bird's success beat runs about 1.2s, then it goes back to idling.
const SUCCESS_HOLD_MS = 1_300;
const ERROR_HOLD_MS = 2_400;
// When asked to go somewhere, the birds answer first, then take the visitor.
const GO_DELAY_MS = 1_600;
const HIDDEN_KEY = "guide-hidden";
type Bird = { id: BirdId; tuning: Partial<BotTuning> };
// The birds stay in their corner: a short, slow shuffle in place, nothing that
// crosses the page.
const STAY_PUT: Partial<BotTuning> = { wanderRadius: 0.25, waddleSpeed: 0.7 };
// Memory sits on the left, thought on the right next to the chat. Tunings are
// module constants so the bird does not re-apply them on every render.
const BIRDS: Bird[] = [
  { id: "memory", tuning: { bodyColor: "#2E9968", profile: "playful", headgear: "crest", build: 0.92, eyeSize: 1.08, ...STAY_PUT } },
  { id: "thought", tuning: { bodyColor: "#8463D4", profile: "curious", glasses: true, build: 1.1, eyeSize: 0.92, ...STAY_PUT } },
];
// Speaker label colors, darker than the bodies so they read on the bubble.
const LABEL_CLASS: Record<BirdId, string> = { thought: "text-[#5B3BA3]", memory: "text-[#1F6B48]" };
const other = (b: BirdId): BirdId => (b === "thought" ? "memory" : "thought");

// Three.js loads only once the birds are actually shown.
const GuideBird3D = dynamic(() => import("./GuideBird3D").then((m) => m.GuideBird3D), { ssr: false });

const SUGGESTIONS = [
  "How can I get in contact with Armaan?",
  "Where are Armaan's projects?",
  "Where are Armaan's publications?",
  "What is this page, and how did Armaan build it?",
  "Take me to Armaan's projects.",
];

type GuideLink = { href: string; label: string };
type Line = { who: BirdId; text: string };
type Message = { role: "user" | "assistant"; text: string; lines?: Line[]; links?: GuideLink[]; failed?: boolean };
type ActiveQuip = Quip & { who: BirdId };

function readHidden(): boolean {
  try {
    return window.localStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeHidden(v: boolean): void {
  try {
    if (v) window.localStorage.setItem(HIDDEN_KEY, "1");
    else window.localStorage.removeItem(HIDDEN_KEY);
  } catch {
    // Storage blocked: the choice lasts for this page view only.
  }
}

function GuideLinkChip({ link, onClick }: { link: GuideLink; onClick?: () => void }) {
  const cls =
    "inline-flex items-center gap-1 rounded-full border border-[#2E9968]/40 px-2.5 py-0.5 font-mono text-[11px] text-[#1F6B48] hover:bg-[#2E9968]/10 transition-colors";
  const external = /^(https?:|mailto:)/.test(link.href);
  if (external) {
    return (
      <a href={link.href} className={cls} onClick={onClick} {...(link.href.startsWith("http") && { target: "_blank", rel: "noopener noreferrer" })}>
        {link.label}
        <span aria-hidden="true">&#8599;</span>
      </a>
    );
  }
  return (
    <Link href={link.href} className={cls} onClick={onClick}>
      {link.label}
      <span aria-hidden="true">&rarr;</span>
    </Link>
  );
}

export default function BirdGuide({ endpoint = "/api/guide" }: { endpoint?: string }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const goTimerRef = useRef(0);
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  // null until the saved choice is read, so a hidden bird never loads.
  const [hidden, setHidden] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState(BIRD_SIZE_PX);
  const [birdState, setBirdState] = useState<GuideBirdState>("idle");
  const [quip, setQuip] = useState<ActiveQuip | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const apiRef = useRef<Record<BirdId, BotApi | null>>({ thought: null, memory: null });
  const settleTimerRef = useRef(0);
  const lastQuipRef = useRef(-1);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const busyRef = useRef(false); // a quip or a question is in progress
  busyRef.current = quip !== null || pending || birdState !== "idle";

  useEffect(() => {
    setHidden(readHidden());
    setSize(window.matchMedia("(max-width: 640px)").matches ? BIRD_SIZE_MOBILE_PX : BIRD_SIZE_PX);
  }, []);

  // Occasional quips, never the same one twice in a row. The first one of a
  // visit always says what clicking does.
  useEffect(() => {
    if (hidden !== false) return;
    let timer = 0;
    let first = true;
    const schedule = (delay: number) => {
      timer = window.setTimeout(() => {
        const visible = document.visibilityState === "visible";
        if (openRef.current) first = false; // already found the chat, no intro needed
        if (first && !openRef.current && visible) {
          first = false;
          setQuip({ ...FIRST_QUIP, who: FIRST_QUIP.who ?? "thought" });
          apiRef.current.thought?.fireAntic("notice_wave");
        } else if (!first && !openRef.current && visible) {
          let i = Math.floor(Math.random() * QUIPS.length);
          if (i === lastQuipRef.current) i = (i + 1) % QUIPS.length;
          lastQuipRef.current = i;
          const q = QUIPS[i];
          const who: BirdId = q.who ?? (Math.random() < 0.75 ? "memory" : "thought");
          setQuip({ ...q, who });
          apiRef.current[who]?.fireAntic(Math.random() < 0.5 ? "notice_wave" : "peck_nod");
        }
        // An intro skipped because the tab was hidden tries again soon.
        schedule(first ? FIRST_QUIP_MS : QUIP_INTERVAL_MS + Math.random() * QUIP_JITTER_MS);
      }, delay);
    };
    schedule(FIRST_QUIP_MS);
    return () => window.clearTimeout(timer);
  }, [hidden]);

  // Typewriter reveal, then hold scaled to length, then clear.
  useEffect(() => {
    if (!quip) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const n = quip.text.length;
    setRevealed(reduced ? n : 0);
    const timers: number[] = [];
    if (!reduced) {
      for (let i = 1; i <= n; i++) timers.push(window.setTimeout(() => setRevealed((r) => Math.max(r, i)), i * TYPE_MS_PER_CHAR));
    }
    const hold = (reduced ? 0 : n * TYPE_MS_PER_CHAR) + BUBBLE_HOLD_BASE_MS + n * BUBBLE_HOLD_PER_CHAR_MS;
    // A two-bird bit: the other bird answers once the first line has had its moment.
    timers.push(
      window.setTimeout(() => {
        if (quip.reply && !openRef.current) {
          const who = other(quip.who);
          setQuip({ text: quip.reply, who });
          apiRef.current[who]?.fireAntic("peck_nod");
        } else {
          setQuip(null);
        }
      }, hold),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [quip]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, pending]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const settle = useCallback((s: GuideBirdState, ms: number) => {
    setBirdState(s);
    settleTimerRef.current = window.setTimeout(() => setBirdState("idle"), ms);
  }, []);
  // The birds stay mounted across pages, so a trip planned on one page is
  // dropped once the visitor goes somewhere else on their own.
  useEffect(() => () => window.clearTimeout(goTimerRef.current), [pathname]);
  useEffect(() => () => {
    window.clearTimeout(settleTimerRef.current);
    window.clearTimeout(goTimerRef.current);
  }, []);

  // Pages are hrefs on the site that serves the endpoint. On another site the
  // endpoint is absolute, so the trip is a full load of that site's page.
  const goTo = useCallback(
    (href: string) => {
      setOpen(false);
      if (/^https?:\/\//.test(endpoint)) window.location.assign(new URL(href, endpoint).toString());
      else router.push(href);
    },
    [endpoint, router],
  );

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || pending) return;
      // Only complete exchanges: a question whose answer failed is dropped
      // along with its failure message, so answers stay paired.
      const history: { role: Message["role"]; text: string }[] = [];
      for (let i = 0; i + 1 < messages.length; i++) {
        const [a, b] = [messages[i], messages[i + 1]];
        if (a.role === "user" && b.role === "assistant" && !b.failed) {
          history.push({ role: "user", text: a.text }, { role: "assistant", text: b.text });
          i++;
        }
      }
      // A new question cancels a trip the last answer had planned.
      window.clearTimeout(goTimerRef.current);
      setMessages((m) => [...m, { role: "user", text: q }]);
      setDraft("");
      setPending(true);
      window.clearTimeout(settleTimerRef.current);
      setBirdState("thinking");
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: q, path: pathname, history }),
        });
        const data = (await res.json()) as { lines?: Line[]; answer?: string; links?: GuideLink[]; go?: string | null; error?: string };
        const lines = data.lines?.length ? data.lines : typeof data.answer === "string" ? [{ who: "thought" as const, text: data.answer }] : null;
        if (!res.ok || !lines) throw new Error(data.error ?? `HTTP ${res.status}`);
        // History carries the exchange as one block with speaker names.
        const text = lines.map((l) => `${BIRD_NAMES[l.who]}: ${l.text}`).join("\n");
        setMessages((m) => [...m, { role: "assistant", text, lines, links: data.links ?? [] }]);
        settle("success", SUCCESS_HOLD_MS);
        if (data.go && pathRef.current === pathname) {
          const go = data.go;
          window.clearTimeout(goTimerRef.current);
          goTimerRef.current = window.setTimeout(() => goTo(go), GO_DELAY_MS);
        }
      } catch {
        // Say plainly that the call failed, so it never reads as "nothing to say".
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            text: "Our antennas lost the signal, so we could not get an answer. You can always email Armaan directly.",
            lines: [{ who: "thought", text: "Our antennas lost the signal, so we could not get an answer. You can always email Armaan directly." }],
            links: [{ href: "mailto:archarmaan@gmail.com", label: "Email Armaan" }],
            failed: true,
          },
        ]);
        settle("error", ERROR_HOLD_MS);
      } finally {
        setPending(false);
      }
    },
    [endpoint, goTo, messages, pathname, pending, settle],
  );

  const toggleOpen = useCallback(() => {
    setQuip(null);
    window.clearTimeout(goTimerRef.current);
    setOpen((o) => {
      if (!o) {
        apiRef.current.thought?.fireAntic("notice_wave");
        apiRef.current.memory?.fireAntic("peck_nod");
      }
      return !o;
    });
  }, []);

  const hide = () => {
    setOpen(false);
    setQuip(null);
    setHidden(true);
    writeHidden(true);
  };

  if (hidden === null) return null;
  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => {
          setHidden(false);
          writeHidden(false);
        }}
        className="fixed bottom-3 right-3 z-40 rounded-full border border-[#2E9968]/40 bg-[#FBFCFA]/90 px-3 py-1 font-mono text-[11px] text-[#1F6B48] shadow-sm backdrop-blur-sm hover:bg-[#FBFCFA]"
      >
        bring back the birds
      </button>
    );
  }

  return (
    <div className="pointer-events-none fixed bottom-2 right-2 z-40 flex flex-col items-end sm:bottom-4 sm:right-4">
      {open && (
        <div
          role="dialog"
          aria-label={`Ask ${BIRD_NAMES.thought} and ${BIRD_NAMES.memory}`}
          className="pointer-events-auto mb-2 flex max-h-[min(520px,70vh)] w-[min(360px,calc(100vw-16px))] flex-col overflow-hidden rounded-2xl border border-[#16241A]/10 bg-[#FBFCFA] text-[#16241A] shadow-[0_30px_60px_-24px_rgba(26,42,26,0.35)]"
        >
          <div className="flex items-center justify-between border-b border-[#16241A]/10 px-4 py-2.5">
            <p className="font-mono text-[11px] uppercase tracking-wider text-[#4A6B4A]">Ask {BIRD_NAMES.thought} &amp; {BIRD_NAMES.memory}</p>
            <div className="flex items-center gap-3">
              <button type="button" onClick={hide} className="font-mono text-[11px] text-[#4A6B4A] hover:text-[#16241A]">
                hide
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-lg leading-none text-[#4A6B4A] hover:text-[#16241A]">
                &times;
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm leading-relaxed">
            {messages.length === 0 && (
              <>
                <p>
                  <span className={`font-mono text-[11px] uppercase tracking-wider ${LABEL_CLASS.thought}`}>{BIRD_NAMES.thought}</span>
                  <br />
                  Hi. I am {BIRD_NAMES.thought}, he is {BIRD_NAMES.memory}, and between us we know this whole site. Ask us anything about Armaan.
                </p>
                <div className="flex flex-col items-start gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => ask(s)}
                      className="rounded-xl border border-[#16241A]/10 px-3 py-1.5 text-left text-[13px] hover:border-[#2E9968]/50 hover:bg-[#2E9968]/5 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}
            {messages.map((m, i) =>
              m.role === "user" ? (
                <p key={i} className="ml-8 rounded-xl bg-[#16241A] px-3 py-2 text-[#FBFCFA]">
                  {m.text}
                </p>
              ) : (
                <div key={i} className="mr-6 space-y-2">
                  {(m.lines ?? [{ who: "thought" as const, text: m.text }]).map((l, j) => (
                    <p key={j} className={m.failed ? "text-[#A4332F]" : undefined}>
                      <span className={`font-mono text-[11px] uppercase tracking-wider ${LABEL_CLASS[l.who]}`}>
                        {BIRD_NAMES[l.who]}
                      </span>
                      <br />
                      {l.text}
                    </p>
                  ))}
                  {m.links && m.links.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {m.links.map((l) => (
                        <GuideLinkChip key={l.href} link={l} />
                      ))}
                    </div>
                  )}
                </div>
              ),
            )}
            {pending && <p className="font-mono text-[12px] text-[#4A6B4A]">thinking…</p>}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(draft);
            }}
            className="flex items-center gap-2 border-t border-[#16241A]/10 px-3 py-2"
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={500}
              placeholder="Ask about Armaan…"
              aria-label="Your question"
              className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-[#4A6B4A]/70"
            />
            <button
              type="submit"
              disabled={pending || !draft.trim()}
              className="rounded-full bg-[#2E9968] px-3 py-1 font-mono text-[11px] text-white disabled:opacity-40"
            >
              ask
            </button>
          </form>
        </div>
      )}

      {quip && !open && (
        <div className="pointer-events-auto relative mb-1 max-w-[260px] rounded-2xl border border-[#16241A]/10 bg-[#FBFCFA]/95 px-3.5 py-2 text-[13px] leading-snug text-[#16241A] shadow-sm backdrop-blur-sm">
          <button type="button" onClick={() => setRevealed(quip.text.length)} className="text-left">
            <span className={`block font-mono text-[10px] uppercase tracking-wider ${LABEL_CLASS[quip.who]}`}>
              {BIRD_NAMES[quip.who]}
            </span>
            {quip.text.slice(0, revealed)}
            {revealed < quip.text.length && <span className="text-[#4A6B4A]">…</span>}
          </button>
          {quip.href && revealed >= quip.text.length && (
            <div className="mt-1.5">
              <GuideLinkChip link={{ href: quip.href, label: "take me there" }} onClick={() => setQuip(null)} />
            </div>
          )}
          {/* The tail points at whoever is talking. */}
          <span
            aria-hidden="true"
            style={quip.who === "thought" ? { right: size * 0.42 } : { right: size * (1.42 - BIRD_OVERLAP_FRACTION) }}
            className="absolute -bottom-1.5 h-3 w-3 rotate-45 border-b border-r border-[#16241A]/10 bg-[#FBFCFA]/95" />
        </div>
      )}

      <div className="relative flex items-end">
        <button
          type="button"
          onClick={hide}
          aria-label="Hide the birds"
          title="Hide the birds"
          className="pointer-events-auto absolute left-0 top-0 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-[#16241A]/15 bg-[#FBFCFA]/90 font-mono text-[11px] leading-none text-[#4A6B4A] opacity-60 shadow-sm transition-opacity hover:opacity-100 focus-visible:opacity-100"
        >
          &times;
        </button>
        {BIRDS.map((b, i) => (
          <div
            key={b.id}
            className="pointer-events-auto"
            style={i > 0 ? { marginLeft: -size * BIRD_OVERLAP_FRACTION } : undefined}
          >
            <GuideBird3D
              state={birdState}
              size={size}
              tuning={b.tuning}
              onClick={toggleOpen}
              title={open ? "Close the guide" : `${BIRD_NAMES[b.id]}: ask us about Armaan`}
              registerApi={(api) => {
                apiRef.current[b.id] = api;
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
