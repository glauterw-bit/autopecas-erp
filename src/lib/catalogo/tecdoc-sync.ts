import axios from "axios";
import { prisma } from "../db";
import { importarTafXml } from "./tecdoc-xml";

// Sincronização automática do TecDoc
// ==================================
// Roda mensal (BullMQ cron). Para cada empresa que tem a integração ativa:
//   1) Verifica versão do snapshot publicado no TecDoc
//   2) Se mudou, baixa o XML TAF do endpoint do TecDoc
//   3) Aplica delta no banco (idempotente via upsert)
//   4) Registra resultado em TecdocImportLog (futuro)
//
// Acesso: TecAlliance fornece via subscription. Endpoints e auth são privados.
// O job suporta também URLs públicas de "TecDoc Lite" e providers regionais
// (ex.: Sindipeças no Brasil tem feed parcial).

interface TecdocSyncResult {
  ok: boolean;
  empresaId: string;
  versaoSnapshot?: string;
  estatisticas?: {
    montadoras: number;
    modelos: number;
    versoes: number;
    produtos: number;
    aplicacoes: number;
  };
  erro?: string;
  duracaoMs: number;
}

export async function sincronizarTecdocEmpresa(empresaId: string): Promise<TecdocSyncResult> {
  const t0 = Date.now();
  const empresa = await prisma.empresa.findUniqueOrThrow({
    where: { id: empresaId },
    select: { configuracoes: true },
  });
  const cfg = (empresa.configuracoes as TecdocConfig | null) ?? {};
  if (!cfg.tecdocFeedUrl) {
    return { ok: false, empresaId, erro: "Tecdoc não configurado", duracaoMs: 0 };
  }

  try {
    const { data: meta } = await axios.get<{ versao: string; xmlUrl: string }>(
      cfg.tecdocFeedUrl,
      {
        headers: {
          "X-Provider-ID": process.env.TECDOC_PROVIDER_ID ?? "",
          "X-Api-Key": process.env.TECDOC_API_KEY ?? "",
        },
        timeout: 30_000,
      },
    );

    if (cfg.tecdocVersaoAtual === meta.versao) {
      return { ok: true, empresaId, versaoSnapshot: meta.versao, duracaoMs: Date.now() - t0 };
    }

    const { data: xml } = await axios.get<string>(meta.xmlUrl, {
      headers: { "X-Api-Key": process.env.TECDOC_API_KEY ?? "" },
      timeout: 300_000, // 5 minutos para o download
      responseType: "text",
    });

    const progresso = await importarTafXml({ empresaId, xml });

    await prisma.empresa.update({
      where: { id: empresaId },
      data: {
        configuracoes: {
          ...cfg,
          tecdocVersaoAtual: meta.versao,
          tecdocUltimaSync: new Date().toISOString(),
        } as object,
      },
    });

    return {
      ok: true,
      empresaId,
      versaoSnapshot: meta.versao,
      estatisticas: progresso,
      duracaoMs: Date.now() - t0,
    };
  } catch (e) {
    return { ok: false, empresaId, erro: (e as Error).message, duracaoMs: Date.now() - t0 };
  }
}

interface TecdocConfig {
  tecdocFeedUrl?: string;
  tecdocVersaoAtual?: string;
  tecdocUltimaSync?: string;
}

// Roda para todas as empresas com TecDoc configurado.
export async function sincronizarTodos(): Promise<TecdocSyncResult[]> {
  const empresas = await prisma.empresa.findMany({ select: { id: true, configuracoes: true } });
  const result: TecdocSyncResult[] = [];
  for (const e of empresas) {
    const cfg = e.configuracoes as TecdocConfig | null;
    if (!cfg?.tecdocFeedUrl) continue;
    result.push(await sincronizarTecdocEmpresa(e.id));
  }
  return result;
}
