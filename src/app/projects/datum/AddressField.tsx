"use client";

// The address field. SPEC.md section 3 item 1.
//
// Suggestions come from Photon through the server proxy, debounced at 300 ms
// from three characters. Submitting never uses a suggestion: the submit path is
// Nominatim, because Photon mis-resolves the Miami test intersection.

import { useEffect, useRef, useState } from "react";

interface Suggestion {
  label: string;
  lat: number;
  lng: number;
}

interface Props {
  onSubmit: (query: string) => void;
  suggest: (query: string) => Promise<Suggestion[]>;
  busy: boolean;
}

const DEBOUNCE_MS = 300;
const MIN_CHARS = 3;

export default function AddressField({ onSubmit, suggest, busy }: Props) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);

  // Every state change happens inside the debounce callback, never in the
  // effect body: a synchronous setState in an effect cascades renders.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const ticket = ++latest.current;
      const trimmed = query.trim();
      if (trimmed.length < MIN_CHARS) {
        setSuggestions([]);
        setOpen(false);
        return;
      }
      void suggest(trimmed).then((results) => {
        // A slower earlier request must not overwrite a newer answer.
        if (ticket !== latest.current) return;
        setSuggestions(results);
        setOpen(results.length > 0);
      });
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, suggest]);

  function submit(value: string) {
    const trimmed = value.trim();
    if (trimmed.length === 0 || busy) return;
    setOpen(false);
    onSubmit(trimmed);
  }

  return (
    <div className="relative max-w-2xl">
      <label className="eyebrow block" htmlFor="datum-address">
        Site address
      </label>
      <form
        className="mt-3 flex gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit(query);
        }}
      >
        <input
          id="datum-address"
          name="address"
          type="text"
          autoComplete="off"
          value={query}
          disabled={busy}
          placeholder="Techwood Drive NW, Atlanta, GA 30313"
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setOpen(suggestions.length > 0)}
          className="w-full rounded-full border border-[var(--color-line)] bg-white/70 px-5 py-3 text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-brown-light)]/70"
        />
        <button
          type="submit"
          data-datum-submit
          disabled={busy || query.trim().length === 0}
          className="shrink-0 rounded-full bg-[var(--color-terracotta)] px-6 py-3 text-sm font-medium text-[var(--color-paper)] transition-opacity disabled:opacity-40"
        >
          {busy ? "Resolving" : "Resolve"}
        </button>
      </form>

      {open && suggestions.length > 0 ? (
        <ul
          className="card absolute z-20 mt-2 w-full overflow-hidden p-0"
          data-datum-suggestions
        >
          {suggestions.map((suggestion) => (
            <li key={`${suggestion.label}-${suggestion.lat}-${suggestion.lng}`}>
              <button
                type="button"
                // A suggestion fills the field; the submit still goes through
                // Nominatim, which is the source that resolves correctly.
                onClick={() => {
                  setQuery(suggestion.label);
                  setOpen(false);
                }}
                className="block w-full px-5 py-2.5 text-left text-sm text-[var(--color-brown)] hover:bg-[var(--color-cream-dark)]"
              >
                {suggestion.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="meta mt-3">
        Suggestions from Photon. The submit itself is geocoded by Nominatim, one
        request per submit, and you confirm the point before anything runs.
      </p>
    </div>
  );
}
