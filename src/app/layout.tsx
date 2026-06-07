import type { Metadata } from "next";
import { Inter, Amiri } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import IsometricBackground from "@/components/IsometricBackground";
import DrawingAwareScope from "@/components/DrawingAwareScope";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const amiri = Amiri({
  subsets: ["arabic"],
  weight: ["400", "700"],
  variable: "--font-amiri",
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
    <html lang="en" className={`${inter.variable} ${amiri.variable} antialiased`}>
      <body className="min-h-screen flex flex-col font-sans relative">
        <IsometricBackground />
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
