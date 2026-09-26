"use client";

import Link from "next/link";

const links = [
  { href: "mailto:archarmaan@gmail.com", label: "Email" },
  { href: "https://www.linkedin.com/in/kaziarmaan/", label: "LinkedIn" },
  { href: "https://github.com/armaan-k019", label: "GitHub" },
  { href: "https://www.instagram.com/armaankazi019/", label: "Instagram" },
];

export default function Footer() {
  return (
    <footer className="bg-[#16241A]">
      <div className="max-w-5xl mx-auto px-6 py-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="font-mono text-[10px] tracking-wide text-white/60 tnum">
          &copy; {new Date().getFullYear()} ARMAAN KAZI
        </p>
        <nav className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              {...(l.href.startsWith("http") && { target: "_blank", rel: "noopener noreferrer" })}
              className="text-white/75 hover:text-tan transition-colors"
            >
              {l.label}
            </a>
          ))}
          <Link href="/about" className="text-white/75 hover:text-tan transition-colors">
            About
          </Link>
        </nav>
        <p className="meta w-full" style={{ color: "rgba(255, 255, 255, 0.6)" }}>
          Want to get in touch with someone I&apos;ve worked with? Reach out and I&apos;ll make the introduction.
        </p>
      </div>
    </footer>
  );
}
