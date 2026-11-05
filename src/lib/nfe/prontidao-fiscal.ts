import { ibsCbsObrigatorio } from "../fiscal/ibs-cbs";
import type { RegimeEmitente } from "../fiscal/st-sp";
import { ambienteEscolhido, configFocus, servidorPermiteProducao } from "./config-focus";
import { lerConfigFiscal } from "./config-fiscal";
import { decifrarOpcional } from "../cripto";
import { erroCstPadrao } from "./payload";
import { ehSimples } from "../fiscal/st-sp";

// Checklist de prontidão fiscal
// =============================
// O mesmo checklist aparece na tela (Configurações > Fiscal) e trava a emissão
// de NF-e/NFC-e (emissor.ts e devolucao.ts): item com `bloqueia` e não `ok`
// impede a nota, com a mensagem apontando o que falta.
//
// Fontes:
// - Certificado A1 dentro da validade: "Só é possível emitir notas através de
//   nossa API utilizando certificados digitais modelo A1 dentro da validade"
//   https://focusnfe.com.br/blog/como-vincular-o-certificado-digital-modelo-a1-a-empresa-cadastrada/
// - CSC e id do token da NFC-e: a Focus os pede como csc_nfce_* e
//   id_token_nfce_* ("necessário para emitir NFCe em produção, gerar no SEFAZ
//   do estado"): https://doc.focusnfe.com.br/reference/atualizar_empresa
//   Em homologação também exigimos (hipótese a confirmar no 1º teste: a SEFAZ-SP
//   fornece CSC próprio de homologação). Na dúvida, bloqueia.
// - IBS/CBS: obrigatório desde 03/08/2026 no regime normal e a partir de
//   01/01/2027 no Simples (Ato Conjunto RFB/CGIBS 4/2026, ver vigencias.ts).

export const DIAS_AVISO_CERTIFICADO = 30;

export interface EmpresaFiscal {
  cnpj: string;
  inscEstadual: string | null;
  regimeTributario: string;
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  uf?: string | null;
  cep?: string | null;
  configuracoes?: unknown;
}

export interface ItemChecklist {
  id: "certificado" | "cstPadrao" | "ie" | "endereco" | "token" | "serie" | "csc" | "ibsCbs" | "ambiente";
  rotulo: string;
  ok: boolean;
  /** Se não estiver ok, a emissão para. Item ok pode trazer aviso (ex.: certificado vencendo). */
  bloqueia: boolean;
  detalhe: string;
  aviso?: string;
}

type Env = Record<string, string | undefined>;

const dataBr = (d: Date) =>
  d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });

