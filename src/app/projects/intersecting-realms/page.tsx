import Link from 'next/link';

const BASE = '/projects/intersecting-realms';

const PROSE = "max-w-5xl mx-auto px-6";
const WIDE  = "max-w-5xl mx-auto px-6";

function Tile({ src, ratio }: { src: string; ratio: string }) {
  return (
    <div className="overflow-hidden rounded-lg" style={{ aspectRatio: ratio }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="w-full h-full object-cover" />
    </div>
  );
}

function NativeTile({ src }: { src: string }) {
  return (
    <div className="overflow-hidden rounded-lg">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="w-full h-auto block" />
    </div>
  );
}

function CoverTile({ src }: { src: string }) {
  return (
    <div className="overflow-hidden rounded-lg relative">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm font-semibold tracking-widest uppercase text-terracotta mb-6">
      {children}
    </p>
  );
}

export default function IntersectingRealmsPage() {
  return (
    <div className="py-16">

      {/* Back link + header — narrow */}
      <div className={PROSE}>
        <Link
          href="/#projects"
          className="text-sm text-terracotta hover:text-terracotta-dark transition-colors mb-12 inline-block"
        >
          &larr; Back to projects
        </Link>

        <header className="mb-14">
          <h1 className="text-4xl font-semibold text-darkblue tracking-tight mb-3">
            Intersecting Realms
          </h1>
          <p className="text-sm text-brown-light">
            Instructor: Bryce Truitt · Collaborator: Rishi Patel
          </p>
          <div className="w-10 h-[2px] bg-terracotta mt-5" />
        </header>

        <SectionLabel>Priori</SectionLabel>
      </div>

      {/* Images 1–2 — portrait pair, 4:5 — WIDE */}
      <div className={`${WIDE} mb-10`}>
        <div className="grid grid-cols-2 gap-4">
          <Tile src={`${BASE}/1.png`} ratio="4/5" />
          <Tile src={`${BASE}/2.png`} ratio="4/5" />
        </div>
      </div>

      {/* A Priori text — narrow */}
      <div className={`${PROSE} mb-10`}>
        <p className="text-base text-brown leading-relaxed">
          The project starts with composition, not with a site. A painting sets up a grammar of figure against field. Collages pull that grammar into architectural terms, and a model takes it into three dimensions. The mountain shows up last, not as context but as the stereotomic half the whole thing had been searching for.
        </p>
      </div>

      {/* Images 3–4 — WIDE */}
      <div className={`${WIDE} mb-10`}>
        <div className="grid grid-cols-2 gap-4">
          <NativeTile src={`${BASE}/3.png`} />
          <CoverTile src={`${BASE}/4.png`} />
        </div>
      </div>

      {/* Interlude text — narrow */}
      <div className={`${PROSE} mb-10`}>
        <p className="text-base text-brown leading-relaxed">
          From here the project is walked rather than drawn. The interior gets tested at the scale of the body, through the speed it asks for and the speed it refuses. Some moments carry you: a stair, a threshold, a passage between rock and frame. Others hold you still: a seat, a long view, a pocket of quiet where stone meets grid. The architecture works through this alternation. Movement and pause, traversal and contemplation, each one setting up the next.
        </p>
      </div>

      {/* Images 5–6 — WIDE */}
      <div className={`${WIDE} mb-10`}>
        <div className="grid grid-cols-2 gap-4">
          <Tile src={`${BASE}/5.png`} ratio="4/3" />
          <Tile src={`${BASE}/6.png`} ratio="4/3" />
        </div>
      </div>

      {/* Images 7–8 — WIDE */}
      <div className={`${WIDE} mb-10`}>
        <div className="grid grid-cols-2 gap-4">
          <NativeTile src={`${BASE}/7.png`} />
          <CoverTile src={`${BASE}/8.png`} />
        </div>
      </div>

      {/* Posteriori label — narrow */}
      <div className={`${PROSE} mb-6`}>
        <SectionLabel>Posteriori</SectionLabel>

        {/* A Posteriori text — narrow */}
        <p className="text-base text-brown leading-relaxed">
          The proposal cuts itself into the mountain, opening an interior that is then met by a tectonic insertion: a framed room suspended inside the cut. Moving through the project is moving between two kinds of time. The stair, carved from rock, slows the body down; its mass soaks up sound and light. The framed platform does the opposite, holding you lightly, opening out toward distance and air. Pause gathers where the two meet: a threshold, a seat facing water, a room whose walls are half stone and half grid. Architecture here isn't the mass or the frame. It's the passage between them.
        </p>
      </div>

      {/* Images 9–10 — landscape renders, 3:2 — WIDE */}
      <div className={`${WIDE} mb-4`}>
        <div className="grid grid-cols-2 gap-4">
          <Tile src={`${BASE}/9.png`} ratio="3/2" />
          <Tile src={`${BASE}/10.png`} ratio="3/2" />
        </div>
      </div>

      {/* Images 11–12 — portrait renders — WIDE */}
      <div className={WIDE}>
        <div className="grid grid-cols-2 gap-4">
          <NativeTile src={`${BASE}/11.png`} />
          <CoverTile src={`${BASE}/12.png`} />
        </div>
      </div>

    </div>
  );
}
