"use client";

import { motion } from "framer-motion";
import Carousel from "./Carousel";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

export default function AboutSection() {
  return (
    <section id="about" className="max-w-5xl mx-auto px-6 pt-20 pb-14">
      <div className="grid grid-cols-1 md:grid-cols-[47fr_53fr] gap-10">
        {/* Left column — Bio */}
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
              Hey! I&apos;m a student at Georgia Tech, double majoring in Computer Science and Architecture, working towards a certificate in Sustainable Architecture. I am passionate about the intersection of intelligent systems and creative fields. My goal is to contribute to systems that are sustainable, adaptive, and responsive by blending smart technology with environmental consciousness.
            </p>
            <p>
              When I&apos;m not coding or in the studio, you can find me listening to music, playing and watching sports, or reading. Thanks for visiting! Feel free to explore my projects, blog, or photography.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 mb-5">
            <span className="text-xs px-3 py-1 rounded-full bg-tan/20 text-brown-light border border-tan/40">
              📍 Atlanta, GA
            </span>
            <span className="text-xs px-3 py-1 rounded-full bg-tan/20 text-brown-light border border-tan/40">
              🎓 Georgia Tech &apos;27
            </span>
          </div>
          <a href="#contact" className="text-sm font-medium text-terracotta hover:text-terracotta-dark transition-colors">
            Get in touch &rarr;
          </a>
        </motion.div>

        {/* Right column — Carousel (fills entire column) */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
        >
          <Carousel />
        </motion.div>
      </div>
    </section>
  );
}
