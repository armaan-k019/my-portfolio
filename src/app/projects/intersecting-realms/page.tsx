import Link from 'next/link';

const BASE = '/projects/intersecting-realms';

function ProjectImage({ src, caption }: { src: string; caption?: string }) {
  return (
    <figure>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={caption ?? ''}
        className="w-full object-cover rounded-lg"
      />
      <figcaption className="text-xs text-brown-light/60 mt-2 italic leading-relaxed">
        {caption ?? ''}
      </figcaption>
    </figure>
  );
}

function SectionRule() {
  return <hr className="border-tan/20 mb-14" />;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold tracking-widest uppercase text-terracotta mb-6">
      {children}
    </p>
  );
}

export default function IntersectingRealmsPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <Link
        href="/#projects"
        className="text-sm text-terracotta hover:text-terracotta-dark transition-colors mb-12 inline-block"
      >
        &larr; Back to projects
      </Link>

      {/* Header */}
      <header className="mb-14">
        <h1 className="text-4xl font-semibold text-darkblue tracking-tight mb-3">
          Intersecting Realms
        </h1>
        <p className="text-sm text-brown-light">
          Instructor: Bryce Truitt · Collaborator: Rishi Patel
        </p>
        <div className="w-10 h-[2px] bg-terracotta mt-5" />
      </header>

      {/* A Priori */}
      <section className="mb-14">
        <SectionLabel>A Priori</SectionLabel>
        <p className="text-base text-brown leading-relaxed mb-10">
          {''}
        </p>
        <div className="grid grid-cols-2 gap-6">
          <ProjectImage src={`${BASE}/1.png`} caption="" />
          <ProjectImage src={`${BASE}/2.png`} caption="" />
          <ProjectImage src={`${BASE}/3.png`} caption="" />
          <ProjectImage src={`${BASE}/4.png`} caption="" />
        </div>
      </section>

      <SectionRule />

      {/* A Posteriori */}
      <section>
        <SectionLabel>A Posteriori</SectionLabel>
        <p className="text-base text-brown leading-relaxed mb-10">
          {''}
        </p>
        <div className="grid grid-cols-2 gap-6">
          <ProjectImage src={`${BASE}/5.png`} caption="" />
          <ProjectImage src={`${BASE}/6.png`} caption="" />
          <ProjectImage src={`${BASE}/7.png`} caption="" />
          <ProjectImage src={`${BASE}/8.png`} caption="" />
          <ProjectImage src={`${BASE}/9.png`} caption="" />
          <ProjectImage src={`${BASE}/10.png`} caption="" />
          <ProjectImage src={`${BASE}/11.png`} caption="" />
          <ProjectImage src={`${BASE}/12.png`} caption="" />
        </div>
      </section>
    </div>
  );
}
