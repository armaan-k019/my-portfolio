import { NextResponse } from "next/server";
import { getResearchEntries } from "@/lib/mdx";

// GET /api/research: the research entries as JSON, newest first. Frontmatter
// only, exactly as written in content/research/*.mdx, without the article
// body. Public and read only. The research lab's profile page reads this, so
// a paper added here shows there without a second edit.
// Built once per deploy: the content is files in this repository.
export const dynamic = "force-static";

export function GET() {
  const entries = getResearchEntries().map((e) => ({
    slug: e.slug,
    title: e.title,
    date: e.date,
    venue: e.venue ?? null,
    conference: e.conference ?? null,
    status: e.status ?? null,
    authors: e.authors ?? null,
    keywords: e.keywords ?? null,
    preview: e.preview ?? null,
    disclaimer: e.disclaimer ?? null,
    footer: e.footer ?? null,
    projectLinks: e.projectLinks ?? [],
  }));
  return NextResponse.json({ entries });
}
