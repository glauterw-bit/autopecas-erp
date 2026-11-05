// Pedidos do titular (cliente final da loja): exportar e anonimizar.
// A loja é a controladora desses dados; o sistema só dá a ferramenta.
import type { Prisma, PrismaClient } from "@prisma/client";
import { ApiError } from "../auth/guard";
import { registrarAuditoria } from "../auth/auditoria";

type Db = PrismaClient;

export const NOME_ANONIMIZADO = "Cliente removido";
const ABERTAS = ["ABERTO", "PARCIALMENTE_PAGO", "ATRASADO"] as const;

async function clienteDaEmpresa(db: Db | Prisma.TransactionClient, empresaId: string, clienteId: string) {
  const c = await db.cliente.findFirst({ where: { id: clienteId, empresaId } });
  if (!c) throw new ApiError(404, "Cliente não encontrado");
  return c;
}

/** Tudo que o sistema guarda sobre o cliente, em JSON (sem senha do portal). */
export async function exportarDadosDoCliente(db: Db, empresaId: string, clienteId: string, usuarioId: string) {
  const c = await clienteDaEmpresa(db, empresaId, clienteId);
  const { senhaHashB2B: _senha, ...cadastro } = c;
  void _senha;
  const [veiculos, vendas, contas, notas, conversas] = await Promise.all([
    db.veiculoCliente.findMany({ where: { clienteId } }),
    db.venda.findMany({ where: { empresaId, clienteId }, include: { itens: true, pagamentos: true } }),
    db.contaReceber.findMany({ where: { empresaId, clienteId } }),
    db.notaFiscal.findMany({
      where: { empresaId, clienteId },
      select: { id: true, modelo: true, serie: true, numero: true, chaveAcesso: true, status: true, dataEmissao: true, valorTotal: true },
    }),
    db.conversaIA.findMany({ where: { clienteId }, include: { mensagens: true } }),
  ]);
  await registrarAuditoria(db, {
    empresaId,
    usuarioId,
    acao: "LGPD_EXPORTAR_TITULAR",
    entidade: "Cliente",
    entidadeId: clienteId,
    depois: { vendas: vendas.length, contasReceber: contas.length, notas: notas.length },
  });
  return {
    geradoEm: new Date().toISOString(),
    cadastro,
    veiculos,
    vendas,
    contasReceber: contas,
    notasFiscais: notas,
    conversas,
  };
}

/**
 * Anonimiza o cliente: nome vira "Cliente removido" e documento, e-mail,
 * telefones, endereço e anotações são apagados. Vendas e notas ficam (obrigação
 * fiscal). Bloqueia se houver conta a receber em aberto.
 */
export async function anonimizarCliente(db: Db, empresaId: string, clienteId: string, usuarioId: string) {
  return db.$transaction(async (tx) => {
    const c = await clienteDaEmpresa(tx, empresaId, clienteId);
    if (c.nome === NOME_ANONIMIZADO && !c.cpfCnpj && !c.email && !c.telefone) {
      return { jaAnonimizado: true as const };
    }
    const abertas = await tx.contaReceber.count({
      where: { empresaId, clienteId, status: { in: [...ABERTAS] } },
    });
    if (abertas > 0) {
      throw new ApiError(
        409,
        `Este cliente tem ${abertas} conta(s) a receber em aberto. Receba ou cancele antes de remover os dados.`,
      );
    }
    await tx.cliente.update({
      where: { id: clienteId },
      data: {
        nome: NOME_ANONIMIZADO,
        apelido: null,
        cpfCnpj: null,
        rgIe: null,
        email: null,
        telefone: null,
        telefoneAlternativo: null,
        whatsapp: null,
        dataNascimento: null,
        sexo: null,
        logradouro: null,
        numero: null,
        complemento: null,
        bairro: null,
        municipio: null,
        uf: null,
        cep: null,
        observacoes: null,
        ultimoContatoNota: null,
        b2bAtivo: false,
        senhaHashB2B: null,
      },
    });
    // Placas e conversas também identificam a pessoa.
    await tx.veiculoCliente.deleteMany({ where: { clienteId } });
    await tx.mensagemIA.deleteMany({ where: { conversa: { clienteId } } });
    await tx.conversaIA.updateMany({ where: { clienteId }, data: { resumo: null, identificadorExterno: null } });
    await tx.pushSubscription.deleteMany({ where: { clienteId } });
    await registrarAuditoria(tx, {
      empresaId,
      usuarioId,
      acao: "LGPD_ANONIMIZAR_CLIENTE",
      entidade: "Cliente",
      entidadeId: clienteId,
      // Só o id: o log não pode guardar de novo o dado que a pessoa pediu para apagar.
      antes: { clienteId, tinhaCpfCnpj: !!c.cpfCnpj, tinhaEmail: !!c.email, tinhaTelefone: !!c.telefone },
      depois: { anonimizado: true },
    });
    return { jaAnonimizado: false as const };
  });
}
