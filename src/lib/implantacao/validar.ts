// Validação linha a linha
// =======================
// Cada linha vira um registro com `dados` normalizados, ou com `erros` que dizem
// exatamente o que está errado. `avisos` não impedem a importação, mas aparecem
// no relatório (ex.: produto sem NCM não pode sair em nota até ser corrigido).
import type { FormaPagamento } from "@prisma/client";
import { CAMPOS, type Entidade, type RegistroBruto } from "./tipos";
import {
  type Dec,
  ErroCampo,
  documentoValido,
  gtinValido,
  lerData,
  lerNumero,
  lerSimNao,
  mascararDoc,
  soDigitos,
  texto,
} from "./normalizar";

export type ProdutoDados = {
  sku: string;
  nome: string;
  descricao?: string;
  codigoFabricante?: string;
  codigoOem?: string;
  codigoBarras?: string;
  ncm?: string;
  cest?: string;
  marca?: string;
  unidade?: string;
  precoVenda?: Dec;
  precoMinimo?: Dec;
  custo?: Dec;
  ativo?: boolean;
  pesoKg?: Dec;
  localizacao?: string;
  estoqueMinimo?: Dec;
};
export type EstoqueDados = { sku: string; deposito?: string; quantidade: Dec; custo?: Dec };
export type PrecoDados = { sku: string; precoVenda?: Dec; precoMinimo?: Dec; custo?: Dec };
export type ClienteDados = {
  codigo?: string;
  nome: string;
  cpfCnpj?: string;
  tipo: "PF" | "PJ";
  rgIe?: string;
  apelido?: string;
  email?: string;
  telefone?: string;
  whatsapp?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  limiteCredito?: Dec;
  observacoes?: string;
};
export type FornecedorDados = {
  codigo?: string;
  razaoSocial: string;
  nomeFantasia?: string;
  cnpjCpf: string;
  tipo: "PF" | "PJ";
  inscricaoEstadual?: string;
  contatoNome?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
  prazoEntregaDias?: number;
  ativo?: boolean;
};
export type ContaReceberDados = {
  documento?: string;
  parcela: number;
  totalParcelas: number;
  clienteCodigo?: string;
  clienteCpfCnpj?: string;
  dataVencimento: Date;
  valor: Dec;
  formaPagamento: FormaPagamento;
  descricao?: string;
};

export type DadosPorEntidade = {
  PRODUTO: ProdutoDados;
  ESTOQUE: EstoqueDados;
  PRECO: PrecoDados;
  CLIENTE: ClienteDados;
  FORNECEDOR: FornecedorDados;
  CONTA_RECEBER: ContaReceberDados;
};

export type RegistroValidado<T> = {
  linha: number;
  ref?: string;
  chave: string;
  dados: T | null; // null quando há erro
  erros: string[];
  avisos: string[];
};

type Ctx = { erros: string[]; avisos: string[]; v: Record<string, string | undefined> };

function rotulo(entidade: Entidade, campo: string) {
  return CAMPOS[entidade].find((c) => c.campo === campo)?.rotulo ?? campo;
}

function campo<T>(ctx: Ctx, entidade: Entidade, nome: string, fn: (s: string | undefined) => T): T | undefined {
  try {
    return fn(ctx.v[nome]);
  } catch (e) {
    if (e instanceof ErroCampo) {
      ctx.erros.push(`${rotulo(entidade, nome)}: ${e.message}`);
      return undefined;
    }
    throw e;
  }
}

function naoNegativo(ctx: Ctx, entidade: Entidade, nome: string): Dec | undefined {
  const n = campo(ctx, entidade, nome, lerNumero);
  if (n && n.isNegative()) {
    ctx.erros.push(`${rotulo(entidade, nome)}: não pode ser negativo (${ctx.v[nome]})`);
    return undefined;
  }
  return n;
}

// ---------------------------------------------------------------------------

