"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Carousel from "./Carousel";
import Modal from "./Modal";

const ROLE_WORDS = ["student", "researcher", "architect", "computer scientist", "engineer"];

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

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

export default function AboutSection() {
  const [favOpen, setFavOpen] = useState(false);
  const [roleIdx, setRoleIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setRoleIdx(i => (i + 1) % ROLE_WORDS.length), 3400);
    return () => clearInterval(t);
  }, []);

  const currentRole = ROLE_WORDS[roleIdx];
  const article = /^[aeiou]/i.test(currentRole) ? "an" : "a";

  return (
    <section id="about" className="max-w-5xl mx-auto px-6 pt-16 md:pt-24 pb-16">
      <div className="grid grid-cols-1 md:grid-cols-[47fr_53fr] gap-12 items-center">
        {/* Left column - Bio */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <span className="meta text-terracotta">BASECAMP</span>
            <span className="w-1 h-1 rotate-45 bg-terracotta/40" />
            <span className="eyebrow">Architecture &times; Computer Science</span>
            <span className="coord text-brown-light/45">33.7490°N 84.3880°W</span>
          </div>
          <h1 className="font-display display-lg font-semibold text-ink mb-5">
            {["Armaan", "Kazi"].map((word, i) => (
              <span key={word} className="block overflow-hidden pb-[0.08em]">
                <motion.span
                  className="block"
                  initial={{ y: "115%" }}
                  animate={{ y: 0 }}
                  transition={{ duration: 0.95, delay: 0.15 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
                >
                  {word}
                </motion.span>
              </span>
            ))}
          </h1>
          <p className="font-mono text-[15px] md:text-base text-brown-light mb-6 tracking-tight">
            Building at the intersection of design and code.
          </p>
          <div className="text-brown-light leading-relaxed space-y-3 mb-5">
            <p>
              My name is Armaan and I am{" "}
              <AnimatePresence mode="wait">
                <motion.span
                  key={currentRole}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.75, ease: "easeOut" }}
                  className="inline-block"
                >
                  {article}{" "}
                  <span
                    className="font-bold tracking-tight"
                    style={{
                      color: "#15803D",
                      borderBottom: "2px solid #15803D",
                      paddingBottom: "1px",
                    }}
                  >
                    {currentRole}
                  </span>
                </motion.span>
              </AnimatePresence>
              {" "}at Georgia Tech, double majoring in Computer Science and Architecture with a certificate in Sustainable Architecture.
            </p>
            <p>
              I build things because I care about people and the places they inhabit. That usually means architecture, sometimes code, often both. I&apos;m drawn to problems that sit at that intersection where designing something well and building something well are the same question.
            </p>
            <p>
              I also like to write and take pictures, alongside many other things.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 mb-7">
            <span className="text-xs px-3 py-1.5 rounded-full bg-white/60 backdrop-blur text-brown-light border border-[#D8E6D8]">
              📍 Atlanta, GA
            </span>
            <span className="text-xs px-3 py-1.5 rounded-full bg-white/60 backdrop-blur text-brown-light border border-[#D8E6D8]">
              🎓 Georgia Tech &apos;27
            </span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="#contact"
              data-cursor
              className="group inline-flex items-center gap-1.5 text-sm font-medium px-5 py-2.5 rounded-full bg-terracotta text-white shadow-sm hover:bg-terracotta-dark hover:shadow-md transition-all"
            >
              Get in touch
              <span className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
            </a>
            <button
              onClick={() => setFavOpen(true)}
              data-cursor
              className="group inline-flex items-center gap-1.5 text-sm font-medium px-5 py-2.5 rounded-full border border-terracotta/30 text-terracotta hover:bg-terracotta/5 transition-all cursor-pointer"
            >
              Favorites
              <span className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
            </button>
          </div>
        </motion.div>

        {/* Right column - Carousel */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
          className="flex items-center justify-center"
        >
          <div className="w-full">
            <Carousel />
          </div>
        </motion.div>
      </div>

      {/* Favorites modal */}
      <Modal open={favOpen} onClose={() => setFavOpen(false)} panelClassName="max-w-3xl">
        <h2 className="font-display text-2xl font-semibold text-ink mb-1">Favorites</h2>
        <hr className="rule mb-6 mt-2" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {favColumns.map((col) => (
            <div
              key={col.label}
              className="card p-4"
            >
              <p className="text-lg mb-1">{col.emoji}</p>
              <p className={`text-sm font-semibold ${col.labelColor} mb-3`}>{col.label}</p>
              <ul className="space-y-2">
                {col.items.map((item) => (
                  <li key={item} className="flex gap-2 items-center">
                    <span className={`w-1.5 h-1.5 rounded-full ${col.dotColor} shrink-0`} />
                    <p className="text-sm font-medium text-brown">{item}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Modal>
    </section>
  );
}
