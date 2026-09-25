"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Carousel from "./Carousel";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

export default function AboutSection() {
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
          <div className="text-brown-light leading-relaxed space-y-3 mb-5">
            <p>
              I am a student at Georgia Tech, double majoring in Computer Science and Architecture with a certificate in Sustainable Architecture.
            </p>
          </div>
          <p className="meta mb-7">Georgia Tech &apos;27</p>
          <div className="flex items-center gap-3">
            <a
              href="#contact"
              className="group inline-flex items-center gap-1.5 text-sm font-medium px-5 py-2.5 rounded-full bg-terracotta text-white shadow-sm hover:bg-terracotta-dark hover:shadow-md transition-all"
            >
              Get in touch
              <span className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
            </a>
            <Link
              href="/about"
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
