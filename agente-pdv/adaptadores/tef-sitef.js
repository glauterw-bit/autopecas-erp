"use strict";

// =============================================================================
// ADAPTADOR REAL — TEF via CliSiTef (Software Express)
// =============================================================================
// ESQUELETO DOCUMENTADO. A integração de produção com o SiTef é feita pela
// biblioteca CliSiTef, distribuída pela Software Express para o lojista
// credenciado. Há dois caminhos:
//
// (A) DLL/so nativa (CliSiTef32I.dll / CliSiTef64I.dll no Windows,
//     libclisitef.so no Linux), carregada via FFI (pacote `koffi` ou
//     `ffi-napi`). Fluxo de chamadas:
//
//     1. ConfiguraIntSiTefInterativoEx(enderecoIP, codigoLoja, numeroTerminal,
//        reservado, parametrosAdicionais)
//        → 0 = sucesso. IP/loja/terminal vêm do credenciamento SiTef.
//
//     2. IniciaFuncaoSiTefInterativo(funcao, valor, cupomFiscal, dataFiscal,
//        horaFiscal, operador, paramAdic)
//        → funcao: 0=genérica(menu), 2=débito, 3=crédito, 122=Pix
//        → valor em string "150,00"; cupomFiscal = nosso `documento`.
//
//     3. Loop: ContinuaFuncaoSiTefInterativo(&comando, &tipoCampo, &tamMin,
//        &tamMax, buffer, tamBuffer, continua)
//        → a CliSiTef "conversa" por comandos: 21=exibir menu, 30=pedir campo,
//          etc. Aqui o agente responde automaticamente (parcelas, financiamento)
//          e coleta os campos de saída por tipoCampo:
//            105 = modalidade / bandeira
//            133 = NSU SiTef
//            134 = NSU host / autorização
//            121 = 1ª via do comprovante (estabelecimento)
//            122 = 2ª via do comprovante (cliente)
//            158/159 = bin / últimos dígitos do cartão
//        → loop termina quando retorno = 0 (aprovada) ou negativo (negada).
//
//     4. FinalizaFuncaoSiTefInterativo(confirma, cupomFiscal, dataFiscal,
//        horaFiscal, paramAdic)
//        → confirma=1 confirma a transação; confirma=0 desfaz.
//        → É isso que o endpoint /api/tef/confirmar dispara. Sem confirmar,
//          o SiTef DESFAZ a transação automaticamente (timeout).
//
// (B) Socket direto com o servidor SiTef da loja (porta 4096) usando o
//     protocolo de mensagens da Software Express — só recomendado se a DLL
//     não estiver disponível para a plataforma.
//
// Variáveis de ambiente esperadas em produção:
//   SITEF_IP        — IP do servidor SiTef na loja (ex.: 192.168.0.10)
//   SITEF_LOJA      — código da loja no credenciamento (8 dígitos)
//   SITEF_TERMINAL  — número do terminal PDV (ex.: PD000001)
// =============================================================================

const SITEF_IP = process.env.SITEF_IP || "127.0.0.1";
const SITEF_LOJA = process.env.SITEF_LOJA || "00000000";
const SITEF_TERMINAL = process.env.SITEF_TERMINAL || "PD000001";

function naoImplementado(operacao) {
  return new Error(
    `TEF real ainda não implementado (${operacao}). ` +
      `Instale a CliSiTef da Software Express e complete os TODOs em adaptadores/tef-sitef.js. ` +
      `Config atual: SITEF_IP=${SITEF_IP} SITEF_LOJA=${SITEF_LOJA} SITEF_TERMINAL=${SITEF_TERMINAL}`,
  );
}

module.exports = {
  // Deve retornar o contrato RetornoTransacaoTef (src/lib/pdv/tef.ts):
  // { autorizado, nsu, autorizacao, bandeira, bin, ultimosDigitos, parcelas,
  //   comprovanteCliente, comprovanteEstabelecimento, mensagem }
  async venda(corpo) {
    // TODO(1): carregar a CliSiTef via koffi:
    //   const koffi = require("koffi");
    //   const lib = koffi.load(process.platform === "win32" ? "CliSiTef64I.dll" : "libclisitef.so");
    //   const Configura = lib.func("int ConfiguraIntSiTefInterativoEx(const char*, const char*, const char*, int, const char*)");
    // TODO(2): ConfiguraIntSiTefInterativoEx(SITEF_IP, SITEF_LOJA, SITEF_TERMINAL, 0, "")
    // TODO(3): IniciaFuncaoSiTefInterativo(corpo.forma === "DEBITO" ? 2 : 3,
    //          (corpo.valor/100).toFixed(2).replace(".", ","), corpo.documento, dd/mm/aaaa, hh:mm:ss, "CAIXA", "")
    // TODO(4): loop ContinuaFuncaoSiTefInterativo coletando tipoCampo
    //          105/133/134/121/122/158/159 e respondendo parcelas/financiamento
    // TODO(5): mapear para RetornoTransacaoTef e guardar o NSU pendente para
    //          confirmar()/cancelamento()
    throw naoImplementado(`venda ${corpo.forma}`);
  },

  // Deve retornar { ok: boolean }
  async cancelamento(nsu) {
    // TODO: IniciaFuncaoSiTefInterativo(funcao=200 — cancelamento de transação),
    //       informando o NSU original quando a CliSiTef pedir (tipoCampo 133).
    throw naoImplementado(`cancelamento NSU ${nsu}`);
  },

  async confirmar(nsu) {
    // TODO: FinalizaFuncaoSiTefInterativo(1, cupom, data, hora, "") para o NSU
    //       pendente. Sem essa chamada o SiTef desfaz a venda por timeout.
    throw naoImplementado(`confirmar NSU ${nsu}`);
  },

  // Pix pelo PinPad: mesmo fluxo com funcao=122; o QR aparece no display do
  // PinPad. Se a CliSiTef devolver o copia-e-cola (tipoCampo específico da
  // versão), incluir como campo extra `qrCode` na resposta.
  async pix(corpo) {
    // TODO: IniciaFuncaoSiTefInterativo(122, valor, documento, ...) + loop.
    throw naoImplementado(`pix R$ ${(corpo.valor / 100).toFixed(2)}`);
  },
};
