import axios from "axios";

// WhatsApp Business Cloud API
// ===========================
// Envio outbound de mensagens (texto, template, mídia) via Graph API da Meta.
// Webhook inbound já está em /api/ia/whatsapp/route.ts.

const GRAPH_BASE = "https://graph.facebook.com/v20.0";

interface MensagemTexto {
  para: string; // E.164 sem '+', ex: 5511999998888
  texto: string;
}

interface MensagemTemplate {
  para: string;
  template: string;
  idioma?: string; // pt_BR
  variaveis?: string[];
}

export async function enviarTexto({ para, texto }: MensagemTexto) {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;
  if (!phoneId || !token) throw new Error("WhatsApp não configurado");
  await axios.post(
    `${GRAPH_BASE}/${phoneId}/messages`,
    {
      messaging_product: "whatsapp",
      to: para,
      type: "text",
      text: { body: texto, preview_url: false },
    },
    { headers: { Authorization: `Bearer ${token}` } },
  );
}

export async function enviarTemplate({
  para,
  template,
  idioma = "pt_BR",
  variaveis = [],
}: MensagemTemplate) {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;
  if (!phoneId || !token) throw new Error("WhatsApp não configurado");
  await axios.post(
    `${GRAPH_BASE}/${phoneId}/messages`,
    {
      messaging_product: "whatsapp",
      to: para,
      type: "template",
      template: {
        name: template,
        language: { code: idioma },
        components:
          variaveis.length === 0
            ? []
            : [
                {
                  type: "body",
                  parameters: variaveis.map((v) => ({ type: "text", text: v })),
                },
              ],
      },
    },
    { headers: { Authorization: `Bearer ${token}` } },
  );
}

export async function enviarImagem({
  para,
  url,
  legenda,
}: {
  para: string;
  url: string;
  legenda?: string;
}) {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;
  if (!phoneId || !token) throw new Error("WhatsApp não configurado");
  await axios.post(
    `${GRAPH_BASE}/${phoneId}/messages`,
    {
      messaging_product: "whatsapp",
      to: para,
      type: "image",
      image: { link: url, caption: legenda },
    },
    { headers: { Authorization: `Bearer ${token}` } },
  );
}
