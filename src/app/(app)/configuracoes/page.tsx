import { Building2, Cpu, FileText, KeyRound, Store, Wrench } from "lucide-react";
import { prisma } from "@/lib/db";
import { empresaAtualId } from "@/lib/sessao";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { maskCpfCnpj } from "@/lib/utils";

export const dynamic = "force-dynamic";

function statusEnv(v: string | undefined) {
  return v && v.length > 0 && !v.includes("placeholder") && !v.includes("troque")
    ? { label: "configurado", variant: "success" as const }
    : { label: "pendente", variant: "warning" as const };
}

export default async function ConfiguracoesPage() {
  const empresaId = await empresaAtualId();
  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
  const [usuarios, depositos, marketplaces] = await Promise.all([
    prisma.usuario.count({ where: { empresaId } }),
    prisma.deposito.count({ where: { empresaId } }),
    prisma.marketplaceConta.count({ where: { empresaId } }),
  ]);

  const integracoes = [
    { nome: "OpenAI (IA)", env: process.env.OPENAI_API_KEY, icon: Cpu },
    { nome: "Emissor NF-e (Focus)", env: process.env.FOCUS_NFE_TOKEN, icon: FileText },
    { nome: "Mercado Livre", env: process.env.ML_CLIENT_SECRET, icon: Store },
    { nome: "Shopee", env: process.env.SHOPEE_PARTNER_KEY, icon: Store },
    { nome: "WhatsApp Business", env: process.env.WHATSAPP_TOKEN, icon: Store },
    { nome: "Consulta de placa", env: process.env.PLACA_API_KEY, icon: Wrench },
    { nome: "Redis (workers)", env: process.env.REDIS_URL, icon: Cpu },
    { nome: "PSP Pix", env: process.env.PSP_PIX_CLIENT_ID, icon: KeyRound },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">
          Dados da empresa, integrações, séries fiscais e parâmetros do sistema.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Empresa
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
          <Campo label="Razão Social" valor={empresa?.razaoSocial} />
          <Campo label="Nome Fantasia" valor={empresa?.nomeFantasia} />
          <Campo label="CNPJ" valor={maskCpfCnpj(empresa?.cnpj)} />
          <Campo label="Regime" valor={empresa?.regimeTributario?.replace(/_/g, " ")} />
          <Campo label="UF / Município" valor={`${empresa?.uf ?? "—"} / ${empresa?.municipio ?? "—"}`} />
          <Campo label="Inscrição Estadual" valor={empresa?.inscEstadual ?? "—"} />
          <Campo label="Usuários" valor={String(usuarios)} />
          <Campo label="Depósitos" valor={String(depositos)} />
          <Campo label="Contas marketplace" valor={String(marketplaces)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Integrações
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {integracoes.map((it) => {
            const st = statusEnv(it.env);
            const Icon = it.icon;
            return (
              <div key={it.nome} className="flex items-center justify-between rounded-md border p-3">
                <span className="flex items-center gap-2 text-sm">
                  <Icon className="h-4 w-4 text-muted-foreground" /> {it.nome}
                </span>
                <Badge variant={st.variant}>{st.label}</Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function Campo({ label, valor }: { label: string; valor?: string | null }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{valor || "—"}</div>
    </div>
  );
}
