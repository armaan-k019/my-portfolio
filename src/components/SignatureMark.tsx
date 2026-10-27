// Armaan's signature, scanned from the sketchbook. Drawn as a CSS mask so it
// takes whatever background color the caller passes (e.g. bg-darkblue).
// `bold` uses a copy with slightly thickened strokes, for large or dark placements.
export default function SignatureMark({
  className = "",
  size = "h-10 w-[84px]",
  bold = false,
}: {
  className?: string;
  size?: string;
  bold?: boolean;
}) {
  const src = bold ? "url(/logos/signature-bold.png)" : "url(/logos/signature.png)";
  return (
    <span
      aria-hidden
      className={`block select-none ${size} ${className}`}
      style={{
        maskImage: src,
        WebkitMaskImage: src,
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  );
}
