import { NextResponse } from "next/server";
import { clearStaffSession } from "@/lib/auth";

export async function POST(request: Request) {
  await clearStaffSession();
  return NextResponse.redirect(new URL("/staff/login", request.url), 303);
}
