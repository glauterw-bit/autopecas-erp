#!/usr/bin/env node
"use strict";

// =============================================================================
// AGENTE LOCAL DE HARDWARE DO PDV
// =============================================================================
// Executável que roda na máquina da loja e faz a ponte entre o ERP web
// (navegador) e o hardware local: PinPad TEF, equipamento SAT, impressora
// térmica ESC/POS e balança serial.
//
// Um único processo Node.js (sem dependências obrigatórias) abre 3 servidores
// HTTP escutando SOMENTE em 127.0.0.1:
//
//   :60906  TEF        POST /api/tef/venda | /cancelamento | /confirmar | /pix
//           Impressora POST /api/impressora/imprimir
//   :60907  SAT        POST /api/sat/enviar-cfe | GET /api/sat/consultar
//                      POST /api/sat/cancelar
//   :60908  Balança    GET  /api/balanca/peso | POST /zerar | POST /tara
//
// Os contratos (nomes de campos!) espelham exatamente os clients do ERP em
// src/lib/pdv/{tef,sat,balanca,impressora}.ts.
//
// Modos (variável de ambiente AGENTE_MODO):
//   simulado (default) — respostas fake realistas, sem hardware
//   real               — usa os adaptadores em ./adaptadores/
// =============================================================================

const http = require("http");

const HOST = "127.0.0.1"; // NUNCA expor em 0.0.0.0 — segurança do PDV
const PORTA_TEF = 60906;
const PORTA_SAT = 60907;
const PORTA_BALANCA = 60908;

const MODO = (process.env.AGENTE_MODO || "simulado").toLowerCase();

function log(servico, ...args) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${ts}] [${servico}]`, ...args);
}

// -----------------------------------------------------------------------------
// Carrega os adaptadores conforme o modo
// -----------------------------------------------------------------------------
let adaptadores;
if (MODO === "real") {
  adaptadores = {
    tef: require("./adaptadores/tef-sitef"),
    sat: require("./adaptadores/sat"),
    balanca: require("./adaptadores/balanca-serial"),
    impressora: require("./adaptadores/impressora"),
  };
  log("AGENTE", "Modo REAL — adaptadores de hardware carregados");
} else {
  adaptadores = require("./simulado");
  log("AGENTE", "Modo SIMULADO — nenhum hardware será acionado (AGENTE_MODO=real para produção)");
}

// -----------------------------------------------------------------------------
// CORS — obrigatório para o PDV web (https) chamar 127.0.0.1.
// O Chrome (Private Network Access) faz um preflight OPTIONS com o header
// Access-Control-Request-Private-Network: true e só libera a chamada se a
// resposta contiver Access-Control-Allow-Private-Network: true.
// -----------------------------------------------------------------------------
function aplicarCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Max-Age", "86400");
  // Chrome Private Network Access (https → 127.0.0.1)
  if (req.headers["access-control-request-private-network"] === "true" || req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
}

function responderJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

function lerCorpoJson(req) {
  return new Promise((resolve, reject) => {
    let dados = "";
    req.on("data", (chunk) => {
      dados += chunk;
      if (dados.length > 5 * 1024 * 1024) {
        reject(new Error("Corpo da requisição excede 5MB"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!dados) return resolve({});
      try {
        resolve(JSON.parse(dados));
      } catch {
        reject(new Error("JSON inválido no corpo da requisição"));
      }
    });
    req.on("error", reject);
  });
}

// -----------------------------------------------------------------------------
// Fábrica de servidor: recebe um mapa de rotas "METODO /caminho" -> handler.
// handler(corpo, query) deve retornar o objeto de resposta (ou lançar erro).
// -----------------------------------------------------------------------------
function criarServidor(nome, porta, rotas) {
  const servidor = http.createServer(async (req, res) => {
    aplicarCors(req, res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${HOST}:${porta}`);
    const chave = `${req.method} ${url.pathname}`;
    const handler = rotas[chave];

    if (!handler) {
      log(nome, `404 ${chave}`);
      responderJson(res, 404, { erro: `Rota não encontrada: ${chave}` });
      return;
    }

    try {
      const corpo = req.method === "GET" ? {} : await lerCorpoJson(req);
      const query = Object.fromEntries(url.searchParams);
      const inicio = Date.now();
      const resposta = await handler(corpo, query);
      log(nome, `${chave} OK (${Date.now() - inicio}ms)`);
      responderJson(res, 200, resposta ?? { ok: true });
    } catch (err) {
      log(nome, `${chave} ERRO: ${err.message}`);
      responderJson(res, 500, { erro: err.message });
    }
  });

  servidor.listen(porta, HOST, () => {
    log(nome, `escutando em http://${HOST}:${porta}`);
  });

  servidor.on("error", (err) => {
    log(nome, `FALHA ao subir na porta ${porta}: ${err.message}`);
    process.exit(1);
  });

  return servidor;
}

