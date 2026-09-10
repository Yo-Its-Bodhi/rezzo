import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { hasStaffSession } from "@/lib/auth";
import { WAITLIST_ENABLED } from "@/lib/features";
import { WaitlistSign } from "@/components/waitlist-sign";

export default async function WaitlistSignPage() {
  if (!(await hasStaffSession())) redirect("/staff/login");
  if (!WAITLIST_ENABLED) notFound();
  const origin = process.env.APP_URL;
  if (!origin) throw new Error("APP_URL must be configured before printing the waitlist sign.");
  const url = new URL("/waitlist", origin).toString();
  const qr = await QRCode.toDataURL(url, { width: 900, margin: 4, errorCorrectionLevel: "H", color: { dark: "#17120f", light: "#ffffff" } });
  return <WaitlistSign qr={qr} url={url} />;
}
