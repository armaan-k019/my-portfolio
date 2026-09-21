const favColumns = [
  {
    emoji: "🎬",
    label: "Watches",
    labelColor: "text-sage",
    dotColor: "bg-sage",
    items: ["Ted Lasso", "Demolition", "Chhichhore"],
  },
  {
    emoji: "📚",
    label: "Reads",
    labelColor: "text-darkblue",
    dotColor: "bg-darkblue",
    items: ["The Catcher in the Rye", "The Odyssey", "A Canticle for Leibowitz"],
  },
  {
    emoji: "🎵",
    label: "Listens",
    labelColor: "text-terracotta",
    dotColor: "bg-terracotta",
    items: ["End of Summer by Tame Impala", "Runaway by Kanye West", "Eyes Without a Face by Billy Idol"],
  },
  {
    emoji: "🏆",
    label: "Sports Teams",
    labelColor: "text-darkblue",
    dotColor: "bg-darkblue",
    items: ["Baltimore Ravens", "Washington Wizards", "Juventus"],
  },
  {
    emoji: "🏛️",
    label: "Favorite Architects",
    labelColor: "text-sage",
    dotColor: "bg-sage",
    items: ["Louis Kahn", "Tadao Ando", "Peter Zumthor"],
  },
  {
    emoji: "🌍",
    label: "Destinations",
    labelColor: "text-terracotta",
    dotColor: "bg-terracotta",
    items: ["Mumbai", "Iceland", "Amsterdam"],
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-6 pt-16 md:pt-24 pb-20">

        <section className="mb-16">
          <h1 className="font-display display-lg font-semibold text-ink mb-6">More about me</h1>
        </section>

        <section className="mb-16">
          <p className="eyebrow mb-3">Favorites</p>
          <hr className="rule mb-6" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
            {favColumns.map((col) => (
              <div key={col.label} className="flex items-start gap-2">
                <span className="text-base leading-none mt-0.5 shrink-0">{col.emoji}</span>
                <div className="min-w-0">
                  <p className={`text-xs font-semibold ${col.labelColor} mb-0.5`}>{col.label}</p>
                  <p className="text-xs text-brown-light leading-snug">{col.items.join(" · ")}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-16">
          <p className="eyebrow mb-3">Timeline</p>
          <hr className="rule mb-6" />
          <p className="meta">Coming soon</p>
        </section>

        <section>
          <p className="eyebrow mb-3">Pages from my sketchbook</p>
          <hr className="rule mb-6" />
          <p className="meta">Coming soon</p>
        </section>

      </div>
    </div>
  );
}
