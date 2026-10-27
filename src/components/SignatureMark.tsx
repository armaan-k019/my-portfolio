// Armaan's signature, scanned from the sketchbook. Drawn as a CSS mask so it
// takes whatever background color the caller passes (e.g. bg-darkblue).
export default function SignatureMark({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`block h-10 w-[84px] select-none ${className}`}
      style={{
        maskImage: "url(/logos/signature.png)",
        WebkitMaskImage: "url(/logos/signature.png)",
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
