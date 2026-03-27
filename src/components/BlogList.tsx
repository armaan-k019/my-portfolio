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
    <div className="space-y-6">
      {posts.map((post) => (
        <Link
          key={post.slug}
          href={`/blog/${post.slug}`}
          className="block w-full text-left bg-white rounded-xl p-5 shadow-sm hover:shadow-md hover:border-l-terracotta border-l-4 border-l-transparent transition-all duration-200"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-medium text-brown mb-1">{post.title}</h2>
              <p className="text-sm text-brown-light">{post.excerpt}</p>
            </div>
            <span className="text-xs text-brown-light whitespace-nowrap shrink-0">
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
