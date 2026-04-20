import Link from 'next/link';

const BASE = '/projects/edo-commons';

const PROSE = "max-w-5xl mx-auto px-6";
const WIDE  = "max-w-5xl mx-auto px-6";

function Tile({ src, ratio }: { src: string; ratio: string }) {
  return (
    <div className="overflow-hidden rounded-lg bg-stone-100 flex items-center justify-center" style={{ aspectRatio: ratio }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="w-full h-full object-contain" />
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

export default function GuestPeoplePage() {
  return (
    <div className="py-16">

      {/* Back link + header */}
      <div className={PROSE}>
        <Link
          href="/#projects"
          className="text-sm text-terracotta hover:text-terracotta-dark transition-colors mb-12 inline-block"
        >
          &larr; Back to projects
        </Link>

        <header className="mb-14">
          <h1 className="text-4xl font-semibold text-darkblue tracking-tight mb-3">
            Guest People
          </h1>
          <p className="text-sm text-brown-light">
            Instructor: Ingeborg Rocker · Partner: Lavender Kring
          </p>
          <div className="w-10 h-[2px] bg-terracotta mt-5" />
        </header>

        <SectionLabel>Priori</SectionLabel>
        <p className="text-base text-brown leading-relaxed mb-0">
          The project is sited at a Hakka indenture museum. Hakka translates literally as guest people, a name given to a nomadic Han Chinese ethnic group who migrated across southern China and eventually throughout Southeast Asia and the Caribbean. The museum holds the history of their displacement and labor. The site itself is built from the masonry traditions the Hakka carried with them, stone construction techniques that show up in everything from their walled village compounds to the retaining walls terracing the hillside fields.
        </p>
      </div>

      {/* Images 1-2 — priori row 1, both ~3:2 landscape */}
      <div className={`${WIDE} mb-4`}>
        <div className="grid grid-cols-2 gap-4">
          <Tile src={`${BASE}/1.png`} ratio="3/2" />
          <Tile src={`${BASE}/2.png`} ratio="3/2" />
        </div>
      </div>

      {/* Images 3-4 — priori row 2, mixed orientations: unequal columns */}
      <div className={`${WIDE} mb-10`}>
        <div className="grid gap-4" style={{ gridTemplateColumns: '3fr 2fr', aspectRatio: '2/1' }}>
          <div className="overflow-hidden rounded-lg relative bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${BASE}/3.png`} alt="" className="absolute inset-0 w-full h-full object-contain" />
          </div>
          <div className="overflow-hidden rounded-lg relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${BASE}/4.png`} alt="" className="absolute inset-0 w-full h-full object-cover object-bottom" />
          </div>
        </div>
      </div>

      {/* Posteriori label + text */}
      <div className={`${PROSE} mb-6`}>
        <SectionLabel>Posteriori</SectionLabel>
        <p className="text-base text-brown leading-relaxed">
          The goal was to design an intervention that felt like a genuine addition to the site rather than an imposition on it. We chose an overlook positioned above the valley, drawing on the masonry traditions we had studied and on the logic of the terraced agricultural fields that originally shaped the landscape. The structure grows from the ground it sits on.
        </p>
      </div>

      {/* Images 5-6 — posteriori pair, both ~2:1 wide */}
      <div className={`${WIDE} mb-4`}>
        <div className="grid grid-cols-2 gap-4">
          <Tile src={`${BASE}/5.png`} ratio="2/1" />
          <Tile src={`${BASE}/6.png`} ratio="2/1" />
        </div>
      </div>

      {/* Image 7 — money shot, full width ~3:2 */}
      <div className={WIDE}>
        <Tile src={`${BASE}/7.png`} ratio="3/2" />
      </div>

    </div>
  );
}
