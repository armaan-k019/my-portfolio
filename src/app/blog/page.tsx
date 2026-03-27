import { getBlogPosts } from "@/lib/mdx";
import BlogList from "@/components/BlogList";

export const metadata = { title: "Blog — Armaan Kazi" };

export default function BlogPage() {
  const posts = getBlogPosts();

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-2xl font-semibold text-brown mb-1">Blog</h1>
      <div className="w-10 h-0.5 bg-terracotta mb-10" />
      <BlogList posts={posts} />
    </div>
  );
}
