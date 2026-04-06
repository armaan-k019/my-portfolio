import type { Category } from "../../content/projects";

const categoryConfig: Record<Category, { label: string; bg: string; text: string; border: string; hoverBg: string }> = {
  cs: {
    label: "CS",
    bg: "bg-[#E8F0E6]",
    text: "text-[#2D5A27]",
    border: "border-[#2D5A27]/40",
    hoverBg: "hover:bg-[#2D5A27]/10",
  },
  architecture: {
    label: "Architecture",
    bg: "bg-[#E8F0E6]",
    text: "text-[#4A6B4A]",
    border: "border-[#4A6B4A]/40",
    hoverBg: "hover:bg-[#4A6B4A]/10",
  },
  intersection: {
    label: "CS \u00d7 Architecture",
    bg: "bg-[#2D5A27]",
    text: "text-[#C8DEC4]",
    border: "border-[#2D5A27]",
    hoverBg: "hover:bg-[#1A3A16]",
  },
};

export default function CategoryTag({ category }: { category: Category }) {
  const config = categoryConfig[category];
  return (
    <span
      className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border ${config.bg} ${config.text} ${config.border}`}
    >
      {config.label}
    </span>
  );
}

export { categoryConfig };
