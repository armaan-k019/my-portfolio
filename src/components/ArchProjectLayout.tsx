import Link from 'next/link';

export interface ArchImage {
  src: string;
  caption?: string;
}

export interface ArchProjectContent {
  title: string;
  meta?: string;
  priori: string;
  siteImages: [ArchImage, ArchImage];
  contextText: string;
  drawings: ArchImage[];
  finalThoughts: string;
  posteriori?: {
    text: string;
    images: [ArchImage, ArchImage];
  };
}

function ProjectImage({ src, caption, aspect = '4/3' }: { src: string; caption?: string; aspect?: string }) {
  return (
    <figure>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={caption ?? ''} className="w-full object-cover rounded-lg" />
      ) : (
        <div
          className="w-full bg-tan/15 border border-tan/30 rounded-lg flex items-center justify-center"
          style={{ aspectRatio: aspect }}
        >
          <span className="text-xs text-brown-light/30 italic">image</span>
        </div>
      )}
      {caption && (
        <figcaption className="text-xs text-brown-light/60 mt-2 italic leading-relaxed">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

export default function ArchProjectLayout({ content }: { content: ArchProjectContent }) {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <Link
        href="/#projects"
        className="text-sm text-terracotta hover:text-terracotta-dark transition-colors mb-10 inline-block"
      >
        &larr; Back to projects
      </Link>

      {/* Header */}
      <header className="mb-12">
        <h1 className="text-3xl font-semibold text-darkblue tracking-tight mb-2">
          {content.title}
        </h1>
        {content.meta && (
          <p className="text-sm text-brown-light">{content.meta}</p>
        )}
      </header>

      {/* Priori */}
      <section className="mb-14">
        <p className="text-[10px] font-semibold tracking-widest uppercase text-terracotta mb-4">
          Priori
        </p>
        <p className="text-brown leading-relaxed">{content.priori}</p>
      </section>

      {/* 2 site images */}
      <section className="mb-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {content.siteImages.map((img, i) => (
            <ProjectImage key={i} src={img.src} caption={img.caption} aspect="4/3" />
          ))}
        </div>
      </section>

      {/* Context */}
      <section className="mb-14">
        <p className="text-sm text-brown-light leading-relaxed">{content.contextText}</p>
      </section>

      {/* Drawings */}
      <section className="mb-14">
        <p className="text-[10px] font-semibold tracking-widest uppercase text-terracotta mb-6">
          Drawings
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {content.drawings.map((img, i) => (
            <ProjectImage key={i} src={img.src} caption={img.caption} aspect="4/3" />
          ))}
        </div>
      </section>

      {/* Final thoughts */}
      <section className={content.posteriori ? "mb-14" : ""}>
        <p className="text-[10px] font-semibold tracking-widest uppercase text-terracotta mb-4">
          Final Thoughts
        </p>
        <p className="text-brown leading-relaxed">{content.finalThoughts}</p>
      </section>

      {/* Posteriori */}
      {content.posteriori && (
        <section>
          <p className="text-[10px] font-semibold tracking-widest uppercase text-terracotta mb-4">
            A Posteriori
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
            {content.posteriori.images.map((img, i) => (
              <ProjectImage key={i} src={img.src} caption={img.caption} aspect="4/3" />
            ))}
          </div>
          <p className="text-sm text-brown-light leading-relaxed">{content.posteriori.text}</p>
        </section>
      )}
    </div>
  );
}
