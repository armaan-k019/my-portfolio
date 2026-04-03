"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import type { PulseData, LocationData } from "../../api/pulse/route";

// ─── Global window augmentation ───────────────────────────────────────────────

declare global {
  interface Window {
    __pulseMapReady?: () => void;
    gm_authFailure?: () => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google?: any;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface EventItem {
  title: string;
  location: string;
  date: string;
  time: string;
  description: string;
  url: string;
  onCampus: boolean;
}

interface SocialEvent {
  hasEvent: boolean;
  title: string;
  date: string | null;
  time: string | null;
  location: string | null;
  theme: string | null;
  type: 'party' | 'social' | 'official' | 'popup' | 'sports' | 'other';
  description: string;
  sourceAccount: string;
  postUrl: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GT_CENTER = { lat: 33.7756, lng: -84.3963 };
const GT_ZOOM   = 16;
const POLL_MS   = 10_000;

// ─── Bus Route definitions ────────────────────────────────────────────────────

const BUS_ROUTES = [
  {
    id: 'red',
    name: 'Red',
    color: '#E8392A',
    coords: [
      { lat: 33.7756, lng: -84.3963 },
      { lat: 33.7748, lng: -84.3972 },
      { lat: 33.7771, lng: -84.3978 },
      { lat: 33.7780, lng: -84.3960 },
      { lat: 33.7773, lng: -84.3942 },
      { lat: 33.7760, lng: -84.3948 },
      { lat: 33.7756, lng: -84.3963 },
    ],
  },
  {
    id: 'blue',
    name: 'Blue',
    color: '#1A6FBF',
    coords: [
      { lat: 33.7752, lng: -84.4002 },
      { lat: 33.7756, lng: -84.3985 },
      { lat: 33.7763, lng: -84.3945 },
      { lat: 33.7750, lng: -84.3930 },
      { lat: 33.7739, lng: -84.3885 },
    ],
  },
  {
    id: 'green',
    name: 'Green',
    color: '#2E8B57',
    coords: [
      { lat: 33.7790, lng: -84.3970 },
      { lat: 33.7800, lng: -84.3952 },
      { lat: 33.7795, lng: -84.3935 },
      { lat: 33.7780, lng: -84.3960 },
      { lat: 33.7752, lng: -84.4002 },
    ],
  },
  {
    id: 'gold',
    name: 'Gold',
    color: '#B8952A',
    coords: [
      { lat: 33.7756, lng: -84.3963 },
      { lat: 33.7758, lng: -84.3910 },
      { lat: 33.7739, lng: -84.3885 },
      { lat: 33.7745, lng: -84.3940 },
    ],
  },
] as const;

type RouteId = 'red' | 'blue' | 'green' | 'gold';

// ─── Campus location coordinate mapping ───────────────────────────────────────

const CAMPUS_LOCATIONS: Record<string, { lat: number; lng: number }> = {
  "student center":    { lat: 33.7756, lng: -84.3963 },
  "tech green":        { lat: 33.7758, lng: -84.3970 },
  "crc":               { lat: 33.7748, lng: -84.3972 },
  "culc":              { lat: 33.7760, lng: -84.3948 },
  "clough commons":    { lat: 33.7760, lng: -84.3948 },
  "klaus":             { lat: 33.7773, lng: -84.3942 },
  "college of design": { lat: 33.7756, lng: -84.3985 },
  "skiles":            { lat: 33.7763, lng: -84.3945 },
  "north ave dining":  { lat: 33.7771, lng: -84.3978 },
  "west village":      { lat: 33.7752, lng: -84.4002 },
  "bobby dodd":        { lat: 33.7744, lng: -84.3936 },
  "mccamish":          { lat: 33.7744, lng: -84.3952 },
  "ferst center":      { lat: 33.7790, lng: -84.3970 },
  "greek row":         { lat: 33.7694, lng: -84.3896 },
  "van leer":          { lat: 33.7764, lng: -84.4006 },
  "boggs":             { lat: 33.7771, lng: -84.3998 },
  "mason":             { lat: 33.7756, lng: -84.3940 },
  "tech tower":        { lat: 33.7756, lng: -84.3963 },
};

function matchLocationCoords(location: string): { lat: number; lng: number } | null {
  const lower = location.toLowerCase();
  for (const [key, coords] of Object.entries(CAMPUS_LOCATIONS)) {
    if (lower.includes(key)) return coords;
  }
  return null;
}

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

// ─── Campus event coord matching ──────────────────────────────────────────────

const CAMPUS_COORDS: { name: string; lat: number; lng: number }[] = [
  { name: 'Tech Green',          lat: 33.7751, lng: -84.3963 },
  { name: 'Student Center',      lat: 33.7748, lng: -84.3963 },
  { name: 'Clough Commons',      lat: 33.7757, lng: -84.3963 },
  { name: 'CULC',                lat: 33.7757, lng: -84.3963 },
  { name: 'Klaus',               lat: 33.7775, lng: -84.3958 },
  { name: 'Van Leer',            lat: 33.7764, lng: -84.4006 },
  { name: 'Skiles',              lat: 33.7742, lng: -84.3964 },
  { name: 'Boggs',               lat: 33.7771, lng: -84.3998 },
  { name: 'Mason',               lat: 33.7756, lng: -84.3940 },
  { name: 'CRC',                 lat: 33.7769, lng: -84.4039 },
  { name: 'Campus Rec',          lat: 33.7769, lng: -84.4039 },
  { name: 'North Ave Dining',    lat: 33.7721, lng: -84.3902 },
  { name: 'West Village',        lat: 33.7694, lng: -84.3956 },
  { name: 'Bobby Dodd',          lat: 33.7721, lng: -84.3929 },
  { name: 'Ferst Center',        lat: 33.7747, lng: -84.3979 },
  { name: 'Exhibition Hall',     lat: 33.7731, lng: -84.3960 },
  { name: 'Tech Tower',          lat: 33.7756, lng: -84.3963 },
  { name: 'College of Design',   lat: 33.7763, lng: -84.3939 },
];

function matchEventCoords(location: string): { lat: number; lng: number } | null {
  const lower = location.toLowerCase();
  for (const c of CAMPUS_COORDS) {
    if (lower.includes(c.name.toLowerCase())) return { lat: c.lat, lng: c.lng };
  }
  return null;
}

// ─── Physical footprint radii (metres) per location id ────────────────────────
const PHYSICAL_RADIUS: Record<string, number> = {
  chick_fil_a:    25,
  panda:          25,
  north_ave:      55,
  west_village:   55,
  crc:            90,
  clough:         45,
  student_center: 45,
  tech_green:     70,
  van_leer:       35,
  boggs:          32,
  skiles:         32,
  mason:          30,
  design:         30,
  tech_tower:     22,
};

function physRadius(id: string): number {
  return PHYSICAL_RADIUS[id] ?? 30;
}

// ─── Heatmap weight from busyness score ───────────────────────────────────────
function heatWeight(busyness: number): number {
  if (busyness < 30) return 0.2;
  if (busyness < 60) return 0.6;
  return 1.0;
}

// ─── Event type color/badge helpers ──────────────────────────────────────────

function eventTypeBadgeClass(type: SocialEvent['type']): string {
  switch (type) {
    case 'party':
    case 'social':   return 'bg-purple-100 text-purple-700';
    case 'official': return 'bg-teal-100 text-teal-700';
    case 'popup':    return 'bg-amber-100 text-amber-700';
    case 'sports':   return 'bg-blue-100 text-blue-700';
    default:         return 'bg-gray-100 text-gray-600';
  }
}

function eventTypePinColor(type: SocialEvent['type']): string {
  switch (type) {
    case 'party':
    case 'social':   return '#a855f7';
    case 'official': return '#0d9488';
    case 'popup':    return '#d97706';
    case 'sports':   return '#2563eb';
    default:         return '#6b7280';
  }
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function CardSection({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[#2C1810]/[0.06]">
      <div className="px-4 pt-4 pb-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9B8E85] flex items-center gap-1.5">
          <span>{icon}</span>{title}
        </p>
      </div>
      <div className="px-3 pb-3 space-y-2">
        {children}
      </div>
    </div>
  );
}

function LocationCard({ loc, onSelect }: { loc: LocationData; onSelect: (l: LocationData) => void }) {
  const color = busynessHex(loc.busyness);
  const wait  = waitLabel(loc);

  return (
    <button
      onClick={() => onSelect(loc)}
      className="w-full text-left px-3 py-2.5 rounded-xl bg-[#F5F0E8]/60 hover:bg-[#F5F0E8] border border-[#2C1810]/[0.06] transition-colors group"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="text-sm font-medium text-[#2C1810] flex items-center gap-1.5">
          <span className="text-base leading-none">{typeIcon(loc.type)}</span>
          {loc.name}
        </span>
        {loc.isOpen ? (
          <span className="text-[10px] font-semibold shrink-0 mt-0.5" style={{ color }}>{busynessLabel(loc.busyness)}</span>
        ) : (
          <span className="text-[10px] font-semibold shrink-0 mt-0.5 text-[#9B8E85]">-</span>
        )}
      </div>

      {/* Busyness bar */}
      <div className="w-full h-1 rounded-full bg-[#2C1810]/[0.08] overflow-hidden mb-1.5">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${loc.busyness}%`, backgroundColor: color }} />
      </div>

      <div className="flex items-center justify-between text-[10px] text-[#9B8E85]">
        <span>{loc.hoursToday ?? `Hours: ${loc.peakHours}`}</span>
        {loc.isOpen && wait && <span style={{ color: loc.busyness < 30 ? '#22c55e' : color }}>{wait}</span>}
      </div>

      {loc.isOpen && loc.subScores && (
        <div className="mt-2 space-y-1">
          {loc.subScores.map(s => (
            <div key={s.label} className="flex items-center gap-2">
              <span className="text-[10px] text-[#9B8E85] w-16 shrink-0">{s.label}</span>
              <div className="flex-1 h-0.5 rounded-full bg-[#2C1810]/[0.08] overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${s.score}%`, backgroundColor: busynessHex(s.score) }} />
              </div>
              <span className="text-[10px] text-[#9B8E85] w-6 text-right">{s.score}</span>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

function SkeletonCard() {
  return (
    <div className="w-full px-3 py-2.5 rounded-xl bg-[#F5F0E8]/60 border border-[#2C1810]/[0.06] animate-pulse">
      <div className="h-3 bg-[#2C1810]/[0.07] rounded mb-2 w-3/4" />
      <div className="h-1 bg-[#2C1810]/[0.05] rounded mb-2" />
      <div className="h-2 bg-[#2C1810]/[0.05] rounded w-1/2" />
    </div>
  );
}

function CalendarEventCard({ event }: { event: EventItem }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="w-full px-3 py-2.5 rounded-xl bg-[#F5F0E8]/60 border border-[#2C1810]/[0.06]">
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-sm font-medium text-[#2C1810] leading-snug">{event.title}</span>
        <span className="text-[9px] shrink-0 mt-0.5 px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700">
          {event.onCampus ? 'On Campus' : 'Off Campus'}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-[#9B8E85] mb-1.5">
        <span>📅 {event.date}</span>
        <span>🕐 {event.time}</span>
        <span>📍 {event.location}</span>
      </div>
      {expanded && (
        <p className="text-[11px] text-[#6B5244] leading-relaxed mb-1.5">{event.description}</p>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-[10px] text-[#9B8E85] hover:text-[#6B5244] transition-colors"
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

function SocialEventCard({ event }: { event: SocialEvent }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="w-full px-3 py-2.5 rounded-xl bg-[#F5F0E8]/60 border border-[#2C1810]/[0.06]">
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-sm font-medium text-[#2C1810] leading-snug">{event.title}</span>
        <span className={`text-[9px] shrink-0 mt-0.5 px-1.5 py-0.5 rounded-full capitalize ${eventTypeBadgeClass(event.type)}`}>
          {event.type}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-[#9B8E85] mb-1">
        {event.date && <span>📅 {event.date}</span>}
        {event.time && <span>🕐 {event.time}</span>}
        {event.location && <span>📍 {event.location}</span>}
        {event.theme && <span>🎨 {event.theme}</span>}
      </div>
      <div className="text-[9px] text-[#9B8E85] mb-1">@{event.sourceAccount}</div>
      {expanded && (
        <p className="text-[11px] text-[#6B5244] leading-relaxed mb-1.5">{event.description}</p>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-[10px] text-[#9B8E85] hover:text-[#6B5244] transition-colors"
        >
          {expanded ? 'Less ▲' : 'More ▼'}
        </button>
        {event.postUrl && (
          <a
            href={event.postUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-purple-400/70 hover:text-purple-400 transition-colors"
          >
            View post →
          </a>
        )}
      </div>
    </div>
  );
}

type EventFilter = 'all' | 'party' | 'official' | 'popup' | 'sports';

interface EventsTabProps {
  calendarEvents: EventItem[];
  socialEvents: SocialEvent[];
  calendarLoading: boolean;
  socialLoading: boolean;
  eventsUpdatedAt: number;
}

function EventsTab({ calendarEvents, socialEvents, calendarLoading, socialLoading, eventsUpdatedAt }: EventsTabProps) {
  const [filter, setFilter] = useState<EventFilter>('all');

  const minutesAgo = eventsUpdatedAt ? Math.floor((Date.now() - eventsUpdatedAt) / 60000) : null;

  const filteredCalendar = filter === 'all' || filter === 'official'
    ? calendarEvents
    : [];

  const filteredSocial = socialEvents.filter(e => {
    if (filter === 'all') return true;
    if (filter === 'party') return e.type === 'party' || e.type === 'social';
    if (filter === 'official') return e.type === 'official';
    if (filter === 'popup') return e.type === 'popup';
    if (filter === 'sports') return e.type === 'sports';
    return true;
  });

  const FILTERS: { key: EventFilter; label: string }[] = [
    { key: 'all',      label: 'All' },
    { key: 'party',    label: 'Parties' },
    { key: 'official', label: 'Official' },
    { key: 'popup',    label: 'Pop-ups' },
    { key: 'sports',   label: 'Sports' },
  ];

  return (
    <div className="border-b border-[#2C1810]/[0.06]">
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9B8E85] flex items-center gap-1.5">
            <span>📅</span>Events
          </p>
          {minutesAgo !== null && (
            <span className="text-[9px] text-[#9B8E85]/60">
              Updated {minutesAgo === 0 ? 'just now' : `${minutesAgo}m ago`}
            </span>
          )}
        </div>
        {/* Filter pills */}
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                filter === f.key
                  ? 'bg-[#2C1810] text-white border-[#2C1810]'
                  : 'text-[#9B8E85] border-[#2C1810]/[0.12] hover:border-[#2C1810]/30'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="px-3 pb-3 space-y-2">
        {/* Calendar events */}
        {calendarLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : filteredCalendar.length === 0 && filter === 'all' ? (
          <p className="text-[11px] text-[#9B8E85] italic px-1 py-1">No upcoming calendar events.</p>
        ) : (
          filteredCalendar.map((e, i) => <CalendarEventCard key={`cal-${i}`} event={e} />)
        )}

        {/* Social events */}
        {filteredSocial.map((e, i) => <SocialEventCard key={`soc-${i}`} event={e} />)}

        {/* Social loading indicator */}
        {socialLoading && (
          <div className="flex items-center gap-2 px-1 py-2">
            <div className="w-3 h-3 border border-[#9B8E85]/30 border-t-[#9B8E85]/70 rounded-full animate-spin shrink-0" />
            <span className="text-[10px] text-[#9B8E85]/70 italic">Loading social events…</span>
          </div>
        )}
      </div>
    </div>
  );
}

interface SidebarContentProps {
  data: PulseData | null;
  calendarEvents: EventItem[];
  socialEvents: SocialEvent[];
  calendarLoading: boolean;
  socialLoading: boolean;
  eventsUpdatedAt: number;
  activeTab: 'campus' | 'events';
  onTabChange: (tab: 'campus' | 'events') => void;
  onSelectLoc: (l: LocationData) => void;
}

function SidebarContent({
  data,
  calendarEvents,
  socialEvents,
  calendarLoading,
  socialLoading,
  eventsUpdatedAt,
  activeTab,
  onTabChange,
  onSelectLoc,
}: SidebarContentProps) {
  const dining     = data?.locations.filter(l => l.type === 'dining')                          ?? [];
  const recreation = data?.locations.filter(l => l.type === 'recreation')                      ?? [];
  const academic   = data?.locations.filter(l => l.type === 'academic' || l.type === 'outdoor') ?? [];

  return (
    <>
      {/* Tab header */}
      <div className="flex border-b border-[#2C1810]/[0.08] sticky top-0 bg-white z-10 shrink-0">
        <button
          onClick={() => onTabChange('campus')}
          className={`flex-1 py-2.5 text-[11px] font-semibold transition-colors ${
            activeTab === 'campus'
              ? 'text-[#2C1810] border-b-2 border-[#2C1810]'
              : 'text-[#9B8E85] hover:text-[#6B5244]'
          }`}
        >
          Campus
        </button>
        <button
          onClick={() => onTabChange('events')}
          className={`flex-1 py-2.5 text-[11px] font-semibold transition-colors ${
            activeTab === 'events'
              ? 'text-[#2C1810] border-b-2 border-[#2C1810]'
              : 'text-[#9B8E85] hover:text-[#6B5244]'
          }`}
        >
          Events
          {(calendarEvents.length > 0 || socialEvents.length > 0) && (
            <span className="ml-1 px-1 py-0.5 text-[8px] rounded-full bg-purple-100 text-purple-600">
              {calendarEvents.length + socialEvents.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'campus' ? (
        <>
          <CardSection title="Dining" icon="🍽">
            {dining.map(loc => <LocationCard key={loc.id} loc={loc} onSelect={onSelectLoc} />)}
          </CardSection>
          <CardSection title="Recreation" icon="💪">
            {recreation.map(loc => <LocationCard key={loc.id} loc={loc} onSelect={onSelectLoc} />)}
          </CardSection>
          <CardSection title="Buildings & Study Spots" icon="📚">
            {academic.map(loc => <LocationCard key={loc.id} loc={loc} onSelect={onSelectLoc} />)}
          </CardSection>
          <div className="px-4 pb-6 pt-2">
            <p className="text-[10px] text-[#9B8E85]/70 leading-relaxed italic">
              Pulse uses modeled crowd data based on class schedules and historical patterns.
              Bus locations are live. Dining and CRC busyness is estimated, not real-time sensor data.
            </p>
          </div>
        </>
      ) : (
        <EventsTab
          calendarEvents={calendarEvents}
          socialEvents={socialEvents}
          calendarLoading={calendarLoading}
          socialLoading={socialLoading}
          eventsUpdatedAt={eventsUpdatedAt}
        />
      )}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PulsePage() {
  // ── Data state
  const [data,              setData]              = useState<PulseData | null>(null);
  const [calendarEvents,    setCalendarEvents]    = useState<EventItem[]>([]);
  const [socialEvents,      setSocialEvents]      = useState<SocialEvent[]>([]);
  const [calendarLoading,   setCalendarLoading]   = useState(true);
  const [socialLoading,     setSocialLoading]     = useState(true);
  const [eventsUpdatedAt,   setEventsUpdatedAt]   = useState(0);
  const [mapsLoaded,        setMapsLoaded]        = useState(false);
  const [mapError,          setMapError]          = useState<string | null>(null);
  const [mapTimedOut,       setMapTimedOut]       = useState(false);
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

  // ── Map / overlay refs
  const mapContainerRef      = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef               = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const heatmapRef           = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const circlesRef           = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const locationMarkersRef   = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventMarkersRef      = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const busMarkersRef        = useRef<any[]>([]);
  // Route polylines: one per route id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const routePolylinesRef    = useRef<Record<string, any>>({});
  // Route stop markers: one array per route id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const routeStopMarkersRef  = useRef<Record<string, any[]>>({});
  const circleAnimRef        = useRef<number>(0);
  const pollRef              = useRef<ReturnType<typeof setInterval> | null>(null);
  const busPollRef           = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef              = useRef<ReturnType<typeof setInterval> | null>(null);
  const dataRef              = useRef<PulseData | null>(null);
  const chatEndRef           = useRef<HTMLDivElement>(null);

  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  // ── Load Google Maps ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (window.google?.maps) { setMapsLoaded(true); return; }
    window.__pulseMapReady = () => setMapsLoaded(true);
    window.gm_authFailure  = () => setMapError('Google Maps API key is invalid or this domain is not allowlisted. Check Google Cloud Console → Credentials.');
    if (document.getElementById("pulse-maps-script")) return;
    if (!mapsKey) {
      setMapError('Google Maps API key is not configured.');
      return;
    }
    const s = document.createElement("script");
    s.id    = "pulse-maps-script";
    s.src   = `https://maps.googleapis.com/maps/api/js?key=${mapsKey}&libraries=visualization&callback=__pulseMapReady`;
    s.async = true; s.defer = true;
    s.onerror = () => setMapError('Failed to load Google Maps script. Check network connectivity.');
    document.head.appendChild(s);
    return () => { delete window.__pulseMapReady; delete window.gm_authFailure; };
  }, [mapsKey]);

  // ── Map load timeout ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapsLoaded || mapError) return;
    const t = setTimeout(() => setMapTimedOut(true), 10_000);
    return () => clearTimeout(t);
  }, [mapsLoaded, mapError]);

  // ── Init map ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapsLoaded || !mapContainerRef.current || mapRef.current) return;
    const map = new window.google.maps.Map(mapContainerRef.current, {
      center: GT_CENTER,
      zoom:   GT_ZOOM,
      mapTypeId: 'roadmap',
      styles: [
        { elementType: 'geometry',        stylers: [{ color: '#f5f0e8' }] },
        { elementType: 'labels.text.fill',stylers: [{ color: '#5C4A3A' }] },
        { featureType: 'water',           elementType: 'geometry', stylers: [{ color: '#c9d8e8' }] },
        { featureType: 'road',            elementType: 'geometry', stylers: [{ color: '#ede5d8' }] },
        { featureType: 'road.highway',    elementType: 'geometry', stylers: [{ color: '#e0d5c5' }] },
        { featureType: 'poi.park',        elementType: 'geometry', stylers: [{ color: '#d5e4d0' }] },
        { featureType: 'poi',             elementType: 'labels',   stylers: [{ visibility: 'off' }] },
        { featureType: 'transit',         elementType: 'labels',   stylers: [{ visibility: 'off' }] },
      ],
      disableDefaultUI: false,
      zoomControl: false,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      gestureHandling: 'none',
      scrollwheel: false,
      disableDoubleClickZoom: true,
      draggable: false,
    });
    mapRef.current = map;
  }, [mapsLoaded]);

  // ── Draw bus route polylines + stop markers ───────────────────────────────────
  useEffect(() => {
    if (!mapsLoaded || !mapRef.current || !window.google?.maps) return;

    BUS_ROUTES.forEach(route => {
      // Polyline
      if (!routePolylinesRef.current[route.id]) {
        const poly = new window.google.maps.Polyline({
          path: route.coords,
          geodesic: true,
          strokeColor: route.color,
          strokeOpacity: 0.85,
          strokeWeight: 3,
          map: routeToggles[route.id] ? mapRef.current : null,
          zIndex: 2,
        });
        routePolylinesRef.current[route.id] = poly;
      } else {
        routePolylinesRef.current[route.id].setMap(
          routeToggles[route.id] ? mapRef.current : null
        );
      }

      // Stop dot markers
      if (!routeStopMarkersRef.current[route.id]) {
        routeStopMarkersRef.current[route.id] = route.coords.map(coord => {
          const svgDot = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10">
            <circle cx="5" cy="5" r="4" fill="${route.color}" stroke="white" stroke-width="1.5"/>
          </svg>`;
          return new window.google.maps.Marker({
            position: coord,
            map: routeToggles[route.id] ? mapRef.current : null,
            icon: {
              url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svgDot)}`,
              scaledSize: new window.google.maps.Size(10, 10),
              anchor: new window.google.maps.Point(5, 5),
            },
            zIndex: 3,
          });
        });
      } else {
        routeStopMarkersRef.current[route.id].forEach((m: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (m as any).setMap(routeToggles[route.id] ? mapRef.current : null);
        });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapsLoaded, routeToggles]);

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

  // ── Fetch bus positions ───────────────────────────────────────────────────────
  const fetchBuses = useCallback(async () => {
    if (!mapRef.current || !window.google?.maps) return;
    try {
      const res = await fetch('/api/buses', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json() as { buses: { id: string; lat: number; lng: number; routeId: string; routeName: string; heading: number }[] };
      const buses = json.buses ?? [];

      // Clear old bus markers
      busMarkersRef.current.forEach(m => m.setMap(null));
      busMarkersRef.current = [];

      buses.forEach(bus => {
        // Find route color
        const route = BUS_ROUTES.find(r =>
          bus.routeName?.toLowerCase().includes(r.name.toLowerCase()) ||
          bus.routeId === r.id
        );
        const color = route?.color ?? '#888888';
        const routeId = route?.id as RouteId | undefined;

        // Hide bus if its route is toggled off
        if (routeId && !routeToggles[routeId]) return;

        const heading = bus.heading ?? 0;
        const svgBus = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="9" fill="${color}" stroke="white" stroke-width="1.5"/>
          <path d="M10 3 L13 9 L10 7 L7 9 Z" fill="white" transform="rotate(${heading}, 10, 10)"/>
        </svg>`;

        const marker = new window.google.maps.Marker({
          position: { lat: bus.lat, lng: bus.lng },
          map: mapRef.current,
          icon: {
            url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svgBus)}`,
            scaledSize: new window.google.maps.Size(20, 20),
            anchor: new window.google.maps.Point(10, 10),
          },
          title: `${bus.routeName} · Bus ${bus.id}`,
          zIndex: 10,
        });

        const infoWindow = new window.google.maps.InfoWindow({
          content: `<div style="font-family:sans-serif;padding:4px 8px;max-width:180px">
            <p style="font-weight:600;margin:0;color:${color};font-size:12px">${bus.routeName}</p>
            <p style="margin:2px 0 0;font-size:11px;color:#555">Vehicle ID: ${bus.id}</p>
          </div>`,
        });
        marker.addListener('click', () => infoWindow.open(mapRef.current, marker));

        busMarkersRef.current.push(marker);
      });
    } catch {
      // silently fail
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeToggles]);

  // ── Fetch calendar events ─────────────────────────────────────────────────────
  const fetchCalendarEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/events', { cache: 'no-store' });
      if (!res.ok) { setCalendarLoading(false); return; }
      const json = await res.json() as { events: EventItem[] };
      setCalendarEvents(json.events ?? []);
      setEventsUpdatedAt(Date.now());
    } catch {
      // silently fail
    } finally {
      setCalendarLoading(false);
    }
  }, []);

  // ── Fetch social events (Apify, runs in background) ───────────────────────────
  const fetchSocialEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/social-events', { cache: 'no-store' });
      if (!res.ok) { setSocialLoading(false); return; }
      const json = await res.json() as { events: SocialEvent[] };
      setSocialEvents(prev => {
        const newEvents = (json.events ?? []).filter(
          ne => !prev.some(pe => pe.title === ne.title && pe.sourceAccount === ne.sourceAccount)
        );
        return [...prev, ...newEvents];
      });
    } catch {
      // silently fail
    } finally {
      setSocialLoading(false);
    }
  }, []);

  // ── Boot effect ───────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchData();
    fetchCalendarEvents();
    fetchSocialEvents(); // runs async in background
    pollRef.current    = setInterval(fetchData, POLL_MS);
    busPollRef.current = setInterval(fetchBuses, 15_000);
    return () => {
      if (pollRef.current)    clearInterval(pollRef.current);
      if (busPollRef.current) clearInterval(busPollRef.current);
    };
  }, [fetchData, fetchCalendarEvents, fetchSocialEvents, fetchBuses]);

  // Live "last updated X seconds ago" counter
  useEffect(() => {
    tickRef.current = setInterval(() => {
      if (lastUpdated) setSecAgo(Math.floor((Date.now() - lastUpdated) / 1000));
    }, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [lastUpdated]);

  // Fetch buses whenever map becomes ready
  useEffect(() => {
    if (mapsLoaded) fetchBuses();
  }, [mapsLoaded, fetchBuses]);

  // ── Heatmap layer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !data || !window.google?.maps?.visualization) return;

    const points = data.locations.map(loc => ({
      location: new window.google.maps.LatLng(loc.lat, loc.lng),
      weight:   heatWeight(loc.busyness),
    }));

    if (heatmapRef.current) {
      heatmapRef.current.setData(points);
      heatmapRef.current.setMap(showHeatmap ? mapRef.current : null);
    } else {
      heatmapRef.current = new window.google.maps.visualization.HeatmapLayer({
        data: points,
        map:  showHeatmap ? mapRef.current : null,
        radius:   40,
        opacity:  0.65,
        gradient: [
          'rgba(0,160,0,0)',
          'rgba(0,200,0,1)',
          'rgba(200,200,0,1)',
          'rgba(250,130,0,1)',
          'rgba(240,50,50,1)',
        ],
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, showHeatmap, mapsLoaded]);

  // ── Location pin markers ──────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !data || !window.google?.maps) return;

    locationMarkersRef.current.forEach(m => m.setMap(null));
    locationMarkersRef.current = [];

    locationMarkersRef.current = data.locations.map(loc => {
      const color = busynessHex(loc.busyness);
      const svgPin = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="30" viewBox="0 0 24 30">
        <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 18 12 18s12-9 12-18C24 5.373 18.627 0 12 0z" fill="${color}" stroke="white" stroke-width="1.5"/>
        <circle cx="12" cy="12" r="4.5" fill="white" opacity="0.9"/>
      </svg>`;
      const iconUrl = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svgPin)}`;
      const marker = new window.google.maps.Marker({
        position: { lat: loc.lat, lng: loc.lng },
        map: mapRef.current,
        icon: {
          url: iconUrl,
          scaledSize: new window.google.maps.Size(24, 30),
          anchor: new window.google.maps.Point(12, 30),
        },
        title: loc.name,
        zIndex: 5,
      });
      marker.addListener('click', () => setSelectedLoc(loc));
      return marker;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, mapsLoaded]);

  // ── Pulsing circles layer ─────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !data) return;

    circlesRef.current.forEach(c => c.setMap(null));
    circlesRef.current = [];

    if (!showCircles) {
      cancelAnimationFrame(circleAnimRef.current);
      return;
    }

    circlesRef.current = data.locations.map(loc => {
      const baseRadius = physRadius(loc.id) + (loc.busyness / 100) * 30;
      return new window.google.maps.Circle({
        map:           mapRef.current,
        center:        { lat: loc.lat, lng: loc.lng },
        radius:        baseRadius,
        fillColor:     busynessHex(loc.busyness),
        fillOpacity:   0.28,
        strokeColor:   busynessHex(loc.busyness),
        strokeOpacity: 0.7,
        strokeWeight:  1.5,
        clickable:     true,
      });
    });

    circlesRef.current.forEach((circle, i) => {
      circle.addListener('click', () => setSelectedLoc(data.locations[i] ?? null));
    });

    let t = 0;
    function animateCircles() {
      circleAnimRef.current = requestAnimationFrame(animateCircles);
      if (document.hidden) return;
      t += 0.025;
      circlesRef.current.forEach((circle, i) => {
        const loc = data!.locations[i];
        if (!loc) return;
        const base      = physRadius(loc.id) + (loc.busyness / 100) * 30;
        const amplitude = base * 0.15;
        const phase     = i * 0.6;
        const r         = base + Math.sin(t + phase) * amplitude;
        circle.setRadius(r);
        circle.setOptions({ fillOpacity: 0.18 + Math.sin(t + phase) * 0.10 });
      });
    }
    animateCircles();

    return () => cancelAnimationFrame(circleAnimRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, showCircles, mapsLoaded]);

  // ── Event markers (calendar + social) ─────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !window.google?.maps) return;

    eventMarkersRef.current.forEach(m => m.setMap(null));
    eventMarkersRef.current = [];

    if (!showEvents) return;

    // Calendar event markers
    const calendarOnCampus = calendarEvents.filter(e => e.onCampus);
    calendarOnCampus.forEach(event => {
      const coords = matchEventCoords(event.location);
      if (!coords) return;

      const svgPin = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="28" viewBox="0 0 24 30">
        <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 18 12 18s12-9 12-18C24 5.373 18.627 0 12 0z" fill="#0d9488" stroke="white" stroke-width="1.5"/>
        <text x="12" y="16" text-anchor="middle" fill="white" font-size="10" font-family="sans-serif">📅</text>
      </svg>`;
      const iconUrl = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svgPin)}`;
      const marker = new window.google.maps.Marker({
        position: coords,
        map: mapRef.current,
        icon: {
          url: iconUrl,
          scaledSize: new window.google.maps.Size(22, 28),
          anchor: new window.google.maps.Point(11, 28),
        },
        title: event.title,
        zIndex: 7,
      });
      marker.addListener('click', () => {
        const iw = new window.google.maps.InfoWindow({
          content: `<div style="font-family:sans-serif;padding:4px 8px;max-width:200px">
            <p style="font-weight:600;margin:0;color:#0d9488;font-size:13px">${event.title}</p>
            <p style="margin:4px 0 0;font-size:11px;color:#555">${event.date} · ${event.time}</p>
            <p style="margin:2px 0 0;font-size:11px;color:#555">${event.location}</p>
          </div>`,
        });
        iw.open(mapRef.current, marker);
      });
      eventMarkersRef.current.push(marker);
    });

    // Social event markers
    socialEvents.forEach(event => {
      if (!event.location) return;
      const coords = matchLocationCoords(event.location);
      if (!coords) return;

      const pinColor = eventTypePinColor(event.type);
      const svgPin = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="28" viewBox="0 0 24 30">
        <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 18 12 18s12-9 12-18C24 5.373 18.627 0 12 0z" fill="${pinColor}" stroke="white" stroke-width="1.5"/>
        <text x="12" y="16" text-anchor="middle" fill="white" font-size="10" font-family="sans-serif">★</text>
      </svg>`;
      const iconUrl = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svgPin)}`;
      const marker = new window.google.maps.Marker({
        position: coords,
        map: mapRef.current,
        icon: {
          url: iconUrl,
          scaledSize: new window.google.maps.Size(22, 28),
          anchor: new window.google.maps.Point(11, 28),
        },
        title: event.title,
        zIndex: 7,
      });
      marker.addListener('click', () => {
        const iw = new window.google.maps.InfoWindow({
          content: `<div style="font-family:sans-serif;padding:4px 8px;max-width:200px">
            <p style="font-weight:600;margin:0;color:${pinColor};font-size:13px">${event.title}</p>
            <p style="margin:4px 0 0;font-size:11px;color:#555">${event.date ?? ''} ${event.time ?? ''}</p>
            <p style="margin:2px 0 0;font-size:11px;color:#555">${event.location}</p>
            <p style="margin:2px 0 0;font-size:10px;color:#888">@${event.sourceAccount}</p>
          </div>`,
        });
        iw.open(mapRef.current, marker);
      });
      eventMarkersRef.current.push(marker);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarEvents, socialEvents, showEvents, mapsLoaded]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (pollRef.current)    clearInterval(pollRef.current);
      if (busPollRef.current) clearInterval(busPollRef.current);
      if (tickRef.current)    clearInterval(tickRef.current);
      cancelAnimationFrame(circleAnimRef.current);
      locationMarkersRef.current.forEach(m => m.setMap(null));
      eventMarkersRef.current.forEach(m => m.setMap(null));
      busMarkersRef.current.forEach(m => m.setMap(null));
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen bg-[#F5F0E8] text-[#2C1810] flex flex-col font-sans overflow-hidden">

      {/* ── Top status bar ──────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 px-4 py-2 bg-white border-b border-[#2C1810]/[0.08] text-xs select-none shrink-0 flex-wrap">
        <Link href="/#projects" className="text-[#9B8E85] hover:text-[#6B5244] transition-colors mr-1">← Back</Link>

        <span className="font-semibold text-sm text-[#2C1810] tracking-tight">Pulse</span>
        <span className="text-[#9B8E85]">·</span>

        <span className="text-[#6B5244]">
          {new Date().toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET
        </span>

        <span className="hidden sm:inline text-[#9B8E85]">·</span>
        {data?.weather && (
          <span className="hidden sm:inline text-[#6B5244]">
            {data.weather.icon} {data.weather.temp}°F · {data.weather.description}
          </span>
        )}

        <span className="text-[#9B8E85]">·</span>
        <span className="flex items-center gap-1.5 text-[#9B8E85]">
          <span className={`w-1.5 h-1.5 rounded-full ${fetchError ? 'bg-red-500' : 'bg-emerald-400 animate-pulse'}`} />
          {fetchError ? 'Connection error' : lastUpdated ? `Updated ${secAgo}s ago` : 'Loading…'}
        </span>

        {/* Mobile weather on second row */}
        {data?.weather && (
          <div className="sm:hidden w-full text-[#6B5244] text-[11px] pb-0.5">
            {data.weather.icon} {data.weather.temp}°F · {data.weather.description}
          </div>
        )}
      </header>

      {/* ── Main layout ─────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Map column ─────────────────────────────────────────────────── */}
        <div className="relative flex-1 min-h-0">

          {/* Map */}
          <div ref={mapContainerRef} className="absolute inset-0 bg-[#111318]" />
          {!mapsLoaded && !mapError && !mapTimedOut && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-2">
              <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
              <p className="text-white/25 text-xs">Loading map…</p>
            </div>
          )}
          {(mapError || mapTimedOut) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#111318]/80 backdrop-blur-sm">
              <span className="text-3xl">🗺️</span>
              <p className="text-white/70 text-sm font-medium">Map unavailable</p>
              <p className="text-white/35 text-xs max-w-[260px] text-center leading-relaxed">
                {mapError ?? 'Map took too long to load. Check your connection or try again.'}
              </p>
              <button
                onClick={() => {
                  setMapError(null);
                  setMapTimedOut(false);
                  const existing = document.getElementById('pulse-maps-script');
                  if (existing) existing.remove();
                  if (window.google?.maps) { setMapsLoaded(true); return; }
                  window.__pulseMapReady = () => setMapsLoaded(true);
                  window.gm_authFailure  = () => setMapError('Google Maps API key is invalid or this domain is not allowlisted.');
                  const s = document.createElement('script');
                  s.id    = 'pulse-maps-script';
                  s.src   = `https://maps.googleapis.com/maps/api/js?key=${mapsKey}&libraries=visualization&callback=__pulseMapReady`;
                  s.async = true; s.defer = true;
                  s.onerror = () => setMapError('Failed to load Google Maps script.');
                  document.head.appendChild(s);
                }}
                className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-white/70 text-xs transition-colors"
              >
                Retry
              </button>
            </div>
          )}

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
                {BUS_ROUTES.map(route => (
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
            <div className="px-3 pb-2 pt-1">
              <p className="text-[8px] text-white/20">Live · Stinger Bus</p>
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
              style={{ background: 'linear-gradient(135deg, #B3A369 0%, #C1513A 100%)', color: 'white' }}
              onClick={() => setChatOpen(true)}
            >
              <span>✦</span> Ask Pulse
            </button>
          </div>
        </div>

        {/* ── Desktop left sidebar - location data ────────────────────────── */}
        <aside className="hidden lg:flex lg:flex-col w-72 xl:w-80 flex-shrink-0 bg-white border-r border-[#2C1810]/[0.08] overflow-y-auto order-first">
          <SidebarContent
            data={data}
            calendarEvents={calendarEvents}
            socialEvents={socialEvents}
            calendarLoading={calendarLoading}
            socialLoading={socialLoading}
            eventsUpdatedAt={eventsUpdatedAt}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onSelectLoc={setSelectedLoc}
          />
        </aside>

        {/* ── Desktop right panel - persistent chat ───────────────────────── */}
        <div className="hidden lg:flex lg:flex-col w-80 xl:w-96 flex-shrink-0 bg-white border-l border-[#2C1810]/[0.08]">
          {/* Chat header */}
          <div className="px-5 pt-5 pb-4 border-b border-[#2C1810]/[0.08] shrink-0">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #B3A369, #C1513A)' }}>
                <span className="text-sm">✦</span>
              </div>
              <div>
                <p className="font-semibold text-sm text-[#2C1810] leading-none">Ask Pulse</p>
                <p className="text-[10px] text-[#9B8E85] mt-0.5">your GT campus guide</p>
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
                <p className="text-[11px] text-[#9B8E85] leading-relaxed">
                  I know what&apos;s happening on campus right now - ask me anything.
                </p>
                <div className="space-y-2">
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => sendChat(s)}
                      className="w-full text-left text-[12px] px-3 py-2.5 rounded-xl border border-[#2C1810]/[0.08] text-[#6B5244] hover:text-[#2C1810] hover:border-[#2C1810]/20 hover:bg-[#F5F0E8] transition-all"
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
                  <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 mr-2" style={{ background: 'linear-gradient(135deg, #B3A369, #C1513A)' }}>
                    <span className="text-[9px]">✦</span>
                  </div>
                )}
                <div
                  className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-[#2C1810]/[0.07] text-[#2C1810] rounded-tr-sm'
                      : 'bg-[#F5F0E8] text-[#2C1810] rounded-tl-sm border border-[#2C1810]/[0.08]'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'linear-gradient(135deg, #B3A369, #C1513A)' }}>
                  <span className="text-[9px]">✦</span>
                </div>
                <div className="bg-[#F5F0E8] px-3.5 py-3 rounded-2xl rounded-tl-sm border border-[#2C1810]/[0.08]">
                  <div className="flex gap-1">
                    {[0,1,2].map(i => (
                      <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#2C1810]/30 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
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
            className="px-4 pb-4 pt-3 shrink-0 border-t border-[#2C1810]/[0.08]"
            onSubmit={e => { e.preventDefault(); sendChat(chatInput); }}
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Ask anything…"
                className="flex-1 px-3.5 py-2.5 text-sm rounded-xl bg-[#F5F0E8] border border-[#2C1810]/[0.12] text-[#2C1810] placeholder:text-[#9B8E85] focus:outline-none focus:border-terracotta/40 transition-colors"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || chatLoading || !data}
                className="px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-30 hover:brightness-110 active:scale-95"
                style={{ background: 'linear-gradient(135deg, #B3A369, #C1513A)', color: 'white' }}
              >
                →
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ── Mobile bottom drawer - location data ─────────────────────────── */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-x-0 bottom-0 z-30 bg-white border-t border-[#2C1810]/[0.08] shadow-2xl overflow-y-auto"
          style={{ maxHeight: '60vh' }}
        >
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#2C1810]/[0.06] sticky top-0 bg-white z-10">
            <span className="text-xs font-semibold text-[#9B8E85] uppercase tracking-widest">Campus Info</span>
            <button onClick={() => setDrawerOpen(false)} className="text-[#9B8E85] hover:text-[#2C1810] text-xl leading-none">×</button>
          </div>
          <SidebarContent
            data={data}
            calendarEvents={calendarEvents}
            socialEvents={socialEvents}
            calendarLoading={calendarLoading}
            socialLoading={socialLoading}
            eventsUpdatedAt={eventsUpdatedAt}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onSelectLoc={(l) => { setSelectedLoc(l); setDrawerOpen(false); }}
          />
        </div>
      )}

      {/* ── Mobile chat overlay ──────────────────────────────────────────── */}
      {chatOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-white">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#2C1810]/[0.08] shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #B3A369, #C1513A)' }}>
                <span className="text-xs">✦</span>
              </div>
              <span className="font-semibold text-sm text-[#2C1810]">Ask Pulse</span>
            </div>
            <button onClick={() => setChatOpen(false)} className="text-[#9B8E85] hover:text-[#2C1810] text-xl leading-none">×</button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {chatMessages.length === 0 && (
              <div className="space-y-3">
                <p className="text-xs text-[#9B8E85] leading-relaxed">I know what&apos;s happening on campus right now - ask me anything.</p>
                <div className="space-y-2">
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => sendChat(s)}
                      className="w-full text-left text-[12px] px-3 py-2.5 rounded-xl border border-[#2C1810]/[0.08] text-[#6B5244] hover:text-[#2C1810] hover:bg-[#F5F0E8] transition-all"
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
                    ? 'bg-[#2C1810]/[0.07] text-[#2C1810] rounded-tr-sm'
                    : 'bg-[#F5F0E8] text-[#2C1810] rounded-tl-sm border border-[#2C1810]/[0.08]'
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-[#F5F0E8] px-3.5 py-3 rounded-2xl rounded-tl-sm border border-[#2C1810]/[0.08]">
                  <div className="flex gap-1">
                    {[0,1,2].map(i => (
                      <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#2C1810]/30 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
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
            className="px-4 pb-6 pt-3 shrink-0 border-t border-[#2C1810]/[0.08]"
            onSubmit={e => { e.preventDefault(); sendChat(chatInput); }}
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Ask anything…"
                className="flex-1 px-3.5 py-2.5 text-sm rounded-xl bg-[#F5F0E8] border border-[#2C1810]/[0.12] text-[#2C1810] placeholder:text-[#9B8E85] focus:outline-none focus:border-terracotta/40 transition-colors"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || chatLoading || !data}
                className="px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-30"
                style={{ background: 'linear-gradient(135deg, #B3A369, #C1513A)', color: 'white' }}
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
