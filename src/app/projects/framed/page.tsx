import Link from 'next/link';

const BASE = '/projects/framed';

const PROSE = "max-w-3xl mx-auto px-6";
const WIDE  = "max-w-5xl mx-auto px-6";

function Tile({ src, alt, ratio }: { src: string; alt: string; ratio: string }) {
  return (
    <div
      className="overflow-hidden rounded-lg bg-tan/10 border border-tan/25"
      style={{ aspectRatio: ratio }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="w-full h-full object-cover object-center" />
    </div>
  );
}

function NativeTile({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="overflow-hidden rounded-lg bg-tan/10 border border-tan/25">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="w-full h-auto block" />
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

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${PROSE} mb-10`}>
      <p className="text-base text-brown leading-relaxed">{children}</p>
    </div>
  );
}

export default function FramedPage() {
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
            Framed
          </h1>
          <p className="text-sm text-brown-light">
            Instructor: Misri Patel
          </p>
          <div className="w-10 h-[2px] bg-terracotta mt-5" />
        </header>
      </div>

      {/* TODO: project description paragraph goes here (no prior copy exists in the repo). */}

      <div className={`${PROSE} mb-6`}>
        <SectionLabel>A Priori</SectionLabel>
      </div>

      <Prose>
        The project starts from three plans. The Guggenheim&rsquo;s spiral, PAMM&rsquo;s stilted
        lightness, and Steven Holl&rsquo;s Winter House get merged into a single figure, then
        abstracted into a bricolage that carries their spatial logics into a new arrangement. The
        parti resolves that logic into a diagram of hierarchy and circulation, which the building
        takes as its starting brief.
      </Prose>

      {/* Row 1 — three squares — WIDE */}
      <div className={`${WIDE} mb-10`}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
          <NativeTile
            src={`${BASE}/parti-01-merged-plan.png`}
            alt="Merged plan combining the Guggenheim, PAMM, and Steven Holl's Winter House"
          />
          <NativeTile
            src={`${BASE}/parti-03-ai-bricolage.png`}
            alt="AI bricolage drawing"
          />
          <NativeTile
            src={`${BASE}/parti-02-parti-drawing.png`}
            alt="Parti diagram"
          />
        </div>
      </div>

      <Prose>
        The bricolage gets broken into a kit of parts: intimate rooms, apertures, thresholds,
        moments of pause. The stuffing drawing tests how those parts inhabit the site, arranging
        them at the scale of the body and the scale of a day spent inside them.
      </Prose>

      {/* Row 2 — two squares — WIDE */}
      <div className={`${WIDE} mb-10`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Tile src={`${BASE}/stuffing-01-kit-of-parts.png`} alt="Kit of parts" ratio="1/1" />
          <Tile src={`${BASE}/stuffing-02-exploded-axon.png`} alt="Stuffing drawing" ratio="1/1" />
        </div>
      </div>

      <div className={`${PROSE} mb-6`}>
        <SectionLabel>A Posteriori</SectionLabel>
      </div>

      <Prose>
        The building resolves into three stacked floors, cyclical in circulation, tessellated in
        envelope. The plans register program and light. The sections register how the body moves
        upward through hierarchy, the envelope framing views out toward Sweet Auburn and Atlanta
        beyond.
      </Prose>

      {/* Row 3 — three squares — WIDE */}
      <div className={`${WIDE} mb-10`}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Tile src={`${BASE}/plan-01.png`} alt="Ground floor plan" ratio="1/1" />
          <Tile src={`${BASE}/plan-02.png`} alt="Second floor plan" ratio="1/1" />
          <Tile src={`${BASE}/plan-03.png`} alt="Third floor plan" ratio="1/1" />
        </div>
      </div>

      {/* Row 4 — two landscape sections — WIDE */}
      <div className={`${WIDE} mb-10`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Tile src={`${BASE}/section-01.png`} alt="West perspective section" ratio="12/5" />
          <Tile src={`${BASE}/section-02.png`} alt="South perspective section" ratio="12/5" />
        </div>
      </div>

      <Prose>
        Inside, the tessellated envelope becomes a lens. The galleries frame artwork; the openings
        frame the city. What began as a study in hierarchy resolves as a reflective environment, one
        that honors the legacy of Old Atlanta while providing a framework for what comes next.
      </Prose>

      {/* Row 5 — two landscape renders — WIDE */}
      <div className={`${WIDE} mb-10`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Tile src={`${BASE}/render-01.png`} alt="Exterior render, evening" ratio="3/2" />
          <Tile src={`${BASE}/render-03.png`} alt="Interior render, gallery" ratio="3/2" />
        </div>
      </div>

      {/* Row 6 — two landscape renders — WIDE */}
      <div className={WIDE}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Tile src={`${BASE}/render-04.png`} alt="Interior render, artist studio" ratio="3/2" />
          <Tile src={`${BASE}/render-06.png`} alt="Exterior render, skyline" ratio="3/2" />
        </div>
      </div>

    </div>
  );
}
