import WorkSection from "@/components/WorkSection";
import AboutSection from "@/components/AboutSection";
import ProjectsSection from "@/components/ProjectsSection";
import ContactSection from "@/components/ContactSection";
import NodeField from "@/components/NodeField";
import ResearchSection from "@/components/ResearchSection";
import { projects } from "../../content/projects";
import { getResearchEntries } from "@/lib/mdx";

export default function Home() {
  const allProjects = projects;
  // The Shape Machine lives on the Shape Computation Lab work entry instead.
  const researchEntries = getResearchEntries().filter((e) => e.slug !== "shape-machine");

  return (
    <div>
      {/* About (merged Hero + About) */}
      <AboutSection />

      {/* Everything below the hero sits over the ambient node field. */}
      <div className="relative">
        <NodeField />
        <div className="relative">
          {/* Work */}
          <section id="work" className="py-20 md:py-24">
            <div className="max-w-5xl mx-auto px-6">
              <h2 className="font-display display-md font-semibold text-darkblue mb-10">Experience</h2>
              <WorkSection />
            </div>
          </section>

          {/* Projects */}
          <section id="projects" className="py-20 md:py-24">
            <div className="max-w-5xl mx-auto px-6">
              <h2 className="font-display display-md font-semibold text-darkblue mb-10">Selected Projects</h2>
              <ProjectsSection projects={allProjects} />
            </div>
          </section>

          {/* Research */}
          <section id="research" className="py-20 md:py-24">
            <div className="max-w-5xl mx-auto px-6">
              <h2 className="font-display display-md font-semibold text-darkblue mb-10">Research &amp; Publications</h2>
              <ResearchSection entries={researchEntries} />
            </div>
          </section>

          {/* Contact */}
          <ContactSection />
        </div>
      </div>
    </div>
  );
}
