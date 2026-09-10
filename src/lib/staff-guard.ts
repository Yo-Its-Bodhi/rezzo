import "server-only";

import { hasStaffSession } from "@/lib/auth";

export async function requireStaff() {
  if (!(await hasStaffSession())) {
    return new Response(JSON.stringify({ error: "Staff authentication required." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}
