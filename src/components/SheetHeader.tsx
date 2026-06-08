import ContourDivider from "./ContourDivider";

// Region header for the atlas: REGION index + coordinate readout + eyebrow,
// a display title, optional lede, capped with a topographic contour line.

export default function SheetHeader({
  index,
  eyebrow,
  title,
  sub,
  coord,
  size = "md",
}: {
  index?: string;
  eyebrow: string;
  title: string;
  sub?: string;
  coord?: string;
  size?: "md" | "lg";
}) {
  return (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {index && <span className="meta text-terracotta">REGION {index}</span>}
        <span className="w-1 h-1 rotate-45 bg-terracotta/40" />
        <span className="eyebrow">{eyebrow}</span>
        {coord && <span className="coord text-brown-light/45 ml-auto hidden sm:block">{coord}</span>}
      </div>
      <h2 className={`font-display ${size === "lg" ? "display-lg" : "display-md"} font-semibold text-darkblue`}>
        {title}
      </h2>
      {sub && <p className="text-[15px] text-brown-light mt-4 max-w-xl leading-relaxed">{sub}</p>}
      <ContourDivider className="mt-7" />
    </div>
  );
}
