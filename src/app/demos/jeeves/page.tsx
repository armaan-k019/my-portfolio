"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { marked } from "marked";

// ─── Types ────────────────────────────────────────────────────────────────────

type Persona = "sales" | "product" | "executive" | null;
type QueryType = "TARGETED_QUERY" | "TEMPORAL_SUMMARY" | "MARKET_DISCOVERY" | "GENERAL_CHAT" | "OBJECTION_HANDLING";
type AppTab = "chat" | "battlecards";

interface BattlecardFeatureComparison { feature: string; jeeves: string; competitor: string; }
interface BattlecardObjectionScript { objection: string; response: string; }
interface RecentIntelligenceItem { date: string; summary: string; sourceUrl: string; sourceType: string; isEstimated: boolean; }
interface BattlecardSections {
  companyOverview: string;
  whyWeWin: string[];
  whyWeLose: string[];
  keyFeaturesComparison: BattlecardFeatureComparison[];
  pricing: string;
  landmines: string[];
  objectionHandling: BattlecardObjectionScript[];
  thirdPartyValidation: string[];
  relevantCustomers: string[];
  sources: string[];
  recentIntelligence?: RecentIntelligenceItem[];
  hiringSignals?: string[];
}
interface Battlecard {
  competitor: string;
  type: string;
  lastSynced: string;
  sections: BattlecardSections;
  dataFreshness?: { liveDataUsed: boolean; scrapeDate: string };
}

interface ChatResponse {
  reply: string;
  persona: Persona;
  queryType: QueryType;
  competitorsMentioned: string[];
  requiresPersonaSelection: boolean;
  citations: string[];
  tokenUsage: { input: number; output: number };
}

interface SSEEvent {
  type: "status" | "persona_request" | "reply_chunk" | "reply_complete" | "error";
  message?: string;
  data?: Partial<ChatResponse>;
}

interface Message {
  id: string;
  role: "user" | "agent" | "status";
  text: string;
  html?: string;
  citations?: string[];
  requiresPersonaSelection?: boolean;
}

const PERSONAS: { value: NonNullable<Persona>; label: string }[] = [
  { value: "sales", label: "Sales / GTM" },
  { value: "product", label: "Product & Strategy" },
  { value: "executive", label: "Executive" },
];

