import SectionReveal from "@/components/SectionReveal";
import WorkSection from "@/components/WorkSection";
import AboutSection from "@/components/AboutSection";
import ProjectsSection from "@/components/ProjectsSection";
import ContactSection from "@/components/ContactSection";
import ResearchSection from "@/components/ResearchSection";
import SheetHeader from "@/components/SheetHeader";
import Marquee from "@/components/Marquee";
import { projects } from "../../content/projects";
import { getResearchEntries } from "@/lib/mdx";

export default function Home() {
  const allProjects = projects;
  const researchEntries = getResearchEntries();

  return (
    <div>
      {/* About (merged Hero + About) */}
      <AboutSection />

      <Marquee />

      {/* Work */}
      <section id="work" className="py-20 md:py-24" style={{ backgroundColor: "rgba(45, 90, 39, 0.025)" }}>
        <div className="max-w-5xl mx-auto px-6">
          <SectionReveal>
            <SheetHeader index="01" eyebrow="Where I've worked" title="Experience" coord="33.7756°N 84.3963°W" />
            <WorkSection />
          </SectionReveal>
        </div>
      </section>

      {/* Projects */}
      <section id="projects" className="py-20 md:py-24">
        <div className="max-w-5xl mx-auto px-6">
          <SectionReveal>
            <SheetHeader index="02" eyebrow="Things I've built" title="Selected Projects" coord="33.7490°N 84.3880°W" />
            <ProjectsSection projects={allProjects} />
          </SectionReveal>
        </div>
      </section>

      {/* Research */}
      <section id="research" className="py-20 md:py-24" style={{ backgroundColor: "rgba(45, 90, 39, 0.025)" }}>
        <div className="max-w-5xl mx-auto px-6">
          <SectionReveal>
            <SheetHeader
              index="03"
              eyebrow="Peer-reviewed work"
              title="Research & Publications"
              sub="Research submitted, accepted, and presented at leading architecture and design conferences."
              coord="33.7701°N 84.3876°W"
            />
            <ResearchSection entries={researchEntries} />
          </SectionReveal>
        </div>
      </section>

      {/* Contact */}
      <ContactSection />
    </div>
  );
}
