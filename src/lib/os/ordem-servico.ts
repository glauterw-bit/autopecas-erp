import { prisma } from "../db";
import { emitirNfse } from "../nfe/nfse";

// Ordem de Serviço (oficinas mecânicas)
// =====================================
// Fluxo: ABERTA → EM_ANALISE → AGUARDANDO_APROVACAO → APROVADA → EM_EXECUCAO
//        → CONCLUIDA → ENTREGUE.
// Após ENTREGUE, se o cliente reclama dentro da garantia, vira GARANTIA.
//
// A OS pode gerar dois documentos fiscais:
//   1) NF-e (modelo 55) — peças aplicadas (vendaPecasId)
//   2) NFS-e municipal — serviço prestado (notaServicoId)

export interface CriarOSInput {
  empresaId: string;
  clienteId?: string;
  veiculoClienteId?: string;
  placa?: string;
  kmEntrada?: number;
  diagnostico?: string;
  servicoExecutado?: string;
  tecnicoId?: string;
  garantiaServicoDias?: number;
  itensServico?: Array<{
    codigoServico: string;
    descricao: string;
    quantidade: number;
    valorUnitario: number;
    desconto?: number;
    duracaoMinutos?: number;
  }>;
  fotosAntes?: string[];
}

export async function criarOS(input: CriarOSInput) {
  const ultimo = await prisma.ordemServico.findFirst({
    where: { empresaId: input.empresaId },
    orderBy: { numero: "desc" },
    select: { numero: true },
  });
  const numero = (ultimo?.numero ?? 0) + 1;

  let valorServicos = 0;
  const itensSrv = (input.itensServico ?? []).map((it) => {
    const total = it.quantidade * it.valorUnitario - (it.desconto ?? 0);
    valorServicos += total;
    return {
      codigoServico: it.codigoServico,
      descricao: it.descricao,
      quantidade: it.quantidade,
      valorUnitario: it.valorUnitario,
      desconto: it.desconto ?? 0,
      total,
      duracaoMinutos: it.duracaoMinutos,
    };
  });

  return prisma.ordemServico.create({
    data: {
      empresaId: input.empresaId,
      numero,
      clienteId: input.clienteId,
      veiculoClienteId: input.veiculoClienteId,
      placa: input.placa,
      kmEntrada: input.kmEntrada,
      diagnostico: input.diagnostico,
      servicoExecutado: input.servicoExecutado,
      tecnicoId: input.tecnicoId,
      garantiaServicoDias: input.garantiaServicoDias ?? 90,
      fotosAntes: input.fotosAntes ?? [],
      valorServicos,
      valorTotal: valorServicos,
      itensServico: { create: itensSrv },
    },
    include: { itensServico: true },
  });
}

export async function atualizarStatusOS(opts: {
  ordemId: string;
  status:
    | "ABERTA"
    | "EM_ANALISE"
    | "AGUARDANDO_APROVACAO"
    | "APROVADA"
    | "EM_EXECUCAO"
    | "AGUARDANDO_PECA"
    | "CONCLUIDA"
    | "ENTREGUE"
    | "CANCELADA"
    | "GARANTIA";
  kmSaida?: number;
  fotosDepois?: string[];
}) {
  const data: Record<string, unknown> = { status: opts.status };
  if (opts.status === "CONCLUIDA") data.concluidaEm = new Date();
  if (opts.status === "ENTREGUE") data.entreguaEm = new Date();
  if (opts.kmSaida !== undefined) data.kmSaida = opts.kmSaida;
  if (opts.fotosDepois) data.fotosDepois = opts.fotosDepois;
  return prisma.ordemServico.update({
    where: { id: opts.ordemId },
    data,
  });
}

export async function vincularPecasOS(ordemId: string, vendaId: string) {
  const venda = await prisma.venda.findUniqueOrThrow({
    where: { id: vendaId },
    select: { valorTotal: true },
  });
  const os = await prisma.ordemServico.findUniqueOrThrow({ where: { id: ordemId } });
  const valorPecas = Number(venda.valorTotal);
  return prisma.ordemServico.update({
    where: { id: ordemId },
    data: {
      vendaPecasId: vendaId,
      valorPecas,
      valorTotal: valorPecas + Number(os.valorServicos) - Number(os.valorDesconto),
    },
  });
}

// Faturamento: cria NFS-e a partir dos itens de serviço da OS.
export async function faturarServicoOS(ordemId: string) {
  const os = await prisma.ordemServico.findUniqueOrThrow({
    where: { id: ordemId },
    include: { itensServico: true },
  });
  const cliente = os.clienteId
    ? await prisma.cliente.findUnique({ where: { id: os.clienteId } })
    : null;
  if (!cliente?.cpfCnpj || !cliente.nome)
    throw new Error("Cliente sem documento — não é possível emitir NFS-e");
  if (os.itensServico.length === 0) throw new Error("OS sem itens de serviço");

  const nota = await emitirNfse({
    empresaId: os.empresaId,
    tomadorCpfCnpj: cliente.cpfCnpj,
    tomadorNome: cliente.nome,
    tomadorEmail: cliente.email ?? undefined,
    itens: os.itensServico.map((it) => ({
      codigoServico: it.codigoServico,
      descricao: it.descricao,
      quantidade: Number(it.quantidade),
      valorUnitario: Number(it.valorUnitario),
      aliquotaIss: 5, // configurar por município
    })),
    observacoes: `OS #${os.numero} — Veículo placa ${os.placa ?? "—"}, garantia ${os.garantiaServicoDias} dias`,
  });

  await prisma.ordemServico.update({
    where: { id: ordemId },
    data: { notaServicoId: nota.id },
  });
  return nota;
}
