import { NextRequest, NextResponse } from "next/server";
import { coletarSaude } from "@/lib/operacao/saude";
import { avisosAdminSaas } from "@/lib/assinatura/admin-saas";
import { tokenConfere } from "@/lib/operacao/token";

// Saúde completa. Protegido por HEALTH_TOKEN (header Authorization: Bearer ...
// ou x-health-token). Sem a env configurada, fica fechado (404).
// Não é rota de sessão de propósito: é para monitor externo.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const esperado = process.env.HEALTH_TOKEN;
  if (!esperado) return NextResponse.json({ erro: "Não encontrado" }, { status: 404 });
  const recebido =
    req.headers.get("x-health-token") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!tokenConfere(recebido, esperado)) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }
  const saude = await coletarSaude();
  const avisos = await avisosAdminSaas().catch(() => ["Não foi possível checar a lista do painel /admin-saas."]);
  return NextResponse.json({ ...saude, avisos }, { status: saude.ok ? 200 : 503 });
}
