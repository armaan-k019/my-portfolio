"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GuideBird3D, type BotApi, type GuideBirdState } from "./GuideBird3D";
import { QUIPS, type Quip } from "@/lib/guide/quips";

// ---------------------------------------------------------------------------
// The site guide: the kazi lab bird in the bottom right corner. Click it to
// ask about Armaan; leave it alone and it says something silly now and then.
// Self contained (own colors, no globals.css classes) so the folder can be
// dropped into the other sites, pointed at this site's /api/guide.
// ---------------------------------------------------------------------------

const BIRD_SIZE_PX = 96;
const BIRD_SIZE_MOBILE_PX = 72;
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
const HIDDEN_KEY = "guide-hidden";
// Excursions: now and then the bird leaves its corner, flying a loop over the
// page or sprinting off and back. Durations match the "fly" and "run" antics.
const FIRST_EXCURSION_MS = 22_000;
const EXCURSION_INTERVAL_MS = 40_000;
const EXCURSION_JITTER_MS = 30_000;
const FLY_MS = 5_200;
const RUN_MS = 4_000;
const FIRST_QUIP: Quip = { text: "Click on me to ask me anything about Armaan." };

// Page-level paths as [x, y] offsets from the corner, in viewport units.
const FLY_PATH: [number, number][] = [
  [0, 0], [-6, -14], [-22, -34], [-40, -40], [-52, -26], [-40, -12], [-24, -22], [-10, -12], [0, 0],
];
const RUN_PATH: { offset: number; x: number }[] = [
  { offset: 0, x: 0 }, { offset: 0.45, x: -45 }, { offset: 0.55, x: -45 }, { offset: 1, x: 0 },
];

const SUGGESTIONS = [
  "How can I get in contact with Armaan?",
  "Where are Armaan's projects?",
  "Where are Armaan's publications?",
  "What is this page, and how did Armaan build it?",
];

