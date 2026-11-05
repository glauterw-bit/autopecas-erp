import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { autenticarWebhookPix } from "@/lib/pagamentos/webhook-pix-auth";
import { baixarPixRecebido } from "@/lib/pagamentos/baixa-pix";
import { configPspDoAmbiente, PspPixClient } from "@/lib/pagamentos/psp-pix";

// Webhook Pix (callback dos PSPs no padrão BACEN — Manual de APIs Pix)
// ====================================================================
// O PSP chama este endpoint quando uma cobrança é liquidada:
//   POST body: { pix: [{ txid, valor, horario, endToEndId }] }
// A Efí acrescenta "/pix" ao fim da URL cadastrada; cadastre a URL com
// "?hmac=<segredo>&ignorar=" para o sufixo cair num parâmetro ignorado.
//
// Segurança (ver src/lib/pagamentos/webhook-pix-auth.ts): segredo por PSP em
// tempo constante + IPs do PSP + mTLS na borda (opcionais) e, com o PSP
// configurado, reconsulta GET /pix/{e2eid} antes da baixa — o valor que vale
// é o que o PSP confirma, nunca o do corpo.
//
// Baixa e idempotência: src/lib/pagamentos/baixa-pix.ts.
// Se nada casar, respondemos 200 {ignorado: true} — o PSP não deve reenviar
// eternamente um evento que não conseguimos vincular (fica na trilha).

const pixSchema = z.object({
  pix: z
    .array(
      z.object({
        txid: z.string().min(1).max(35),
        valor: z.union([z.string(), z.number()]),
        horario: z.string().optional(),
        endToEndId: z.string().max(64).optional(),
      }),
    )
    .min(1)
    .max(100),
});

const reais = (v: string | number) => Math.round(Number(v) * 100) / 100;

// Alguns PSPs validam a URL do webhook com um GET antes de ativar o callback.
export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const auth = autenticarWebhookPix({ query: req.nextUrl.searchParams, headers: req.headers });
  if (!auth.ok) {
    if (auth.status === 503) console.error("[webhook-pix] segredo não configurado — rejeitando");
    return NextResponse.json({ erro: auth.motivo }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "payload inválido" }, { status: 400 });
  }
  const parsed = pixSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ erro: "payload inválido" }, { status: 400 });
  }

  // Reconsulta no PSP (mTLS). Desligável só explicitamente (PIX_WEBHOOK_CONFIRMAR=0).
  const cfgPsp = process.env.PIX_WEBHOOK_CONFIRMAR === "0" ? null : configPspDoAmbiente();
  let psp: PspPixClient | null = null;
  if (cfgPsp) {
    try {
      psp = new PspPixClient(cfgPsp);
    } catch {
      console.error("[webhook-pix] PSP configurado sem certificado mTLS — não dá para confirmar");
      return NextResponse.json({ erro: "indisponível" }, { status: 503 });
    }
  }

  let processados = 0;
  let ignorados = 0;

  try {
    for (const p of parsed.data.pix) {
      let valor = reais(p.valor);
      let txid = p.txid;
      if (psp) {
        if (!p.endToEndId) {
          ignorados++;
          continue;
        }
        const confirmado = await psp.consultarPix(p.endToEndId);
        if (confirmado.txid && confirmado.txid !== p.txid) {
          console.warn(`[webhook-pix] txid divergente do PSP para e2e ${p.endToEndId.slice(0, 8)}…`);
          ignorados++;
          continue;
        }
        valor = reais(confirmado.valor);
        txid = confirmado.txid ?? p.txid;
      }
      if (!Number.isFinite(valor) || valor <= 0) {
        ignorados++;
        continue;
      }
      const resultado = await baixarPixRecebido({
        txid,
        valor,
        horario: p.horario,
        endToEndId: p.endToEndId,
      });
      if (resultado === "processado") {
        processados++;
      } else {
        console.warn(`[webhook-pix] txid sem vínculo aceito: ${txid} (R$ ${valor.toFixed(2)})`);
        ignorados++;
      }
    }
  } catch (e) {
    // Sem stack para fora; o PSP reenvia (idempotente) e o log fica curto.
    console.error("[webhook-pix] falha ao processar:", (e as Error).message?.slice(0, 200));
    return NextResponse.json({ erro: "falha temporária" }, { status: 500 });
  }

  if (processados === 0) {
    return NextResponse.json({ ignorado: true });
  }
  return NextResponse.json({ ok: true, processados, ignorados });
}
