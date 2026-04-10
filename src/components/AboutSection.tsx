"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Carousel from "./Carousel";
import Modal from "./Modal";

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

  return (
    <section id="about" className="max-w-5xl mx-auto px-6 pt-20 pb-14">
      <div className="grid grid-cols-1 md:grid-cols-[47fr_53fr] gap-10">
        {/* Left column - Bio */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <p className="text-xs font-semibold tracking-widest uppercase text-terracotta mb-3">
            About
          </p>
          <h1 className="text-3xl md:text-4xl font-semibold text-darkblue tracking-tight mb-2">
            Armaan Kazi
          </h1>
          <p className="text-brown-light text-base md:text-lg mb-5">
            Architecture + CS @ Georgia Tech
          </p>
          <div className="text-brown-light leading-relaxed space-y-3 mb-5">
            <p>
              My name is Armaan and I am a student at Georgia Tech, double majoring in Computer Science and Architecture with a certificate in Sustainable Architecture.
            </p>
            <p>
              I like to build and design things that solve real world problems. Many of the projects I have created I have actually used for coursework, whether in Computer Science or Architecture. I don&apos;t quite know what I want to do yet, but I know I want to help out.
            </p>
            <p>
              I also like to write and take pictures, alongside many other things.
            </p>
            <p>
              Thanks for checking out my website!
            </p>
          </div>
          <div className="flex flex-wrap gap-2 mb-5">
            <span className="text-xs px-3 py-1 rounded-full bg-[#F0F5F0] text-brown-light border border-[#D8E6D8]">
              📍 Atlanta, GA
            </span>
            <span className="text-xs px-3 py-1 rounded-full bg-[#F0F5F0] text-brown-light border border-[#D8E6D8]">
              🎓 Georgia Tech &apos;27
            </span>
          </div>
          <div className="flex items-center gap-4">
            <a href="#contact" className="text-sm font-medium text-terracotta hover:text-terracotta-dark transition-colors">
              Get in touch &rarr;
            </a>
            <button
              onClick={() => setFavOpen(true)}
              className="text-sm font-medium text-terracotta hover:text-terracotta-dark transition-colors"
            >
              Favorites &rarr;
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
          <div className="w-full" style={{ transform: "translateX(48px)" }}>
            <Carousel />
          </div>
        </motion.div>
      </div>

      {/* Favorites modal */}
      <Modal open={favOpen} onClose={() => setFavOpen(false)} panelClassName="max-w-3xl">
        <h2 className="text-xl font-semibold text-brown mb-1">Favorites</h2>
        <div className="w-10 h-[3px] bg-terracotta mb-6" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {favColumns.map((col) => (
            <div
              key={col.label}
              className="bg-[#F7FAF7] rounded-xl border border-[#D8E6D8] p-4 shadow-sm"
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
