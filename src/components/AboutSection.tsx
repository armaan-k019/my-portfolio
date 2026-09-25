import Link from "next/link";
import SectionCut from "./section-cut/SectionCut";

export default function AboutSection() {
  return (
    <section id="about" className="relative overflow-hidden flex flex-col md:justify-center md:min-h-[calc(100svh-4rem)]">
      <div className="relative w-full max-w-5xl mx-auto px-6 pt-16 md:pt-0 pb-8 md:pb-0 z-10">
        {/* Left column - Bio */}
        <div className="max-w-md">
          <h1 className="font-display display-lg font-semibold text-ink mb-5">
            Armaan<br />Kazi
          </h1>
          <div className="text-brown-light leading-relaxed space-y-3 mb-5 max-w-[var(--measure)]">
            <p>
              I am a student at Georgia Tech, double majoring in Computer Science and Architecture with a certificate in Sustainable Architecture.
            </p>
          </div>
          <p className="meta mb-7">Georgia Tech &apos;27</p>
          <div className="flex items-center gap-3">
            <a
              href="#contact"
              className="group inline-flex items-center gap-1.5 text-sm font-medium px-5 py-2.5 bg-terracotta text-white hover:bg-terracotta-dark transition-colors"
            >
              Get in touch
              <span className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
            </a>
            <Link
              href="/about"
              className="group inline-flex items-center gap-1.5 text-sm font-medium px-5 py-2.5 border border-terracotta/30 text-terracotta hover:bg-terracotta/5 transition-colors"
            >
              More about me
              <span className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
            </Link>
          </div>
        </div>
      </div>
      <SectionCut />
    </section>
  );
}
