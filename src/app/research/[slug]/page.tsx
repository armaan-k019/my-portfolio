import { notFound } from "next/navigation";
import Link from "next/link";
import { getResearchEntries, getResearchEntry } from "@/lib/mdx";
import { MDXRemote } from "next-mdx-remote/rsc";
import CategoryTag from "@/components/CategoryTag";

export function generateStaticParams() {
  return getResearchEntries().map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = getResearchEntry(slug);
  return { title: entry ? `${entry.title} | Armaan Kazi` : "Not Found" };
}

export default async function ResearchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = getResearchEntry(slug);
  if (!entry) notFound();

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <Link
        href="/#research"
        className="text-sm text-terracotta hover:text-terracotta-dark transition-colors mb-8 inline-block"
      >
        &larr; Back to research
      </Link>
      <article>
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <h1 className="font-display display-md font-semibold text-ink">{entry.title}</h1>
            {entry.category && <CategoryTag category={entry.category} />}
          </div>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            {entry.venue && (
              <span className="text-sm text-terracotta font-medium">{entry.venue}</span>
            )}
            {entry.status && (
              <span className="text-sm text-brown-light">{entry.status}</span>
            )}
          </div>
          {entry.authors && (
            <p className="text-xs text-brown-light mt-2">
              <span className="font-semibold text-brown">Authors:</span> {entry.authors}
            </p>
          )}
          {entry.preview && (
            <p className="mt-3 text-brown-light text-sm italic">{entry.preview}</p>
          )}
        </header>
        <div className="prose">
          <MDXRemote source={entry.content} />
        </div>
        {entry.keywords && (
          <p className="text-xs text-brown-light mt-6">
            <span className="font-semibold text-brown">Keywords:</span> {entry.keywords}
          </p>
        )}
        {entry.footer && (
          <div className="border-t border-tan/30 pt-4 mt-6">
            <p className="text-xs text-brown-light italic">{entry.footer}</p>
            {entry.conferenceDates && (
              <p className="text-xs text-brown-light mt-1">{entry.conferenceDates}</p>
            )}
          </div>
        )}
      </article>
    </div>
  );
}
