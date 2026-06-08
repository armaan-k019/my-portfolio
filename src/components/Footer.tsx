"use client";

export default function Footer() {
  return (
    <footer className="relative overflow-hidden bg-[#16241A]">
      {/* top hairline accent */}
      <div className="h-px w-full" style={{ background: "linear-gradient(90deg, transparent, rgba(212,169,106,0.5), transparent)" }} />
      {/* oversized faint wordmark */}
      <p
        aria-hidden
        className="pointer-events-none select-none absolute -bottom-6 left-1/2 -translate-x-1/2 font-display text-white/[0.04] whitespace-nowrap"
        style={{ fontSize: "clamp(5rem, 18vw, 14rem)", lineHeight: 1 }}
      >
        Armaan Kazi
      </p>

      <div className="relative max-w-5xl mx-auto px-6 pt-12 pb-10 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="text-center md:text-left">
          <p className="font-display text-lg text-white">Armaan Kazi</p>
          <p className="font-mono text-[10px] tracking-wide uppercase text-white/45 mt-1">Architecture + CS · Georgia Tech</p>
        </div>

        <div className="flex items-center gap-5">
          {/* Email */}
          <a
            href="mailto:archarmaan@gmail.com"
            className="text-white/70 hover:text-tan transition-colors"
            aria-label="Email"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          </a>
          {/* Instagram */}
          <a
            href="https://www.instagram.com/armaankazi019/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/70 hover:text-tan transition-colors"
            aria-label="Instagram"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <rect x="2" y="2" width="20" height="20" rx="5" />
              <circle cx="12" cy="12" r="5" />
              <circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none" />
            </svg>
          </a>
          {/* GitHub */}
          <a
            href="https://github.com/armaan-k019"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/70 hover:text-tan transition-colors"
            aria-label="GitHub"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
          </a>
          {/* LinkedIn */}
          <a
            href="https://www.linkedin.com/in/kaziarmaan/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/70 hover:text-tan transition-colors"
            aria-label="LinkedIn"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
          </a>
        </div>

        <p className="font-mono text-[10px] tracking-wide text-white/40 tnum">
          &copy; {new Date().getFullYear()} ARMAAN KAZI
        </p>
      </div>
      <div className="relative text-center pb-8">
        <p className="text-xs" style={{ color: "rgba(140, 170, 140, 0.55)" }}>
          Want to get in touch with someone I&apos;ve worked with? Reach out and I&apos;ll make the introduction.
        </p>
      </div>
    </footer>
  );
}
