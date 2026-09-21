import Link from "next/link";
import Image from "next/image";
import { getBlogPosts } from "@/lib/mdx";
import { PHOTOS, TOTAL_PHOTOS } from "../../../content/photos";

export const metadata = { title: "Journal | Armaan Kazi" };

export default function JournalPage() {
  const posts = getBlogPosts();

  const seenDestinations = new Set<string>();
  const previewPhotos = [];
  for (const photo of PHOTOS) {
    if (previewPhotos.length >= 4) break;
    if (!seenDestinations.has(photo.location)) {
      seenDestinations.add(photo.location);
      previewPhotos.push(photo);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 pt-12 pb-20">
      <h1 className="font-display display-lg font-semibold text-ink mb-4">Journal</h1>
      <div className="tick-rule mb-10" />

      <div className="grid lg:grid-cols-2 gap-x-12 gap-y-14">
        <section>
          <h2 className="font-display text-xl font-semibold text-ink mb-1">Writing</h2>
          <hr className="rule mb-6" />
          <div className="divide-y divide-[rgba(45,90,39,0.10)]">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group flex items-baseline justify-between gap-4 py-3"
              >
                <span className="font-display text-base text-ink group-hover:text-terracotta transition-colors">
                  {post.title}
                </span>
                <span className="meta whitespace-nowrap shrink-0">
                  {new Date(post.date).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-ink mb-1">Photography</h2>
          <hr className="rule mb-6" />
          <Link href="/photography" className="group block" aria-label={`View all ${TOTAL_PHOTOS} photos`}>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {previewPhotos.map((photo) => (
                <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden bg-[#D8E6D8]">
                  <Image
                    src={photo.src}
                    alt={photo.location}
                    fill
                    sizes="(max-width: 1024px) 50vw, 25vw"
                    className="object-cover transition-all duration-300 group-hover:scale-[1.02]"
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
    </div>
  );
}
