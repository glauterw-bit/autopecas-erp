import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/sessao";
import { podePerfil } from "@/lib/auth/config";
import { DepositosResumo } from "@/components/estoque/depositos-resumo";
import { TransferenciaCard } from "@/components/estoque/transferencia-card";
import { InventariosCard } from "@/components/estoque/inventarios-card";

export const dynamic = "force-dynamic";

export default async function EstoquePage() {
  const usuario = await usuarioAtual();
  const depositos = await prisma.deposito.findMany({
    where: { empresaId: usuario.empresaId, ativo: true },
    select: { id: true, nome: true, tipo: true },
    orderBy: { nome: "asc" },
  });
  const ehGerente = podePerfil(usuario.perfil, "GERENTE");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Estoque</h1>
        <p className="text-muted-foreground">
          Transferência entre depósitos/lojas e inventário rotativo.
        </p>
      </div>

      <DepositosResumo />

      <TransferenciaCard depositos={depositos} />

      <InventariosCard depositos={depositos} ehGerente={ehGerente} />
    </div>
  );
}
