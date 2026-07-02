"use strict";

// =============================================================================
// ADAPTADORES SIMULADOS (default — AGENTE_MODO != real)
// =============================================================================
// Permitem desenvolver e homologar o PDV web sem nenhum hardware conectado:
//   - TEF aprova qualquer venda (NSU/autorização gerados, comprovante realista)
//   - SAT devolve CF-e fake com chave de 44 dígitos e DV válido (mod-11)
//   - Balança devolve peso aleatório estável
//   - Impressora decodifica o ESC/POS e imprime o cupom no console
// =============================================================================

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------
function agora() {
  const d = new Date();
  const p = (n, l = 2) => String(n).padStart(l, "0");
  return {
    data: `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`,
    hora: `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`,
    aamm: `${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}`,
    iso: d.toISOString(),
  };
}

function digitos(qtd) {
  let s = "";
  for (let i = 0; i < qtd; i++) s += Math.floor(Math.random() * 10);
  return s;
}

function formatarReais(centavos) {
  return (centavos / 100).toFixed(2).replace(".", ",");
}

function centralizar(texto, colunas = 40) {
  const pad = Math.max(0, Math.floor((colunas - texto.length) / 2));
  return " ".repeat(pad) + texto;
}

// ---------------------------------------------------------------------------
// TEF simulado
// ---------------------------------------------------------------------------
const BANDEIRAS_CREDITO = ["VISA", "MASTERCARD", "ELO", "HIPERCARD", "AMEX"];
const BANDEIRAS_DEBITO = ["VISA ELECTRON", "MAESTRO", "ELO DEBITO"];

let sequencialNsu = Date.now() % 1000000;
const transacoes = new Map(); // nsu -> { valor, forma, status }

function montarComprovante(via, dados) {
  const t = agora();
  const linhas = [
    centralizar("REDE SIMULADA S.A."),
    centralizar("SITEF - AGENTE PDV (SIMULADO)"),
    "",
    `CNPJ LOJA: ${dados.cnpj || "00.000.000/0001-00"}`,
    `${t.data}  ${t.hora}`,
    "----------------------------------------",
    `${dados.descricaoForma}`,
    `${dados.bandeira}  **** **** **** ${dados.ultimosDigitos}`,
    `VALOR:            R$ ${formatarReais(dados.valor)}`,
    dados.parcelas > 1 ? `PARCELAS:         ${dados.parcelas}x` : null,
    `NSU: ${dados.nsu}      AUT: ${dados.autorizacao}`,
    `DOC: ${dados.documento || "-"}`,
    "----------------------------------------",
    centralizar("TRANSACAO AUTORIZADA"),
    centralizar(via === "cliente" ? "*** VIA CLIENTE ***" : "*** VIA ESTABELECIMENTO ***"),
  ].filter((l) => l !== null);
  return linhas.join("\n");
}

const tef = {
  async venda(corpo) {
    // Latência do PinPad simulada (cliente "passando o cartão")
    await new Promise((r) => setTimeout(r, 300));

    const forma = corpo.forma || "CREDITO";
    const parcelas = Number(corpo.parcelas) || 1;
    const nsu = String(++sequencialNsu).padStart(9, "0");
    const autorizacao = digitos(6);
    const ultimosDigitos = digitos(4);
    const bin = "541275";

    let bandeira;
    let descricaoForma;
    if (forma === "PIX") {
      bandeira = "PIX";
      descricaoForma = "PIX NO PINPAD";
    } else if (forma === "DEBITO") {
      bandeira = BANDEIRAS_DEBITO[Math.floor(Math.random() * BANDEIRAS_DEBITO.length)];
      descricaoForma = "VENDA DEBITO A VISTA";
    } else if (forma === "VOUCHER") {
      bandeira = "VR AUTO";
      descricaoForma = "VENDA VOUCHER";
    } else {
      bandeira = BANDEIRAS_CREDITO[Math.floor(Math.random() * BANDEIRAS_CREDITO.length)];
      descricaoForma = parcelas > 1 ? `VENDA CREDITO PARCELADO ${parcelas}X` : "VENDA CREDITO A VISTA";
    }

    const dados = {
      valor: corpo.valor,
      cnpj: corpo.cnpj,
      documento: corpo.documento,
      forma,
      parcelas,
      nsu,
      autorizacao,
      bandeira,
      bin,
      ultimosDigitos,
      descricaoForma,
    };

    transacoes.set(nsu, { ...dados, status: "PENDENTE_CONFIRMACAO" });

    // Contrato: RetornoTransacaoTef (src/lib/pdv/tef.ts)
    return {
      autorizado: true,
      nsu,
      autorizacao,
      bandeira,
      bin,
      ultimosDigitos,
      parcelas,
      comprovanteCliente: montarComprovante("cliente", dados),
      comprovanteEstabelecimento: montarComprovante("estabelecimento", dados),
      mensagem: "TRANSACAO AUTORIZADA (SIMULADO)",
    };
  },

  async cancelamento(nsu) {
    const tx = transacoes.get(nsu);
    if (tx) tx.status = "CANCELADA";
    return { ok: true };
  },

  async confirmar(nsu) {
    const tx = transacoes.get(nsu);
    if (tx) tx.status = "CONFIRMADA";
    return { ok: true };
  },

  async pix(corpo) {
    const retorno = await tef.venda({ ...corpo, forma: "PIX" });
    // Copia-e-cola fake no padrão EMV do Pix (útil para renderizar QR no PDV)
    const copiaECola =
      "00020126580014br.gov.bcb.pix0136" +
      "simulado-" + digitos(8) + "-fake-agente-pdv" +
      "52040000530398654" +
      String((corpo.valor / 100).toFixed(2)).padStart(2, "0") +
      "5802BR5915LOJA SIMULADA6009SAO PAULO62070503***6304" + digitos(4);
    return { ...retorno, qrCode: copiaECola };
  },
};

