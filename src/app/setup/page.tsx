import { loadSkillGraph, SKILLS_REPO_URL, type SkillNode } from "@/lib/skills-graph";
import SkillsConstellation from "@/components/setup/SkillsConstellation";

export const metadata = { title: "Setup | Armaan Kazi" };

// Rebuilt daily so the page follows the ark-skills repo.
export const revalidate = 86400;

// The first sentence of a description, for the index below the graph.
function firstSentence(text: string | null) {
  if (!text) return null;
  const m = text.match(/^(.+?[.!?])(\s|$)/);
  return m ? m[1] : text;
}

export default async function SetupPage() {
  const graph = await loadSkillGraph(revalidate);

  return (
    <div className="max-w-7xl mx-auto px-6 pt-12 pb-20">
      <p className="eyebrow mb-3">ark-skills</p>
      <h1 className="font-display display-lg font-semibold text-ink mb-4">Setup</h1>
      <p className="text-ink/80 max-w-2xl mb-8">
        The skills, subagents, and hooks I run Claude Code with, and how they reference each other. Every node is a file
        in{" "}
        <a href={SKILLS_REPO_URL} target="_blank" rel="noopener noreferrer" className="underline decoration-terracotta/40 underline-offset-2 hover:text-terracotta">
          ark-skills
        </a>
        , and the map is generated from those files.
      </p>

      {graph ? (
        <>
          <SkillsConstellation graph={graph} />

          <section className="mt-16">
            <h2 className="font-display text-xl font-semibold text-ink mb-1">Index</h2>
            <hr className="rule mb-8" />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-10">
              {graph.families.map((f) => {
                const members = graph.nodes.filter((n) => n.family === f.id);
                return (
                  <div key={f.id}>
                    <p className="eyebrow mb-3">
                      {f.label} <span className="text-ink/40">{members.length}</span>
                    </p>
                    <ul className="space-y-3">
                      {members.map((n: SkillNode) => (
                        <li key={n.id}>
                          <a
                            href={`${SKILLS_REPO_URL}/blob/main/${n.path}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group block"
                          >
                            <span className="flex items-center gap-2 font-mono text-sm text-ink group-hover:text-terracotta transition-colors">
                              <span className="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: n.color }} />
                              {n.name}
                            </span>
                            {firstSentence(n.description) && (
                              <span className="mt-1 block text-[13px] leading-snug text-ink/60">{firstSentence(n.description)}</span>
                            )}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : (
        <p className="meta">
          The skills graph couldn&apos;t be loaded right now. It lives in{" "}
          <a href={SKILLS_REPO_URL} className="underline">ark-skills</a>.
        </p>
      )}
    </div>
  );
}
