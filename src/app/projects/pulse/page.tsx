"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { PulseData, LocationData } from "../../api/pulse/route";
import type { UnifiedEvent, EventsResponse, SourceStatus } from "../../api/events/route";

const PulseMap = dynamic(() => import("./PulseMap"), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_MS = 10_000;

type RouteId = "red" | "blue" | "green" | "gold";

const BUS_ROUTE_DEFS = [
  { id: "red"   as const, name: "Red",   color: "#E8392A" },
  { id: "blue"  as const, name: "Blue",  color: "#1A6FBF" },
  { id: "green" as const, name: "Green", color: "#2E8B57" },
  { id: "gold"  as const, name: "Gold",  color: "#B8952A" },
];

// ─── Busyness colour helpers ──────────────────────────────────────────────────

function busynessHex(score: number): string {
  if (score < 30) return '#22c55e';
  if (score < 60) return '#eab308';
  if (score < 80) return '#f97316';
  return '#ef4444';
}

function busynessLabel(score: number): string {
  if (score < 30) return 'Quiet';
  if (score < 60) return 'Moderate';
  if (score < 80) return 'Busy';
  return 'Very busy';
}

function waitLabel(loc: LocationData): string {
  if (loc.type !== 'dining' || !loc.waitTime) return '';
  return loc.waitTime === 'No wait' ? '✓ No wait' : `~${loc.waitTime}`;
}

// ─── Suggested questions ──────────────────────────────────────────────────────

const SUGGESTIONS = [
  "Where should I eat right now?",
  "Good study spot for the next hour?",
  "Is the CRC worth going to right now?",
  "What's happening on campus today?",
  "Help me plan my afternoon",
  "What's quiet right now?",
];

// ─── Type icons ───────────────────────────────────────────────────────────────

function typeIcon(type: LocationData['type']): string {
  switch (type) {
    case 'dining':     return '🍽';
    case 'recreation': return '💪';
    case 'outdoor':    return '🌿';
    default:           return '📚';
  }
}

// ─── Event type color/badge helpers ──────────────────────────────────────────

function eventTypeBadgeClass(type: UnifiedEvent['type']): string {
  switch (type) {
    case 'party':
    case 'social':   return 'bg-purple-100 text-purple-700';
    case 'official': return 'bg-teal-100 text-teal-700';
    case 'popup':    return 'bg-amber-100 text-amber-700';
    case 'sports':   return 'bg-blue-100 text-blue-700';
    case 'lecture':  return 'bg-indigo-100 text-indigo-700';
    default:         return 'bg-gray-100 text-gray-600';
  }
}


function sourceBadge(source: UnifiedEvent['source']): string {
  switch (source) {
    case 'involvement': return 'GT Involvement';
    case 'eventbrite':  return 'Eventbrite';
    case 'registrar':   return 'GT Registrar';
  }
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function CardSection({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[#1A2A1A]/[0.06]">
      <div className="px-4 pt-4 pb-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#7A9B7A] flex items-center gap-1.5">
          <span>{icon}</span>{title}
        </p>
      </div>
      <div className="px-3 pb-3 space-y-2">
        {children}
      </div>
    </div>
  );
}

function LocationCard({ loc, onSelect, selected }: { loc: LocationData; onSelect: (l: LocationData) => void; selected?: boolean }) {
  const color = busynessHex(loc.busyness);
  const wait  = waitLabel(loc);

  return (
    <button
      onClick={() => onSelect(loc)}
      className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors group ${
        selected
          ? 'bg-[#FFFFFF] border-[#1A2A1A]/20 ring-1 ring-[#1A2A1A]/10'
          : 'bg-[#FFFFFF]/60 hover:bg-[#FFFFFF] border-[#1A2A1A]/[0.06]'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="text-sm font-medium text-[#1A2A1A] flex items-center gap-1.5">
          <span className="text-base leading-none">{typeIcon(loc.type)}</span>
          {loc.name}
        </span>
        {loc.isOpen ? (
          <span className="text-[10px] font-semibold shrink-0 mt-0.5" style={{ color }}>{busynessLabel(loc.busyness)}</span>
        ) : (
          <span className="text-[10px] font-semibold shrink-0 mt-0.5 text-[#7A9B7A]">-</span>
        )}
      </div>

      {/* Busyness bar */}
      <div className="w-full h-1 rounded-full bg-[#1A2A1A]/[0.08] overflow-hidden mb-1.5">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${loc.busyness}%`, backgroundColor: color }} />
      </div>

      <div className="flex items-center justify-between text-[10px] text-[#7A9B7A]">
        <span>{loc.hoursToday ?? `Hours: ${loc.peakHours}`}</span>
        {loc.isOpen && wait && <span style={{ color: loc.busyness < 30 ? '#22c55e' : color }}>{wait}</span>}
      </div>

      {loc.isOpen && loc.subScores && (
        <div className="mt-2 space-y-1">
          {loc.subScores.map(s => (
            <div key={s.label} className="flex items-center gap-2">
              <span className="text-[10px] text-[#7A9B7A] w-16 shrink-0">{s.label}</span>
              <div className="flex-1 h-0.5 rounded-full bg-[#1A2A1A]/[0.08] overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${s.score}%`, backgroundColor: busynessHex(s.score) }} />
              </div>
              <span className="text-[10px] text-[#7A9B7A] w-6 text-right">{s.score}</span>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

function SkeletonCard() {
  return (
    <div className="w-full px-3 py-2.5 rounded-xl bg-[#FFFFFF]/60 border border-[#1A2A1A]/[0.06] animate-pulse">
      <div className="h-3 bg-[#1A2A1A]/[0.07] rounded mb-2 w-3/4" />
      <div className="h-1 bg-[#1A2A1A]/[0.05] rounded mb-2" />
      <div className="h-2 bg-[#1A2A1A]/[0.05] rounded w-1/2" />
    </div>
  );
}

function UnifiedEventCard({ event }: { event: UnifiedEvent }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="w-full px-3 py-2.5 rounded-xl bg-[#FFFFFF]/60 border border-[#1A2A1A]/[0.06]">
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-sm font-medium text-[#1A2A1A] leading-snug">{event.title}</span>
        <span className={`text-[9px] shrink-0 mt-0.5 px-1.5 py-0.5 rounded-full capitalize ${eventTypeBadgeClass(event.type)}`}>
          {event.type}
        </span>
      </div>
      <div className="text-[9px] text-[#7A9B7A] mb-1">{event.organization} · {sourceBadge(event.source)}</div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-[#7A9B7A] mb-1.5">
        <span>📅 {event.date}</span>
        {event.time && <span>🕐 {event.time}</span>}
        {event.location && <span>📍 {event.location}</span>}
      </div>
      {expanded && (
        <p className="text-[11px] text-[#4A6B4A] leading-relaxed mb-1.5">{event.description}</p>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-[10px] text-[#7A9B7A] hover:text-[#4A6B4A] transition-colors"
        >
          {expanded ? 'Less ▲' : 'More ▼'}
        </button>
        {event.url && (
          <a
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-teal-500/70 hover:text-teal-500 transition-colors"
          >
            View →
          </a>
        )}
      </div>
    </div>
  );
}

type EventFilter = 'all' | 'party' | 'official' | 'lecture' | 'sports';

interface SourceDebug {
  involvement: { status: SourceStatus; count: number };
  eventbrite:  { status: SourceStatus; count: number };
  registrar:   { status: SourceStatus; count: number };
}

interface EventsTabProps {
  events: UnifiedEvent[];
  eventsLoading: boolean;
  eventsError: boolean;
  failedSources: string[];
  skippedSources: string[];
  sourceDebug: SourceDebug | null;
  eventsUpdatedAt: number;
  onRetryEvents: () => void;
}

function EventsTab({ events, eventsLoading, eventsError, failedSources, skippedSources, sourceDebug, eventsUpdatedAt, onRetryEvents }: EventsTabProps) {
  const [filter, setFilter] = useState<EventFilter>('all');

  const minutesAgo = eventsUpdatedAt ? Math.floor((Date.now() - eventsUpdatedAt) / 60000) : null;

  const filtered = events.filter(e => {
    if (filter === 'all') return true;
    if (filter === 'party') return e.type === 'party' || e.type === 'social' || e.type === 'popup';
    if (filter === 'official') return e.type === 'official';
    if (filter === 'lecture') return e.type === 'lecture';
    if (filter === 'sports') return e.type === 'sports';
    return true;
  });

  const FILTERS: { key: EventFilter; label: string }[] = [
    { key: 'all',      label: 'All' },
    { key: 'party',    label: 'Parties' },
    { key: 'official', label: 'Official' },
    { key: 'lecture',  label: 'Lectures' },
    { key: 'sports',   label: 'Sports' },
  ];

  return (
    <div className="border-b border-[#1A2A1A]/[0.06]">
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#7A9B7A] flex items-center gap-1.5">
            <span>📅</span>Events
          </p>
          {minutesAgo !== null && (
            <span className="text-[9px] text-[#7A9B7A]/60">
              Updated {minutesAgo === 0 ? 'just now' : `${minutesAgo}m ago`}
            </span>
          )}
        </div>
        {/* Source status badges */}
        <div className="flex gap-1.5 flex-wrap mb-2">
          {([
            { label: 'GT Involvement', key: 'involvement' },
            { label: 'Eventbrite',     key: 'eventbrite'  },
            { label: 'GT Registrar',   key: 'registrar'   },
          ] as const).map(({ label, key }) => {
            const skipped = skippedSources.includes(key);
            const failed  = failedSources.includes(key);
            return (
              <span
                key={key}
                className={`text-[8px] px-1.5 py-0.5 rounded-full border ${
                  skipped ? 'border-gray-200 bg-gray-50 text-gray-400'
                  : failed ? 'border-red-200 bg-red-50 text-red-500'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-600'
                }`}
              >
                {skipped ? '–' : failed ? '✗' : '✓'} {label}
              </span>
            );
          })}
        </div>
        {/* Filter pills */}
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                filter === f.key
                  ? 'bg-[#1A2A1A] text-white border-[#1A2A1A]'
                  : 'text-[#7A9B7A] border-[#1A2A1A]/[0.12] hover:border-[#1A2A1A]/30'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="px-3 pb-3 space-y-2">
        {/* Partial failure warning */}
        {failedSources.length > 0 && failedSources.length < 3 && (
          <p className="text-[9px] text-amber-600/80 italic px-1">Some sources unavailable. Showing partial results.</p>
        )}
        {eventsLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : eventsError ? (
          <div className="px-1 py-2 space-y-2">
            <p className="text-[11px] text-[#7A9B7A] italic">Could not load events. Tap to retry.</p>
            <button
              onClick={onRetryEvents}
              className="text-[10px] px-3 py-1.5 rounded-lg bg-[#1A2A1A]/[0.06] hover:bg-[#1A2A1A]/[0.12] text-[#4A6B4A] transition-colors"
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-[11px] text-[#7A9B7A] italic px-1 py-1">No events found.</p>
        ) : (
          filtered.map((e, i) => <UnifiedEventCard key={i} event={e} />)
        )}
        <p className="text-[8px] text-[#7A9B7A]/50 px-1 pt-1">GT Involvement · Eventbrite · GT Registrar</p>
        {/* Debug panel — remove once events are confirmed working */}
        {sourceDebug && (
          <div className="mt-2 px-1 py-1.5 rounded-lg bg-[#1A2A1A]/[0.03] border border-[#1A2A1A]/[0.06]">
            <p className="text-[8px] font-semibold text-[#7A9B7A]/60 mb-1">Debug</p>
            {([
              { label: 'GT Involvement', key: 'involvement' },
              { label: 'Eventbrite',     key: 'eventbrite'  },
              { label: 'GT Registrar',   key: 'registrar'   },
            ] as const).map(({ label, key }) => {
              const d = sourceDebug[key];
              return (
                <p key={key} className="text-[8px] text-[#7A9B7A]/50 leading-relaxed">
                  {label}: {d.status === 'skipped' ? 'skipped (no key)' : d.status === 'error' ? 'error' : `${d.count} event${d.count !== 1 ? 's' : ''}`}
                </p>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface SidebarContentProps {
  data: PulseData | null;
  events: UnifiedEvent[];
  eventsLoading: boolean;
  eventsError: boolean;
  failedSources: string[];
  skippedSources: string[];
  sourceDebug: SourceDebug | null;
  eventsUpdatedAt: number;
  activeTab: 'campus' | 'events';
  onTabChange: (tab: 'campus' | 'events') => void;
  onSelectLoc: (l: LocationData) => void;
  onRetryEvents: () => void;
  selectedLocId?: string;
}

function SidebarContent({
  data,
  events,
  eventsLoading,
  eventsError,
  failedSources,
  skippedSources,
  sourceDebug,
  eventsUpdatedAt,
  activeTab,
  onTabChange,
  onSelectLoc,
  onRetryEvents,
  selectedLocId,
}: SidebarContentProps) {
  const dining     = data?.locations.filter(l => l.type === 'dining')                          ?? [];
  const recreation = data?.locations.filter(l => l.type === 'recreation')                      ?? [];
  const academic   = data?.locations.filter(l => l.type === 'academic' || l.type === 'outdoor') ?? [];

  return (
    <>
      {/* Tab header */}
      <div className="flex border-b border-[#1A2A1A]/[0.08] sticky top-0 bg-white z-10 shrink-0">
        <button
          onClick={() => onTabChange('campus')}
          className={`flex-1 py-2.5 text-[11px] font-semibold transition-colors ${
            activeTab === 'campus'
              ? 'text-[#1A2A1A] border-b-2 border-[#1A2A1A]'
              : 'text-[#7A9B7A] hover:text-[#4A6B4A]'
          }`}
        >
          Campus
        </button>
        <button
          onClick={() => onTabChange('events')}
          className={`flex-1 py-2.5 text-[11px] font-semibold transition-colors ${
            activeTab === 'events'
              ? 'text-[#1A2A1A] border-b-2 border-[#1A2A1A]'
              : 'text-[#7A9B7A] hover:text-[#4A6B4A]'
          }`}
        >
          Events
          {events.length > 0 && (
            <span className="ml-1 px-1 py-0.5 text-[8px] rounded-full bg-purple-100 text-purple-600">
              {events.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'campus' ? (
        <>
          <CardSection title="Dining" icon="🍽">
            {dining.map(loc => <LocationCard key={loc.id} loc={loc} onSelect={onSelectLoc} selected={loc.id === selectedLocId} />)}
          </CardSection>
          <CardSection title="Recreation" icon="💪">
            {recreation.map(loc => <LocationCard key={loc.id} loc={loc} onSelect={onSelectLoc} selected={loc.id === selectedLocId} />)}
          </CardSection>
          <CardSection title="Buildings & Study Spots" icon="📚">
            {academic.map(loc => <LocationCard key={loc.id} loc={loc} onSelect={onSelectLoc} selected={loc.id === selectedLocId} />)}
          </CardSection>
          <div className="px-4 pb-6 pt-2">
            <p className="text-[10px] text-[#7A9B7A]/70 leading-relaxed italic">
              Pulse uses modeled crowd data based on class schedules and historical patterns.
              Bus locations are live. Dining and CRC busyness is estimated, not real-time sensor data.
            </p>
          </div>
        </>
      ) : (
        <EventsTab
          events={events}
          eventsLoading={eventsLoading}
          eventsError={eventsError}
          failedSources={failedSources}
          skippedSources={skippedSources}
          sourceDebug={sourceDebug}
          eventsUpdatedAt={eventsUpdatedAt}
          onRetryEvents={onRetryEvents}
        />
      )}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PulsePage() {
  // ── Data state
  const [data,              setData]              = useState<PulseData | null>(null);
  const [events,            setEvents]            = useState<UnifiedEvent[]>([]);
  const [eventsLoading,     setEventsLoading]     = useState(true);
  const [eventsError,       setEventsError]       = useState(false);
  const [failedSources,     setFailedSources]     = useState<string[]>([]);
  const [skippedSources,    setSkippedSources]    = useState<string[]>([]);
  const [sourceDebug,       setSourceDebug]       = useState<SourceDebug | null>(null);
  const [eventsUpdatedAt,   setEventsUpdatedAt]   = useState(0);
  const [lastUpdated,       setLastUpdated]       = useState<number>(0);
  const [secAgo,            setSecAgo]            = useState(0);
  const [fetchError,        setFetchError]        = useState(false);

  // ── Layer toggles
  const [showHeatmap,    setShowHeatmap]    = useState(true);
  const [showCircles,    setShowCircles]    = useState(false);
  const [showEvents,     setShowEvents]     = useState(true);
  const [routeToggles,   setRouteToggles]  = useState<Record<RouteId, boolean>>({
    red: true, blue: true, green: true, gold: true,
  });

  // ── UI state
  const [activeTab,       setActiveTab]      = useState<'campus' | 'events'>('campus');
  const [selectedLoc,     setSelectedLoc]   = useState<LocationData | null>(null);
  const [chatOpen,        setChatOpen]       = useState(false);
  const [chatMessages,    setChatMessages]   = useState<ChatMessage[]>([]);
  const [chatInput,       setChatInput]      = useState("");
  const [chatLoading,     setChatLoading]    = useState(false);
  const [chatError,       setChatError]      = useState("");
  const [drawerOpen,      setDrawerOpen]     = useState(false);
  const [layersPanelOpen, setLayersPanelOpen] = useState(false);
  const [activeBusCount,  setActiveBusCount] = useState(0);
  const [busesSimulated,  setBusesSimulated]  = useState(false);

  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const dataRef    = useRef<PulseData | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── Fetch pulse data ──────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const res  = await fetch('/api/pulse', { cache: 'no-store' });
      if (!res.ok) throw new Error('fetch failed');
      const json = await res.json() as PulseData;
      setData(json);
      dataRef.current = json;
      setLastUpdated(Date.now());
      setSecAgo(0);
      setFetchError(false);
    } catch {
      setFetchError(true);
    }
  }, []);

  // ── Fetch unified events ──────────────────────────────────────────────────────
  const fetchEvents = useCallback(async () => {
    setEventsLoading(true);
    setEventsError(false);
    try {
      const res = await fetch('/api/events', { cache: 'no-store' });
      if (!res.ok) { setEventsError(true); setEventsLoading(false); return; }
      const json = await res.json() as EventsResponse;
      setEvents(json.events ?? []);
      setFailedSources(json.failedSources ?? []);
      setSkippedSources(json.skippedSources ?? []);
      setSourceDebug(json.sourceDebug ?? null);
      setEventsUpdatedAt(Date.now());
    } catch {
      setEventsError(true);
    } finally {
      setEventsLoading(false);
    }
  }, []);

  // ── Boot effect ───────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchData();
    fetchEvents();
    pollRef.current = setInterval(fetchData, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchData, fetchEvents]);

  // Live "last updated X seconds ago" counter
  useEffect(() => {
    tickRef.current = setInterval(() => {
      if (lastUpdated) setSecAgo(Math.floor((Date.now() - lastUpdated) / 1000));
    }, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [lastUpdated]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ── Chat handler ───────────────────────────────────────────────────────────
  const sendChat = useCallback(async (question: string) => {
    if (!question.trim() || chatLoading || !dataRef.current) return;
    setChatInput("");
    setChatError("");
    const userMsg: ChatMessage = { role: 'user', content: question };
    setChatMessages(prev => [...prev, userMsg]);
    setChatLoading(true);
    try {
      const res = await fetch('/api/pulse-ai', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ question, history: chatMessages.slice(-10), data: dataRef.current }),
      });
      const json = await res.json() as { answer?: string; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? 'Failed');
      setChatMessages(prev => [...prev, { role: 'assistant', content: json.answer! }]);
    } catch (e) {
      setChatError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setChatLoading(false);
    }
  }, [chatLoading, chatMessages]);

  // ── Route toggle helper ────────────────────────────────────────────────────
  const toggleRoute = useCallback((routeId: RouteId) => {
    setRouteToggles(prev => ({ ...prev, [routeId]: !prev[routeId] }));
  }, []);

  // ── Select location (pan map + show popup) ─────────────────────────────────
  const selectLocation = useCallback((loc: LocationData) => {
    setSelectedLoc(loc);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen bg-[#FFFFFF] text-[#1A2A1A] flex flex-col font-sans overflow-hidden">

      {/* ── Top status bar ──────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 px-4 py-2 bg-white border-b border-[#1A2A1A]/[0.08] text-xs select-none shrink-0 flex-wrap">
        <Link href="/#projects" className="text-[#7A9B7A] hover:text-[#4A6B4A] transition-colors mr-1">← Back</Link>

        <span className="font-semibold text-sm text-[#1A2A1A] tracking-tight">Pulse</span>
        <span className="text-[#7A9B7A]">·</span>

        <span className="text-[#4A6B4A]">
          {new Date().toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET
        </span>

        <span className="hidden sm:inline text-[#7A9B7A]">·</span>
        {data?.weather && (
          <span className="hidden sm:inline text-[#4A6B4A]">
            {data.weather.icon} {data.weather.temp}°F · {data.weather.description}
          </span>
        )}

        <span className="text-[#7A9B7A]">·</span>
        <span className="flex items-center gap-1.5 text-[#7A9B7A]">
          <span className={`w-1.5 h-1.5 rounded-full ${fetchError ? 'bg-red-500' : 'bg-emerald-400 animate-pulse'}`} />
          {fetchError ? 'Connection error' : lastUpdated ? `Updated ${secAgo}s ago` : 'Loading…'}
        </span>

        <span className="hidden sm:inline text-[#7A9B7A]">·</span>
        <span className="hidden sm:inline text-[#4A6B4A]">
          🚌 {activeBusCount} {activeBusCount === 1 ? 'bus' : 'buses'} active
          {busesSimulated && <span className="text-[#7A9B7A] ml-1">(simulated)</span>}
        </span>

        {/* Mobile weather on second row */}
        {data?.weather && (
          <div className="sm:hidden w-full text-[#4A6B4A] text-[11px] pb-0.5">
            {data.weather.icon} {data.weather.temp}°F · {data.weather.description}
          </div>
        )}
      </header>

      {/* ── Main layout ─────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Map column ─────────────────────────────────────────────────── */}
        <div className="relative flex-1 min-h-0">

          {/* Map */}
          <div className="absolute inset-0">
            <PulseMap
              data={data}
              events={events}
              showHeatmap={showHeatmap}
              showCircles={showCircles}
              showEvents={showEvents}
              routeToggles={routeToggles}
              onSelectLoc={selectLocation}
              selectedLoc={selectedLoc}
              onBusStatusChange={(count, sim) => {
                setActiveBusCount(count);
                setBusesSimulated(sim);
              }}
            />
          </div>

          {/* ── Layer toggle panel (top-left) ──────────────────────────── */}
          <div className="absolute top-3 left-3 z-10 bg-black/70 backdrop-blur-md rounded-xl border border-white/[0.08] min-w-[140px]">
            <button
              className="w-full flex items-center justify-between px-3 pt-3 pb-2"
              onClick={() => setLayersPanelOpen(o => !o)}
            >
              <p className="text-[9px] font-semibold uppercase tracking-widest text-white/30">Layers</p>
              <span className="text-white/30 text-xs">{layersPanelOpen ? '▲' : '▼'}</span>
            </button>
            {layersPanelOpen && (
              <div className="px-3 pb-3 space-y-2">
                {([
                  { key: 'heatmap', label: 'Heatmap', value: showHeatmap, set: setShowHeatmap },
                  { key: 'circles', label: 'Circles', value: showCircles, set: setShowCircles },
                  { key: 'events',  label: 'Events',  value: showEvents,  set: setShowEvents  },
                ] as const).map(({ key, label, value, set }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                    <div
                      onClick={() => set(!value)}
                      className={`w-7 h-3.5 rounded-full transition-colors relative shrink-0 cursor-pointer ${value ? 'bg-emerald-500' : 'bg-white/10'}`}
                    >
                      <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all shadow-sm ${value ? 'left-3.5' : 'left-0.5'}`} />
                    </div>
                    <span className={`text-xs transition-colors ${value ? 'text-white/80' : 'text-white/30'}`}>{label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* ── Stinger Routes legend (bottom-left) ────────────────────── */}
          <div className="absolute bottom-16 left-3 z-10 lg:bottom-3 bg-black/70 backdrop-blur-md rounded-xl border border-white/[0.08] min-w-[150px]">
            <div className="px-3 pt-3 pb-1">
              <p className="text-[9px] font-semibold uppercase tracking-widest text-white/30 mb-2">Stinger Routes</p>
              <div className="space-y-1.5">
                {BUS_ROUTE_DEFS.map(route => (
                  <label key={route.id} className="flex items-center gap-2 cursor-pointer select-none">
                    <div
                      onClick={() => toggleRoute(route.id)}
                      className={`w-7 h-3.5 rounded-full transition-colors relative shrink-0 cursor-pointer`}
                      style={{ backgroundColor: routeToggles[route.id] ? route.color : 'rgba(255,255,255,0.1)' }}
                    >
                      <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all shadow-sm ${routeToggles[route.id] ? 'left-3.5' : 'left-0.5'}`} />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: route.color }}
                      />
                      <span className={`text-xs transition-colors ${routeToggles[route.id] ? 'text-white/80' : 'text-white/30'}`}>
                        {route.name}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="px-3 pb-2 pt-1 border-t border-white/[0.06] mt-1">
              <p className="text-[8px] text-white/20 leading-tight">
                Simulated. Live tracking<br/>requires GT PTS credentials.
              </p>
            </div>
          </div>

          {/* ── Selected location popup ────────────────────────────────── */}
          {selectedLoc && (
            <div className="absolute inset-x-0 bottom-3 mx-auto z-20 max-w-xs px-3">
              <div className="bg-[#141820] border border-white/[0.1] rounded-2xl p-4 shadow-2xl relative">
                <button
                  onClick={() => setSelectedLoc(null)}
                  className="absolute top-3 right-3 text-white/30 hover:text-white/70 text-lg leading-none"
                >×</button>
                <p className="text-sm font-semibold text-white mb-1">{selectedLoc.name}</p>
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${selectedLoc.busyness}%`, backgroundColor: busynessHex(selectedLoc.busyness) }} />
                  </div>
                  <span className="text-xs font-medium shrink-0" style={{ color: busynessHex(selectedLoc.busyness) }}>{selectedLoc.busyness}%</span>
                </div>
                <div className="flex gap-3 text-[11px] text-white/40">
                  <span style={{ color: busynessHex(selectedLoc.busyness) }}>{selectedLoc.status}</span>
                  {selectedLoc.waitTime && <span>· {selectedLoc.waitTime}</span>}
                  <span>· Hours: {selectedLoc.peakHours}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Mobile buttons (bottom of map) ────────────────────────── */}
          <div className="lg:hidden absolute bottom-4 inset-x-4 z-20 flex gap-2">
            <button
              className="flex-1 bg-black/70 backdrop-blur-md border border-white/[0.1] rounded-full px-3 py-2 text-xs text-white/60 hover:text-white/90 transition-colors"
              onClick={() => setDrawerOpen(o => !o)}
            >
              {drawerOpen ? 'Hide Info ▼' : 'Campus Info ▲'}
            </button>
            <button
              className="flex-1 flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-all hover:scale-105 active:scale-95"
              style={{ background: 'linear-gradient(135deg, #B3A369 0%, #2D5A27 100%)', color: 'white' }}
              onClick={() => setChatOpen(true)}
            >
              <span>✦</span> Ask Pulse
            </button>
          </div>
        </div>

        {/* ── Desktop left sidebar - location data ────────────────────────── */}
        <aside className="hidden lg:flex lg:flex-col w-72 xl:w-80 flex-shrink-0 bg-white border-r border-[#1A2A1A]/[0.08] overflow-y-auto order-first">
          <SidebarContent
            data={data}
            events={events}
            eventsLoading={eventsLoading}
            eventsError={eventsError}
            failedSources={failedSources}
            skippedSources={skippedSources}
            sourceDebug={sourceDebug}
            eventsUpdatedAt={eventsUpdatedAt}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onSelectLoc={selectLocation}
            onRetryEvents={fetchEvents}
            selectedLocId={selectedLoc?.id}
          />
        </aside>

        {/* ── Desktop right panel - persistent chat ───────────────────────── */}
        <div className="hidden lg:flex lg:flex-col w-80 xl:w-96 flex-shrink-0 bg-white border-l border-[#1A2A1A]/[0.08]">
          {/* Chat header */}
          <div className="px-5 pt-5 pb-4 border-b border-[#1A2A1A]/[0.08] shrink-0">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #B3A369, #2D5A27)' }}>
                <span className="text-sm">✦</span>
              </div>
              <div>
                <p className="font-semibold text-sm text-[#1A2A1A] leading-none">Ask Pulse</p>
                <p className="text-[10px] text-[#7A9B7A] mt-0.5">your GT campus guide</p>
              </div>
              {data && (
                <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-400/70">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  live
                </span>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {chatMessages.length === 0 && (
              <div className="space-y-4">
                <p className="text-[11px] text-[#7A9B7A] leading-relaxed">
                  I know what&apos;s happening on campus right now - ask me anything.
                </p>
                <div className="space-y-2">
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => sendChat(s)}
                      className="w-full text-left text-[12px] px-3 py-2.5 rounded-xl border border-[#1A2A1A]/[0.08] text-[#4A6B4A] hover:text-[#1A2A1A] hover:border-[#1A2A1A]/20 hover:bg-[#FFFFFF] transition-all"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {chatMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'assistant' && (
                  <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 mr-2" style={{ background: 'linear-gradient(135deg, #B3A369, #2D5A27)' }}>
                    <span className="text-[9px]">✦</span>
                  </div>
                )}
                <div
                  className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-[#1A2A1A]/[0.07] text-[#1A2A1A] rounded-tr-sm'
                      : 'bg-[#FFFFFF] text-[#1A2A1A] rounded-tl-sm border border-[#1A2A1A]/[0.08]'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'linear-gradient(135deg, #B3A369, #2D5A27)' }}>
                  <span className="text-[9px]">✦</span>
                </div>
                <div className="bg-[#FFFFFF] px-3.5 py-3 rounded-2xl rounded-tl-sm border border-[#1A2A1A]/[0.08]">
                  <div className="flex gap-1">
                    {[0,1,2].map(i => (
                      <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#1A2A1A]/30 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            {chatError && <p className="text-xs text-red-400/70 text-center">{chatError}</p>}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <form
            className="px-4 pb-4 pt-3 shrink-0 border-t border-[#1A2A1A]/[0.08]"
            onSubmit={e => { e.preventDefault(); sendChat(chatInput); }}
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Ask anything…"
                className="flex-1 px-3.5 py-2.5 text-sm rounded-xl bg-[#FFFFFF] border border-[#1A2A1A]/[0.12] text-[#1A2A1A] placeholder:text-[#7A9B7A] focus:outline-none focus:border-terracotta/40 transition-colors"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || chatLoading || !data}
                className="px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-30 hover:brightness-110 active:scale-95"
                style={{ background: 'linear-gradient(135deg, #B3A369, #2D5A27)', color: 'white' }}
              >
                →
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ── Mobile bottom drawer - location data ─────────────────────────── */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-x-0 bottom-0 z-30 bg-white border-t border-[#1A2A1A]/[0.08] shadow-2xl overflow-y-auto"
          style={{ maxHeight: '60vh' }}
        >
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#1A2A1A]/[0.06] sticky top-0 bg-white z-10">
            <span className="text-xs font-semibold text-[#7A9B7A] uppercase tracking-widest">Campus Info</span>
            <button onClick={() => setDrawerOpen(false)} className="text-[#7A9B7A] hover:text-[#1A2A1A] text-xl leading-none">×</button>
          </div>
          <SidebarContent
            data={data}
            events={events}
            eventsLoading={eventsLoading}
            eventsError={eventsError}
            failedSources={failedSources}
            skippedSources={skippedSources}
            sourceDebug={sourceDebug}
            eventsUpdatedAt={eventsUpdatedAt}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onSelectLoc={(l) => { selectLocation(l); setDrawerOpen(false); }}
            onRetryEvents={fetchEvents}
            selectedLocId={selectedLoc?.id}
          />
        </div>
      )}

      {/* ── Mobile chat overlay ──────────────────────────────────────────── */}
      {chatOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-white">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1A2A1A]/[0.08] shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #B3A369, #2D5A27)' }}>
                <span className="text-xs">✦</span>
              </div>
              <span className="font-semibold text-sm text-[#1A2A1A]">Ask Pulse</span>
            </div>
            <button onClick={() => setChatOpen(false)} className="text-[#7A9B7A] hover:text-[#1A2A1A] text-xl leading-none">×</button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {chatMessages.length === 0 && (
              <div className="space-y-3">
                <p className="text-xs text-[#7A9B7A] leading-relaxed">I know what&apos;s happening on campus right now - ask me anything.</p>
                <div className="space-y-2">
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => sendChat(s)}
                      className="w-full text-left text-[12px] px-3 py-2.5 rounded-xl border border-[#1A2A1A]/[0.08] text-[#4A6B4A] hover:text-[#1A2A1A] hover:bg-[#FFFFFF] transition-all"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {chatMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-[#1A2A1A]/[0.07] text-[#1A2A1A] rounded-tr-sm'
                    : 'bg-[#FFFFFF] text-[#1A2A1A] rounded-tl-sm border border-[#1A2A1A]/[0.08]'
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-[#FFFFFF] px-3.5 py-3 rounded-2xl rounded-tl-sm border border-[#1A2A1A]/[0.08]">
                  <div className="flex gap-1">
                    {[0,1,2].map(i => (
                      <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#1A2A1A]/30 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            {chatError && <p className="text-xs text-red-400/70 text-center">{chatError}</p>}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <form
            className="px-4 pb-6 pt-3 shrink-0 border-t border-[#1A2A1A]/[0.08]"
            onSubmit={e => { e.preventDefault(); sendChat(chatInput); }}
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Ask anything…"
                className="flex-1 px-3.5 py-2.5 text-sm rounded-xl bg-[#FFFFFF] border border-[#1A2A1A]/[0.12] text-[#1A2A1A] placeholder:text-[#7A9B7A] focus:outline-none focus:border-terracotta/40 transition-colors"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || chatLoading || !data}
                className="px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-30"
                style={{ background: 'linear-gradient(135deg, #B3A369, #2D5A27)', color: 'white' }}
              >
                →
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