function validarProduto(ctx: Ctx): { chave: string; dados: ProdutoDados } {
  const E = "PRODUTO";
  const sku = texto(ctx.v.codigo, 60);
  const nome = texto(ctx.v.descricao, 250);
  if (!sku) ctx.erros.push("Código interno vazio");
  if (!nome) ctx.erros.push("Descrição vazia");

  let ncm: string | undefined;
  const ncmBruto = soDigitos(ctx.v.ncm);
  if (!ncmBruto) ctx.avisos.push("Sem NCM: a nota fiscal deste produto fica bloqueada até preencher");
  else if (ncmBruto.length !== 8) ctx.avisos.push(`NCM "${ctx.v.ncm}" não tem 8 dígitos: ignorado, revise`);
  else ncm = ncmBruto;

  let cest: string | undefined;
  const cestBruto = soDigitos(ctx.v.cest);
  if (cestBruto && cestBruto.length !== 7) ctx.avisos.push(`CEST "${ctx.v.cest}" não tem 7 dígitos: ignorado`);
  else if (cestBruto) cest = cestBruto;

  let codigoBarras: string | undefined;
  const ean = soDigitos(ctx.v.ean);
  if (ctx.v.ean && !/^sem\s*gtin$/i.test(ctx.v.ean.trim())) {
    if (gtinValido(ean)) codigoBarras = ean;
    else ctx.avisos.push(`EAN "${ctx.v.ean}" com dígito verificador errado: ignorado`);
  }

  const descComp = texto(ctx.v.descricaoComplementar, 2000);
  const aplicacao = texto(ctx.v.aplicacao, 2000);
  const descricao =
    [descComp, aplicacao ? `Aplicação: ${aplicacao}` : undefined].filter(Boolean).join("\n") || undefined;

  const precoVenda = naoNegativo(ctx, E, "precoVenda");
  const precoMinimo = naoNegativo(ctx, E, "precoMinimo");
  const custo = naoNegativo(ctx, E, "custo");
  if (precoVenda && custo && precoVenda.gt(0) && precoVenda.lt(custo))
    ctx.avisos.push(`Preço de venda (${precoVenda.toFixed(2)}) abaixo do custo (${custo.toFixed(2)})`);
  if (precoVenda && precoMinimo && precoVenda.gt(0) && precoMinimo.gt(precoVenda))
    ctx.avisos.push(`Preço mínimo (${precoMinimo.toFixed(2)}) acima do preço de venda (${precoVenda.toFixed(2)})`);

  const unidade = texto(ctx.v.unidade, 6)?.toUpperCase();

  return {
    chave: sku ?? "",
    dados: {
      sku: sku ?? "",
      nome: nome ?? "",
      descricao,
      codigoFabricante: texto(ctx.v.codigoFabricante, 60),
      codigoOem: texto(ctx.v.codigoOem, 60),
      codigoBarras,
      ncm,
      cest,
      marca: texto(ctx.v.marca, 80),
      unidade,
      precoVenda,
      precoMinimo,
      custo,
      ativo: campo(ctx, E, "ativo", lerSimNao),
      pesoKg: naoNegativo(ctx, E, "pesoKg"),
      localizacao: texto(ctx.v.localizacao, 60),
      estoqueMinimo: naoNegativo(ctx, E, "estoqueMinimo"),
    },
  };
}

function validarEstoque(ctx: Ctx): { chave: string; dados: EstoqueDados } {
  const E = "ESTOQUE";
  const sku = texto(ctx.v.codigo, 60);
  if (!sku) ctx.erros.push("Código do produto vazio");
  const deposito = texto(ctx.v.deposito, 80);
  let quantidade = campo(ctx, E, "quantidade", lerNumero);
  if (ctx.v.quantidade === undefined) ctx.erros.push("Quantidade vazia");
  if (quantidade && quantidade.isNegative()) {
    ctx.avisos.push(`Estoque negativo na origem (${quantidade.toString()}): entra como zero, conte a peça`);
    quantidade = quantidade.mul(0);
  }
  const custo = naoNegativo(ctx, E, "custo");
  return {
    chave: `${sku ?? ""}@${(deposito ?? "").toUpperCase()}`,
    dados: { sku: sku ?? "", deposito, quantidade: quantidade!, custo },
  };
}

function validarPreco(ctx: Ctx): { chave: string; dados: PrecoDados } {
  const E = "PRECO";
  const sku = texto(ctx.v.codigo, 60);
  if (!sku) ctx.erros.push("Código do produto vazio");
  const precoVenda = naoNegativo(ctx, E, "precoVenda");
  const precoMinimo = naoNegativo(ctx, E, "precoMinimo");
  const custo = naoNegativo(ctx, E, "custo");
  if (!precoVenda && !precoMinimo && !custo && ctx.erros.length === 0)
    ctx.erros.push("Nenhum preço informado na linha");
  if (precoVenda && custo && precoVenda.gt(0) && precoVenda.lt(custo))
    ctx.avisos.push(`Preço de venda (${precoVenda.toFixed(2)}) abaixo do custo (${custo.toFixed(2)})`);
  return { chave: sku ?? "", dados: { sku: sku ?? "", precoVenda, precoMinimo, custo } };
}

