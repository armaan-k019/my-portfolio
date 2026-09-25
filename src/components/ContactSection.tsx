"use client";

import { useState } from "react";

const PROJECT_OPTIONS = [
  "General / Other",
  "Fine Print",
  "Datum",
  "Yield",
  "Archipedia",
];

export default function ContactSection() {
  const [project, setProject] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project, message, email }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error ?? "Something went wrong. Please try again.");
        setStatus("error");
      } else {
        setStatus("sent");
        setMessage("");
        setEmail("");
        setProject("");
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
      setStatus("error");
    }
  }

  return (
    <section id="contact" className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 pt-4" style={{ borderTop: "var(--rule)" }}>
        <h2 className="font-display display-md font-semibold text-ink">Let&apos;s talk.</h2>
        <a
          href="mailto:archarmaan@gmail.com"
          className="font-display text-xl text-terracotta underline underline-offset-4 decoration-1 hover:text-terracotta-dark transition-colors"
        >
          archarmaan@gmail.com
        </a>
      </div>

      <details className="mt-4">
        <summary className="meta cursor-pointer w-fit">
          Leave feedback
        </summary>
        <p className="text-sm text-brown-light mt-4 mb-6">
          Spotted a bug, have a feature idea, or want to suggest an improvement to one of the projects? Let me know.
        </p>

        {status === "sent" ? (
          <div className="bg-sage/10 border border-sage/30 rounded-xl px-5 py-4 text-sm text-sage font-medium">
            Thanks, feedback received!
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
            <div className="grid sm:grid-cols-2 gap-4">
              {/* Project selector */}
              <div>
                <label className="block text-xs font-medium text-brown-light mb-1.5">Project</label>
                <select
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-tan/50 bg-white text-brown focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/15 transition-all"
                >
                  <option value="">Select a project…</option>
                  {PROJECT_OPTIONS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              {/* Optional email */}
              <div>
                <label className="block text-xs font-medium text-brown-light mb-1.5">
                  Your email <span className="text-brown-light/50 font-normal">(optional)</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="if you'd like a reply"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-tan/50 bg-white text-brown placeholder:text-brown-light/40 focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/15 transition-all"
                />
              </div>
            </div>

            {/* Message */}
            <div>
              <label className="block text-xs font-medium text-brown-light mb-1.5">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                rows={4}
                placeholder="Describe the issue, feature request, or suggestion…"
                className="w-full px-3 py-2 text-sm rounded-lg border border-tan/50 bg-white text-brown placeholder:text-brown-light/40 focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/15 transition-all resize-none"
              />
            </div>

            {status === "error" && (
              <p className="text-xs text-red-500">{errorMsg}</p>
            )}

            <button
              type="submit"
              disabled={status === "sending" || message.trim().length < 5}
              className="px-5 py-2 rounded-lg bg-terracotta text-white text-sm font-medium hover:bg-terracotta-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {status === "sending" ? "Sending…" : "Send feedback"}
            </button>
          </form>
        )}
      </details>
    </section>
  );
}
