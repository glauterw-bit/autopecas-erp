"use strict";

// =============================================================================
// ADAPTADOR REAL — Impressora térmica ESC/POS
// =============================================================================
// Implementação REAL. Recebe o buffer ESC/POS pronto (gerado por
// src/lib/pdv/impressora.ts) e o entrega à impressora por um destes caminhos,
// nesta ordem de prioridade:
//
// 1. REDE (RAW/JetDirect, porta TCP 9100) — se IMPRESSORA_IP estiver definido.
//    Praticamente toda térmica de rede (Epson TM-T20X, Elgin i9 rede,
//    Bematech 4200 TH ethernet) aceita bytes crus na porta 9100: abre-se um
//    socket TCP, escreve-se o buffer e fecha-se a conexão. Sem driver.
//
// 2. USB direto no Linux — escreve o buffer no device file da classe
//    usblp (ex.: /dev/usb/lp0). Requer permissão de escrita (adicionar o
//    usuário ao grupo `lp`: usermod -aG lp usuario).
//
// 3. Compartilhamento no Windows — a impressora USB é compartilhada
//    (ex.: \\localhost\CUPOM) e o buffer é copiado em modo binário com
//    `copy /b arquivo \\localhost\CUPOM` — equivalente ao clássico
//    "print to LPT1". Configurar IMPRESSORA_COMPARTILHAMENTO.
//
// Variáveis de ambiente:
//   IMPRESSORA_IP               — ex.: 192.168.0.50 (ativa o modo rede)
//   IMPRESSORA_PORTA            — default 9100
//   IMPRESSORA_DISPOSITIVO      — default /dev/usb/lp0 (Linux)
//   IMPRESSORA_COMPARTILHAMENTO — ex.: \\localhost\CUPOM (Windows)
// =============================================================================

const net = require("net");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const IMPRESSORA_IP = process.env.IMPRESSORA_IP || "";
const IMPRESSORA_PORTA = Number(process.env.IMPRESSORA_PORTA) || 9100;
const IMPRESSORA_DISPOSITIVO = process.env.IMPRESSORA_DISPOSITIVO || "/dev/usb/lp0";
const IMPRESSORA_COMPARTILHAMENTO = process.env.IMPRESSORA_COMPARTILHAMENTO || "";
const TIMEOUT_MS = 10000;

// --- 1. Rede: TCP 9100 (RAW) -------------------------------------------------
function imprimirViaRede(buffer) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let finalizado = false;

    const falhar = (msg) => {
      if (finalizado) return;
      finalizado = true;
      socket.destroy();
      reject(new Error(msg));
    };

    socket.setTimeout(TIMEOUT_MS, () =>
      falhar(`Timeout ao conectar/enviar para ${IMPRESSORA_IP}:${IMPRESSORA_PORTA}`),
    );
    socket.on("error", (err) =>
      falhar(`Erro na impressora de rede ${IMPRESSORA_IP}:${IMPRESSORA_PORTA}: ${err.message}`),
    );

    socket.connect(IMPRESSORA_PORTA, IMPRESSORA_IP, () => {
      socket.end(buffer, () => {
        if (finalizado) return;
        finalizado = true;
        resolve({ sucesso: true, via: "rede", destino: `${IMPRESSORA_IP}:${IMPRESSORA_PORTA}`, bytes: buffer.length });
      });
    });
  });
}

// --- 2. USB no Linux: /dev/usb/lp0 -------------------------------------------
function imprimirViaDeviceFile(buffer) {
  return new Promise((resolve, reject) => {
    fs.writeFile(IMPRESSORA_DISPOSITIVO, buffer, (err) => {
      if (err) {
        reject(
          new Error(
            `Falha ao escrever em ${IMPRESSORA_DISPOSITIVO}: ${err.message}. ` +
              `Verifique se a impressora está conectada e se o usuário tem permissão (grupo 'lp').`,
          ),
        );
      } else {
        resolve({ sucesso: true, via: "usb", destino: IMPRESSORA_DISPOSITIVO, bytes: buffer.length });
      }
    });
  });
}

// --- 3. Compartilhamento no Windows: copy /b ---------------------------------
function imprimirViaCompartilhamento(buffer) {
  return new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), `cupom-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
    fs.writeFile(tmp, buffer, (errEscrita) => {
      if (errEscrita) return reject(new Error(`Falha ao gravar spool temporário: ${errEscrita.message}`));
      // copy /b (binário) para o compartilhamento — não passa pelo driver GDI
      execFile("cmd.exe", ["/c", "copy", "/b", tmp, IMPRESSORA_COMPARTILHAMENTO], (errCopia) => {
        fs.unlink(tmp, () => {});
        if (errCopia) {
          reject(new Error(`Falha no copy /b para ${IMPRESSORA_COMPARTILHAMENTO}: ${errCopia.message}`));
        } else {
          resolve({ sucesso: true, via: "compartilhamento", destino: IMPRESSORA_COMPARTILHAMENTO, bytes: buffer.length });
        }
      });
    });
  });
}

module.exports = {
  async imprimir(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new Error("Buffer ESC/POS vazio");
    }

    // 1. Rede TCP 9100
    if (IMPRESSORA_IP) return imprimirViaRede(buffer);

    // 2. USB Linux (/dev/usb/lp0)
    if (process.platform !== "win32" && fs.existsSync(IMPRESSORA_DISPOSITIVO)) {
      return imprimirViaDeviceFile(buffer);
    }

    // 3. Compartilhamento Windows (copy /b)
    if (process.platform === "win32" && IMPRESSORA_COMPARTILHAMENTO) {
      return imprimirViaCompartilhamento(buffer);
    }

    throw new Error(
      "Nenhuma impressora configurada. Defina IMPRESSORA_IP (rede TCP 9100), " +
        "conecte a USB em " + IMPRESSORA_DISPOSITIVO + " (Linux), " +
        "ou defina IMPRESSORA_COMPARTILHAMENTO (Windows, ex.: \\\\localhost\\CUPOM).",
    );
  },
};
