"use strict";

// =============================================================================
// ADAPTADOR REAL — SAT-CF-e (modelo 59) via DLL do fabricante
// =============================================================================
// ESQUELETO DOCUMENTADO. Todo equipamento SAT (Dimep, Bematech/Elgin, Sweda,
// Tanca, Kryptus...) é acompanhado de uma biblioteca nativa padronizada pela
// SEFAZ-SP (Especificação de Requisitos do SAT, ER 2.x) com assinaturas
// idênticas entre fabricantes:
//
//   dhsat.dll / libsat.so — funções relevantes:
//
//   EnviarDadosVenda(numeroSessao, codigoDeAtivacao, dadosVenda)
//     → dadosVenda = XML do CF-e SEM assinatura (layout CFe ER 2.x).
//     → retorno: "numeroSessao|EEEEE|CCCC|mensagem|cod|msgSEFAZ|base64(XML
//       assinado)|timeStamp|chaveConsulta|valorTotalCFe|CPFCNPJValue|assinaturaQRCODE"
//       (campos separados por pipe). EEEEE=06000 → emitido.
//
//   ConsultarSAT(numeroSessao)
//     → "numeroSessao|EEEEE|mensagem|..." — usado no /api/sat/consultar.
//
//   ConsultarStatusOperacional(numeroSessao, codigoDeAtivacao)
//     → devolve nº de série, versão, status da rede etc.
//
//   CancelarUltimaVenda(numeroSessao, codigoDeAtivacao, chave, dadosCancelamento)
//     → só funciona dentro de 30 minutos da emissão (regra da SEFAZ).
//
// Pontos de integração:
//   1. Carregar a DLL via FFI (`koffi`): as funções recebem/retornam char*.
//   2. Montar o XML do CF-e a partir do InputCfeSat (src/lib/pdv/sat.ts):
//      <CFe><infCFe versaoDadosEnt="0.08"><ide><CNPJ>swHouse</CNPJ>
//      <signAC>assinatura do vínculo sw house + lojista</signAC>...
//      — o SAT completa série, número, data e assina o XML.
//   3. numeroSessao: inteiro aleatório de 6 dígitos, único por chamada.
//   4. Parsear o retorno pipe-separado e mapear para RetornoCfeSat:
//      { status EMITIDO|REJEITADO, chave, xml (base64 → string), mensagem, qrCode }
//      qrCode = chave|timeStamp|valorTotal|CPF/CNPJ|assinaturaQRCODE.
//
// Variáveis de ambiente esperadas em produção:
//   SAT_CODIGO_ATIVACAO — código de ativação configurado no equipamento
//   SAT_SIGN_AC         — assinatura AC (vínculo software house ↔ lojista)
//   SAT_DLL             — caminho da DLL/so do fabricante (ex.: C:\\SAT\\dhsat.dll)
// =============================================================================

const SAT_CODIGO_ATIVACAO = process.env.SAT_CODIGO_ATIVACAO || "";
const SAT_DLL = process.env.SAT_DLL || "";

function naoImplementado(operacao) {
  return new Error(
    `SAT real ainda não implementado (${operacao}). ` +
      `Instale a DLL do fabricante e complete os TODOs em adaptadores/sat.js. ` +
      `Config atual: SAT_DLL=${SAT_DLL || "(não definido)"} codigoAtivacao=${SAT_CODIGO_ATIVACAO ? "definido" : "(não definido)"}`,
  );
}

module.exports = {
  // Deve retornar RetornoCfeSat: { status, chave, xml, mensagem, qrCode }
  async enviarCfe(input) {
    // TODO(1): carregar DLL: const lib = koffi.load(SAT_DLL);
    //          const EnviarDadosVenda = lib.func("const char* EnviarDadosVenda(int, const char*, const char*)");
    // TODO(2): montar XML CF-e (layout ER 2.x) a partir de `input`
    //          (itens com NCM/CFOP/CST, pagamento com código WA03, signAC).
    // TODO(3): const ret = EnviarDadosVenda(numeroSessao, SAT_CODIGO_ATIVACAO, xml);
    // TODO(4): split("|"): [sessao, EEEEE, CCCC, msg, cod, msgSefaz, xmlB64,
    //          timeStamp, chave, valorTotal, cpfCnpj, assinaturaQr]
    //          → status = EEEEE === "06000" ? "EMITIDO" : "REJEITADO"
    //          → qrCode = `${chave}|${timeStamp}|${valorTotal}|${cpfCnpj}|${assinaturaQr}`
    throw naoImplementado(`enviarCfe (${input.itens?.length ?? 0} itens)`);
  },

  // Deve retornar { ativo, numeroSessao, modelo }
  async consultar() {
    // TODO: ConsultarSAT(numeroSessao) — EEEEE 08000 = SAT em operação.
    //       Complementar com ConsultarStatusOperacional p/ modelo/nº de série.
    throw naoImplementado("consultar");
  },

  // Deve retornar { cancelado: boolean }
  async cancelar(chave) {
    // TODO: CancelarUltimaVenda(numeroSessao, SAT_CODIGO_ATIVACAO, chave,
    //       xmlCancelamento) — válido só até 30 min após a emissão.
    throw naoImplementado(`cancelar ${chave}`);
  },
};
