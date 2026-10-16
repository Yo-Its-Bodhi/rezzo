import type { Metadata } from "next";
import localFont from "next/font/local";
import { DemoNotice } from "@/components/demo-notice";
import { reservationMetadata } from "@/lib/page-metadata";
import "./globals.css";
import "./reservations.css";

// The preview flag and notice must be evaluated at runtime, never baked into a cached page.
export const dynamic = "force-dynamic";

const geistSans = localFont({
  src: "../../public/fonts/dm-sans-latin-variable.woff2",
  variable: "--font-geist-sans",
  display: "swap",
});

const headingFont = localFont({
  src: [
    {
      path: "../../public/fonts/barlow-condensed-bold-latin.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../../public/fonts/barlow-condensed-extrabold-latin.woff2",
      weight: "800",
      style: "normal",
    },
  ],
  variable: "--font-heading",
  display: "swap",
});

export function generateMetadata(): Metadata {
  return reservationMetadata(process.env);
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${headingFont.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <DemoNotice />
        {children}
      </body>
    </html>
  );
}
