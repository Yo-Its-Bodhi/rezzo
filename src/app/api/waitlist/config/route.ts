import { WAITLIST_ENABLED } from "@/lib/features";
import { waitlistPushPublicKey } from "@/lib/waitlist-push";
import { waitlistJson } from "@/lib/waitlist-api";

export const runtime = "nodejs";

export async function GET() {
  return waitlistJson({ enabled: WAITLIST_ENABLED, pushPublicKey: WAITLIST_ENABLED ? waitlistPushPublicKey() : null });
}
