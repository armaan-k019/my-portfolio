"use client";

import { motion } from "framer-motion";

export default function HeroSection() {
  return (
    <section className="max-w-5xl mx-auto px-6 py-24 md:py-32">
      <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="flex-1"
        >
          <h1 className="text-2xl md:text-3xl font-medium text-darkblue tracking-tight">
            Armaan Kazi
          </h1>
          <p className="mt-3 text-brown-light text-base md:text-lg max-w-md">
            CS student at Georgia Tech. I build things and write about them.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
          className="w-[280px] h-[340px] md:w-[300px] md:h-[380px] rounded-2xl shrink-0 flex items-center justify-center shadow-lg border-2 border-darkblue/20"
          style={{ backgroundColor: "#D4A96A" }}
        >
          <span className="text-white/80 text-sm font-medium">Your Photo</span>
        </motion.div>
      </div>
    </section>
  );
}
