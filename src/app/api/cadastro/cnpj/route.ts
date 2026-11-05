import { NextRequest, NextResponse } from "next/server";
import { ipDoCliente } from "@/lib/auth/ip";
import { permitidoAsync } from "@/lib/auth/rate-limit";
import { cnpjValido, limparCnpj } from "@/lib/validacao/cnpj";

// Preenche o cadastro a partir da consulta pública e gratuita de CNPJ
// (BrasilAPI, que lê os dados abertos da Receita Federal). Só ajuda: se a
// consulta falhar, o cadastro segue com o preenchimento à mão. Rota pública
// (a pessoa ainda não tem conta), com limite por IP.
export async function GET(req: NextRequest) {
  const cnpj = limparCnpj(req.nextUrl.searchParams.get("cnpj") ?? "");
  if (!cnpjValido(cnpj)) return NextResponse.json({ erro: "CNPJ inválido." }, { status: 400 });
  if (!(await permitidoAsync(`cadastro:cnpj:${ipDoCliente(req)}`, 20, 10 * 60 * 1000))) {
    return NextResponse.json({ erro: "Muitas consultas. Preencha à mão." }, { status: 429 });
  }
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      signal: AbortSignal.timeout(4000),
      headers: { accept: "application/json" },
    });
    if (!r.ok) return NextResponse.json({ encontrado: false });
    const j = (await r.json()) as Record<string, unknown>;
    return NextResponse.json({
      encontrado: true,
      razaoSocial: typeof j.razao_social === "string" ? j.razao_social : null,
      nomeFantasia: typeof j.nome_fantasia === "string" && j.nome_fantasia ? j.nome_fantasia : null,
      uf: typeof j.uf === "string" ? j.uf : null,
    });
  } catch {
    return NextResponse.json({ encontrado: false });
  }
}