// -----------------------------------------------------------------------------
// TEF (60906) + Impressora (mesmo processo/porta do TEF)
// Contrato: src/lib/pdv/tef.ts (AgenteTefClient) e impressora.ts
// -----------------------------------------------------------------------------
criarServidor("TEF", PORTA_TEF, {
  // Body: { valor(centavos), documento, forma DEBITO|CREDITO|PIX|VOUCHER,
  //         parcelas, financiamento, cnpj }
  // Retorno: { autorizado, nsu, autorizacao, bandeira, bin, ultimosDigitos,
  //            parcelas, comprovanteCliente, comprovanteEstabelecimento, mensagem }
  "POST /api/tef/venda": async (corpo) => {
    if (!corpo.valor || corpo.valor <= 0) throw new Error("Campo 'valor' (centavos) é obrigatório");
    log("TEF", `Venda ${corpo.forma || "?"} R$ ${(corpo.valor / 100).toFixed(2)} doc=${corpo.documento || "-"} parcelas=${corpo.parcelas || 1}`);
    return adaptadores.tef.venda(corpo);
  },

  // Body: { nsu }  →  { ok: boolean }
  "POST /api/tef/cancelamento": async (corpo) => {
    if (!corpo.nsu) throw new Error("Campo 'nsu' é obrigatório");
    log("TEF", `Cancelamento NSU ${corpo.nsu}`);
    return adaptadores.tef.cancelamento(corpo.nsu);
  },

  // Body: { nsu } — confirmação obrigatória no SiTef (senão desfaz por timeout)
  "POST /api/tef/confirmar": async (corpo) => {
    if (!corpo.nsu) throw new Error("Campo 'nsu' é obrigatório");
    log("TEF", `Confirmação NSU ${corpo.nsu}`);
    return adaptadores.tef.confirmar(corpo.nsu);
  },

  // Body: { valor(centavos), documento } — Pix no PinPad (QR no display)
  "POST /api/tef/pix": async (corpo) => {
    if (!corpo.valor || corpo.valor <= 0) throw new Error("Campo 'valor' (centavos) é obrigatório");
    log("TEF", `Pix R$ ${(corpo.valor / 100).toFixed(2)} doc=${corpo.documento || "-"}`);
    return adaptadores.tef.pix(corpo);
  },

  // Body: { dadosBase64 } — buffer ESC/POS gerado por src/lib/pdv/impressora.ts
  "POST /api/impressora/imprimir": async (corpo) => {
    if (!corpo.dadosBase64) throw new Error("Campo 'dadosBase64' é obrigatório");
    const buffer = Buffer.from(corpo.dadosBase64, "base64");
    log("IMPRESSORA", `Recebido cupom de ${buffer.length} bytes ESC/POS`);
    return adaptadores.impressora.imprimir(buffer);
  },
});

// -----------------------------------------------------------------------------
// SAT-CF-e (60907) — Contrato: src/lib/pdv/sat.ts (SatLocalClient)
// -----------------------------------------------------------------------------
criarServidor("SAT", PORTA_SAT, {
  // Body: InputCfeSat { cnpjEmitente, ieEmitente, itens[], pagamento[] ... }
  // Retorno: { status EMITIDO|REJEITADO, chave, xml, mensagem, qrCode }
  "POST /api/sat/enviar-cfe": async (corpo) => {
    if (!corpo.cnpjEmitente) throw new Error("Campo 'cnpjEmitente' é obrigatório");
    if (!Array.isArray(corpo.itens) || corpo.itens.length === 0) throw new Error("Campo 'itens' é obrigatório");
    log("SAT", `Enviar CF-e: ${corpo.itens.length} item(ns), emitente ${corpo.cnpjEmitente}`);
    return adaptadores.sat.enviarCfe(corpo);
  },

  // Retorno: { ativo, numeroSessao, modelo }
  "GET /api/sat/consultar": async () => {
    log("SAT", "Consulta status do equipamento");
    return adaptadores.sat.consultar();
  },

  // Body: { chave } → { cancelado: boolean } (janela de 30 min)
  "POST /api/sat/cancelar": async (corpo) => {
    if (!corpo.chave) throw new Error("Campo 'chave' é obrigatório");
    log("SAT", `Cancelar CF-e ${corpo.chave}`);
    return adaptadores.sat.cancelar(corpo.chave);
  },
});

// -----------------------------------------------------------------------------
// Balança (60908) — Contrato: src/lib/pdv/balanca.ts (BalancaLocalClient)
// -----------------------------------------------------------------------------
criarServidor("BALANCA", PORTA_BALANCA, {
  // Query: ?modelo=TOLEDO_PRIX_III|TOLEDO_PRIX_6|FILIZOLA_PLATINA|URANO_POP_S|GENERICO
  // Retorno: { peso(kg), estavel, unidade, modelo, bruto? }
  "GET /api/balanca/peso": async (_corpo, query) => {
    const modelo = query.modelo || process.env.BALANCA_MODELO || "TOLEDO_PRIX_III";
    const leitura = await adaptadores.balanca.lerPeso(modelo);
    log("BALANCA", `Peso ${leitura.peso.toFixed(3)} kg (${leitura.estavel ? "estável" : "instável"}) modelo=${modelo}`);
    return leitura;
  },

  "POST /api/balanca/zerar": async (corpo) => {
    const modelo = corpo.modelo || process.env.BALANCA_MODELO || "TOLEDO_PRIX_III";
    log("BALANCA", `Zerar balança modelo=${modelo}`);
    return adaptadores.balanca.zerar(modelo);
  },

  "POST /api/balanca/tara": async (corpo) => {
    const modelo = corpo.modelo || process.env.BALANCA_MODELO || "TOLEDO_PRIX_III";
    log("BALANCA", `Tara ${corpo.peso ?? 0} kg modelo=${modelo}`);
    return adaptadores.balanca.tara(corpo.peso ?? 0, modelo);
  },
});

log("AGENTE", `Agente PDV iniciado em modo ${MODO.toUpperCase()} (Ctrl+C para encerrar)`);

process.on("SIGINT", () => {
  log("AGENTE", "Encerrando agente PDV...");
  process.exit(0);
});
process.on("SIGTERM", () => {
  log("AGENTE", "Encerrando agente PDV...");
  process.exit(0);
});
