import type { Metadata } from "next";
import { demoModeEnabled } from "./demo-mode";

export const baseMetadata: Metadata = {
  title: "Reserve | La Chingada",
  description:
    "Save your seat for fresh Mexican street food at La Chingada, 1242 Dundas Street West, Toronto. Book a table for up to six guests.",
  icons: { icon: "/brand/corn-mark.svg", apple: "/apple-touch-icon.png" },
};

export function reservationMetadata(
  environment: Parameters<typeof demoModeEnabled>[0],
): Metadata {
  return demoModeEnabled(environment)
    ? {
        ...baseMetadata,
        robots: { index: false, follow: false, noarchive: true },
      }
    : baseMetadata;
}