// ---------------------------------------------------------------------------
// SAT simulado
// ---------------------------------------------------------------------------
// Chave do CF-e (44 dígitos): cUF(2) AAMM(4) CNPJ(14) mod(2)=59
//   nSerieSAT(9) nCFe(6) tpAmb(1) cNF(5) cDV(1)
// DV calculado por módulo-11 (mesmo algoritmo da NF-e).
function dvMod11(chave43) {
  let peso = 2;
  let soma = 0;
  for (let i = chave43.length - 1; i >= 0; i--) {
    soma += Number(chave43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

let numeroCfe = 1;
let numeroSessaoSat = 100000;
const SERIE_SAT_SIMULADO = "900001234";

const sat = {
  async enviarCfe(input) {
    await new Promise((r) => setTimeout(r, 200));
    const t = agora();
    const cnpj = String(input.cnpjEmitente).replace(/\D/g, "").padStart(14, "0");
    const nCfe = String(numeroCfe++).padStart(6, "0");
    const chave43 =
      "35" +               // cUF: São Paulo (SAT é obrigatório em SP)
      t.aamm +             // AAMM emissão
      cnpj +               // CNPJ do emitente
      "59" +               // modelo 59 = CF-e SAT
      SERIE_SAT_SIMULADO + // número de série do equipamento SAT
      nCfe +               // número do CF-e
      "2" +                // tpAmb: 2 = homologação/teste
      digitos(5);          // cNF aleatório
    const chave = chave43 + String(dvMod11(chave43));

    const valorTotal =
      (input.pagamento || []).reduce((s, p) => s + (p.valor || 0), 0) ||
      (input.itens || []).reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);

    const itensXml = (input.itens || [])
      .map(
        (it, i) =>
          `<det nItem="${i + 1}"><prod><cProd>${it.codigo}</cProd><xProd>${it.descricao}</xProd>` +
          `<NCM>${it.ncm}</NCM><CFOP>${it.cfop}</CFOP><uCom>${it.unidade}</uCom>` +
          `<qCom>${it.quantidade}</qCom><vUnCom>${it.valorUnitario.toFixed(2)}</vUnCom></prod></det>`,
      )
      .join("");

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<CFe><infCFe Id="CFe${chave}" versao="0.08">` +
      `<ide><cUF>35</cUF><mod>59</mod><nserieSAT>${SERIE_SAT_SIMULADO}</nserieSAT>` +
      `<nCFe>${nCfe}</nCFe><dEmi>${t.iso.slice(0, 10).replace(/-/g, "")}</dEmi>` +
      `<hEmi>${t.hora.replace(/:/g, "")}</hEmi><tpAmb>2</tpAmb></ide>` +
      `<emit><CNPJ>${cnpj}</CNPJ><IE>${input.ieEmitente || ""}</IE></emit>` +
      (input.cnpjCpfDestinatario ? `<dest><CPF>${input.cnpjCpfDestinatario}</CPF></dest>` : "<dest/>") +
      itensXml +
      `<total><vCFe>${valorTotal.toFixed(2)}</vCFe></total>` +
      `</infCFe><Signature>ASSINATURA-SIMULADA-${digitos(16)}</Signature></CFe>`;

    // QR Code do CF-e: chave|dataHora|valorTotal|CPF/CNPJ destinatário|assinaturaQRCODE
    const qrCode = [
      chave,
      t.iso.slice(0, 19).replace(/[-:T]/g, ""),
      valorTotal.toFixed(2),
      input.cnpjCpfDestinatario || "",
      "ASSINATURA-QRCODE-SIMULADA-" + digitos(32),
    ].join("|");

    // Contrato: RetornoCfeSat (src/lib/pdv/sat.ts)
    return {
      status: "EMITIDO",
      chave,
      xml,
      mensagem: "06000 - Emitido com sucesso (SIMULADO)",
      qrCode,
    };
  },

  async consultar() {
    // Contrato: { ativo, numeroSessao, modelo }
    return { ativo: true, numeroSessao: ++numeroSessaoSat, modelo: "SAT SIMULADO v1.0" };
  },

  async cancelar(_chave) {
    return { cancelado: true };
  },
};

// ---------------------------------------------------------------------------
// Balança simulada — peso aleatório estável
// ---------------------------------------------------------------------------
// Mantém o mesmo peso por alguns segundos (como um produto parado no prato),
// para que o polling de lerPesoEstavel() do ERP convirja.
let pesoAtual = null;
let pesoExpiraEm = 0;

const balanca = {
  async lerPeso(modelo) {
    const agoraMs = Date.now();
    if (!pesoAtual || agoraMs > pesoExpiraEm) {
      pesoAtual = Math.round((0.2 + Math.random() * 24.8) * 1000) / 1000; // 0,200 a 25,000 kg
      pesoExpiraEm = agoraMs + 8000;
    }
    const gramas = String(Math.round(pesoAtual * 1000)).padStart(5, "0");
    // Contrato: LeituraBalanca (src/lib/pdv/balanca.ts)
    return {
      peso: pesoAtual,
      estavel: true,
      unidade: "kg",
      modelo,
      bruto: `\x02${gramas}\x03\r`, // frame Toledo Prix III simulado
    };
  },

  async zerar(_modelo) {
    pesoAtual = 0;
    pesoExpiraEm = Date.now() + 3000;
    return { ok: true };
  },

  async tara(peso, _modelo) {
    if (pesoAtual) pesoAtual = Math.max(0, Math.round((pesoAtual - peso) * 1000) / 1000);
    return { ok: true };
  },
};

// ---------------------------------------------------------------------------
// Impressora simulada — decodifica o ESC/POS e loga o cupom no console
// ---------------------------------------------------------------------------
function decodificarEscPos(buf) {
  const linhas = [];
  let atual = "";
  let i = 0;
  while (i < buf.length) {
    const b = buf[i];
    if (b === 0x1b) {
      // ESC — comandos: @ (init) sem parâmetro extra; E/a com 1 byte; p com 3
      const cmd = buf[i + 1];
      if (cmd === 0x40) i += 2;
      else if (cmd === 0x45 || cmd === 0x61) i += 3;
      else if (cmd === 0x70) i += 5;
      else i += 2;
    } else if (b === 0x1d) {
      // GS — ! (1 byte), V (2 bytes), ( k (pL pH + dados)
      const cmd = buf[i + 1];
      if (cmd === 0x21) i += 3;
      else if (cmd === 0x56) i += 4;
      else if (cmd === 0x28) {
        const pL = buf[i + 3];
        const pH = buf[i + 4];
        const len = pL + pH * 256;
        // Função "armazenar dados do QR" (cn=0x31 fn=0x50): extrai o conteúdo
        if (buf[i + 5] === 0x31 && buf[i + 6] === 0x50) {
          const dados = buf.slice(i + 8, i + 5 + len).toString("latin1");
          if (atual) { linhas.push(atual); atual = ""; }
          linhas.push(`[QR CODE] ${dados}`);
        }
        i += 5 + len;
      } else i += 2;
    } else if (b === 0x0a) {
      linhas.push(atual);
      atual = "";
      i++;
    } else if (b === 0x0d) {
      i++;
    } else if (b >= 0x20) {
      atual += String.fromCharCode(b);
      i++;
    } else {
      i++;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

const impressora = {
  async imprimir(buffer) {
    const linhas = decodificarEscPos(buffer);
    console.log("┌────────────── CUPOM (IMPRESSORA SIMULADA) ──────────────");
    for (const l of linhas) console.log("│ " + l);
    console.log("└──────────────────────── [CORTE] ────────────────────────");
    return { sucesso: true, bytes: buffer.length, linhas: linhas.length };
  },
};

module.exports = { tef, sat, balanca, impressora };
