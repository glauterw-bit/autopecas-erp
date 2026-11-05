import crypto from "node:crypto";
import axios from "axios";
import { prisma } from "../db";

// Consulta por placa
// ==================
// O vendedor digita a placa e o sistema devolve marca/modelo/ano para casar
// com a versão do catálogo. Falha graciosa: sem resposta, segue manual.
//
// Provedores (o Sinesp Cidadão não tem API pública; não usamos):
//   1) consultadeplaca.net — chave SÓ no header `Authorization: Bearer`
//      (doc: https://consultadeplaca.net/desenvolvedores/skill.md).
//      POST /api/v1/lookups {plate} com Idempotency-Key. Env: PLACA_API_KEY.
//   2) WDAPI (wdapi2.com.br) — reserva, só se PLACA_WDAPI_TOKEN existir. A doc
//      pública não confirma envio por header; o formato conhecido põe o token
//      no caminho da URL. Por isso fica desligado por padrão e, quando ligado,
//      o erro nunca é logado com a URL.
// Nenhuma chave vai para log: erros viram só "falhou".

export interface DadosPlaca {
  placa: string;
  marca?: string;
  modelo?: string;
  versao?: string;
  ano?: number;
  anoModelo?: number;
  cor?: string;
  combustivel?: string;
  chassi?: string;
  municipio?: string;
  uf?: string;
  provedor?: string;
}

const PLACA_VALIDA = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

export function normalizarPlaca(placa: string): string | null {
  const n = placa.replace(/\W/g, "").toUpperCase();
  return PLACA_VALIDA.test(n) ? n : null;
}

const num = (v: unknown) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);

/** Requisição para o consultadeplaca.net (pura: testável sem rede). */
export function requisicaoConsultaDePlaca(placa: string, chave: string) {
  return {
    url: "https://consultadeplaca.net/api/v1/lookups",
    corpo: { plate: placa },
    headers: {
      Authorization: `Bearer ${chave}`,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
  };
}

export function mapearConsultaDePlaca(placa: string, data: unknown): DadosPlaca | null {
  const d = data as { result?: string; vehicle?: Record<string, unknown> } | undefined;
  if (d?.result !== "found" || !d.vehicle) return null;
  const v = d.vehicle;
  return {
    placa,
    marca: v.brand as string | undefined,
    modelo: v.model as string | undefined,
    versao: v.version as string | undefined,
    ano: num(v.manufacture_year),
    anoModelo: num(v.model_year),
    cor: v.color as string | undefined,
    combustivel: v.fuel as string | undefined,
    municipio: v.city as string | undefined,
    uf: v.state as string | undefined,
    provedor: "consultadeplaca",
  };
}

async function viaConsultaDePlaca(placa: string, chave: string): Promise<DadosPlaca | null> {
  const r = requisicaoConsultaDePlaca(placa, chave);
  const { data } = await axios.post(r.url, r.corpo, { headers: r.headers, timeout: 8000 });
  return mapearConsultaDePlaca(placa, data);
}

async function viaWdapi(placa: string, token: string): Promise<DadosPlaca | null> {
  const { data } = await axios.get(`https://wdapi2.com.br/consulta/${placa}/${token}`, {
    timeout: 8000,
  });
  if (!data?.MARCA && !data?.MODELO) return null;
  return {
    placa,
    marca: data?.MARCA,
    modelo: data?.MODELO,
    ano: num(data?.ano),
    anoModelo: num(data?.anoModelo),
    cor: data?.cor,
    combustivel: data?.combustivel,
    chassi: data?.chassi,
    municipio: data?.municipio,
    uf: data?.uf,
    provedor: "wdapi",
  };
}

export async function consultarPlaca(placa: string): Promise<DadosPlaca | null> {
  const normalizada = normalizarPlaca(placa);
  if (!normalizada) return null;
  const tentativas: Array<[string, () => Promise<DadosPlaca | null>]> = [];
  if (process.env.PLACA_API_KEY) {
    const k = process.env.PLACA_API_KEY;
    tentativas.push(["consultadeplaca", () => viaConsultaDePlaca(normalizada, k)]);
  }
  if (process.env.PLACA_WDAPI_TOKEN) {
    const t = process.env.PLACA_WDAPI_TOKEN;
    tentativas.push(["wdapi", () => viaWdapi(normalizada, t)]);
  }
  for (const [nome, fn] of tentativas) {
    try {
      const r = await fn();
      if (r) return r;
    } catch (e) {
      // Só o status: o erro do axios carrega URL e headers (com a chave).
      const status = axios.isAxiosError(e) ? e.response?.status ?? e.code : "erro";
      console.warn(`[placa] provedor ${nome} falhou (${status})`);
    }
  }
  return null;
}

// Localiza ou cria o VeiculoCliente vinculado ao cliente atual.
export async function vincularPlacaAoCliente(clienteId: string, placa: string) {
  const dados = await consultarPlaca(placa);
  if (!dados) return null;

  // Tenta casar com versão do catálogo via heurística.
  const versao = dados.modelo
    ? await prisma.versaoVeiculo.findFirst({
        where: {
          modelo: {
            nome: { contains: dados.modelo, mode: "insensitive" },
            ...(dados.marca && {
              montadora: { nome: { contains: dados.marca, mode: "insensitive" } },
            }),
          },
          ...(dados.anoModelo && {
            anoInicio: { lte: dados.anoModelo },
            OR: [{ anoFim: { gte: dados.anoModelo } }, { anoFim: null }],
          }),
        },
        select: { id: true },
      })
    : null;

  return prisma.veiculoCliente.upsert({
    where: { id: `${clienteId}-${dados.placa}` },
    update: { kmAtual: undefined },
    create: {
      id: `${clienteId}-${dados.placa}`,
      clienteId,
      placa: dados.placa,
      chassi: dados.chassi,
      ano: dados.ano,
      anoModelo: dados.anoModelo,
      cor: dados.cor,
      versaoId: versao?.id,
    },
  });
}
