// Review-only homepage variant. Reference: Massimo Vignelli's 1972 New York
// City Subway diagram. Strategy: full palette, one line color per section.
import SectionReveal from "@/components/SectionReveal";
import WorkSection from "@/components/WorkSection";
import AboutSection from "@/components/AboutSection";
import ProjectsSection from "@/components/ProjectsSection";
import ContactSection from "@/components/ContactSection";
import ResearchSection from "@/components/ResearchSection";
import { projects } from "../../../../content/projects";
import { getResearchEntries } from "@/lib/mdx";
import s from "./page.module.css";

export const metadata = { robots: { index: false } };

export default function LineHome() {
  return (
    <div>
      <AboutSection />

      {[
        { id: "work", title: "Experience", line: s.green, body: <WorkSection /> },
        { id: "projects", title: "Selected Projects", line: s.blue, body: <ProjectsSection projects={projects} /> },
        { id: "research", title: "Research & Publications", line: s.rust, body: <ResearchSection entries={getResearchEntries()} /> },
      ].map((sec) => (
        <section key={sec.id} id={sec.id} className={`${s.line} ${sec.line} py-16 md:py-20`}>
          <div className="max-w-5xl mx-auto px-6">
            <SectionReveal>
              <div className={s.bar} />
              <h2 className="font-display display-md font-semibold mb-8">{sec.title}</h2>
              {sec.body}
            </SectionReveal>
          </div>
        </section>
      ))}

      <ContactSection />
    </div>
  );
}
