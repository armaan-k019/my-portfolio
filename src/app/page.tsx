import SectionReveal from "@/components/SectionReveal";
import WorkSection from "@/components/WorkSection";
import AboutSection from "@/components/AboutSection";
import ProjectsSection from "@/components/ProjectsSection";
import ContactSection from "@/components/ContactSection";
import ResearchSection from "@/components/ResearchSection";
import { projects } from "../../content/projects";
import { getResearchEntries } from "@/lib/mdx";

function SectionDivider() {
  return <div className="h-px bg-tan/30" />;
}

export default function Home() {
  const allProjects = projects;
  const researchEntries = getResearchEntries();

  return (
    <div>
      {/* About (merged Hero + About) - base cream */}
      <AboutSection />

      <SectionDivider />

      {/* Work - dark blue at 12% opacity */}
      <section id="work" className="py-14" style={{ backgroundColor: "rgba(30, 58, 95, 0.12)" }}>
        <div className="max-w-5xl mx-auto px-6">
          <SectionReveal>
            <h2 className="text-xl font-semibold text-brown mb-1">Experience</h2>
            <div className="w-10 h-[3px] bg-terracotta mb-8" />
            <WorkSection />
          </SectionReveal>
        </div>
      </section>

      <SectionDivider />

      {/* Projects - terracotta at 3% */}
      <section id="projects" className="py-14" style={{ backgroundColor: "rgba(193, 81, 58, 0.03)" }}>
        <div className="max-w-5xl mx-auto px-6">
          <SectionReveal>
            <h2 className="text-xl font-semibold text-brown mb-1">Projects</h2>
            <div className="w-10 h-[3px] bg-terracotta mb-8" />
            <ProjectsSection projects={allProjects} />
          </SectionReveal>
        </div>
      </section>

      <SectionDivider />

      {/* Research - dark blue at 3% */}
      <section id="research" className="py-14" style={{ backgroundColor: "rgba(30, 58, 95, 0.03)" }}>
        <div className="max-w-5xl mx-auto px-6">
          <SectionReveal>
            <h2 className="text-xl font-semibold text-brown mb-1">Research &amp; Publications</h2>
            <div className="w-10 h-[3px] bg-terracotta mb-3" />
            <p className="text-sm text-brown-light mb-8">
              Including work to be presented at the Computer-Aided Architectural Design Research in Asia (CAADRIA) conference and the Environmental Design Research Association (EDRA) conference.
            </p>
            <ResearchSection entries={researchEntries} />
          </SectionReveal>
        </div>
      </section>

      <SectionDivider />

      {/* Contact - transparent so isometric background shows through */}
      <div style={{ background: "transparent" }}>
        <ContactSection />
      </div>
    </div>
  );
}
