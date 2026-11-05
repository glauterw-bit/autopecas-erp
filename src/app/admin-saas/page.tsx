import { notFound, redirect } from "next/navigation";
import { usuarioDaSessao } from "@/lib/auth/config";
import { listarLojas, negarAdminSaas } from "@/lib/assinatura/admin-saas";
import { prisma } from "@/lib/db";
import { PainelClient } from "./painel-client";

export const dynamic = "force-dynamic";

// Painel do dono do SaaS. Acesso só por id de usuário (SAAS_ADMIN_USER_IDS) com 2FA ligado.
export default async function AdminSaasPage() {
  const u = await usuarioDaSessao();
  if (!u || !u.ativo) redirect("/login");
  if (await negarAdminSaas({ id: u.id })) notFound();
  const [{ lojas, mrrCentavos }, planos] = await Promise.all([
    listarLojas(),
    prisma.plano.findMany({ where: { ativo: true }, select: { codigo: true, nome: true }, orderBy: { codigo: "asc" } }),
  ]);
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Painel do SaaS</h1>
        <p className="text-muted-foreground">
          Receita mensal recorrente (soma das assinaturas ativas, sem projeção):{" "}
          <strong>{(mrrCentavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>
        </p>
      </div>
      <PainelClient lojas={JSON.parse(JSON.stringify(lojas))} planos={planos} />
    </div>
  );
}