export function checklistFiscal(
  empresa: EmpresaFiscal,
  opts: { agora?: Date; env?: Env; modelo?: "55" | "65" } = {},
): ItemChecklist[] {
  const agora = opts.agora ?? new Date();
  const env = opts.env ?? process.env;
  const c = lerConfigFiscal(empresa.configuracoes);
  const focus = configFocus(empresa, env);
  const amb = focus.ambiente;
  const nomeAmb = amb === "producao" ? "produção" : "homologação";
  const itens: ItemChecklist[] = [];

  // Certificado
  const cert = c.certificado;
  if (!cert?.validoAte || Number.isNaN(new Date(cert.validoAte).getTime())) {
    itens.push({
      id: "certificado",
      rotulo: "Certificado digital A1",
      ok: false,
      bloqueia: true,
      detalhe: "Certificado digital: envie o arquivo .pfx (ou informe a validade, se a Focus já tem o certificado).",
    });
  } else {
    const ate = new Date(cert.validoAte);
    const dias = Math.floor((ate.getTime() - agora.getTime()) / 86_400_000);
    const vencido = ate.getTime() <= agora.getTime();
    itens.push({
      id: "certificado",
      rotulo: "Certificado digital A1",
      ok: !vencido,
      bloqueia: true,
      detalhe: vencido
        ? `Certificado digital vencido em ${dataBr(ate)}. Renove com a certificadora e envie o novo .pfx; até lá nenhuma nota sai.`
        : cert.origem === "informado"
          ? `Informado, não verificado: a loja digitou a validade ${dataBr(ate)}; o sistema não leu o certificado.`
          : `Válido até ${dataBr(ate)}.`,
      aviso:
        !vencido && dias <= DIAS_AVISO_CERTIFICADO
          ? `O certificado vence em ${dias <= 0 ? "menos de 1 dia" : `${dias} dia(s)`} (${dataBr(ate)}). Renove antes para a emissão não parar.`
          : !vencido && cert.origem === "informado"
            ? "A validade foi informada à mão e não foi verificada. Se o certificado da Focus estiver vencido, a SEFAZ vai recusar a nota."
            : undefined,
    });
  }

  // Inscrição estadual
  const ie = (empresa.inscEstadual ?? "").replace(/\D/g, "");
  itens.push({
    id: "ie",
    rotulo: "Inscrição estadual",
    ok: ie.length >= 2,
    bloqueia: true,
    detalhe: ie.length >= 2 ? `IE ${ie}.` : "Inscrição estadual: preencha a IE da loja (só números).",
  });

  // Endereço fiscal
  const faltaEnd = (
    [
      ["rua", empresa.logradouro],
      ["número", empresa.numero],
      ["bairro", empresa.bairro],
      ["cidade", empresa.municipio],
      ["UF", empresa.uf],
      ["CEP", (empresa.cep ?? "").replace(/\D/g, "").length === 8 ? "ok" : ""],
    ] as const
  )
    .filter(([, v]) => !String(v ?? "").trim())
    .map(([n]) => n);
  itens.push({
    id: "endereco",
    rotulo: "Endereço fiscal",
    ok: faltaEnd.length === 0,
    bloqueia: true,
    detalhe: faltaEnd.length ? `Endereço fiscal: falta ${faltaEnd.join(", ")}.` : "Completo.",
  });

  // Token
  itens.push({
    id: "token",
    rotulo: `Token da Focus NFe (${nomeAmb})`,
    ok: !!focus.token,
    bloqueia: true,
    detalhe: focus.erroToken
      ? `Token da Focus: ${focus.erroToken}`
      : focus.token
        ? focus.origemToken === "empresa"
          ? "Informado pela loja."
          : "Usando o token reserva do servidor."
        : `Emissão de nota não configurada: falta o token da Focus NFe desta empresa (ambiente de ${nomeAmb}).`,
  });

  // Série
  const sNfe = String(c.focus?.serieNfe ?? "").trim();
  const sNfce = String(c.focus?.serieNfce ?? "").trim();
  const faltaSerie = [
    ...(opts.modelo !== "65" && !sNfe ? ["NF-e"] : []),
    ...(opts.modelo !== "55" && !sNfce ? ["NFC-e"] : []),
  ];
  itens.push({
    id: "serie",
    rotulo: "Série das notas",
    ok: faltaSerie.length === 0,
    bloqueia: true,
    detalhe: faltaSerie.length
      ? `Série: informe a série da ${faltaSerie.join(" e da ")} (combine com o contador; costuma ser 1).`
      : `NF-e série ${sNfe || "—"}, NFC-e série ${sNfce || "—"}.`,
  });

  // CSC (só NFC-e)
  if (opts.modelo !== "55") {
    const n = c.nfce ?? {};
    const cscCifrado = amb === "producao" ? n.cscProducao : n.cscHomologacao;
    const idToken = amb === "producao" ? n.idTokenProducao : n.idTokenHomologacao;
    let cscOk = false;
    let erro = "";
    try {
      cscOk = !!decifrarOpcional(cscCifrado, env);
    } catch (e) {
      erro = (e as Error).message;
    }
    itens.push({
      id: "csc",
      rotulo: `CSC da NFC-e (${nomeAmb})`,
      ok: cscOk && !!idToken,
      bloqueia: true,
      detalhe: erro
        ? `CSC: ${erro}`
        : cscOk && idToken
          ? `Id do token ${idToken}.`
          : `CSC da NFC-e: informe o CSC e o id do token de ${nomeAmb} (gerados no site da SEFAZ do estado).`,
    });
  }

  // IBS/CBS
  const regime = empresa.regimeTributario as RegimeEmitente;
  const temIbs = /^\d{3}$/.test(c.ibsCbs?.cst ?? "") && /^\d{6}$/.test(c.ibsCbs?.cClassTrib ?? "");
  const obrigatorio = ibsCbsObrigatorio(regime, agora) || !!(c.ibsCbs as { simplesAntecipar?: boolean } | undefined)?.simplesAntecipar;
  itens.push({
    id: "ibsCbs",
    rotulo: "Padrão de IBS/CBS (CST e cClassTrib)",
    ok: temIbs,
    bloqueia: obrigatorio,
    detalhe: temIbs
      ? `CST ${c.ibsCbs?.cst}, cClassTrib ${c.ibsCbs?.cClassTrib}.`
      : obrigatorio
        ? "IBS/CBS: informe o CST e o cClassTrib padrão da empresa (peça ao contador). A nota já precisa do grupo IBS/CBS."
        : "IBS/CBS: preencha com o contador. Para o Simples passa a ser obrigatório em 01/01/2027.",
  });

  // CST/CSOSN padrão salvo antes da regra nova (só aparece se estiver inválido)
  const erroPadrao = erroCstPadrao(ehSimples(regime), c.cstIcmsPadrao);
  if (erroPadrao) {
    itens.push({
      id: "cstPadrao",
      rotulo: "CST/CSOSN padrão da empresa",
      ok: false,
      bloqueia: true,
      detalhe: `CST/CSOSN padrão: ${erroPadrao} Corrija em Configurações > Fiscal.`,
    });
  }

  // Ambiente (informativo)
  const escolhido = ambienteEscolhido(empresa.configuracoes);
  itens.push({
    id: "ambiente",
    rotulo: "Ambiente",
    ok: true,
    bloqueia: false,
    detalhe: amb === "producao" ? "Produção: as notas têm valor legal." : "Homologação: notas de teste, sem valor legal.",
    aviso:
      escolhido === "producao" && !servidorPermiteProducao(env)
        ? "A loja escolheu produção, mas o servidor está travado em homologação. Peça ao suporte para liberar."
        : undefined,
  });

  return itens;
}

export function pendenciasBloqueantes(itens: ItemChecklist[]): ItemChecklist[] {
  return itens.filter((i) => i.bloqueia && !i.ok);
}

/** Texto do bloqueio: uma linha por item que falta. Vazio se estiver pronto. */
export function mensagemBloqueio(itens: ItemChecklist[]): string {
  const p = pendenciasBloqueantes(itens);
  if (!p.length) return "";
  return `Emissão bloqueada — falta na configuração fiscal (Configurações > Fiscal):\n- ${p.map((i) => i.detalhe).join("\n- ")}`;
}
