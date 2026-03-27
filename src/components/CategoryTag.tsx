import type { Category } from "../../content/projects";

const categoryConfig: Record<Category, { label: string; bg: string; text: string; border: string; hoverBg: string }> = {
  cs: {
    label: "CS",
    bg: "bg-terracotta/25",
    text: "text-terracotta",
    border: "border-terracotta/40",
    hoverBg: "hover:bg-terracotta/5",
  },
  architecture: {
    label: "Architecture",
    bg: "bg-sage/25",
    text: "text-sage",
    border: "border-sage/40",
    hoverBg: "hover:bg-sage/5",
  },
  intersection: {
    label: "CS \u00d7 Architecture",
    bg: "bg-darkblue/25",
    text: "text-darkblue",
    border: "border-darkblue/40",
    hoverBg: "hover:bg-darkblue/5",
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
