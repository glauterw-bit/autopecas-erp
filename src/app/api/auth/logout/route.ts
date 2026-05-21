import { NextRequest, NextResponse } from "next/server";
import { destruirSessao } from "@/lib/auth/config";

export async function POST(req: NextRequest) {
  await destruirSessao();
  return NextResponse.redirect(new URL("/login", req.url), 303);
}
