"use client";

import { motion } from "framer-motion";
import CurrentlyWorkingOn from "./CurrentlyWorkingOn";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

const columns = [
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

export default function InterestsSection() {
  return (
    <section id="favorites" className="max-w-5xl mx-auto px-6 py-14">
      <CurrentlyWorkingOn />
      <h2 className="text-xl font-semibold text-brown mb-1">Favorites</h2>
      <div className="w-10 h-[3px] bg-terracotta mb-8" />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {columns.map((col, i) => (
          <motion.div
            key={col.label}
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5, delay: i * 0.08, ease: "easeOut" }}
            className="bg-cream-warm rounded-xl border border-tan/30 p-5 shadow-sm hover:-translate-y-[3px] hover:shadow-md transition-all duration-200"
          >
            <p className="text-lg mb-1">{col.emoji}</p>
            <p className={`text-sm font-semibold ${col.labelColor} mb-4`}>{col.label}</p>
            <ul className="space-y-3">
              {col.items.map((item) => (
                <li key={item} className="flex gap-2 items-center">
                  <span className={`w-1.5 h-1.5 rounded-full ${col.dotColor} shrink-0`} />
                  <p className="text-sm font-medium text-brown">{item}</p>
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
