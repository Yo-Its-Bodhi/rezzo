import { z } from "zod";
import { withLockedRestaurantState } from "@/lib/state-store";
import { authenticateWaitlist, respondToWaitlist, waitlistTicket, WaitlistError } from "@/lib/waitlist-engine";
import { waitlistBearer, waitlistBody, waitlistJson, waitlistRoute } from "@/lib/waitlist-api";

export const runtime = "nodejs";
const schema = z.object({
  action: z.enum(["accept", "decline", "leave"]),
  offerId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  return waitlistRoute(async () => {
    const input = schema.safeParse(await waitlistBody(request));
    if (!input.success) throw new WaitlistError("Invalid waitlist response.", 400);
    const { result, state } = await withLockedRestaurantState((state) => {
      const entry = authenticateWaitlist(state, waitlistBearer(request));
      return respondToWaitlist(state, entry, input.data.action, input.data.offerId).id;
    });
    return waitlistJson({ ticket: waitlistTicket(state, state.waitlist.find((entry) => entry.id === result)!) });
  });
}
