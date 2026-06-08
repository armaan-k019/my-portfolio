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
  return { title: post ? `${post.title} | Armaan Kazi` : "Not Found" };
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
        <header className="mb-10">
          <h1 className="font-display display-md font-semibold text-ink mb-3">{post.title}</h1>
          <time className="meta">
            {new Date(post.date).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </time>
          <hr className="hairline mt-6" />
        </header>
        <div className="prose">
          <MDXRemote source={post.content} />
        </div>
      </article>
    </div>
  );
}
