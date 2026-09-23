import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppNavigation } from "@/components/app-navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "Career Quest · AI Career Navigator",
  description: "Explainable career navigation powered by evidence, not guesswork",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ru" data-scroll-behavior="smooth">
      <body>
        <AppNavigation />
        {children}
      </body>
    </html>
  );
}
