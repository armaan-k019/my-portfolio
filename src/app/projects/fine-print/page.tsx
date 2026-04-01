"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

interface Loophole {
  title: string;
  what: string;
  how: string;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(",")[1]);
    };
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsText(file);
  });
}

export default function FinePrintPage() {
  const [file, setFile] = useState<File | null>(null);
  const [context, setContext] = useState("");
  const [loopholes, setLoopholes] = useState<Loophole[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped && isValidFile(dropped)) {
      setFile(dropped);
      setError("");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && isValidFile(selected)) {
      setFile(selected);
      setError("");
    }
  };

  function isValidFile(f: File): boolean {
    const valid =
      f.type === "application/pdf" ||
      f.type === "text/plain" ||
      f.name.endsWith(".txt") ||
      f.name.endsWith(".pdf");
    if (!valid) setError("Please upload a PDF or .txt file.");
    return valid;
  }

  const handleSubmit = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    setLoopholes([]);
    setHasSearched(false);

    try {
      const isPDF = file.type === "application/pdf" || file.name.endsWith(".pdf");

      let body: Record<string, string>;
      if (isPDF) {
        const base64 = await readFileAsBase64(file);
        body = { base64, mediaType: "application/pdf", context };
      } else {
        const content = await readFileAsText(file);
        if (content.trim().length === 0) {
          setError("File appears to be empty.");
          setLoading(false);
          return;
        }
        body = { content, context };
      }

      const res = await fetch("/api/fine-print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Analysis failed.");
      }

      const data = await res.json();
      setLoopholes(data.loopholes || []);
      setHasSearched(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <Link
        href="/#projects"
        className="text-sm text-terracotta hover:text-terracotta-dark transition-colors mb-8 inline-block"
      >
        &larr; Back to projects
      </Link>

      <header className="mb-10">
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <h1 className="text-2xl font-semibold text-darkblue">Fine Print</h1>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-sage/20 text-sage border-sage/40">
            CS
          </span>
        </div>
        <p className="text-brown-light leading-relaxed">
          Upload any document, from board game rules to legal contracts, and let AI
          surface the real loopholes, genuine gaps, ambiguities, and exploitable
          clauses hiding in the fine print.
        </p>
        <p className="text-xs text-brown-light/60 mt-3 italic">
          Fine Print is just for fun. Loopholes are AI-generated for entertainment purposes only; not legal advice.
        </p>
      </header>

      {/* Upload area */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          file
            ? "border-sage bg-sage/5"
            : "border-tan/60 hover:border-terracotta/50 bg-cream-dark/30"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,text/plain,application/pdf"
          onChange={handleFileChange}
          className="hidden"
        />
        {file ? (
          <div>
            <p className="text-sage font-medium">{file.name}</p>
            <p className="text-xs text-brown-light mt-1">
              {(file.size / 1024).toFixed(1)} KB · click or drop to replace
            </p>
          </div>
        ) : (
          <div>
            <div className="text-3xl mb-2 text-tan">&#128196;</div>
            <p className="text-brown font-medium">Drop a PDF or .txt file here</p>
            <p className="text-xs text-brown-light mt-1">or click to browse</p>
          </div>
        )}
      </div>

      {/* Context field */}
      <div className="mt-5">
        <label className="block text-sm font-medium text-brown mb-1.5">
          Context{" "}
          <span className="text-brown-light font-normal">(optional but helpful)</span>
        </label>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder={'e.g. "I am a tenant trying to break my lease" or "I\'m the buyer in this deal"'}
          rows={2}
          className="w-full rounded-lg border border-tan/40 bg-cream-dark/20 px-4 py-2.5 text-sm text-brown placeholder:text-brown-light/60 focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta/50 transition-colors resize-none"
        />
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!file || loading}
        className="mt-5 w-full px-5 py-2.5 text-sm font-medium bg-terracotta text-white rounded-lg hover:bg-terracotta-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? "Analyzing..." : "Find Loopholes"}
      </button>

      {/* Error */}
      {error && (
        <div className="mt-4 p-3 rounded-lg bg-terracotta/10 border border-terracotta/20 text-sm text-terracotta">
          {error}
        </div>
      )}

      {/* Loading indicator */}
      {loading && (
        <div className="mt-10 flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-terracotta/30 border-t-terracotta rounded-full animate-spin" />
          <p className="text-sm text-brown-light">Reading the fine print...</p>
        </div>
      )}

      {/* Results */}
      <AnimatePresence>
        {hasSearched && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-10"
          >
            {loopholes.length === 0 ? (
              <div className="text-center py-10">
                <div className="text-3xl mb-2">&#9989;</div>
                <p className="text-brown font-medium">This document looks airtight.</p>
                <p className="text-sm text-brown-light mt-1">
                  No meaningful loopholes, ambiguities, or exploitable clauses found.
                </p>
              </div>
            ) : (
              <div>
                <h2 className="text-lg font-semibold text-darkblue mb-4">
                  {loopholes.length} loophole{loopholes.length !== 1 && "s"} found
                </h2>
                <div className="flex flex-col gap-4">
                  {loopholes.map((l, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.08 }}
                      className="rounded-xl border border-tan/30 bg-white/50 p-5"
                    >
                      <h3 className="font-semibold text-darkblue mb-2">{l.title}</h3>
                      <div className="mb-3">
                        <p className="text-xs font-medium text-terracotta uppercase tracking-wide mb-1">
                          What it is
                        </p>
                        <p className="text-sm text-brown leading-relaxed">{l.what}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-sage uppercase tracking-wide mb-1">
                          How to use it
                        </p>
                        <p className="text-sm text-brown leading-relaxed">{l.how}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
