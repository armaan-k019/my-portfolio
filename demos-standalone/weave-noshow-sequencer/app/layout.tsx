import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Weave No-Show Sequencer",
  description: "Patient no-show risk and re-engagement sequencer demo",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <footer
          style={{
            textAlign: "center",
            padding: "1.5rem",
            fontSize: "0.8rem",
            opacity: 0.5,
          }}
        >
          Built by{" "}
          <a
            href="https://armaankazi.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Armaan Kazi
          </a>{" "}
          · armaankazi.com
        </footer>
      </body>
    </html>
  );
}
