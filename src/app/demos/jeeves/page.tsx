"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { marked } from "marked";

// ─── Types ────────────────────────────────────────────────────────────────────

type Persona = "sales" | "product" | "executive" | null;
type QueryType = "TARGETED_QUERY" | "TEMPORAL_SUMMARY" | "MARKET_DISCOVERY" | "GENERAL_CHAT" | "OBJECTION_HANDLING";

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [persona, setPersona] = useState<Persona>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
          {personaLabel && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{
                padding: "4px 10px", background: "#C9A84C22", border: "1px solid #C9A84C55",
                borderRadius: "6px", fontSize: "11px", color: "#C9A84C", fontWeight: 600,
              }}>
                {personaLabel}
              </span>
              <button
                onClick={handleResetPersona}
                style={{
                  background: "none", border: "1px solid #2a2520", borderRadius: "6px",
                  color: "#7a7060", fontSize: "11px", padding: "4px 8px", cursor: "pointer",
                }}
                title="Switch persona"
              >
                Switch
              </button>
            </div>
          )}
          <div style={{
            padding: "5px 12px", background: "#1a1a1a", border: "1px solid #2a2520",
            borderRadius: "6px", fontSize: "11px", color: "#7a7060",
          }}>
            {isLoading ? (
              <span style={{ color: "#C9A84C" }}>Processing...</span>
            ) : (
              <span>Ready</span>
            )}
          </div>
        </div>
      </header>

      {/* Messages */}
      <div style={{
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
      </div>

      {/* Suggestions (only when not loading and no conversation yet) */}
      {messages.length <= 1 && !isLoading && (
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
      <div style={{
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
          Powered by Claude + Apify. Responses may take 30–90s for live data scraping.
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
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
