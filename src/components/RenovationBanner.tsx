"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "renovation-banner-dismissed";
const BANNER_HEIGHT = "34px";

/**
 * Thin dismissible notice across the top of every page.
 *
 * The Navbar is position fixed at top 0, so the banner cannot simply sit in
 * normal flow above it. Instead this component publishes a --renovation-h
 * custom property while it is visible. The style block below offsets the one
 * nav element in the app, and the root layout adds the same value to the main
 * padding. When the banner is dismissed nothing is rendered, the property is
 * undefined, and both fall back to their original values.
 */
export default function RenovationBanner() {
  // Render nothing until mounted so the server and client markup agree and the
  // stored preference is read before anything paints.
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    let stored = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage can throw in private mode or when site data is blocked.
      // Treat that as not dismissed rather than hiding the notice.
    }
    setDismissed(stored === "true");
    setMounted(true);
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // Dismissal still applies for this session even if it cannot persist.
    }
  }

  if (!mounted || dismissed) return null;

  return (
    <>
      <style>{`
        :root { --renovation-h: ${BANNER_HEIGHT}; }
        nav { top: var(--renovation-h); }
      `}</style>
      <div
        role="status"
        className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-center gap-3 px-4"
        style={{
          height: BANNER_HEIGHT,
          backgroundColor: "rgba(212, 169, 106, 0.18)",
          borderBottom: "1px solid rgba(212, 169, 106, 0.45)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      >
        <p
          className="truncate"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.6875rem",
            letterSpacing: "0.08em",
            color: "var(--color-brown)",
            margin: 0,
          }}
        >
          Renovation in progress. If something looks off, that is why.
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss renovation notice"
          className="absolute right-3 leading-none transition-opacity hover:opacity-60"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.875rem",
            color: "var(--color-brown-light)",
            background: "none",
            border: 0,
            cursor: "pointer",
            padding: "0 4px",
          }}
        >
          &times;
        </button>
      </div>
    </>
  );
}
