import type { Metadata } from "next";
import Link from "next/link";
import { sites, type Site } from "../../content/sites";

export const metadata: Metadata = {
  title: "Armaan Kazi",
  description: "Website, architecture portfolio, research lab, and workflow.",
};

function SiteRow({ site }: { site: Site }) {
  const body = (
    <>
      <span className="coord pt-2">{site.index}</span>
      <div>
        <h2 className="font-display display-md font-semibold text-darkblue">{site.name}</h2>
        <p className="mt-2 text-sm text-brown-light leading-relaxed max-w-xl">{site.blurb}</p>
        <p className="meta mt-2">{site.note}</p>
      </div>
      <span className="meta self-center text-lg" aria-hidden="true">
        {site.external ? <>&#8599;</> : <>&#8594;</>}
      </span>
    </>
  );
  const className = "card-hover grid grid-cols-[2.5rem_1fr_auto] gap-x-4 py-8 items-start";

  return (
    <li style={{ borderBottom: "var(--rule)" }}>
      {site.external ? (
        <a href={site.href} className={className}>{body}</a>
      ) : (
        <Link href={site.href} className={className}>{body}</Link>
      )}
    </li>
  );
}

// The chooser: armaankazi.com opens here, and each row leads to one site.
export default function Chooser() {
  return (
    <div className="-mt-16 min-h-screen flex flex-col justify-center">
      <div className="max-w-3xl w-full mx-auto px-6 py-20">
        <p className="eyebrow">Armaan Kazi</p>
        <div className="tick-rule mt-6" />
        <ul className="mt-2">
          {sites.map((site) => (
            <SiteRow key={site.index} site={site} />
          ))}
        </ul>
      </div>
    </div>
  );
}
