"use client";

import Link from "next/link";

interface BlogPreview {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
}

export default function BlogList({ posts }: { posts: BlogPreview[] }) {
  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <Link
          key={post.slug}
          href={`/blog/${post.slug}`}
          className="group card card-hover block w-full text-left p-6 overflow-hidden"
        >
          <span className="absolute left-0 top-0 h-full w-[3px] bg-terracotta opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-semibold text-ink mb-1.5 leading-snug">{post.title}</h2>
              <p className="text-sm text-brown-light leading-relaxed">{post.excerpt}</p>
            </div>
            <span className="meta whitespace-nowrap shrink-0 mt-1">
              {new Date(post.date).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