const SUGGESTIONS = [
  "What's Brex's current pricing?",
  "What happened with Clara this week?",
  "What's new in LatAm corporate cards?",
  "Customer says Ramp is cheaper - how do I respond?",
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Markdown renderer ───────────────────────────────────────────────────────

marked.setOptions({ breaks: true });

function renderMarkdown(text: string): string {
  try {
    return marked.parse(text) as string;
  } catch {
    return text.replace(/\n/g, "<br/>");
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function JeevesPage() {
  const [appTab, setAppTab] = useState<AppTab>("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [persona, setPersona] = useState<Persona>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Battlecard state
  const [competitors, setCompetitors] = useState<string[]>([]);
  const [selectedCompetitor, setSelectedCompetitor] = useState<string | null>(null);
  const [battlecard, setBattlecard] = useState<Battlecard | null>(null);
  const [battlecardLoading, setBattlecardLoading] = useState(false);
  const [battlecardError, setBattlecardError] = useState("");
  const [bcSection, setBcSection] = useState<string>("overview");

  // Initialize session
  useEffect(() => {
    const stored = sessionStorage.getItem("jeeves_session_id");
    if (stored) {
      setSessionId(stored);
      // Restore persona from server
      fetch(`/api/jeeves/session?sessionId=${stored}`)
        .then((r) => r.json())
        .then((d) => { if (d.persona) setPersona(d.persona); })
        .catch(() => {});
    } else {
      fetch("/api/jeeves/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create" }) })
        .then((r) => r.json())
        .then((d) => {
          setSessionId(d.sessionId);
          sessionStorage.setItem("jeeves_session_id", d.sessionId);
        })
        .catch(() => {
          const id = Math.random().toString(36).slice(2, 18);
          setSessionId(id);
          sessionStorage.setItem("jeeves_session_id", id);
        });
    }

    // Load competitor list
    fetch("/api/jeeves/competitors").then((r) => r.json()).then((d: string[]) => {
      setCompetitors(d);
      if (d.length > 0) setSelectedCompetitor(d[0]);
    }).catch(() => {});

    // Welcome message
    setMessages([{
      id: uid(),
      role: "agent",
      text: "Hello! I'm **Jeeves**, your competitive intelligence agent.\n\nI can help you with:\n- Targeted competitor research (e.g., \"What's Brex's pricing?\")\n- Temporal summaries (e.g., \"What happened with Clara this week?\")\n- Market discovery (e.g., \"What's new in LatAm corporate cards?\")\n- Objection handling (e.g., \"Customer says Ramp is cheaper - how do I respond?\")\n\nWhat would you like to know?",
      html: renderMarkdown("Hello! I'm **Jeeves**, your competitive intelligence agent.\n\nI can help you with:\n- Targeted competitor research (e.g., \"What's Brex's pricing?\")\n- Temporal summaries (e.g., \"What happened with Clara this week?\")\n- Market discovery (e.g., \"What's new in LatAm corporate cards?\")\n- Objection handling (e.g., \"Customer says Ramp is cheaper - how do I respond?\")\n\nWhat would you like to know?"),
    }]);
  }, []);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const updateLastMessage = useCallback((updater: (msg: Message) => Message) => {
    setMessages((prev) => {
      const next = [...prev];
      if (next.length > 0) next[next.length - 1] = updater(next[next.length - 1]);
      return next;
    });
  }, []);

  const sendMessage = useCallback(async (text: string, personaOverride?: Persona) => {
    if (!text.trim() || isLoading || !sessionId) return;

    const userMsg: Message = { id: uid(), role: "user", text };
    addMessage(userMsg);
    setInput("");
    setIsLoading(true);
    setStatusText("Thinking...");

    // Add a placeholder agent message
    const agentMsgId = uid();
    addMessage({ id: agentMsgId, role: "agent", text: "", html: "" });

    try {
      const response = await fetch("/api/jeeves/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), sessionId, personaOverride }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith(": ping")) continue;
          if (!line.startsWith("data: ")) continue;

          let event: SSEEvent;
          try {
            event = JSON.parse(line.slice(6)) as SSEEvent;
          } catch {
            continue;
          }

          if (event.type === "status" && event.message) {
            setStatusText(event.message);
            // Update the placeholder with interim status
            setMessages((prev) => {
              const next = [...prev];
              const idx = next.findIndex((m) => m.id === agentMsgId);
              if (idx !== -1) {
                next[idx] = {
                  ...next[idx],
                  role: "status",
                  text: event.message!,
                };
              }
              return next;
            });
          }

          if (event.type === "reply_complete" && event.data) {
            const data = event.data as ChatResponse;
            const html = renderMarkdown(data.reply);

            // Update session persona
            if (data.persona) setPersona(data.persona);

            setMessages((prev) => {
              const next = [...prev];
              const idx = next.findIndex((m) => m.id === agentMsgId);
              if (idx !== -1) {
                next[idx] = {
                  id: agentMsgId,
                  role: "agent",
                  text: data.reply,
                  html,
                  citations: data.citations?.length ? data.citations : undefined,
                  requiresPersonaSelection: data.requiresPersonaSelection,
                };
              }
              return next;
            });
          }

          if (event.type === "error" && event.message) {
            setMessages((prev) => {
              const next = [...prev];
              const idx = next.findIndex((m) => m.id === agentMsgId);
              if (idx !== -1) {
                next[idx] = {
                  id: agentMsgId,
                  role: "agent",
                  text: `Error: ${event.message}`,
                  html: `<p style="color:#e05555">Error: ${event.message}</p>`,
                };
              }
              return next;
            });
          }
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const next = [...prev];
        const idx = next.findIndex((m) => m.id === agentMsgId);
        if (idx !== -1) {
          next[idx] = {
            id: agentMsgId,
            role: "agent",
            text: "Connection error. Please try again.",
            html: "<p style=\"color:#e05555\">Connection error. Please try again.</p>",
          };
        }
        return next;
      });
      console.error("Jeeves chat error:", err);
    } finally {
      setIsLoading(false);
      setStatusText("");
    }
  }, [isLoading, sessionId, addMessage]);

  const handlePersonaPill = useCallback(async (p: NonNullable<Persona>) => {
    setPersona(p);
    await sendMessage(`[persona:${p}]`, p);
  }, [sendMessage]);

  const handleResetPersona = useCallback(async () => {
    if (!sessionId) return;
    await fetch("/api/jeeves/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, action: "reset" }),
    });
    setPersona(null);
  }, [sessionId]);

  const fetchBattlecard = useCallback(async (competitor: string) => {
    setBattlecardLoading(true);
    setBattlecardError("");
    setBattlecard(null);
    try {
      const res = await fetch(`/api/jeeves/battlecard/${encodeURIComponent(competitor)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as Battlecard;
      setBattlecard(data);
      setBcSection("overview");
    } catch (err) {
      setBattlecardError(err instanceof Error ? err.message : "Failed to generate battlecard");
    } finally {
      setBattlecardLoading(false);
    }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }, [input, sendMessage]);

  const personaLabel = persona ? PERSONAS.find((p) => p.value === persona)?.label : null;

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100vh",
      background: "#111111", color: "#f0ebe0", fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      fontSize: "15px", lineHeight: "1.6",
    }}>
      {/* Header */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 20px", background: "#0a0a0a", borderBottom: "1px solid #2a2520",
        flexShrink: 0, gap: "12px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            width: "36px", height: "36px", background: "#C9A84C", borderRadius: "8px",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 900, fontSize: "18px", color: "#0a0a0a", flexShrink: 0,
          }}>J</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "17px", letterSpacing: "0.5px" }}>Jeeves Intel</div>
            <div style={{ fontSize: "10px", color: "#7a7060", textTransform: "uppercase", letterSpacing: "1px" }}>
              Competitive Intelligence
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Tab switcher */}
          <div style={{ display: "flex", background: "#1a1a1a", border: "1px solid #2a2520", borderRadius: "8px", padding: "3px", gap: "3px" }}>
            {(["chat", "battlecards"] as AppTab[]).map((t) => (
              <button key={t} onClick={() => setAppTab(t)} style={{
                padding: "5px 12px", borderRadius: "5px", border: "none",
                background: appTab === t ? "#C9A84C" : "transparent",
                color: appTab === t ? "#0a0a0a" : "#7a7060",
                fontSize: "11px", fontWeight: 600, cursor: "pointer", textTransform: "capitalize",
                transition: "all 0.15s",
              }}>{t}</button>
            ))}
          </div>
          {appTab === "chat" && personaLabel && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ padding: "4px 10px", background: "#C9A84C22", border: "1px solid #C9A84C55", borderRadius: "6px", fontSize: "11px", color: "#C9A84C", fontWeight: 600 }}>
                {personaLabel}
              </span>
              <button onClick={handleResetPersona} style={{ background: "none", border: "1px solid #2a2520", borderRadius: "6px", color: "#7a7060", fontSize: "11px", padding: "4px 8px", cursor: "pointer" }}>
                Switch
              </button>
            </div>
          )}
          {appTab === "chat" && (
            <div style={{ padding: "5px 12px", background: "#1a1a1a", border: "1px solid #2a2520", borderRadius: "6px", fontSize: "11px", color: "#7a7060" }}>
              {isLoading ? <span style={{ color: "#C9A84C" }}>Processing...</span> : <span>Ready</span>}
            </div>
          )}
        </div>
      </header>

      {/* ── Battlecards panel ──────────────────────────────────────────── */}
      {appTab === "battlecards" && (
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          {/* Competitor selector */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #2a2520", background: "#0d0d0d", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: "12px", color: "#7a7060", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Competitor</span>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {competitors.map((c) => (
                <button key={c} onClick={() => setSelectedCompetitor(c)} style={{
                  padding: "6px 14px", borderRadius: "6px", border: "1px solid",
                  borderColor: selectedCompetitor === c ? "#C9A84C" : "#2a2520",
                  background: selectedCompetitor === c ? "#C9A84C22" : "#1a1a1a",
                  color: selectedCompetitor === c ? "#C9A84C" : "#b5a98a",
                  fontSize: "12px", fontWeight: 600, cursor: "pointer",
                }}>{c}</button>
              ))}
            </div>
            <button
              onClick={() => selectedCompetitor && fetchBattlecard(selectedCompetitor)}
              disabled={!selectedCompetitor || battlecardLoading}
              style={{
                marginLeft: "auto", padding: "7px 18px", borderRadius: "7px", border: "none",
                background: !selectedCompetitor || battlecardLoading ? "#2a2520" : "#C9A84C",
                color: !selectedCompetitor || battlecardLoading ? "#7a7060" : "#0a0a0a",
                fontSize: "12px", fontWeight: 700, cursor: !selectedCompetitor || battlecardLoading ? "not-allowed" : "pointer",
              }}
            >{battlecardLoading ? "Generating..." : "Generate Battlecard"}</button>
          </div>

          {/* Loading state */}
          {battlecardLoading && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", color: "#7a7060" }}>
              <div style={{ width: "36px", height: "36px", border: "3px solid #2a2520", borderTopColor: "#C9A84C", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <p style={{ fontSize: "13px", fontStyle: "italic" }}>Scraping live data and generating battlecard... (30-90s)</p>
            </div>
          )}

          {/* Error state */}
          {battlecardError && !battlecardLoading && (
            <div style={{ padding: "20px", color: "#e05555", fontSize: "13px" }}>{battlecardError}</div>
          )}

          {/* Battlecard display */}
          {battlecard && !battlecardLoading && (() => {
            const s = battlecard.sections;
            const SECTIONS = [
              { id: "overview", label: "Overview" },
              { id: "win-lose", label: "Win / Lose" },
              { id: "features", label: "Features" },
              { id: "pricing", label: "Pricing" },
              { id: "objections", label: "Objections" },
              { id: "landmines", label: "Landmines" },
              { id: "intelligence", label: "Intelligence" },
            ];
            return (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                {/* Section nav */}
                <div style={{ display: "flex", gap: "4px", padding: "12px 20px", background: "#0d0d0d", borderBottom: "1px solid #2a2520", overflowX: "auto", flexShrink: 0 }}>
                  {SECTIONS.map((sec) => (
                    <button key={sec.id} onClick={() => setBcSection(sec.id)} style={{
                      padding: "5px 12px", borderRadius: "6px", border: "1px solid",
                      borderColor: bcSection === sec.id ? "#C9A84C" : "#2a2520",
                      background: bcSection === sec.id ? "#C9A84C22" : "transparent",
                      color: bcSection === sec.id ? "#C9A84C" : "#7a7060",
                      fontSize: "11px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                    }}>{sec.label}</button>
                  ))}
                  <div style={{ marginLeft: "auto", fontSize: "10px", color: "#4a4035", display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                    {battlecard.dataFreshness?.liveDataUsed && <span style={{ color: "#4a9" }}>Live data</span>}
                    <span>Synced {new Date(battlecard.lastSynced).toLocaleTimeString()}</span>
                  </div>
                </div>

                {/* Section content */}
                <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
                  {bcSection === "overview" && (
                    <div>
                      <h2 style={{ color: "#C9A84C", fontSize: "16px", fontWeight: 700, marginBottom: "12px" }}>{battlecard.competitor}</h2>
                      <p style={{ color: "#d4cfc5", lineHeight: "1.7", fontSize: "14px" }}>{s.companyOverview}</p>
                    </div>
                  )}

                  {bcSection === "win-lose" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                      <div>
                        <h3 style={{ color: "#4CAF50", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Why We Win</h3>
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          {s.whyWeWin.map((item, i) => (
                            <div key={i} style={{ background: "#1a2a1a", border: "1px solid #2a3a2a", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: "#c5d4c5", lineHeight: "1.55" }}>{item}</div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h3 style={{ color: "#e05555", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Why We Lose</h3>
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          {s.whyWeLose.map((item, i) => (
                            <div key={i} style={{ background: "#2a1a1a", border: "1px solid #3a2a2a", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: "#d4c5c5", lineHeight: "1.55" }}>{item}</div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {bcSection === "features" && (
                    <div>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                        <thead>
                          <tr style={{ background: "#0a0a0a" }}>
                            <th style={{ padding: "10px 12px", textAlign: "left", color: "#7a7060", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", borderBottom: "1px solid #2a2520" }}>Feature</th>
                            <th style={{ padding: "10px 12px", textAlign: "left", color: "#C9A84C", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", borderBottom: "1px solid #2a2520" }}>Jeeves</th>
                            <th style={{ padding: "10px 12px", textAlign: "left", color: "#7a7060", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", borderBottom: "1px solid #2a2520" }}>{battlecard.competitor}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.keyFeaturesComparison.map((row, i) => (
                            <tr key={i} style={{ borderBottom: "1px solid #1a1a1a" }}>
                              <td style={{ padding: "10px 12px", color: "#b5a98a", fontWeight: 600 }}>{row.feature}</td>
                              <td style={{ padding: "10px 12px", color: "#c5d4c5", background: "#0e1a0e" }}>{row.jeeves}</td>
                              <td style={{ padding: "10px 12px", color: "#d4cfc5" }}>{row.competitor}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {bcSection === "pricing" && (
                    <div>
                      <h3 style={{ color: "#C9A84C", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Pricing</h3>
                      <p style={{ color: "#d4cfc5", fontSize: "14px", lineHeight: "1.7" }}>{s.pricing}</p>
                    </div>
                  )}

                  {bcSection === "objections" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {s.objectionHandling.map((item, i) => (
                        <div key={i} style={{ background: "#1c1c1c", border: "1px solid #2a2520", borderRadius: "10px", padding: "14px 16px" }}>
                          <p style={{ color: "#C9A84C", fontWeight: 600, fontSize: "13px", marginBottom: "6px" }}>"{item.objection}"</p>
                          <p style={{ color: "#d4cfc5", fontSize: "13px", lineHeight: "1.6" }}>{item.response}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {bcSection === "landmines" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <p style={{ color: "#7a7060", fontSize: "12px", marginBottom: "8px" }}>Discovery questions to expose competitor weaknesses:</p>
                      {s.landmines.map((item, i) => (
                        <div key={i} style={{ background: "#1a1a0e", border: "1px solid #3a3a1a", borderRadius: "8px", padding: "10px 14px", fontSize: "13px", color: "#d4d4b5", display: "flex", gap: "10px" }}>
                          <span style={{ color: "#C9A84C", fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                          {item}
                        </div>
                      ))}
                    </div>
                  )}

                  {bcSection === "intelligence" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                      {(s.recentIntelligence?.length ?? 0) > 0 && (
                        <div>
                          <h3 style={{ color: "#C9A84C", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Recent Intelligence</h3>
                          {(s.recentIntelligence ?? []).map((item, i) => (
                            <div key={i} style={{ background: "#1c1c1c", border: "1px solid #2a2520", borderRadius: "8px", padding: "10px 14px", marginBottom: "8px" }}>
                              <div style={{ display: "flex", gap: "8px", marginBottom: "4px" }}>
                                <span style={{ color: "#7a7060", fontSize: "11px" }}>{item.date}</span>
                                <span style={{ color: "#4a4035", fontSize: "11px" }}>{item.sourceType}</span>
                              </div>
                              <p style={{ color: "#d4cfc5", fontSize: "13px", lineHeight: "1.55" }}>{item.summary}</p>
                              {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#C9A84C66", fontSize: "11px", marginTop: "4px", display: "block" }}>{item.sourceUrl.slice(0, 60)}...</a>}
                            </div>
                          ))}
                        </div>
                      )}
                      {(s.hiringSignals?.length ?? 0) > 0 && (
                        <div>
                          <h3 style={{ color: "#b5a98a", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Hiring Signals</h3>
                          {(s.hiringSignals ?? []).map((item, i) => (
                            <div key={i} style={{ background: "#1c1c1c", border: "1px solid #2a2520", borderRadius: "8px", padding: "10px 14px", marginBottom: "6px", fontSize: "13px", color: "#d4cfc5" }}>{item}</div>
                          ))}
                        </div>
                      )}
                      {(s.thirdPartyValidation?.length ?? 0) > 0 && (
                        <div>
                          <h3 style={{ color: "#b5a98a", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Third-Party Validation</h3>
                          {(s.thirdPartyValidation ?? []).map((item, i) => (
                            <div key={i} style={{ background: "#1c1c1c", border: "1px solid #2a2520", borderRadius: "8px", padding: "10px 14px", marginBottom: "6px", fontSize: "13px", color: "#d4cfc5", fontStyle: "italic" }}>{item}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Empty state */}
          {!battlecard && !battlecardLoading && !battlecardError && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", color: "#4a4035" }}>
              <div style={{ fontSize: "32px" }}>📋</div>
              <p style={{ fontSize: "14px" }}>Select a competitor and click Generate Battlecard</p>
              <p style={{ fontSize: "12px", color: "#3a3028" }}>Uses live web scraping - takes 30-90 seconds</p>
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      {appTab === "chat" && <div style={{
        flex: 1, overflowY: "auto", padding: "24px 20px",
        display: "flex", flexDirection: "column", gap: "16px",
        scrollBehavior: "smooth",
      }}>
        {messages.map((msg) => {
          if (msg.role === "status") {
            return (
              <div key={msg.id} style={{ alignSelf: "center", maxWidth: "70%", animation: "fadeIn 0.2s ease" }}>
                <div style={{
                  padding: "10px 16px", border: "1px dashed #2a2520",
                  borderRadius: "12px", color: "#b5a98a", fontSize: "13px",
                  fontStyle: "italic", textAlign: "center",
                }}>
                  {msg.text}
                </div>
              </div>
            );
          }

          if (msg.role === "user") {
            return (
              <div key={msg.id} style={{ alignSelf: "flex-end", display: "flex", gap: "10px", maxWidth: "80%", flexDirection: "row-reverse" }}>
                <div style={{
                  width: "32px", height: "32px", borderRadius: "8px", flexShrink: 0, marginTop: "2px",
                  background: "#2a2318", border: "1px solid #2a2520", display: "flex",
                  alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700, color: "#C9A84C",
                }}>U</div>
                <div style={{
                  padding: "10px 16px", background: "#2a2318", border: "1px solid #3d3425",
                  borderRadius: "12px", borderTopRightRadius: "4px", fontSize: "14px",
                  lineHeight: "1.65", color: "#f0ebe0",
                }}>
                  {msg.text}
                </div>
              </div>
            );
          }

          // Agent message
          return (
            <div key={msg.id} style={{ alignSelf: "flex-start", display: "flex", gap: "10px", maxWidth: "85%" }}>
              <div style={{
                width: "32px", height: "32px", borderRadius: "8px", flexShrink: 0, marginTop: "2px",
                background: "#C9A84C", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "13px", fontWeight: 900, color: "#0a0a0a",
              }}>J</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", minWidth: 0 }}>
                <div
                  style={{
                    padding: "12px 16px", background: "#1c1c1c", border: "1px solid #2a2520",
                    borderRadius: "12px", borderTopLeftRadius: "4px", fontSize: "14px", lineHeight: "1.65",
                  }}
                  dangerouslySetInnerHTML={{ __html: msg.html || (msg.text ? renderMarkdown(msg.text) : "<span style='color:#7a7060;font-style:italic'>Generating response...</span>") }}
                />

                {/* Persona selection pills */}
                {msg.requiresPersonaSelection && (
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {PERSONAS.map((p) => (
                      <button
                        key={p.value}
                        onClick={() => handlePersonaPill(p.value)}
                        style={{
                          padding: "8px 16px", background: "#1a1a1a", border: "1px solid #C9A84C66",
                          borderRadius: "8px", color: "#C9A84C", fontSize: "13px", fontWeight: 600,
                          cursor: "pointer", transition: "all 0.15s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "#C9A84C22"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "#1a1a1a"; }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Citations */}
                {msg.citations && msg.citations.length > 0 && (
                  <div style={{ fontSize: "11px", color: "#7a7060", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    <span style={{ color: "#b5a98a", fontWeight: 600, marginRight: "4px" }}>Sources:</span>
                    {msg.citations.slice(0, 5).map((url, i) => {
                      let host = url;
                      try { host = new URL(url).hostname.replace("www.", ""); } catch { /* ignore */ }
                      return (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#C9A84C88", textDecoration: "none", border: "1px solid #2a2520", padding: "1px 6px", borderRadius: "4px" }}
                        >
                          {host}
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>}

      {/* Suggestions (only when not loading and no conversation yet) */}
      {appTab === "chat" && messages.length <= 1 && !isLoading && (
        <div style={{
          display: "flex", gap: "8px", padding: "0 20px 8px",
          overflowX: "auto", flexShrink: 0,
        }}>
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => sendMessage(s)}
              style={{
                padding: "7px 14px", background: "#1a1a1a", border: "1px solid #2a2520",
                borderRadius: "20px", color: "#b5a98a", fontSize: "12px",
                cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                transition: "border-color 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#C9A84C66"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2520"; }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      {appTab === "chat" && <div style={{
        padding: "14px 20px", background: "#0a0a0a", borderTop: "1px solid #2a2520",
        flexShrink: 0,
      }}>
        <div style={{
          display: "flex", gap: "10px", alignItems: "flex-end",
          background: "#1a1a1a", border: "1px solid #2a2520", borderRadius: "12px",
          padding: "10px 14px", transition: "border-color 0.15s",
        }}
          onFocus={() => {}}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder={isLoading ? statusText || "Processing..." : "Ask about a competitor, market trends, or an objection..."}
            rows={1}
            style={{
              flex: 1, background: "none", border: "none", outline: "none",
              color: "#f0ebe0", fontSize: "14px", fontFamily: "inherit",
              lineHeight: "1.5", resize: "none", maxHeight: "120px",
              overflow: "auto",
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={isLoading || !input.trim()}
            style={{
              width: "36px", height: "36px", borderRadius: "8px", border: "none",
              background: isLoading || !input.trim() ? "#2a2520" : "#C9A84C",
              color: isLoading || !input.trim() ? "#7a7060" : "#0a0a0a",
              cursor: isLoading || !input.trim() ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "16px", fontWeight: 700, flexShrink: 0,
              transition: "all 0.15s",
            }}
          >
            {isLoading ? (
              <span style={{ fontSize: "12px" }}>...</span>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 8l12-6-6 12-2-4-4-2z"/>
              </svg>
            )}
          </button>
        </div>
        <div style={{ marginTop: "8px", textAlign: "center", fontSize: "11px", color: "#7a7060" }}>
          Responses may take 30-90s for live data scraping.
        </div>
      </div>}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: #2a2520; border-radius: 2px; }
        ::-webkit-scrollbar-track { background: transparent; }
        .bubble-content h1, .bubble-content h2, .bubble-content h3 { color: #C9A84C; margin: 16px 0 8px; font-size: 1em; text-transform: uppercase; }
        .bubble-content p { margin: 8px 0; }
        .bubble-content ul, .bubble-content ol { margin: 8px 0 8px 20px; }
        .bubble-content li { margin: 4px 0; }
        .bubble-content strong { color: #a8893e; }
        .bubble-content code { background: #0a0a0a; color: #C9A84C; padding: 1px 6px; border-radius: 4px; font-family: monospace; font-size: 12px; }
        .bubble-content pre { background: #0a0a0a; border: 1px solid #2a2520; border-radius: 8px; padding: 12px; overflow-x: auto; margin: 12px 0; }
        .bubble-content table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
        .bubble-content th { background: #0a0a0a; color: #C9A84C; padding: 8px 12px; text-align: left; font-weight: 600; border: 1px solid #2a2520; font-size: 11px; text-transform: uppercase; }
        .bubble-content td { padding: 8px 12px; border: 1px solid #2a2520; vertical-align: top; }
        .bubble-content blockquote { border-left: 3px solid #C9A84C; padding-left: 12px; color: #b5a98a; margin: 8px 0; }
        .bubble-content hr { border: none; border-top: 1px solid #2a2520; margin: 12px 0; }
      `}</style>
    </div>
  );
}
