"use client";

import { useState } from "react";
import Link from "next/link";
import Modal from "./Modal";

interface BlogPreview {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
}

export default function BlogPreviewSection({ posts }: { posts: BlogPreview[] }) {
  const [selected, setSelected] = useState<BlogPreview | null>(null);

  return (
    <>
      <div className="space-y-5">
        {posts.map((post) => (
          <button
            key={post.slug}
            onClick={() => setSelected(post)}
            className="block w-full text-left bg-white rounded-xl p-5 shadow-sm hover:shadow-md hover:border-l-terracotta border-l-4 border-l-transparent transition-all duration-200"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-medium text-brown mb-1">{post.title}</h3>
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
          </button>
        ))}
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)}>
        {selected && (
          <div>
            <div className="bg-darkblue -mx-6 -mt-6 px-6 py-4 rounded-t-xl mb-5">
              <h3 className="text-lg font-semibold text-white">{selected.title}</h3>
            </div>
            <p className="text-xs text-brown-light mb-3">
              {new Date(selected.date).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
            <p className="text-sm text-brown-light leading-relaxed mb-5">
              {selected.excerpt}
            </p>
            <Link
              href={`/blog/${selected.slug}`}
              className="inline-block px-5 py-2 bg-terracotta text-white text-sm font-medium rounded-lg hover:bg-terracotta-dark transition-colors"
            >
              Read more &rarr;
            </Link>
          </div>
        )}
      </Modal>
    </>
  );
}
