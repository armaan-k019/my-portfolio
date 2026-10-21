import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Architecture | Armaan Kazi",
  description: "Architecture portfolio, in progress.",
};

// Placeholder until the architecture portfolio is built.
export default function ArchitecturePage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-24">
      <p className="eyebrow">Portfolio</p>
      <h1 className="font-display display-lg font-semibold text-darkblue mt-4">Architecture</h1>
      <div className="rule mt-8" />
      <p className="mt-8 text-brown-light leading-relaxed">This portfolio is in progress.</p>
      <p className="meta mt-6">
        <Link href="/" className="hover:text-terracotta transition-colors">&#8592; All sites</Link>
      </p>
    </div>
  );
}
