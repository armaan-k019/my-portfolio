import type { Metadata } from "next";
import StoryBook from "@/components/storybook/StoryBook";

export const metadata: Metadata = {
  title: "Architecture | Armaan Kazi",
  description: "Architecture portfolio, bound as a book you can page through.",
};

// The architecture portfolio. Its pages come from content/storybook.ts.
export default function ArchitecturePage() {
  return <StoryBook />;
}