function lerDocumento(ctx: Ctx, nomeCampo: string, obrigatorio: boolean): string | undefined {
  const bruto = ctx.v[nomeCampo];
  const doc = soDigitos(bruto);
  if (!doc) {
    if (obrigatorio) ctx.erros.push("CPF/CNPJ vazio");
    return undefined;
  }
  // CNPJ exportado como número perde zeros à esquerda: completa se o resultado for válido
  for (const tam of [11, 14]) {
    if (doc.length < tam && documentoValido(doc.padStart(tam, "0"))) return doc.padStart(tam, "0");
  }
  if (documentoValido(doc)) return doc;
  const msg = `CPF/CNPJ ${mascararDoc(doc) || "informado"} inválido (dígito verificador)`;
  if (obrigatorio) ctx.erros.push(msg);
  else ctx.avisos.push(`${msg}: importado sem documento`);
  return undefined;
}

function telefone(s: string | undefined): string | undefined {
  const d = soDigitos(s);
  return d.length >= 8 ? d.slice(0, 13) : undefined;
}

function validarCliente(ctx: Ctx): { chave: string; dados: ClienteDados } {
  const E = "CLIENTE";
  const codigo = texto(ctx.v.codigo, 60);
  const nome = texto(ctx.v.nome, 200);
  if (!nome) ctx.erros.push("Nome vazio");
  const cpfCnpj = lerDocumento(ctx, "cpfCnpj", false);
  if (!codigo && !cpfCnpj) ctx.erros.push("Sem código e sem CPF/CNPJ: não há como reconhecer o cliente numa nova importação");
  const email = texto(ctx.v.email, 120);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) ctx.avisos.push(`E-mail "${email}" inválido: ignorado`);
  const uf = texto(ctx.v.uf, 2)?.toUpperCase();
  const limite = naoNegativo(ctx, E, "limiteCredito");
  return {
    chave: codigo ? `C:${codigo}` : `D:${cpfCnpj ?? ""}`,
    dados: {
      codigo,
      nome: nome ?? "",
      cpfCnpj,
      tipo: cpfCnpj?.length === 14 ? "PJ" : "PF",
      rgIe: texto(ctx.v.ie, 20),
      apelido: texto(ctx.v.apelido, 120),
      email: email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email.toLowerCase() : undefined,
      telefone: telefone(ctx.v.telefone),
      whatsapp: telefone(ctx.v.whatsapp),
      logradouro: texto(ctx.v.logradouro, 200),
      numero: texto(ctx.v.numero, 20),
      complemento: texto(ctx.v.complemento, 100),
      bairro: texto(ctx.v.bairro, 100),
      municipio: texto(ctx.v.municipio, 100),
      uf: uf && /^[A-Z]{2}$/.test(uf) ? uf : undefined,
      cep: soDigitos(ctx.v.cep).length === 8 ? soDigitos(ctx.v.cep) : undefined,
      limiteCredito: limite,
      observacoes: texto(ctx.v.observacoes, 1000),
    },
  };
}

function validarFornecedor(ctx: Ctx): { chave: string; dados: FornecedorDados } {
  const E = "FORNECEDOR";
  const razao = texto(ctx.v.razaoSocial, 200);
  if (!razao) ctx.erros.push("Razão social vazia");
  const doc = lerDocumento(ctx, "cnpjCpf", true);
  const prazo = campo(ctx, E, "prazoEntregaDias", lerNumero);
  const endereco = [texto(ctx.v.endereco, 200), texto(ctx.v.municipio, 100), texto(ctx.v.uf, 2)?.toUpperCase()]
    .filter(Boolean)
    .join(" - ");
  return {
    chave: doc ?? "",
    dados: {
      codigo: texto(ctx.v.codigo, 60),
      razaoSocial: razao ?? "",
      nomeFantasia: texto(ctx.v.nomeFantasia, 200),
      cnpjCpf: doc ?? "",
      tipo: doc?.length === 11 ? "PF" : "PJ",
      inscricaoEstadual: texto(ctx.v.ie, 20),
      contatoNome: texto(ctx.v.contato, 100),
      telefone: telefone(ctx.v.telefone),
      email: texto(ctx.v.email, 120)?.toLowerCase(),
      endereco: endereco || undefined,
      prazoEntregaDias: prazo ? Math.max(0, Math.round(prazo.toNumber())) : undefined,
      ativo: campo(ctx, E, "ativo", lerSimNao),
    },
  };
}

