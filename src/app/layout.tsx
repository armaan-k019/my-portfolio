import type { Metadata } from "next";
import { Inter, Amiri, Fraunces, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import DrawingAwareScope from "@/components/DrawingAwareScope";
import CustomCursor from "@/components/CustomCursor";
import AtlasFrame from "@/components/AtlasFrame";
import AtlasMount from "@/components/atlas/AtlasMount";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const amiri = Amiri({
  subsets: ["arabic"],
  weight: ["400", "700"],
  variable: "--font-amiri",
});

// Editorial display serif for headings. Optical sizing on, weights we use.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
});

// Technical monospace for the metadata layer: indices, labels, coordinates.
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "Armaan Kazi | Portfolio",
  description: "CS student at Georgia Tech. I build things and write about them.",
  icons: {
    icon: '/logos/ak-logo.png',
    apple: '/logos/ak-logo.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${amiri.variable} ${fraunces.variable} ${plexMono.variable} antialiased`}>
      <body className="min-h-screen flex flex-col font-sans relative">
        <AtlasMount />
        <AtlasFrame />
        <CustomCursor />
        <DrawingAwareScope>
          <div className="relative z-10 flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-1 pt-16">{children}</main>
            <Footer />
          </div>
        </DrawingAwareScope>
      </body>
    </html>
  );
}
