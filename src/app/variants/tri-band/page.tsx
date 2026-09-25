// Review-only homepage variant. Reference: Edward Young's 1935 Penguin
// tri-band cover. Strategy: drenched green bands around a paper center band.
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

export default function TriBandHome() {
  return (
    <div>
      <div className={s.band}>
        <AboutSection />
      </div>

      <div className={s.center}>
        {[
          { id: "work", title: "Experience", body: <WorkSection /> },
          { id: "projects", title: "Selected Projects", body: <ProjectsSection projects={projects} /> },
          { id: "research", title: "Research & Publications", body: <ResearchSection entries={getResearchEntries()} /> },
        ].map((sec) => (
          <section key={sec.id} id={sec.id} className="py-16 md:py-20">
            <div className="max-w-5xl mx-auto px-6">
              <SectionReveal>
                <h2 className="font-display display-md font-semibold mb-8">{sec.title}</h2>
                {sec.body}
              </SectionReveal>
            </div>
          </section>
        ))}
      </div>

      <div className={s.band}>
        <ContactSection />
      </div>
    </div>
  );
}
