import { requireStaff } from "@/lib/staff-guard";

export async function POST() {
  const unauthorized = await requireStaff();
  if (unauthorized) return unauthorized;
  return Response.json(
    { error: "This endpoint was retired. Use /api/staff/waitlist to create a protected table offer." },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