const FORMAS: [RegExp, FormaPagamento][] = [
  [/^BOL/, "BOLETO"],
  [/^(CH|CHEQUE)/, "CHEQUE"],
  [/^PIX/, "PIX"],
  [/DEBITO|DÉBITO/, "DEBITO"],
  [/CARTEIRA|CREDIARIO|CREDIÁRIO|PROMISS|FIADO|CONVENIO|CONVÊNIO|NOTA|DUPLICATA|PRAZO/, "CREDIARIO"],
  [/CART|CREDITO|CRÉDITO/, "CREDITO"],
  [/^(DIN|ESPECIE)/, "DINHEIRO"],
  [/TRANSF|DEPOSITO|DEPÓSITO|TED|DOC/, "TRANSFERENCIA"],
];

function validarContaReceber(ctx: Ctx): { chave: string; dados: ContaReceberDados } {
  const E = "CONTA_RECEBER";
  const codigo = texto(ctx.v.codigo, 60);
  const documento = texto(ctx.v.documento, 60);
  const parcelaN = campo(ctx, E, "parcela", lerNumero);
  const totalN = campo(ctx, E, "totalParcelas", lerNumero);
  const parcela = parcelaN ? Math.max(1, Math.round(parcelaN.toNumber())) : 1;
  const totalParcelas = Math.max(parcela, totalN ? Math.round(totalN.toNumber()) : parcela);
  if (!codigo && !documento) ctx.erros.push("Sem código do título e sem documento: não há como reconhecer o título numa nova importação");

  const clienteCodigo = texto(ctx.v.clienteCodigo, 60);
  const clienteCpfCnpj = lerDocumento(ctx, "clienteCpfCnpj", false);
  if (!clienteCodigo && !clienteCpfCnpj) ctx.erros.push("Sem código e sem CPF/CNPJ do cliente");

  const venc = campo(ctx, E, "vencimento", lerData);
  if (ctx.v.vencimento === undefined) ctx.erros.push("Vencimento vazio");
  const valor = campo(ctx, E, "valor", lerNumero);
  if (ctx.v.valor === undefined) ctx.erros.push("Saldo em aberto vazio");
  else if (valor && !valor.gt(0)) ctx.erros.push(`Saldo ${valor.toFixed(2)}: título sem saldo não é conta em aberto`);

  const formaTxt = (ctx.v.formaPagamento ?? "").normalize("NFC").toUpperCase().trim();
  let forma: FormaPagamento = "CREDIARIO";
  const achou = FORMAS.find(([re]) => re.test(formaTxt));
  if (achou) forma = achou[1];
  else ctx.avisos.push(`Forma "${ctx.v.formaPagamento ?? ""}" não reconhecida: considerada crediário (carteira)`);

  return {
    chave: codigo ? `T:${codigo}` : `D:${documento}/${parcela}`,
    dados: {
      documento,
      parcela,
      totalParcelas,
      clienteCodigo,
      clienteCpfCnpj,
      dataVencimento: venc!,
      valor: valor!,
      formaPagamento: forma,
      descricao: texto(ctx.v.descricao, 200),
    },
  };
}

const VALIDADORES: { [E in Entidade]: (ctx: Ctx) => { chave: string; dados: DadosPorEntidade[E] } } = {
  PRODUTO: validarProduto,
  ESTOQUE: validarEstoque,
  PRECO: validarPreco,
  CLIENTE: validarCliente,
  FORNECEDOR: validarFornecedor,
  CONTA_RECEBER: validarContaReceber,
};

export function validar<E extends Entidade>(
  entidade: E,
  brutos: RegistroBruto[],
): RegistroValidado<DadosPorEntidade[E]>[] {
  const fn = VALIDADORES[entidade] as (ctx: Ctx) => { chave: string; dados: DadosPorEntidade[E] };
  const vistos = new Map<string, number>();
  return brutos.map((b) => {
    const ctx: Ctx = { erros: [], avisos: [], v: b.valores };
    const { chave, dados } = fn(ctx);
    const onde = (n: number) => (b.ref ? "registro anterior" : `linha ${n}`);
    if (chave && ctx.erros.length === 0) {
      const anterior = vistos.get(chave);
      if (anterior !== undefined) ctx.erros.push(`Repetido: mesma chave da ${onde(anterior)} (vale a primeira)`);
      else vistos.set(chave, b.linha);
    }
    return {
      linha: b.linha,
      ref: b.ref,
      chave,
      dados: ctx.erros.length ? null : dados,
      erros: ctx.erros,
      avisos: ctx.avisos,
    };
  });
}
