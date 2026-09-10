import { z } from "zod";
import { requireStaff } from "@/lib/staff-guard";
import { withLockedRestaurantState } from "@/lib/state-store";
import { staffWaitlistAction, staffWaitlistState, WaitlistError } from "@/lib/waitlist-engine";
import { sendWaitlistPush } from "@/lib/waitlist-push";
import { waitlistBody, waitlistJson, waitlistRoute } from "@/lib/waitlist-api";

export const runtime = "nodejs";
const schema = z.object({
  entryId: z.string().min(1).max(100),
  action: z.enum(["up_next", "offer", "remove", "seat", "requeue"]),
  tableId: z.string().min(1).max(100).optional(),
});

export async function POST(request: Request) {
  return waitlistRoute(async () => {
    const unauthorized = await requireStaff();
    if (unauthorized) return unauthorized;
    const input = schema.safeParse(await waitlistBody(request));
    if (!input.success) throw new WaitlistError("Invalid waitlist action.", 400);
    const { result, state } = await withLockedRestaurantState((state) => {
      const result = staffWaitlistAction(state, input.data.entryId, input.data.action, input.data.tableId);
      return { ...result, entry: structuredClone(result.entry) };
    });
    if (!result.notify) {
      const delivery = ["offer", "up_next"].includes(input.data.action)
        ? [result.entry.lastDelivery ?? { channel: "push", sent: false, error: "This update was already requested; check the guest's ticket." }]
        : undefined;
      return waitlistJson({ state: staffWaitlistState(state), delivery });
    }
    // Persist the actual offer before contacting an external push service.
    const sent = await sendWaitlistPush(result.entry, result.notify);
    const updated = await withLockedRestaurantState((current) => {
      const entry = current.waitlist.find((item) => item.id === result.entry.id);
      if (!entry) return false;
      let changed = false;
      if (sent.invalidate && JSON.stringify(entry.pushSubscription) === JSON.stringify(result.entry.pushSubscription)) {
        delete entry.pushSubscription;
        changed = true;
      }
      if (entry.offerId === result.entry.offerId && entry.upNextAt === result.entry.upNextAt) {
        entry.lastDelivery = sent.delivery;
        changed = true;
      }
      return changed;
    }, Boolean);
    return waitlistJson({ state: staffWaitlistState(updated.state), delivery: [sent.delivery] });
  });
}
