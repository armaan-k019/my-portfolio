import dynamic from "next/dynamic";

const OfficeMapLeaflet = dynamic(() => import("./OfficeMapLeaflet"), {
  ssr: false,
  loading: () => (
    <div className="w-full rounded-xl overflow-hidden border border-[#e4e4e4] bg-[#e8eaf0] h-80 animate-pulse" />
  ),
});

export default function OfficeMap({ className }: { className?: string }) {
  return <OfficeMapLeaflet className={className} />;
}
