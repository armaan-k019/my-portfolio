import fs from "fs";
import path from "path";
import matter from "gray-matter";
import type { Category } from "../../content/projects";

const contentDir = path.join(process.cwd(), "content");

export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  category?: string;
  content: string;
}

export interface ResearchEntry {
  slug: string;
  title: string;
  date: string;
  abstract: string;
  venue?: string;
  category?: Category;
  pdf?: string;
  status?: string;
  preview?: string;
  authors?: string;
  keywords?: string;
  conferenceDates?: string;
  footer?: string;
  projectLink?: string;
  projectLinks?: { label: string; url: string }[];
  content: string;
}

export function getBlogPosts(): BlogPost[] {
  const dir = path.join(contentDir, "blog");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".mdx"));

  return files
    .map((file) => {
      const raw = fs.readFileSync(path.join(dir, file), "utf-8");
      const { data, content } = matter(raw);
      return {
        slug: file.replace(/\.mdx$/, ""),
        title: data.title,
        date: data.date,
        excerpt: data.excerpt,
        category: data.category,
        content,
      };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getBlogPost(slug: string): BlogPost | undefined {
  const posts = getBlogPosts();
  return posts.find((p) => p.slug === slug);
}

export function getResearchEntries(): ResearchEntry[] {
  const dir = path.join(contentDir, "research");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".mdx"));

  return files
    .map((file) => {
      const raw = fs.readFileSync(path.join(dir, file), "utf-8");
      const { data, content } = matter(raw);
      return {
        slug: file.replace(/\.mdx$/, ""),
        title: data.title,
        date: data.date,
        abstract: data.abstract ?? data.preview ?? "",
        venue: data.venue,
        category: data.category,
        pdf: data.pdf,
        status: data.status,
        preview: data.preview,
        authors: data.authors,
        keywords: data.keywords,
        conferenceDates: data.conferenceDates,
        footer: data.footer,
        projectLink: data.projectLink,
        projectLinks: data.projectLinks,
        content,
      };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getResearchEntry(slug: string): ResearchEntry | undefined {
  const entries = getResearchEntries();
  return entries.find((e) => e.slug === slug);
}
