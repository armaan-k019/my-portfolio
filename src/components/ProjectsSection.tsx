import Link from "next/link";
import type { Project } from "../../content/projects";

export default function ProjectsSection({ projects }: { projects: Project[] }) {
  return (
    <>
      <ul style={{ borderTop: "var(--rule)" }}>
        {projects.map((project) => (
          <li
            key={project.slug}
            style={{ borderBottom: "var(--rule)" }}
            className="grid grid-cols-1 sm:grid-cols-[minmax(0,15rem)_1fr_auto] gap-x-6 gap-y-1 py-4 items-baseline"
          >
            <Link
              href={`/projects/${project.slug}`}
              className="font-display text-lg font-semibold text-ink hover:text-terracotta transition-colors"
            >
              {project.title}
            </Link>
            <div>
              <p className="text-sm text-brown-light leading-relaxed">{project.blurb}</p>
              <p className="meta mt-1">
                {project.stack.join(" · ")}
                {project.status && <> · {project.status}</>}
              </p>
            </div>
            <span className="meta whitespace-nowrap flex gap-4">
              {project.link && (
                <a
                  href={project.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-terracotta transition-colors"
                  aria-label={`Visit ${project.title}`}
                >
                  {new URL(project.link).host} &#8599;
                </a>
              )}
              {project.github && (
                <a
                  href={project.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-terracotta transition-colors"
                  aria-label={`View ${project.title} on GitHub`}
                >
                  GitHub
                </a>
              )}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-xs text-brown-light/60">
        More on{" "}
        <a
          href="https://github.com/armaan-k019"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-brown-light transition-colors"
        >
          GitHub
        </a>
        .
      </p>
    </>
  );
}
