import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/staff-guard";
import { getRestaurantState, replaceRestaurantState } from "@/lib/state-store";
import { normalizeRestaurantState } from "@/lib/state";
import { staffWaitlistState } from "@/lib/waitlist-engine";

const updateSchema = z.object({
  revision: z.number().int().positive(),
  state: z.unknown(),
});

export async function GET() {
  const unauthorized = await requireStaff();
  if (unauthorized) return unauthorized;
  return NextResponse.json(staffWaitlistState(await getRestaurantState()), { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const unauthorized = await requireStaff();
  if (unauthorized) return unauthorized;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid restaurant state." }, { status: 400 });
  }
  const updated = await replaceRestaurantState(
    normalizeRestaurantState(parsed.data.state),
    parsed.data.revision,
  );
  if (!updated) {
    return NextResponse.json(
      { error: "Another staff member made a change. Refreshing shared data is required." },
      { status: 409 },
    );
  }
  return NextResponse.json(staffWaitlistState(updated));
}
