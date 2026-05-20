import axios from "axios";
import { prisma } from "../db";

// NFS-e — Nota Fiscal de Serviço Eletrônica
// =========================================
// Auto peças que prestam serviço (instalação, alinhamento, balanceamento,
// diagnóstico) precisam emitir NFS-e além da NF-e/NFC-e do produto.
//
// Padrão ABRASF v2.04 (~5000 municípios). Alguns têm padrão próprio:
//   - São Paulo Capital: padrão SP (envio assíncrono)
//   - Rio de Janeiro: SisCarioca
//   - DSF, Betha, ISSNet, GINFES, etc.
//
// Usamos provedor que abstrai os municípios (Focus NFS-e ou NFE.io).
// Lista de códigos de serviço comuns para auto peças (LC 116/2003):
//   14.01 — Lubrificação, limpeza, manutenção (revisão)
//   14.02 — Reparo de máquinas / motores / veículos
//   14.03 — Conserto de máquinas / veículos
//   14.04 — Recauchutagem ou regeneração de pneus
//   14.05 — Restauração / blindagem
//   14.06 — Instalação e montagem de aparelhos
//   14.10 — Tinturaria e lavanderia (oficina martelinho/funilaria)
//   14.13 — Carpintaria e serralheria

const FOCUS_NFSE_BASE: Record<string, string> = {
  homologacao: "https://homologacao.focusnfe.com.br",
  producao: "https://api.focusnfe.com.br",
};

export interface ItemServico {
  codigoServico: string;     // ex.: "14.01"
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  aliquotaIss: number;       // % conforme município (geralmente 2-5%)
  retencaoIss?: boolean;     // tomador retém ISS na fonte?
  cnaeFiscal?: string;
}

export async function emitirNfse(opts: {
  empresaId: string;
  vendaId?: string;
  tomadorCpfCnpj: string;
  tomadorNome: string;
  tomadorEmail?: string;
  tomadorEndereco?: {
    logradouro: string;
    numero?: string;
    bairro?: string;
    municipio: string;
    uf: string;
    cep: string;
  };
  itens: ItemServico[];
  observacoes?: string;
}) {
  const empresa = await prisma.empresa.findUniqueOrThrow({
    where: { id: opts.empresaId },
  });
  const ambiente = (process.env.FOCUS_NFE_AMBIENTE as "homologacao" | "producao") ?? "homologacao";
  const ref = `nfse-${Date.now()}`;

  const valorServicos = opts.itens.reduce(
    (a, it) => a + it.quantidade * it.valorUnitario,
    0,
  );
  const valorIss = opts.itens.reduce(
    (a, it) => a + (it.quantidade * it.valorUnitario * it.aliquotaIss) / 100,
    0,
  );

  const payload = {
    data_emissao: new Date().toISOString(),
    prestador: {
      cnpj: empresa.cnpj,
      inscricao_municipal: empresa.inscMunicipal,
      codigo_municipio: "",  // IBGE - configurar por empresa
    },
    tomador: {
      cpf: opts.tomadorCpfCnpj.length === 11 ? opts.tomadorCpfCnpj : undefined,
      cnpj: opts.tomadorCpfCnpj.length === 14 ? opts.tomadorCpfCnpj : undefined,
      razao_social: opts.tomadorNome,
      email: opts.tomadorEmail,
      endereco: opts.tomadorEndereco && {
        logradouro: opts.tomadorEndereco.logradouro,
        numero: opts.tomadorEndereco.numero,
        bairro: opts.tomadorEndereco.bairro,
        codigo_municipio: "",
        uf: opts.tomadorEndereco.uf,
        cep: opts.tomadorEndereco.cep,
      },
    },
    servico: {
      valor_servicos: valorServicos,
      valor_iss: valorIss,
      iss_retido: opts.itens.some((it) => it.retencaoIss),
      item_lista_servico: opts.itens[0]?.codigoServico,
      codigo_tributacao_municipio: opts.itens[0]?.codigoServico,
      discriminacao: opts.itens
        .map((it) => `${it.quantidade}x ${it.descricao} — R$ ${(it.quantidade * it.valorUnitario).toFixed(2)}`)
        .join("\n"),
      codigo_municipio: "",
    },
    observacao: opts.observacoes,
  };

  const url = `${FOCUS_NFSE_BASE[ambiente]}/v2/nfse?ref=${ref}`;
  const { data } = await axios.post(url, payload, {
    auth: { username: process.env.FOCUS_NFE_TOKEN ?? "", password: "" },
    headers: { "Content-Type": "application/json" },
    validateStatus: () => true,
  });

  const numeroExterno = data?.numero ?? data?.numero_rps ?? 0;
  // Persistimos como NotaFiscal modelo NFSE
  const nota = await prisma.notaFiscal.create({
    data: {
      empresaId: opts.empresaId,
      modelo: "NFSE",
      serie: "1",
      numero: Number(numeroExterno) || Math.floor(Date.now() / 1000),
      status: data.status === "autorizado" ? "AUTORIZADA" : "EMITINDO",
      ambiente: ambiente === "producao" ? "PRODUCAO" : "HOMOLOGACAO",
      naturezaOperacao: "PRESTAÇÃO DE SERVIÇO",
      valorProdutos: 0,
      valorTotal: valorServicos,
      protocolo: data?.protocolo,
      chaveAcesso: data?.codigo_verificacao ?? null,
      danfeUrl: data?.url ?? data?.url_danfse,
      xmlAutorizado: data?.xml ?? null,
    },
  });

  if (opts.vendaId) {
    await prisma.venda
      .update({
        where: { id: opts.vendaId },
        data: { notaFiscalId: nota.id, status: "FATURADA" },
      })
      .catch(() => undefined);
  }

  return nota;
}

export async function cancelarNfse(notaId: string, motivo: string) {
  const nota = await prisma.notaFiscal.findUniqueOrThrow({ where: { id: notaId } });
  if (nota.modelo !== "NFSE") throw new Error("Nota não é NFS-e");
  const ambiente = (process.env.FOCUS_NFE_AMBIENTE as "homologacao" | "producao") ?? "homologacao";
  const url = `${FOCUS_NFSE_BASE[ambiente]}/v2/nfse/nfse-${nota.id}`;
  await axios.delete(url, {
    auth: { username: process.env.FOCUS_NFE_TOKEN ?? "", password: "" },
    data: { justificativa: motivo },
  });
  return prisma.notaFiscal.update({
    where: { id: notaId },
    data: { status: "CANCELADA", motivoCancelamento: motivo, dataCancelamento: new Date() },
  });
}
