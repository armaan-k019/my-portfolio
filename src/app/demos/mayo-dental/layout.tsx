"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

const MAYO_KEY = "mayo dental keer";
const BASE = "/demos/mayo-dental";

const NAV = [
  { label: "Home",          href: BASE },
  { label: "Services",      href: `${BASE}/services` },
  { label: "Meet the Team", href: `${BASE}/meet-the-team` },
  { label: "Contact Us",    href: `${BASE}/contact` },
];

function PhoneIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" className="inline-block shrink-0">
      <path d="M3.654 1.328a.678.678 0 00-1.015-.063L1.605 2.3c-.483.484-.661 1.169-.45 1.77a17.568 17.568 0 004.168 6.608 17.569 17.569 0 006.608 4.168c.601.211 1.286.033 1.77-.45l1.034-1.034a.678.678 0 00-.063-1.015L10.474 5.57a.678.678 0 00-.58-.122l-2.19.547a1.745 1.745 0 01-1.657-.459L4.482 4.062a1.745 1.745 0 01-.46-1.657l.548-2.19a.678.678 0 00-.122-.58L3.654 1.328z"/>
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="inline-block shrink-0 mt-px">
      <path d="M8 0C5.24 0 3 2.24 3 5c0 3.75 5 11 5 11s5-7.25 5-11c0-2.76-2.24-5-5-5zm0 6.75a1.75 1.75 0 110-3.5 1.75 1.75 0 010 3.5z"/>
    </svg>
  );
}

function SiteHeader() {
  const [open, setOpen] = useState(false);
  const path = usePathname();

  return (
    <header className="sticky top-0 z-50 shadow-md">
      {/* Utility bar */}
      <div className="bg-[#002b7f] text-white text-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
          <span className="flex items-center gap-1.5 text-white/80">
            <PinIcon />
            55 Mayo Rd, Edgewater, MD 21037
          </span>
          <div className="flex items-center gap-4 text-white/80">
            <a href="tel:4109566636" className="flex items-center gap-1.5 hover:text-white transition-colors">
              <PhoneIcon />
              New Patients: 410-956-6636
            </a>
            <a href="tel:4109566626" className="flex items-center gap-1.5 hover:text-white transition-colors">
              <PhoneIcon />
              Scheduling: 410-956-6626
            </a>
          </div>
        </div>
      </div>

      {/* Main nav */}
      <div className="bg-white border-b border-[#e4e4e4]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16 gap-6">

            {/* Logo */}
            <Link href={BASE} className="shrink-0">
              <Image
                src="/mayo-dental-logo.png"
                alt="Mayo Dental Family Dentistry"
                width={160}
                height={26}
                className="h-10 w-auto object-contain"
                priority
              />
            </Link>

            {/* Desktop nav + CTA */}
            <div className="hidden md:flex items-center gap-5">
              {NAV.map(l => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`text-sm font-medium transition-colors whitespace-nowrap ${
                    path === l.href
                      ? "text-[#002b7f]"
                      : "text-[#252525] hover:text-[#002b7f]"
                  }`}
                >
                  {l.label}
                </Link>
              ))}
              <Link
                href={`${BASE}/contact`}
                className="ml-2 px-4 py-2 rounded bg-[#339e35] text-white text-sm font-semibold hover:bg-[#2a7a2c] transition-colors whitespace-nowrap"
              >
                Schedule Appointment
              </Link>
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setOpen(o => !o)}
              className="md:hidden p-2 text-[#252525]"
              aria-label={open ? "Close menu" : "Open menu"}
            >
              {open ? (
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 5l12 12M17 5L5 17"/>
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 7h16M3 11h16M3 15h16"/>
                </svg>
              )}
            </button>
          </div>

          {/* Mobile dropdown */}
          {open && (
            <div className="md:hidden border-t border-[#e4e4e4] py-3 space-y-0.5 pb-4">
              {NAV.map(l => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={`block px-3 py-2.5 rounded text-sm font-medium transition-colors ${
                    path === l.href
                      ? "text-[#002b7f] bg-blue-50"
                      : "text-[#252525] hover:bg-gray-50"
                  }`}
                >
                  {l.label}
                </Link>
              ))}
              <div className="pt-2 px-3">
                <Link
                  href={`${BASE}/contact`}
                  onClick={() => setOpen(false)}
                  className="block text-center py-2.5 rounded bg-[#339e35] text-white text-sm font-semibold hover:bg-[#2a7a2c] transition-colors"
                >
                  Schedule Appointment
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="bg-[#001d5c] text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-8">

          {/* Left */}
          <div>
            <p className="font-bold text-base mb-1">Mayo Dental Family Dentistry</p>
            <p className="text-white/60 text-sm">Serving Edgewater, MD for over 10 years</p>
          </div>

          {/* Center */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/50 mb-3">Quick Links</p>
            <div className="space-y-2">
              {NAV.map(l => (
                <Link key={l.href} href={l.href} className="block text-sm text-white/70 hover:text-white transition-colors">
                  {l.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Right */}
          <div className="space-y-2 text-sm text-white/70">
            <p className="flex items-start gap-2">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="shrink-0 mt-0.5">
                <path d="M8 0C5.24 0 3 2.24 3 5c0 3.75 5 11 5 11s5-7.25 5-11c0-2.76-2.24-5-5-5zm0 6.75a1.75 1.75 0 110-3.5 1.75 1.75 0 010 3.5z"/>
              </svg>
              55 Mayo Rd, Edgewater, MD 21037
            </p>
            <p className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="shrink-0">
                <path d="M3.654 1.328a.678.678 0 00-1.015-.063L1.605 2.3c-.483.484-.661 1.169-.45 1.77a17.568 17.568 0 004.168 6.608 17.569 17.569 0 006.608 4.168c.601.211 1.286.033 1.77-.45l1.034-1.034a.678.678 0 00-.063-1.015L10.474 5.57a.678.678 0 00-.58-.122l-2.19.547a1.745 1.745 0 01-1.657-.459L4.482 4.062a1.745 1.745 0 01-.46-1.657l.548-2.19a.678.678 0 00-.122-.58L3.654 1.328z"/>
              </svg>
              410-956-6626
            </p>
            <p className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="shrink-0">
                <path d="M3.654 1.328a.678.678 0 00-1.015-.063L1.605 2.3c-.483.484-.661 1.169-.45 1.77a17.568 17.568 0 004.168 6.608 17.569 17.569 0 006.608 4.168c.601.211 1.286.033 1.77-.45l1.034-1.034a.678.678 0 00-.063-1.015L10.474 5.57a.678.678 0 00-.58-.122l-2.19.547a1.745 1.745 0 01-1.657-.459L4.482 4.062a1.745 1.745 0 01-.46-1.657l.548-2.19a.678.678 0 00-.122-.58L3.654 1.328z"/>
              </svg>
              New Patients: 410-956-6636
            </p>
          </div>
        </div>

        <div className="border-t border-white/10 pt-6 text-center text-xs text-white/40">
          &copy; 2026 Mayo Dental Family Dentistry &middot; 55 Mayo Rd, Edgewater, MD 21037
        </div>
      </div>
    </footer>
  );
}

export default function MayoDentalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let redirected = false;
    try {
      if (sessionStorage.getItem("demo_access") === MAYO_KEY) {
        setReady(true);
      } else if (!redirected) {
        redirected = true;
        router.replace("/demos");
      }
    } catch {
      if (!redirected) {
        redirected = true;
        router.replace("/demos");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) return <div className="min-h-screen bg-white" />;

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
