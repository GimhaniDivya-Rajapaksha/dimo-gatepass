import type { Metadata } from "next";
import { Geist, Playfair_Display } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import SessionProvider from "@/components/ui/SessionProvider";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair", weight: ["700", "800"] });

export const metadata: Metadata = {
  title: "DIMO Gate Pass System",
  description: "Gate Pass Management System for DIMO",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geist.variable} ${playfair.variable} antialiased`} style={{ background: "var(--bg)", color: "var(--text)" }}>
        <ThemeProvider>
          <SessionProvider>
            {children}
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
