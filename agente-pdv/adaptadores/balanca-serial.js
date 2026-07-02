"use strict";

// =============================================================================
// ADAPTADOR REAL — Balança via porta serial (RS-232 / USB-serial)
// =============================================================================
// Implementação REAL usando o pacote `serialport` (optionalDependency — se o
// build nativo falhar na máquina, o npm install não quebra; este módulo então
// lança erro explicando como instalar).
//
// Protocolo principal suportado: TOLEDO PRIX III / 9091 (o mais comum em
// checkout no Brasil). Sequência de bytes:
//
//   PDV → balança:  ENQ (0x05)                    — "envie o peso"
//   balança → PDV:  STX (0x02) + 5 bytes ASCII do peso em GRAMAS
//                   + ETX (0x03) [+ CR (0x0D)]
//     Ex.: 02 30 31 32 33 34 03 0D  →  "01234" = 1.234 g = 1,234 kg (estável)
//     Se o primeiro byte após STX for "I" (0x49), a leitura está INSTÁVEL.
//     "N" indica peso negativo; "S" sobrecarga.
//
// Outros protocolos (parser incluído, comando de solicitação varia):
//   FILIZOLA_PLATINA — enviar 0x02 'P' 0x03; resposta STX "+00.000kg" ETX BCC
//   URANO_POP_S      — enviar "PESO\r";       resposta "$1234.56\r" (kg)
//   TOLEDO_PRIX_6    — frame binário proprietário (AA 55 00) — TODO
//
// Config serial padrão Toledo: 9600 baud, 8 bits de dado, paridade nenhuma,
// 1 stop bit (9600-8N1). Filizola usa 4800-8N1 em modelos antigos.
//
// Variáveis de ambiente:
//   BALANCA_PORTA  — ex.: /dev/ttyUSB0 (Linux) ou COM3 (Windows). Default /dev/ttyUSB0
//   BALANCA_BAUD   — default 9600
//   BALANCA_MODELO — default TOLEDO_PRIX_III
// =============================================================================

const PORTA = process.env.BALANCA_PORTA || (process.platform === "win32" ? "COM3" : "/dev/ttyUSB0");
const BAUD = Number(process.env.BALANCA_BAUD) || 9600;
const TIMEOUT_MS = 1500;

const ENQ = Buffer.from([0x05]);
const STX = 0x02;
const ETX = 0x03;

let SerialPort = null;
try {
  ({ SerialPort } = require("serialport"));
} catch {
  // serialport é optionalDependency; erro tratado ao usar
}

let porta = null; // instância única, aberta sob demanda

async function abrirPorta() {
  if (!SerialPort) {
    throw new Error(
      "Pacote 'serialport' não instalado (optionalDependency falhou no build). " +
        "Rode: npm install serialport --save-optional (requer toolchain de build nativo).",
    );
  }
  if (porta && porta.isOpen) return porta;
  porta = new SerialPort({
    path: PORTA,
    baudRate: BAUD,
    dataBits: 8,
    parity: "none",
    stopBits: 1,
    autoOpen: false,
  });
  await new Promise((resolve, reject) => {
    porta.open((err) => (err ? reject(new Error(`Falha ao abrir ${PORTA}: ${err.message}`)) : resolve()));
  });
  return porta;
}

// Envia `comando` e acumula bytes até encontrar `fim` (byte terminador) ou estourar o timeout.
function transacaoSerial(sp, comando, fim) {
  return new Promise((resolve, reject) => {
    const pedacos = [];
    let timer = null;

    const limpar = () => {
      clearTimeout(timer);
      sp.removeListener("data", aoReceber);
    };

    const aoReceber = (chunk) => {
      pedacos.push(chunk);
      const tudo = Buffer.concat(pedacos);
      if (tudo.includes(fim)) {
        limpar();
        resolve(tudo);
      }
    };

    timer = setTimeout(() => {
      limpar();
      const tudo = Buffer.concat(pedacos);
      if (tudo.length > 0) resolve(tudo); // alguns modelos não mandam terminador
      else reject(new Error(`Balança não respondeu em ${TIMEOUT_MS}ms (porta ${PORTA})`));
    }, TIMEOUT_MS);

    sp.on("data", aoReceber);
    sp.write(comando, (err) => {
      if (err) {
        limpar();
        reject(new Error(`Falha ao escrever na serial: ${err.message}`));
      }
    });
  });
}

