"use client";

export interface PageColors {
  bg: string;
  cardBg: string;
  cardBorder: string;
  text: string;
  muted: string;
  dim: string;
  accent: string;
  accentBg: string;
  headerBg: string;
  headerBorder: string;
  headerText: string;
}

export const MY_STYLE: PageColors = {
  bg: "#f5f3ef",
  cardBg: "#ffffff",
  cardBorder: "#e5e0d8",
  text: "#1a1a1a",
  muted: "#6b6b6b",
  dim: "#9a8a7a",
  accent: "#2d5a27",
  accentBg: "#eef2ec",
  headerBg: "#ffffff",
  headerBorder: "#e5e0d8",
  headerText: "#1a1a1a",
};

// Demo pages reference `CSS_VAR_COLORS` for inline styling. The values route
// through CSS variables (`--ct-*`) that each demo's <CompanyThemeStyle/> sets.
// Non-Greptile demos point those variables at MY_STYLE so they render in the
// portfolio's own scheme; Greptile keeps its company-specific values.
export const CSS_VAR_COLORS: PageColors = {
  bg: "var(--ct-bg)",
  cardBg: "var(--ct-card-bg)",
  cardBorder: "var(--ct-card-border)",
  text: "var(--ct-text)",
  muted: "var(--ct-muted)",
  dim: "var(--ct-dim)",
  accent: "var(--ct-accent)",
  accentBg: "var(--ct-accent-bg)",
  headerBg: "var(--ct-header-bg)",
  headerBorder: "var(--ct-header-border)",
  headerText: "var(--ct-header-text)",
};
