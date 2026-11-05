// Envio de e-mail opcional. Só usa o serviço Resend (API HTTP) se RESEND_API_KEY
// e EMAIL_FROM estiverem definidos. Sem isso, nada é enviado e o administrador
// gera o link na tela de usuários.
export function emailConfigurado(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}

export async function enviarEmail(para: string, assunto: string, texto: string): Promise<boolean> {
  if (!emailConfigurado()) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [para], subject: assunto, text: texto }),
      signal: AbortSignal.timeout(8000),
    });
    return r.ok;
  } catch {
    return false;
  }
}
