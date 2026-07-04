import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Healthcheck do Railway/monitoramento: valida app + banco.
// Público de propósito — não expõe dados, só status.

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: true });
  } catch {
    return NextResponse.json({ ok: false, db: false }, { status: 503 });
  }
}
