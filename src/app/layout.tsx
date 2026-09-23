import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppProviders } from "./AppProviders";
import "./globals.css";

export const metadata: Metadata = {
  title: "Career Quest",
  description: "Explainable AI career navigation",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
