import { notFound } from "next/navigation";
import Link from "next/link";
import { projects } from "../../../../content/projects";
import CategoryTag from "@/components/CategoryTag";

export function generateStaticParams() {
  return projects.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = projects.find((p) => p.slug === slug);
  return { title: project ? `${project.title} | Armaan Kazi` : "Not Found" };
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = projects.find((p) => p.slug === slug);
  if (!project) notFound();

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <Link
        href="/#projects"
        className="text-sm text-terracotta hover:text-terracotta-dark transition-colors mb-8 inline-block"
      >
        &larr; Back to projects
      </Link>
      <article>
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <h1 className="font-display display-md font-semibold text-ink">{project.title}</h1>
            <CategoryTag category={project.category} />
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                project.status === "Coming Soon"
                  ? "bg-tan/20 text-tan border-tan/40"
                  : "bg-sage/20 text-sage border-sage/40"
              }`}
            >
              {project.status}
            </span>
          </div>
          <p className="text-brown-light leading-relaxed mb-4">{project.description}</p>
          {project.link && (
            <a
              href={project.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-4 py-1.5 text-sm font-medium bg-terracotta text-white rounded-lg hover:bg-terracotta-dark transition-colors"
            >
              Visit project &rarr;
            </a>
          )}
        </header>
      </article>
    </div>
  );
}
