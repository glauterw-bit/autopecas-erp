// Parser OFX 2.x (Open Financial Exchange)
// =========================================
// Formato padrão dos extratos bancários no Brasil (todos os bancos exportam).
// Estrutura: cabeçalho SGML + body XML com BANKMSGSRSV1 contendo STMTTRN
// (Statement Transaction) repetido para cada lançamento.
//
// Exemplo:
//   <STMTTRN>
//     <TRNTYPE>CREDIT</TRNTYPE>
//     <DTPOSTED>20260518100000[-3:BRT]</DTPOSTED>
//     <TRNAMT>1234.56</TRNAMT>
//     <FITID>2026051812345</FITID>
//     <MEMO>PIX RECEBIDO JOAO MECANICO</MEMO>
//   </STMTTRN>

export interface TransacaoOFX {
  tipo: "CREDIT" | "DEBIT" | "PIX" | "OTHER";
  data: Date;
  valor: number;
  fitid: string;       // identificador único do banco
  memo?: string;
  checkNum?: string;
  refNum?: string;
}

export interface ExtratoOFX {
  banco: string;
  agencia: string;
  conta: string;
  saldoInicial?: number;
  saldoFinal?: number;
  dataInicial?: Date;
  dataFinal?: Date;
  transacoes: TransacaoOFX[];
}

export function parseOFX(texto: string): ExtratoOFX {
  // Remove cabeçalho SGML (antes da primeira tag <OFX>)
  const idx = texto.indexOf("<OFX>");
  const body = idx >= 0 ? texto.slice(idx) : texto;

  const banco = pegar(body, "BANKID") ?? "";
  const agencia = pegar(body, "BRANCHID") ?? "";
  const conta = pegar(body, "ACCTID") ?? "";
  const saldoInicial = numero(pegar(body, "BALAMT", "AVAILBAL"));
  const saldoFinal = numero(pegar(body, "BALAMT", "LEDGERBAL"));
  const dataInicial = data(pegar(body, "DTSTART"));
  const dataFinal = data(pegar(body, "DTEND"));

  const transacoes: TransacaoOFX[] = [];
  const re = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const bloco = m[1];
    const tipo = (pegar(bloco, "TRNTYPE") ?? "OTHER").toUpperCase();
    const dt = data(pegar(bloco, "DTPOSTED"));
    const valor = numero(pegar(bloco, "TRNAMT"));
    const fitid = pegar(bloco, "FITID") ?? "";
    const memo = pegar(bloco, "MEMO");
    if (dt && valor !== undefined) {
      transacoes.push({
        tipo: tipo === "CREDIT" || tipo === "DEBIT" || tipo === "PIX" ? tipo : "OTHER",
        data: dt,
        valor,
        fitid,
        memo,
      });
    }
  }

  return { banco, agencia, conta, saldoInicial, saldoFinal, dataInicial, dataFinal, transacoes };
}

function pegar(s: string, ...tags: string[]): string | undefined {
  for (const tag of tags) {
    const m = s.match(new RegExp(`<${tag}>([^<\n\r]+)`, "i"));
    if (m) return m[1].trim();
  }
  return undefined;
}
function numero(s?: string): number | undefined {
  if (!s) return undefined;
  const n = Number(s.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}
function data(s?: string): Date | undefined {
  if (!s) return undefined;
  // OFX usa YYYYMMDDHHMMSS[zone]
  const m = s.match(/^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2}))?/);
  if (!m) return undefined;
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4] ?? 0),
    Number(m[5] ?? 0),
    Number(m[6] ?? 0),
  );
}
