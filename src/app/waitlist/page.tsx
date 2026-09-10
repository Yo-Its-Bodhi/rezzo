import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { WaitlistGuest } from "@/components/waitlist-guest";
import { WAITLIST_ENABLED } from "@/lib/features";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Join the Waitlist | La Chingada",
  description: "Join La Chingada's walk-in waitlist, follow your place, and accept your table.",
  appleWebApp: { capable: true, title: "La Chingada", statusBarStyle: "black-translucent" },
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function WaitlistPage() {
  if (!WAITLIST_ENABLED) notFound();
  return <><SiteHeader /><WaitlistGuest /></>;
}