type GuideLink = { href: string; label: string };
type Message = { role: "user" | "assistant"; text: string; links?: GuideLink[]; failed?: boolean };

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
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState(BIRD_SIZE_PX);
  const [birdState, setBirdState] = useState<GuideBirdState>("idle");
  const [quip, setQuip] = useState<Quip | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const apiRef = useRef<BotApi | null>(null);
  const lastQuipRef = useRef(-1);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const flightRef = useRef<HTMLDivElement | null>(null);
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
    if (hidden) return;
    let timer = 0;
    let first = true;
    const schedule = (delay: number) => {
      timer = window.setTimeout(() => {
        if (first && !openRef.current) {
          first = false;
          setQuip(FIRST_QUIP);
          apiRef.current?.fireAntic("notice_wave");
        } else if (!openRef.current && document.visibilityState === "visible") {
          let i = Math.floor(Math.random() * QUIPS.length);
          if (i === lastQuipRef.current) i = (i + 1) % QUIPS.length;
          lastQuipRef.current = i;
          setQuip(QUIPS[i]);
          apiRef.current?.fireAntic(Math.random() < 0.5 ? "notice_wave" : "peck_nod");
        }
        schedule(QUIP_INTERVAL_MS + Math.random() * QUIP_JITTER_MS);
      }, delay);
    };
    schedule(FIRST_QUIP_MS);
    return () => window.clearTimeout(timer);
  }, [hidden]);

  // Excursions: fly a loop or sprint off and back, only while nothing else is
  // going on, and never with reduced motion.
  useEffect(() => {
    if (hidden) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer = 0;
    let anim: Animation | null = null;
    const schedule = (delay: number) => {
      timer = window.setTimeout(() => {
        const el = flightRef.current;
        if (el && !openRef.current && !busyRef.current && document.visibilityState === "visible") {
          const fly = Math.random() < 0.5;
          apiRef.current?.fireAntic(fly ? "fly" : "run");
          anim = fly
            ? el.animate(
                FLY_PATH.map(([x, y]) => ({ transform: `translate(${x}vw, ${y}vh)` })),
                { duration: FLY_MS, easing: "ease-in-out" },
              )
            : el.animate(
                RUN_PATH.map((k) => ({ offset: k.offset, transform: `translateX(${k.x}vw)` })),
                { duration: RUN_MS, easing: "cubic-bezier(0.45, 0, 0.55, 1)" },
              );
        }
        schedule(EXCURSION_INTERVAL_MS + Math.random() * EXCURSION_JITTER_MS);
      }, delay);
    };
    schedule(FIRST_EXCURSION_MS);
    return () => {
      window.clearTimeout(timer);
      anim?.cancel();
    };
  }, [hidden]);

  // Typewriter reveal, then hold scaled to length, then clear.
  useEffect(() => {
    if (!quip) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const n = quip.text.length;
    setRevealed(reduced ? n : 0);
    const timers: number[] = [];
    if (!reduced) {
      for (let i = 1; i <= n; i++) timers.push(window.setTimeout(() => setRevealed(i), i * TYPE_MS_PER_CHAR));
    }
    const hold = (reduced ? 0 : n * TYPE_MS_PER_CHAR) + BUBBLE_HOLD_BASE_MS + n * BUBBLE_HOLD_PER_CHAR_MS;
    timers.push(window.setTimeout(() => setQuip(null), hold));
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
    window.setTimeout(() => setBirdState("idle"), ms);
  }, []);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || pending) return;
      const history = messages.filter((m) => !m.failed).map((m) => ({ role: m.role, text: m.text }));
      setMessages((m) => [...m, { role: "user", text: q }]);
      setDraft("");
      setPending(true);
      setBirdState("thinking");
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: q, path: pathname, history }),
        });
        const data = (await res.json()) as { answer?: string; links?: GuideLink[]; error?: string };
        if (!res.ok || typeof data.answer !== "string") throw new Error(data.error ?? `HTTP ${res.status}`);
        setMessages((m) => [...m, { role: "assistant", text: data.answer as string, links: data.links ?? [] }]);
        settle("success", SUCCESS_HOLD_MS);
      } catch {
        // Say plainly that the call failed, so it never reads as "nothing to say".
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            text: "My antenna lost the signal, so I could not get an answer. You can always email Armaan directly.",
            links: [{ href: "mailto:archarmaan@gmail.com", label: "Email Armaan" }],
            failed: true,
          },
        ]);
        settle("error", ERROR_HOLD_MS);
      } finally {
        setPending(false);
      }
    },
    [endpoint, messages, pathname, pending, settle],
  );

  const toggleOpen = useCallback(() => {
    setQuip(null);
    setOpen((o) => {
      if (!o) apiRef.current?.fireAntic("notice_wave");
      return !o;
    });
  }, []);

  const hide = () => {
    setOpen(false);
    setQuip(null);
    setHidden(true);
    writeHidden(true);
  };

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
        bring back the bird
      </button>
    );
  }

  return (
    <div className="pointer-events-none fixed bottom-2 right-2 z-40 flex flex-col items-end sm:bottom-4 sm:right-4">
      {open && (
        <div
          role="dialog"
          aria-label="Ask the site guide"
          className="pointer-events-auto mb-2 flex max-h-[min(520px,70vh)] w-[min(360px,calc(100vw-16px))] flex-col overflow-hidden rounded-2xl border border-[#16241A]/10 bg-[#FBFCFA] text-[#16241A] shadow-[0_30px_60px_-24px_rgba(26,42,26,0.35)]"
        >
          <div className="flex items-center justify-between border-b border-[#16241A]/10 px-4 py-2.5">
            <p className="font-mono text-[11px] uppercase tracking-wider text-[#4A6B4A]">Ask the bird</p>
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
                <p>Hi. I know my way around this site. Ask me anything about Armaan and his work.</p>
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
                  <p className={m.failed ? "text-[#A4332F]" : undefined}>{m.text}</p>
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
        <div className="pointer-events-auto relative mb-1 mr-6 max-w-[240px] rounded-2xl border border-[#16241A]/10 bg-[#FBFCFA]/95 px-3.5 py-2 text-[13px] leading-snug text-[#16241A] shadow-sm backdrop-blur-sm">
          <button type="button" onClick={() => setRevealed(quip.text.length)} className="text-left">
            {quip.text.slice(0, revealed)}
            {revealed < quip.text.length && <span className="text-[#4A6B4A]">…</span>}
          </button>
          {quip.href && revealed >= quip.text.length && (
            <div className="mt-1.5">
              <GuideLinkChip link={{ href: quip.href, label: "take me there" }} onClick={() => setQuip(null)} />
            </div>
          )}
          <span aria-hidden="true" className="absolute -bottom-1.5 right-6 h-3 w-3 rotate-45 border-b border-r border-[#16241A]/10 bg-[#FBFCFA]/95" />
        </div>
      )}

      <div ref={flightRef} className="pointer-events-auto will-change-transform">
        <GuideBird3D
          state={birdState}
          size={size}
          onClick={toggleOpen}
          title={open ? "Close the guide" : "Ask me about Armaan"}
          registerApi={(api) => {
            apiRef.current = api;
          }}
        />
      </div>
    </div>
  );
}
