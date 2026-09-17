"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Carousel from "./Carousel";

const ROLE_WORDS = ["student", "researcher", "architect", "computer scientist", "engineer"];

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

export default function AboutSection() {
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
            <Link
              href="/about"
              data-cursor
              className="group inline-flex items-center gap-1.5 text-sm font-medium px-5 py-2.5 rounded-full border border-terracotta/30 text-terracotta hover:bg-terracotta/5 transition-all"
            >
              More about me
              <span className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
            </Link>
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
    </section>
  );
}
