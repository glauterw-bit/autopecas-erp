import axios from "axios";
import { prisma } from "../db";

// MDF-e — Manifesto Eletrônico de Documentos Fiscais
// ==================================================
// Documento que acompanha o transporte de mercadorias quando há mais de uma
// NF-e no mesmo veículo, ou quando a loja faz a própria entrega.
// Obrigatório para:
//   - Transporte interestadual com carga própria (auto peças → entrega para
//     mecânica em outra cidade dentro do estado: opcional)
//   - Transporte de carga fracionada com mais de uma NF-e
//
// Eventos: autorização, cancelamento, encerramento, inclusão de motorista.

const FOCUS_BASE: Record<string, string> = {
  homologacao: "https://homologacao.focusnfe.com.br",
  producao: "https://api.focusnfe.com.br",
};

export interface MotoristaMdfe {
  cpf: string;
  nome: string;
}

export interface VeiculoMdfe {
  placa: string;
  renavam?: string;
  tara: number;        // peso em kg
  capacidadeKg?: number;
  tipoRodado: string;  // "01"=truck, "02"=toco, "03"=cavalo mecânico, etc.
  tipoCarroceria: string; // "00"=não aplicável, "01"=aberta, "02"=fechada/baú
  uf: string;
}

export interface MdfeInput {
  empresaId: string;
  ufInicio: string;
  ufFim: string;
  ufsPercurso?: string[];
  veiculo: VeiculoMdfe;
  motorista: MotoristaMdfe;
  notasFiscaisChaves: string[];   // chaves das NF-e que estão sendo transportadas
  cidadeCarregamentoIbge: string;
  cidadeDescarregamentoIbge: string;
  pesoBrutoKg: number;
  valorTotalCarga: number;
}

export async function emitirMdfe(input: MdfeInput) {
  const empresa = await prisma.empresa.findUniqueOrThrow({
    where: { id: input.empresaId },
  });
  const ambiente = (process.env.FOCUS_NFE_AMBIENTE as "homologacao" | "producao") ?? "homologacao";
  const ref = `mdfe-${Date.now()}`;

  const payload = {
    cnpj_emitente: empresa.cnpj,
    ie_emitente: empresa.inscEstadual,
    nome_emitente: empresa.razaoSocial,
    uf_emitente: empresa.uf,
    tipo_emitente: "2", // 2=transportador autônomo ou carga própria
    tipo_transportador: "",
    serie: "1",
    data_emissao: new Date().toISOString(),
    uf_inicio: input.ufInicio,
    uf_fim: input.ufFim,
    ufs_percurso: input.ufsPercurso ?? [],
    modal: "1", // 1=rodoviário
    rodoviario: {
      veiculo_tracao: {
        placa: input.veiculo.placa,
        renavam: input.veiculo.renavam,
        tara: input.veiculo.tara,
        capacidade_kg: input.veiculo.capacidadeKg,
        tipo_rodado: input.veiculo.tipoRodado,
        tipo_carroceria: input.veiculo.tipoCarroceria,
        uf: input.veiculo.uf,
        condutores: [
          { nome: input.motorista.nome, cpf: input.motorista.cpf },
        ],
      },
    },
    cidade_carregamento: input.cidadeCarregamentoIbge,
    cidade_descarregamento: input.cidadeDescarregamentoIbge,
    cidades_descarregamento: [
      {
        codigo_ibge: input.cidadeDescarregamentoIbge,
        documentos: input.notasFiscaisChaves.map((chave) => ({
          chave_nfe: chave,
        })),
      },
    ],
    quantidade_total_carga: input.notasFiscaisChaves.length,
    peso_bruto_total: input.pesoBrutoKg,
    valor_total_carga: input.valorTotalCarga,
    unidade_medida: "01", // 01=KG
  };

  const url = `${FOCUS_BASE[ambiente]}/v2/mdfe?ref=${ref}`;
  const { data } = await axios.post(url, payload, {
    auth: { username: process.env.FOCUS_NFE_TOKEN ?? "", password: "" },
    headers: { "Content-Type": "application/json" },
    validateStatus: () => true,
  });

  return data;
}

// Encerramento do MDF-e — obrigatório quando a viagem termina.
export async function encerrarMdfe(opts: {
  chaveMdfe: string;
  ufEncerramento: string;
  cidadeIbge: string;
}) {
  const ambiente = (process.env.FOCUS_NFE_AMBIENTE as "homologacao" | "producao") ?? "homologacao";
  const url = `${FOCUS_BASE[ambiente]}/v2/mdfe/encerramento`;
  const { data } = await axios.post(
    url,
    {
      chave_mdfe: opts.chaveMdfe,
      protocolo: "",
      uf: opts.ufEncerramento,
      municipio: opts.cidadeIbge,
      data_encerramento: new Date().toISOString().slice(0, 10),
    },
    {
      auth: { username: process.env.FOCUS_NFE_TOKEN ?? "", password: "" },
      validateStatus: () => true,
    },
  );
  return data;
}

export async function cancelarMdfe(chaveMdfe: string, justificativa: string) {
  if (justificativa.length < 15)
    throw new Error("Justificativa de cancelamento exige 15 caracteres");
  const ambiente = (process.env.FOCUS_NFE_AMBIENTE as "homologacao" | "producao") ?? "homologacao";
  const url = `${FOCUS_BASE[ambiente]}/v2/mdfe/${chaveMdfe}/cancelamento`;
  const { data } = await axios.delete(url, {
    auth: { username: process.env.FOCUS_NFE_TOKEN ?? "", password: "" },
    data: { justificativa },
    validateStatus: () => true,
  });
  return data;
}
