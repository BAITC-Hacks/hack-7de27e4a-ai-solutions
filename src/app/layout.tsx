import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppProviders } from "./AppProviders";
import { cookies } from "next/headers";
import { isLocale, LANGUAGE_STORAGE_KEY } from "@/lib/i18n/core";
import "./globals.css";

export const metadata: Metadata = {
  title: "Career Quest",
  description: "Explainable AI career navigation",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const savedLocale = (await cookies()).get(LANGUAGE_STORAGE_KEY)?.value;
  const locale = isLocale(savedLocale) ? savedLocale : "ru";
  return (
    <html lang={locale} data-scroll-behavior="smooth">
      <body>
        <AppProviders initialLocale={locale}>{children}</AppProviders>
      </body>
    </html>
  );
}
