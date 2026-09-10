import { withLockedRestaurantState } from "@/lib/state-store";
import { authenticateWaitlist, joinWaitlist, waitlistJoinSchema, waitlistTicket, WaitlistError } from "@/lib/waitlist-engine";
import { waitlistBearer, waitlistBody, waitlistJson, waitlistRoute } from "@/lib/waitlist-api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return waitlistRoute(async () => {
    const input = waitlistJoinSchema.safeParse(await waitlistBody(request));
    if (!input.success) throw new WaitlistError("Enter a name, valid phone, party size (1–6), and notification consent.", 400);
    const { result, state } = await withLockedRestaurantState((state) => {
      const { entry, token } = joinWaitlist(state, input.data, new Date(), waitlistBearer(request));
      return { id: entry.id, token };
    });
    return waitlistJson({ token: result.token, ticket: waitlistTicket(state, state.waitlist.find((entry) => entry.id === result.id)!) });
  });
}

export async function GET(request: Request) {
  return waitlistRoute(async () => {
    const { result, state } = await withLockedRestaurantState(
      (state) => authenticateWaitlist(state, waitlistBearer(request)).id, () => false,
    );
    return waitlistJson({ ticket: waitlistTicket(state, state.waitlist.find((entry) => entry.id === result)!) });
  });
}
