import { NextResponse } from "next/server";
import { comAuth } from "@/lib/auth/guard";
import { lerCsv } from "@/lib/implantacao/csv";
import { aplicarMapa, camposObrigatoriosFaltando, sugerirMapa } from "@/lib/implantacao/mapa";
import { validar } from "@/lib/implantacao/validar";
import { conferirOrigem } from "@/lib/implantacao/conferencia";
import { CAMPOS } from "@/lib/implantacao/tipos";
import { mascararDoc } from "@/lib/implantacao/normalizar";
import { corpoBase } from "../esquema";

// Prévia da importação: lê o CSV, sugere (ou aplica) o mapa de colunas e valida
// linha a linha. Não consulta nem grava o banco.
export const POST = comAuth("ADMIN", async (req) => {
  const body = corpoBase.parse(await req.json());
  const csv = lerCsv(body.csv);
  const sugerido = sugerirMapa(body.entidade, csv.cabecalhos);
  const mapa = body.mapa ? { ...sugerido, ...body.mapa } : sugerido;
  const faltando = camposObrigatoriosFaltando(body.entidade, mapa);

  let amostra: unknown[] = [];
  let conferencia = null;
  let erros: { linha: number; mensagem: string }[] = [];
  if (faltando.length === 0) {
    const regs = validar(body.entidade, aplicarMapa(body.entidade, csv, mapa));
    conferencia = conferirOrigem(body.entidade, regs);
    amostra = regs.slice(0, 20).map((r) => ({
      linha: r.linha,
      // documento mascarado mesmo para o admin: a prévia é para conferir colunas
      dados: r.dados ? JSON.parse(JSON.stringify(r.dados, (k, v) => (/cpfCnpj|cnpjCpf/i.test(k) ? mascararDoc(v) : v))) : null,
      erros: r.erros,
      avisos: r.avisos,
    }));
    erros = regs.flatMap((r) => r.erros.map((m) => ({ linha: r.linha, mensagem: m }))).slice(0, 200);
  }

  return NextResponse.json({
    cabecalhos: csv.cabecalhos,
    separador: csv.separador,
    totalLinhas: csv.linhas.length,
    campos: CAMPOS[body.entidade],
    mapa,
    faltando,
    amostra,
    erros,
    conferencia,
  });
});
