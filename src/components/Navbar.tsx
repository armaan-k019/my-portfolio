"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

const sections = [
  { id: "about", label: "About" },
  { id: "work", label: "Experience" },
  { id: "projects", label: "Projects" },
  { id: "research", label: "Research" },
];

const pages = [
  { href: "/demos", label: "Demos" },
  { href: "/blog", label: "Blog" },
  { href: "/photography", label: "Photography" },
];

export default function Navbar() {
  const [activeSection, setActiveSection] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const isHome = pathname === "/";

  const handleIntersection = useCallback((entries: IntersectionObserverEntry[]) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        setActiveSection(entry.target.id);
      }
    }
  }, []);

  useEffect(() => {
    if (!isHome) return;
    const observer = new IntersectionObserver(handleIntersection, {
      rootMargin: "-40% 0px -55% 0px",
    });
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [isHome, handleIntersection]);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const navLinkClass = (id: string) =>
    `text-sm transition-colors ${
      activeSection === id && isHome
        ? "text-terracotta font-semibold"
        : "text-brown-light hover:text-terracotta"
    }`;

  const handleSectionClick = (id: string) => {
    setMobileOpen(false);
    if (!isHome) {
      window.location.href = `/#${id}`;
    }
  };

  return (
    <>
      <nav
        className="sticky top-0 z-50 backdrop-blur-md border-b"
        style={{
          backgroundColor: "#FFFFFF",
          borderBottomColor: "rgba(45, 90, 39, 0.12)",
        }}
      >
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-3 shrink-0">
            <span
              className="text-darkblue select-none leading-none"
              style={{ fontFamily: 'var(--font-amiri), "Amiri", serif', fontSize: '1.6rem' }}
            >
              أك
            </span>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-darkblue tracking-wide">Armaan Kazi</span>
              <span className="hidden sm:block text-[11px] text-brown-light">Architecture + CS @ Georgia Tech · Sustainable Architecture Certificate</span>
            </div>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6 ml-16">
            {sections.map((s) => (
              <a
                key={s.id}
                href={isHome ? `#${s.id}` : `/#${s.id}`}
                className={navLinkClass(s.id)}
              >
                {s.label}
              </a>
            ))}

            {/* Vertical separator */}
            <div className="w-px h-[18px] bg-sage/40" />

            {pages.map((p) => (
              <Link
                key={p.href}
                href={p.href}
                className={`text-sm transition-colors ${
                  pathname.startsWith(p.href)
                    ? "text-terracotta font-semibold"
                    : "text-brown-light hover:text-terracotta"
                }`}
              >
                {p.label}
              </Link>
            ))}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden flex flex-col gap-1 p-2"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            <span className={`w-5 h-0.5 bg-darkblue transition-transform ${mobileOpen ? "rotate-45 translate-y-1.5" : ""}`} />
            <span className={`w-5 h-0.5 bg-darkblue transition-opacity ${mobileOpen ? "opacity-0" : ""}`} />
            <span className={`w-5 h-0.5 bg-darkblue transition-transform ${mobileOpen ? "-rotate-45 -translate-y-1.5" : ""}`} />
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/20 z-40 md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed top-0 right-0 h-full w-64 bg-white z-50 shadow-xl p-8 flex flex-col gap-6 md:hidden"
            >
              <button
                onClick={() => setMobileOpen(false)}
                className="self-end text-brown-light text-sm"
                aria-label="Close menu"
              >
                Close
              </button>
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={isHome ? `#${s.id}` : `/#${s.id}`}
                  className="text-lg text-brown hover:text-terracotta transition-colors"
                  onClick={() => handleSectionClick(s.id)}
                >
                  {s.label}
                </a>
              ))}
              <div className="h-px bg-sage/20 my-1" />
              {pages.map((p) => (
                <Link
                  key={p.href}
                  href={p.href}
                  className="text-lg text-brown hover:text-terracotta transition-colors flex items-center gap-1.5"
                  onClick={() => setMobileOpen(false)}
                >
                  {p.label}
                  <svg className="w-3 h-3 text-brown-light" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                  </svg>
                </Link>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
