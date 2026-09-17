export interface TimelineEntry {
  year: string;
  title: string;
  description: string;
}

const ENTRIES: TimelineEntry[] = [
  { year: "[YYYY]", title: "[Georgia Tech starts]", description: "[TODO: one-line description]" },
  { year: "[YYYY]", title: "[Shape Computation Lab]", description: "[TODO: one-line description]" },
  { year: "[YYYY]", title: "[Rho internship]", description: "[TODO: one-line description]" },
  { year: "[YYYY]", title: "[Jeeves internship]", description: "[TODO: one-line description]" },
  { year: "[YYYY]", title: "[CAADRIA paper]", description: "[TODO: one-line description]" },
];

export default function AboutTimeline() {
  return (
    <ol className="relative pl-6 space-y-8 md:pl-0 md:space-y-0 md:flex md:gap-6 md:overflow-x-auto md:pb-2">
      <span className="absolute left-[5px] top-1 bottom-1 w-px bg-line md:hidden" aria-hidden="true" />
      {ENTRIES.map((entry, i) => (
        <li key={i} className="relative md:flex-1 md:min-w-[180px]">
          <span className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-terracotta border-2 border-paper md:hidden" aria-hidden="true" />
          <div className="hidden md:block relative h-px bg-line mb-4">
            <span className="absolute left-0 -top-[5px] w-3 h-3 rounded-full bg-terracotta" aria-hidden="true" />
          </div>
          <p className="font-mono text-[11px] uppercase tracking-wide text-terracotta mb-1">
            {entry.year}
          </p>
          <p className="font-display text-base font-semibold text-ink mb-1">
            {entry.title}
          </p>
          <p className="text-sm text-brown-light leading-snug">
            {entry.description}
          </p>
        </li>
      ))}
    </ol>
  );
}
