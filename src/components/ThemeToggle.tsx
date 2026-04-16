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

interface ThemeToggleProps {
  theme: "my" | "company";
  onChange: (t: "my" | "company") => void;
  companyAccent: string;
  /** Pass true when the surrounding header/area has a dark background */
  darkContext?: boolean;
}

export default function ThemeToggle({
  theme,
  onChange,
  companyAccent,
  darkContext = false,
}: ThemeToggleProps) {
  const labelColor = darkContext
    ? (theme === "my" ? "#9a8a7a" : companyAccent + "99")
    : (theme === "my" ? "#9a8a7a" : companyAccent + "bb");

  const wrapperBg = theme === "my"
    ? (darkContext ? "#2a2a2a" : "#ede9e3")
    : companyAccent + "22";

  const activeColor = theme === "my" ? "#2d5a27" : companyAccent;

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <span className="text-[10px] font-medium" style={{ color: labelColor }}>
        View as:
      </span>
      <div
        className="flex rounded-lg p-0.5"
        style={{ backgroundColor: wrapperBg }}
      >
        {(["my", "company"] as const).map((t) => (
          <button
            key={t}
            onClick={() => onChange(t)}
            className="text-[10px] font-semibold px-2 py-1 rounded-md transition-all"
            style={{
              backgroundColor: theme === t ? activeColor : "transparent",
              color: theme === t ? "#ffffff" : labelColor,
            }}
          >
            {t === "my" ? "My Style" : "Company Style"}
          </button>
        ))}
      </div>
    </div>
  );
}