// --- Parsers (espelham src/lib/pdv/balanca.ts) ------------------------------

function parseToledoPrix3(buffer, modelo) {
  const s = buffer.toString("ascii");
  const i = s.indexOf("\x02");
  const f = s.indexOf("\x03");
  if (i < 0 || f < 0) throw new Error(`Frame Toledo inválido: ${JSON.stringify(s)}`);
  const corpo = s.slice(i + 1, f);
  const instavel = corpo.startsWith("I");
  if (corpo.startsWith("S")) throw new Error("Balança em sobrecarga");
  const gramas = Number(corpo.replace(/[^0-9.]/g, "")) || 0;
  return { peso: gramas / 1000, estavel: !instavel, unidade: "kg", modelo, bruto: s };
}

function parseFilizolaPlatina(buffer, modelo) {
  const s = buffer.toString("ascii");
  const i = s.indexOf("\x02");
  const f = s.indexOf("\x03");
  if (i < 0 || f < 0) throw new Error(`Frame Filizola inválido: ${JSON.stringify(s)}`);
  const m = s.slice(i + 1, f).match(/([+-]?\d+\.\d+)\s*(kg|g)?/i);
  if (!m) throw new Error("Não foi possível ler peso Filizola");
  const peso = Number(m[1]);
  return {
    peso: m[2]?.toLowerCase() === "g" ? peso / 1000 : peso,
    estavel: true,
    unidade: "kg",
    modelo,
    bruto: s,
  };
}

function parseUranoPopS(buffer, modelo) {
  const s = buffer.toString("ascii").trim();
  if (!s.startsWith("$")) throw new Error(`Frame Urano inválido: ${JSON.stringify(s)}`);
  const peso = Number(s.slice(1));
  return { peso: Number.isNaN(peso) ? 0 : peso, estavel: true, unidade: "kg", modelo, bruto: s };
}

module.exports = {
  // Deve retornar LeituraBalanca: { peso(kg), estavel, unidade, modelo, bruto }
  async lerPeso(modelo = "TOLEDO_PRIX_III") {
    const sp = await abrirPorta();

    switch (modelo) {
      case "TOLEDO_PRIX_III":
      case "GENERICO": {
        // ENQ (0x05) → STX peso(5 ASCII, gramas) ETX CR
        const resposta = await transacaoSerial(sp, ENQ, ETX);
        return parseToledoPrix3(resposta, modelo);
      }
      case "FILIZOLA_PLATINA": {
        // STX 'P' ETX → STX "+00.000kg" ETX BCC
        const resposta = await transacaoSerial(sp, Buffer.from([STX, 0x50, ETX]), ETX);
        return parseFilizolaPlatina(resposta, modelo);
      }
      case "URANO_POP_S": {
        // "PESO\r" → "$1234.56\r"
        const resposta = await transacaoSerial(sp, Buffer.from("PESO\r", "ascii"), 0x0d);
        return parseUranoPopS(resposta, modelo);
      }
      case "TOLEDO_PRIX_6":
        // TODO: frame binário proprietário — enviar AA 55 00 e decodificar o
        //       frame de resposta (ver manual "Protocolo de Comunicação Prix 6").
        throw new Error("Protocolo TOLEDO_PRIX_6 ainda não implementado no agente");
      default:
        throw new Error(`Modelo de balança desconhecido: ${modelo}`);
    }
  },

  async zerar(modelo = "TOLEDO_PRIX_III") {
    // Toledo Prix: comando de zero remoto não é suportado em todos os
    // firmwares; quando suportado é a sequência 0x02 'Z' 0x03.
    const sp = await abrirPorta();
    await new Promise((resolve, reject) =>
      sp.write(Buffer.from([STX, 0x5a, ETX]), (err) => (err ? reject(err) : resolve())),
    );
    return { ok: true, modelo };
  },

  async tara(peso, modelo = "TOLEDO_PRIX_III") {
    // Tara via comando remoto não é padronizada entre fabricantes — na Toledo
    // Prix III a tara é feita no teclado da balança. Mantemos a tara em
    // software: o ERP desconta o valor no cálculo do item.
    return { ok: true, taraKg: peso, modelo, observacao: "tara aplicada em software" };
  },
};
