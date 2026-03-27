import { notFound } from "next/navigation";
import Link from "next/link";
import { getBlogPosts, getBlogPost } from "@/lib/mdx";
import { MDXRemote } from "next-mdx-remote/rsc";

export function generateStaticParams() {
  return getBlogPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  return { title: post ? `${post.title} — Armaan Kazi` : "Not Found" };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <Link
        href="/blog"
        className="text-sm text-terracotta hover:text-terracotta-dark transition-colors mb-8 inline-block"
      >
        &larr; Back to blog
      </Link>
      <article>
        <header className="mb-8">
          <h1 className="text-2xl font-semibold text-darkblue mb-2">{post.title}</h1>
          <time className="text-sm text-brown-light">
            {new Date(post.date).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </time>
        </header>
        <div className="prose">
          <MDXRemote source={post.content} />
        </div>
      </article>
    </div>
  );
}
