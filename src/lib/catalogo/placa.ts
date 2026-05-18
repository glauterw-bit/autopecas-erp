import axios from "axios";
import { prisma } from "../db";

// Consulta por placa
// ==================
// Permite ao vendedor digitar a placa e o sistema retornar marca/modelo/ano,
// fazendo o vínculo automático com a versão do catálogo TecDoc/Cinoa.
//
// Suporta múltiplos provedores (Sinesp Cidadão, API SefazAtua, providers
// privados). Falha gracioso — se a placa não for encontrada, o vendedor
// segue digitando manualmente.

export interface DadosPlaca {
  placa: string;
  marca?: string;
  modelo?: string;
  ano?: number;
  anoModelo?: number;
  cor?: string;
  combustivel?: string;
  chassi?: string;
  municipio?: string;
  uf?: string;
}

export async function consultarPlaca(placa: string): Promise<DadosPlaca | null> {
  const normalizada = placa.replace(/\W/g, "").toUpperCase();
  if (!process.env.PLACA_API_KEY) {
    return null;
  }
  try {
    const { data } = await axios.get(
      `https://wdapi2.com.br/consulta/${normalizada}/${process.env.PLACA_API_KEY}`,
      { timeout: 8000 },
    );
    return {
      placa: normalizada,
      marca: data?.MARCA,
      modelo: data?.MODELO,
      ano: data?.ano ? Number(data.ano) : undefined,
      anoModelo: data?.anoModelo ? Number(data.anoModelo) : undefined,
      cor: data?.cor,
      combustivel: data?.combustivel,
      chassi: data?.chassi,
      municipio: data?.municipio,
      uf: data?.uf,
    };
  } catch {
    return null;
  }
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
