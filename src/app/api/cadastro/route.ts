import { NextRequest, NextResponse } from "next/server";
import { criarSessao } from "@/lib/auth/config";
import { ipDoCliente } from "@/lib/auth/ip";
import { permitidoAsync } from "@/lib/auth/rate-limit";
import { prisma } from "@/lib/db";
import { TERMOS_VERSAO } from "@/lib/legal/versao";
import { celularSemPais, validarCadastro } from "@/lib/empresas/cadastro";
import { criarEmpresaComAdmin, ErroCadastro } from "@/lib/empresas/criar-empresa";

// Cadastro self-service de uma loja nova (rota pública, de propósito).
// Proteções: limite por IP e por e-mail, honeypot, CNPJ e e-mail únicos,
// aceite dos termos gravado com versão, data e IP.
const HORA = 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const ip = ipDoCliente(req);
  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    return NextResponse.json({ erro: "Dados inválidos." }, { status: 400 });
  }

  // Honeypot: responde como se tivesse dado certo e não cria nada.
  if (typeof (bruto as { website?: unknown })?.website === "string" && (bruto as { website: string }).website.trim() !== "") {
    return NextResponse.json({ ok: true, destino: "/onboarding" });
  }

  const okIp = await permitidoAsync(`cadastro:ip:${ip}`, 5, HORA);
  if (!okIp) {
    return NextResponse.json({ erro: "Muitas tentativas. Tente de novo em uma hora." }, { status: 429 });
  }

  const v = validarCadastro(bruto);
  if (!v.ok) return NextResponse.json({ erro: v.erro }, { status: 400 });
  const d = v.dados;

  const okEmail = await permitidoAsync(`cadastro:email:${d.email}`, 3, HORA);
  if (!okEmail) {
    return NextResponse.json({ erro: "Muitas tentativas com este e-mail. Tente de novo em uma hora." }, { status: 429 });
  }

  try {
    const { usuario } = await criarEmpresaComAdmin(prisma, {
      razaoSocial: d.razaoSocial,
      cnpj: d.cnpj,
      telefone: celularSemPais(d.celular),
      adminNome: d.nome,
      adminEmail: d.email,
      adminSenha: d.senha,
      assinatura: { tipo: "TRIAL" },
      aceite: { versao: TERMOS_VERSAO, ip, userAgent: req.headers.get("user-agent") },
    });
    await criarSessao(usuario.id, ip, req.headers.get("user-agent") ?? "");
    return NextResponse.json({ ok: true, destino: "/onboarding" }, { status: 201 });
  } catch (e) {
    if (e instanceof ErroCadastro) {
      if (e.codigo === "CNPJ_DUPLICADO") {
        return NextResponse.json(
          { erro: "Esta empresa já tem cadastro. Peça um convite ao administrador da loja ou entre com a sua conta." },
          { status: 409 },
        );
      }
      if (e.codigo === "EMAIL_DUPLICADO") {
        return NextResponse.json(
          { erro: "Não foi possível usar este e-mail. Se você já tem conta, entre ou use “esqueci a senha”." },
          { status: 409 },
        );
      }
    }
    console.error("[cadastro]", (e as Error).message);
    return NextResponse.json({ erro: "Não foi possível concluir o cadastro agora. Tente de novo." }, { status: 500 });
  }
}
