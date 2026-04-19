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
  posteriori: {
    text: string;
    images: [ArchImage, ArchImage];
  };
}

const PLACEHOLDER_TEXT = 'Lorem ipsum odor amet, consectetuer adipiscing elit. Dapibus facilisis volutpat viverra; nisl facilisi cubilia. Dis venenatis consequat duis condimentum commodo blandit per class. Enim facilisi lobortis auctor tristique penatibus pretium. Praesent massa pulvinar cras nascetur ad laoreet. Nisi augue malesuada sodales; bibendum cras feugiat lacinia consectetur.';

function Placeholder({ text }: { text: string }) {
  return <span className="italic text-brown-light/30">{text}</span>;
}

function SectionRule() {
  return <hr className="border-tan/20 mb-14" />;
}

function ProjectImage({ src, caption, aspect = '4/3' }: { src: string; caption?: string; aspect?: string }) {
  return (
    <figure>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={caption ?? ''} className="w-full object-cover rounded-lg" />
      ) : (
        <div
          className="w-full bg-tan/10 border border-tan/25 rounded-lg flex items-center justify-center"
          style={{ aspectRatio: aspect }}
        >
          <span className="text-xs text-brown-light/25 italic tracking-wide">image</span>
        </div>
      )}
      {caption ? (
        <figcaption className="text-xs text-brown-light/60 mt-2 italic leading-relaxed">{caption}</figcaption>
      ) : (
        <figcaption className="text-xs text-brown-light/25 mt-2 italic">caption</figcaption>
      )}
    </figure>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold tracking-widest uppercase text-terracotta mb-6">
      {children}
    </p>
  );
}

export default function ArchProjectLayout({ content }: { content: ArchProjectContent }) {
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
          {content.title}
        </h1>
        {content.meta ? (
          <p className="text-sm text-brown-light">{content.meta}</p>
        ) : (
          <p className="text-sm text-brown-light/30 italic">Studio · Term · Institution</p>
        )}
        <div className="w-10 h-[2px] bg-terracotta mt-5" />
      </header>

      {/* A Priori */}
      <section className="mb-14">
        <SectionLabel>A Priori</SectionLabel>
        <p className="text-base text-brown leading-relaxed">
          {content.priori || <Placeholder text={PLACEHOLDER_TEXT} />}
        </p>
      </section>

      <SectionRule />

      {/* Site */}
      <section className="mb-14">
        <SectionLabel>Site</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
          {content.siteImages.map((img, i) => (
            <ProjectImage key={i} src={img.src} caption={img.caption} aspect="4/3" />
          ))}
        </div>
        <p className="text-sm text-brown-light leading-relaxed">
          {content.contextText || <Placeholder text={PLACEHOLDER_TEXT} />}
        </p>
      </section>

      <SectionRule />

      {/* Drawings */}
      <section className="mb-14">
        <SectionLabel>Drawings</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {content.drawings.map((img, i) => (
            <ProjectImage key={i} src={img.src} caption={img.caption} aspect="4/3" />
          ))}
        </div>
      </section>

      <SectionRule />

      {/* Final Thoughts */}
      <section className="mb-14">
        <SectionLabel>Final Thoughts</SectionLabel>
        <p className="text-base text-brown leading-relaxed">
          {content.finalThoughts || <Placeholder text={PLACEHOLDER_TEXT} />}
        </p>
      </section>

      <SectionRule />

      {/* A Posteriori */}
      <section>
        <SectionLabel>A Posteriori</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
          {content.posteriori.images.map((img, i) => (
            <ProjectImage key={i} src={img.src} caption={img.caption} aspect="4/3" />
          ))}
        </div>
        <p className="text-sm text-brown-light leading-relaxed">
          {content.posteriori.text || <Placeholder text={PLACEHOLDER_TEXT} />}
        </p>
      </section>
    </div>
  );
}
