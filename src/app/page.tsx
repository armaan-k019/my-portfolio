import SectionReveal from "@/components/SectionReveal";
import WorkSection from "@/components/WorkSection";
import AboutSection from "@/components/AboutSection";
import ProjectsSection from "@/components/ProjectsSection";
import ContactSection from "@/components/ContactSection";
import ResearchSection from "@/components/ResearchSection";
import { projects } from "../../content/projects";
import { getResearchEntries } from "@/lib/mdx";

export default function Home() {
  const allProjects = projects;
  const researchEntries = getResearchEntries();

  return (
    <div>
      {/* About (merged Hero + About) */}
      <AboutSection />

      {/* Work */}
      <section id="work" className="py-20 md:py-24">
        <div className="max-w-5xl mx-auto px-6">
          <SectionReveal>
            <h2 className="font-display display-md font-semibold text-darkblue mb-10">Experience</h2>
            <WorkSection />
          </SectionReveal>
        </div>
      </section>

      {/* Projects */}
      <section id="projects" className="py-20 md:py-24">
        <div className="max-w-5xl mx-auto px-6">
          <SectionReveal>
            <h2 className="font-display display-md font-semibold text-darkblue mb-10">Selected Projects</h2>
            <ProjectsSection projects={allProjects} />
          </SectionReveal>
        </div>
      </section>

      {/* Research */}
      <section id="research" className="py-20 md:py-24">
        <div className="max-w-5xl mx-auto px-6">
          <SectionReveal>
            <h2 className="font-display display-md font-semibold text-darkblue mb-10">Research &amp; Publications</h2>
            <ResearchSection entries={researchEntries} />
          </SectionReveal>
        </div>
      </section>

      {/* Contact */}
      <ContactSection />
    </div>
  );
}
