import { NextRequest, NextResponse } from "next/server";
import { logoutB2B } from "@/lib/b2b/sessao";

export async function POST(req: NextRequest) {
  await logoutB2B();
  return NextResponse.redirect(new URL("/b2b/login", req.url), 303);
}
