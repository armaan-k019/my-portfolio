"use client";

import { useState } from "react";
import { motion } from "framer-motion";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

const PROJECT_OPTIONS = [
  "General / Other",
  "Acoustic Form",
  "Fine Print",
  "UrbanGPT",
  "Tempo",
  "Yield",
  "Edo Commons",
  "Intersecting Realms",
  "Framed",
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
    <section id="contact" className="max-w-5xl mx-auto px-6 py-20">
      {/* ─── Let's talk ─────────────────────────────────────────────────────── */}
      <div className="text-center mb-16">
        <motion.h2
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="text-2xl font-semibold text-terracotta mb-3"
        >
          Let&apos;s talk.
        </motion.h2>
        <motion.p
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, delay: 0.08, ease: "easeOut" }}
          className="text-brown-light max-w-md mx-auto mb-8"
        >
          I&apos;m always open to interesting conversations, collaborations, or opportunities.
        </motion.p>
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, delay: 0.16, ease: "easeOut" }}
          className="flex items-center justify-center gap-6"
        >
          {/* Email */}
          <a
            href="mailto:archarmaan@gmail.com"
            className="w-14 h-14 rounded-full bg-white shadow-sm flex items-center justify-center text-brown-light hover:text-terracotta hover:shadow-md transition-all"
            aria-label="Email"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          </a>

          {/* LinkedIn */}
          <a
            href="https://www.linkedin.com/in/kaziarmaan/"
            target="_blank"
            rel="noopener noreferrer"
            className="w-14 h-14 rounded-full bg-white shadow-sm flex items-center justify-center text-brown-light hover:text-terracotta hover:shadow-md transition-all"
            aria-label="LinkedIn"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
          </a>
        </motion.div>
      </div>

      {/* ─── Feedback box ─────────────────────────────────────────────────────── */}
      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
        className="pt-12"
      >
        <h3 className="text-lg font-semibold text-brown mb-1">Leave feedback</h3>
        <p className="text-sm text-brown-light mb-6">
          Spotted a bug, have a feature idea, or want to suggest an improvement to one of the projects? Let me know.
        </p>

        {status === "sent" ? (
          <div className="bg-sage/10 border border-sage/30 rounded-xl px-5 py-4 text-sm text-sage font-medium">
            Thanks, feedback received!
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              {/* Project selector */}
              <div>
                <label className="block text-xs font-medium text-brown-light mb-1.5">Project</label>
                <select
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-tan/50 bg-white text-brown focus:outline-none focus:border-terracotta transition-colors"
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
                  className="w-full px-3 py-2 text-sm rounded-lg border border-tan/50 bg-white text-brown placeholder:text-brown-light/40 focus:outline-none focus:border-terracotta transition-colors"
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
                className="w-full px-3 py-2 text-sm rounded-lg border border-tan/50 bg-white text-brown placeholder:text-brown-light/40 focus:outline-none focus:border-terracotta transition-colors resize-none"
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
      </motion.div>
    </section>
  );
}
