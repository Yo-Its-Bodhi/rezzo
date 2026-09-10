import { z } from "zod";
import { withLockedRestaurantState } from "@/lib/state-store";
import { authenticateWaitlist, waitlistTicket, WaitlistError } from "@/lib/waitlist-engine";
import { waitlistSubscriptionSchema, waitlistPushPublicKey } from "@/lib/waitlist-push";
import { waitlistBearer, waitlistBody, waitlistJson, waitlistRoute } from "@/lib/waitlist-api";

export const runtime = "nodejs";
const schema = z.object({ subscription: waitlistSubscriptionSchema });

export async function POST(request: Request) {
  return waitlistRoute(async () => {
    const input = schema.safeParse(await waitlistBody(request));
    if (!input.success) throw new WaitlistError("Invalid or unsupported push subscription.", 400);
    if (!waitlistPushPublicKey()) throw new WaitlistError("Push notifications are not configured.", 503);
    const { result, state } = await withLockedRestaurantState((state) => {
      const entry = authenticateWaitlist(state, waitlistBearer(request));
      if (!["waiting", "offered", "accepted"].includes(entry.status)) throw new WaitlistError("This ticket is no longer active.");
      entry.pushSubscription = input.data.subscription;
      return entry.id;
    });
    return waitlistJson({ ticket: waitlistTicket(state, state.waitlist.find((entry) => entry.id === result)!) });
  });
}
