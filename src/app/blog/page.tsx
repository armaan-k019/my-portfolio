import { getBlogPosts } from "@/lib/mdx";
import BlogList from "@/components/BlogList";

export const metadata = { title: "Blog | Armaan Kazi" };

export default function BlogPage() {
  const posts = getBlogPosts();

  return (
    <div className="max-w-3xl mx-auto px-6 pt-12 pb-20">
      <p className="eyebrow mb-3">Writing</p>
      <h1 className="font-display display-lg font-semibold text-ink mb-4">Blog</h1>
      <p className="text-brown-light max-w-xl mb-8">Essays on architecture, computation, and the space between them.</p>
      <div className="tick-rule mb-10" />
      <BlogList posts={posts} />
    </div>
  );
}
