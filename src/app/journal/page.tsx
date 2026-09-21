import Link from "next/link";
import Image from "next/image";
import { getBlogPosts } from "@/lib/mdx";
import BlogList from "@/components/BlogList";
import { PHOTOS, TOTAL_PHOTOS } from "../../../content/photos";

export const metadata = { title: "Journal | Armaan Kazi" };

export default function JournalPage() {
  const posts = getBlogPosts();
  const previewPhotos = PHOTOS.slice(0, 6);

  return (
    <div className="max-w-3xl mx-auto px-6 pt-12 pb-20">
      <h1 className="font-display display-lg font-semibold text-ink mb-4">Journal</h1>
      <div className="tick-rule mb-10" />

      <section className="mb-14">
        <h2 className="font-display text-xl font-semibold text-ink mb-1">Writing</h2>
        <hr className="rule mb-6" />
        <BlogList posts={posts} />
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold text-ink mb-1">Photography</h2>
        <hr className="rule mb-6" />
        <Link href="/photography" className="group block">
          <div className="grid grid-cols-3 gap-2 mb-3">
            {previewPhotos.map((photo) => (
              <div key={photo.id} className="relative rounded-lg overflow-hidden bg-[#D8E6D8]">
                <Image
                  src={photo.src}
                  alt={photo.location}
                  width={photo.w}
                  height={photo.h}
                  sizes="(max-width: 640px) 33vw, 200px"
                  style={{ width: "100%", height: "auto", display: "block" }}
                  className="transition-all duration-300 group-hover:scale-[1.02]"
                />
              </div>
            ))}
          </div>
          <span className="text-sm text-terracotta group-hover:text-terracotta-dark transition-colors">
            View all {TOTAL_PHOTOS} photos &rarr;
          </span>
        </Link>
      </section>
    </div>
  );
}
