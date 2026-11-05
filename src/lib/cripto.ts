import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Segredos em repouso (uso geral)
// ===============================
// AES-256-GCM com chave de 32 bytes em APP_ENCRYPTION_KEY (base64 ou hex).
// Gerar: `openssl rand -base64 32`.
// Formato gravado: "enc:v1:<iv>:<tag>:<cifrado>" (base64url). O IV é aleatório
// a cada gravação (12 bytes, recomendação do NIST SP 800-38D para GCM) e a tag
// de 16 bytes detecta chave errada ou dado adulterado.
//
// Leitura aceita o legado em texto aberto (sem o prefixo) para a migração ser
// gradual: quem lê decifra se estiver cifrado e devolve como está se não
// estiver. `scripts/cifrar-segredos.ts` cifra o que ficou para trás.
//
// Troca de chave: ponha a nova em APP_ENCRYPTION_KEY e a velha em
// APP_ENCRYPTION_KEY_ANTERIOR; a leitura tenta as duas e o script recifra.

const PREFIXO = "enc:v1:";

export class ErroCripto extends Error {}

type Env = Record<string, string | undefined>;

function chaveDe(valor: string | undefined, nome: string): Buffer | null {
  const v = (valor ?? "").trim();
  if (!v) return null;
  const buf = /^[0-9a-fA-F]{64}$/.test(v) ? Buffer.from(v, "hex") : Buffer.from(v, "base64");
  if (buf.length !== 32) {
    throw new ErroCripto(`${nome} precisa ter 32 bytes (gere com: openssl rand -base64 32).`);
  }
  return buf;
}

export function chaveAtual(env: Env = process.env): Buffer {
  const k = chaveDe(env.APP_ENCRYPTION_KEY, "APP_ENCRYPTION_KEY");
  if (!k) {
    throw new ErroCripto(
      "Falta a chave de cifra do servidor (APP_ENCRYPTION_KEY). Sem ela o sistema não grava senhas e tokens.",
    );
  }
  return k;
}

function chavesDeLeitura(env: Env): Buffer[] {
  const out: Buffer[] = [];
  const a = chaveDe(env.APP_ENCRYPTION_KEY, "APP_ENCRYPTION_KEY");
  const b = chaveDe(env.APP_ENCRYPTION_KEY_ANTERIOR, "APP_ENCRYPTION_KEY_ANTERIOR");
  if (a) out.push(a);
  if (b) out.push(b);
  return out;
}

export function estaCifrado(valor: string | null | undefined): boolean {
  return typeof valor === "string" && valor.startsWith(PREFIXO);
}

export function cifrar(texto: string, env: Env = process.env): string {
  const chave = chaveAtual(env);
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave, iv);
  const ct = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return `${PREFIXO}${iv.toString("base64url")}:${tag.toString("base64url")}:${ct.toString("base64url")}`;
}

/** Cifra se ainda não estiver cifrado; vazio/nulo passa direto. */
export function cifrarSeTexto<T extends string | null | undefined>(valor: T, env: Env = process.env): T {
  if (valor === null || valor === undefined || valor === "" || estaCifrado(valor)) return valor;
  return cifrar(valor, env) as T;
}

/**
 * Decifra o formato "enc:v1:". Valor sem prefixo é legado em texto e volta
 * como está. Chave errada ou dado adulterado: ErroCripto (nunca devolve lixo).
 */
export function decifrar(valor: string, env: Env = process.env): string {
  if (!estaCifrado(valor)) return valor;
  const partes = valor.slice(PREFIXO.length).split(":");
  if (partes.length !== 3) throw new ErroCripto("Segredo gravado em formato inválido.");
  const [iv, tag, ct] = partes.map((p) => Buffer.from(p, "base64url"));
  if (iv.length !== 12 || tag.length !== 16) throw new ErroCripto("Segredo gravado em formato inválido.");
  const chaves = chavesDeLeitura(env);
  if (!chaves.length) chaveAtual(env); // lança a mensagem de chave ausente
  for (const chave of chaves) {
    try {
      const d = createDecipheriv("aes-256-gcm", chave, iv);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
    } catch {
      // tenta a próxima chave
    }
  }
  throw new ErroCripto(
    "Não foi possível ler um segredo salvo: a chave de cifra do servidor (APP_ENCRYPTION_KEY) mudou ou o dado foi alterado. Informe o token/senha de novo.",
  );
}

export function decifrarOpcional(valor: string | null | undefined, env: Env = process.env): string | null {
  if (valor === null || valor === undefined || valor === "") return null;
  return decifrar(valor, env);
}

/**
 * Máscara para tela e log: mostra só os últimos `visiveis` caracteres.
 * Segredo curto (menos de 8) não mostra nada. Nunca passe valor cifrado aqui
 * esperando ver o final do segredo — decifre antes ou mostre só "configurado".
 */
export function mascarar(valor: string | null | undefined, visiveis = 4): string {
  if (!valor) return "";
  if (valor.length < 8) return "••••";
  return "••••" + valor.slice(-Math.min(visiveis, Math.floor(valor.length / 4)));
}
