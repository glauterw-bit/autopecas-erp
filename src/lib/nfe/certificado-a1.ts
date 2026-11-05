import { createDecipheriv, createHash, createHmac, pbkdf2Sync, timingSafeEqual, X509Certificate } from "node:crypto";

// Certificado digital A1 (.pfx / .p12)
// ====================================
// Lê a validade, o titular e o CNPJ do certificado direto do arquivo, com o
// `crypto` do Node (sem dependência nova). O arquivo e a senha NÃO são
// guardados: só os dados lidos aqui.
//
// Formato: PKCS#12, RFC 7292 (https://www.rfc-editor.org/rfc/rfc7292).
// Cifras aceitas no saco do certificado:
//   - PBES2 (PBKDF2 + AES-CBC ou 3DES), RFC 8018 — padrão do OpenSSL 3;
//   - pbeWithSHAAnd3-KeyTripleDES-CBC e pbeWithSHAAnd40/128BitRC2-CBC
//     (RFC 7292, apêndice C) — padrão de exportação do Windows e de
//     certificadoras mais antigas. O RC2 (RFC 2268) foi implementado aqui
//     porque o OpenSSL 3 do Node não traz mais essa cifra.
// CNPJ do titular: OID 2.16.76.1.3.3 no SubjectAltName (DOC-ICP-04, ICP-Brasil)
// ou o final ":<CNPJ>" do CN.

export class ErroCertificado extends Error {}

export interface DadosCertificado {
  validoDe: Date;
  validoAte: Date;
  titular: string;
  cnpj: string | null;
  emissor: string;
  numeroSerie: string;
}

// ---------------------------------------------------------------- ASN.1 (BER)
interface No {
  classe: number; // 0 universal, 2 contexto
  numero: number;
  construido: boolean;
  conteudo: Buffer; // primitivo: bytes; construído: bytes brutos dos filhos
  filhos: No[];
}

function lerNo(buf: Buffer, pos: number): { no: No; fim: number } {
  if (pos + 2 > buf.length) throw new ErroCertificado("Arquivo de certificado incompleto ou corrompido.");
  const t = buf[pos];
  const classe = t >> 6;
  const construido = (t & 0x20) !== 0;
  const numero = t & 0x1f;
  if (numero === 0x1f) throw new ErroCertificado("Arquivo de certificado em formato não reconhecido.");
  let p = pos + 1;
  let len = buf[p++];
  const indefinido = len === 0x80;
  if (!indefinido && len & 0x80) {
    const n = len & 0x7f;
    if (n > 4) throw new ErroCertificado("Arquivo de certificado em formato não reconhecido.");
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[p++];
  }
  const filhos: No[] = [];
  if (indefinido) {
    if (!construido) throw new ErroCertificado("Arquivo de certificado em formato não reconhecido.");
    const ini = p;
    while (!(buf[p] === 0 && buf[p + 1] === 0)) {
      const r = lerNo(buf, p);
      filhos.push(r.no);
      p = r.fim;
      if (p >= buf.length) throw new ErroCertificado("Arquivo de certificado incompleto ou corrompido.");
    }
    return { no: { classe, numero, construido, conteudo: buf.subarray(ini, p), filhos }, fim: p + 2 };
  }
  const fim = p + len;
  if (fim > buf.length) throw new ErroCertificado("Arquivo de certificado incompleto ou corrompido.");
  const conteudo = buf.subarray(p, fim);
  if (construido) {
    let q = p;
    while (q < fim) {
      const r = lerNo(buf, q);
      filhos.push(r.no);
      q = r.fim;
    }
  }
  return { no: { classe, numero, construido, conteudo, filhos }, fim };
}

function der(buf: Buffer): No {
  return lerNo(buf, 0).no;
}

function octetos(no: No): Buffer {
  return no.construido ? Buffer.concat(no.filhos.map(octetos)) : no.conteudo;
}

function oid(no: No): string {
  if (no.classe !== 0 || no.numero !== 6) throw new ErroCertificado("Arquivo de certificado em formato não reconhecido.");
  const b = no.conteudo;
  const partes = [Math.floor(b[0] / 40), b[0] % 40];
  let v = 0;
  for (let i = 1; i < b.length; i++) {
    v = v * 128 + (b[i] & 0x7f);
    if (!(b[i] & 0x80)) {
      partes.push(v);
      v = 0;
    }
  }
  return partes.join(".");
}

function inteiro(no: No): number {
  let v = 0;
  for (const x of no.conteudo) v = v * 256 + x;
  return v;
}

function filho(no: No | undefined, i: number): No {
  const f = no?.filhos[i];
  if (!f) throw new ErroCertificado("Arquivo de certificado em formato não reconhecido.");
  return f;
}

// ---------------------------------------------------------------- KDF PKCS#12
const HASH_OID: Record<string, string> = {
  "1.3.14.3.2.26": "sha1",
  "2.16.840.1.101.3.4.2.1": "sha256",
  "2.16.840.1.101.3.4.2.2": "sha384",
  "2.16.840.1.101.3.4.2.3": "sha512",
};

function senhaBmp(senha: string): Buffer {
  const b = Buffer.alloc((senha.length + 1) * 2);
  for (let i = 0; i < senha.length; i++) b.writeUInt16BE(senha.charCodeAt(i), i * 2);
  return b; // termina com 00 00
}

function repetir(b: Buffer, tamanho: number): Buffer {
  const out = Buffer.alloc(tamanho);
  for (let i = 0; i < tamanho; i++) out[i] = b[i % b.length];
  return out;
}

/** RFC 7292, apêndice B.2. id: 1 = chave, 2 = IV, 3 = MAC. */
export function kdfPkcs12(hash: string, senha: Buffer, sal: Buffer, id: number, n: number, iteracoes: number): Buffer {
  const u = createHash(hash).digest().length;
  const v = u > 32 ? 128 : 64;
  const D = Buffer.alloc(v, id);
  const S = sal.length ? repetir(sal, v * Math.ceil(sal.length / v)) : Buffer.alloc(0);
  const P = senha.length ? repetir(senha, v * Math.ceil(senha.length / v)) : Buffer.alloc(0);
  const I = Buffer.concat([S, P]);
  const blocos: Buffer[] = [];
  for (let i = 0; i < Math.ceil(n / u); i++) {
    let A = createHash(hash).update(D).update(I).digest();
    for (let r = 1; r < iteracoes; r++) A = createHash(hash).update(A).digest();
    blocos.push(A);
    const B = repetir(A, v);
    for (let j = 0; j < I.length; j += v) {
      let carry = 1;
      for (let k = v - 1; k >= 0; k--) {
        const s = I[j + k] + B[k] + carry;
        I[j + k] = s & 0xff;
        carry = s >> 8;
      }
    }
  }
  return Buffer.concat(blocos).subarray(0, n);
}

// ---------------------------------------------------------------- RC2 (RFC 2268)
const PITABLE = Buffer.from(
  "d978f9c419ddb5ed28e9fd794aa0d89dc67e37832b76538e624c6488448bfba2" +
    "179a59f587b34f1361456d8d09817d32bd8f40eb86b77b0bf09521225c6b4e82" +
    "54d66593ce60b21c7356c014a78cf1dc1275ca1f3bbee4d1423dd430a33cb626" +
    "6fbf0eda4669075727f21d9bbc944303f811c7f690ef3ee706c3d52fc8661ed7" +
    "08e8eade8052eef784aa72ac354d6a2a961ad2715a1549744b9fd05e0418a4ec" +
    "c2e0416e0f51cbcc2491af50a1f47039997c3a8523b8b47afc02365b25559731" +
    "2d5dfa98e38a92ae05df2910676cbac9d300e6cfe19ea82c6316013f58e289a9" +
    "0d38341bab33ffb0bb480c5fb9b1cd2ec5f3db47e5a59c770aa62068fe7fc1ad",
  "hex",
);
export const RC2_PITABLE = PITABLE;

function rc2Chave(chave: Buffer, bitsEfetivos: number): Uint16Array {
  const L = Buffer.alloc(128);
  chave.copy(L);
  const T = chave.length;
  const T8 = Math.ceil(bitsEfetivos / 8);
  const TM = 0xff >> (8 * T8 - bitsEfetivos);
  for (let i = T; i < 128; i++) L[i] = PITABLE[(L[i - 1] + L[i - T]) & 0xff];
  L[128 - T8] = PITABLE[L[128 - T8] & TM];
  for (let i = 127 - T8; i >= 0; i--) L[i] = PITABLE[L[i + 1] ^ L[i + T8]];
  const K = new Uint16Array(64);
  for (let i = 0; i < 64; i++) K[i] = L[2 * i] | (L[2 * i + 1] << 8);
  return K;
}

function rc2DecifrarBloco(K: Uint16Array, bloco: Buffer): Buffer {
  const R = [bloco.readUInt16LE(0), bloco.readUInt16LE(2), bloco.readUInt16LE(4), bloco.readUInt16LE(6)];
  const s = [1, 2, 3, 5];
  let j = 63;
  const mix = () => {
    for (let i = 3; i >= 0; i--) {
      const x = R[i];
      R[i] = ((x >>> s[i]) | (x << (16 - s[i]))) & 0xffff;
      R[i] = (R[i] - K[j] - (R[(i + 3) % 4] & R[(i + 2) % 4]) - (~R[(i + 3) % 4] & R[(i + 1) % 4])) & 0xffff;
      j--;
    }
  };
  const mash = () => {
    for (let i = 3; i >= 0; i--) R[i] = (R[i] - K[R[(i + 3) % 4] & 63]) & 0xffff;
  };
  for (let r = 0; r < 5; r++) mix();
  mash();
  for (let r = 0; r < 6; r++) mix();
  mash();
  for (let r = 0; r < 5; r++) mix();
  const out = Buffer.alloc(8);
  R.forEach((w, i) => out.writeUInt16LE(w, i * 2));
  return out;
}

/** Decifra um bloco RC2 (ECB), exportado para o teste com os vetores da RFC 2268. */
export function rc2Bloco(chave: Buffer, bitsEfetivos: number, bloco: Buffer): Buffer {
  return rc2DecifrarBloco(rc2Chave(chave, bitsEfetivos), bloco);
}

function semPadding(b: Buffer): Buffer {
  const n = b[b.length - 1];
  if (!n || n > 8 || n > b.length || !b.subarray(b.length - n).every((x) => x === n)) {
    throw new ErroCertificado("Senha do certificado incorreta.");
  }
  return b.subarray(0, b.length - n);
}

function rc2Cbc(chave: Buffer, bits: number, iv: Buffer, dados: Buffer): Buffer {
  if (dados.length % 8) throw new ErroCertificado("Senha do certificado incorreta.");
  const K = rc2Chave(chave, bits);
  const out = Buffer.alloc(dados.length);
  let anterior = iv;
  for (let i = 0; i < dados.length; i += 8) {
    const c = dados.subarray(i, i + 8);
    const p = rc2DecifrarBloco(K, c);
    for (let k = 0; k < 8; k++) out[i + k] = p[k] ^ anterior[k];
    anterior = c;
  }
  return semPadding(out);
}

// ---------------------------------------------------------------- PBE
const PBES2_CIFRA: Record<string, { nome: string; chave: number }> = {
  "2.16.840.1.101.3.4.1.2": { nome: "aes-128-cbc", chave: 16 },
  "2.16.840.1.101.3.4.1.22": { nome: "aes-192-cbc", chave: 24 },
  "2.16.840.1.101.3.4.1.42": { nome: "aes-256-cbc", chave: 32 },
  "1.2.840.113549.3.7": { nome: "des-ede3-cbc", chave: 24 },
};
const PBKDF2_PRF: Record<string, string> = {
  "1.2.840.113549.2.7": "sha1",
  "1.2.840.113549.2.9": "sha256",
  "1.2.840.113549.2.10": "sha384",
  "1.2.840.113549.2.11": "sha512",
};

function decifrarNode(nome: string, chave: Buffer, iv: Buffer, dados: Buffer): Buffer {
  try {
    const d = createDecipheriv(nome, chave, iv);
    return Buffer.concat([d.update(dados), d.final()]);
  } catch {
    throw new ErroCertificado("Senha do certificado incorreta.");
  }
}

function decifrarPbe(alg: No, senha: string, dados: Buffer): Buffer {
  const id = oid(filho(alg, 0));
  const params = filho(alg, 1);
  if (id.startsWith("1.2.840.113549.1.12.1.")) {
    const sal = octetos(filho(params, 0));
    const iter = inteiro(filho(params, 1));
    const bmp = senhaBmp(senha);
    const tipo = id.slice("1.2.840.113549.1.12.1.".length);
    if (tipo === "3") {
      const k = kdfPkcs12("sha1", bmp, sal, 1, 24, iter);
      const iv = kdfPkcs12("sha1", bmp, sal, 2, 8, iter);
      return decifrarNode("des-ede3-cbc", k, iv, dados);
    }
    if (tipo === "5" || tipo === "6") {
      const n = tipo === "5" ? 16 : 5;
      const k = kdfPkcs12("sha1", bmp, sal, 1, n, iter);
      const iv = kdfPkcs12("sha1", bmp, sal, 2, 8, iter);
      return rc2Cbc(k, n * 8, iv, dados);
    }
  }
  if (id === "1.2.840.113549.1.5.13") {
    const kdf = filho(params, 0);
    const esquema = filho(params, 1);
    if (oid(filho(kdf, 0)) !== "1.2.840.113549.1.5.12") {
      throw new ErroCertificado("O certificado usa uma cifra que o sistema não lê. Exporte de novo o .pfx.");
    }
    const kp = filho(kdf, 1);
    const sal = octetos(filho(kp, 0));
    const iter = inteiro(filho(kp, 1));
    let prf = "sha1";
    for (const f of kp.filhos.slice(2)) {
      if (f.numero === 16) prf = PBKDF2_PRF[oid(filho(f, 0))] ?? "";
    }
    const cifra = PBES2_CIFRA[oid(filho(esquema, 0))];
    if (!cifra || !prf) {
      throw new ErroCertificado("O certificado usa uma cifra que o sistema não lê. Exporte de novo o .pfx.");
    }
    const iv = octetos(filho(esquema, 1));
    const chave = pbkdf2Sync(Buffer.from(senha, "utf8"), sal, iter, cifra.chave, prf);
    return decifrarNode(cifra.nome, chave, iv, dados);
  }
  throw new ErroCertificado("O certificado usa uma cifra que o sistema não lê. Exporte de novo o .pfx.");
}

// ---------------------------------------------------------------- PKCS#12
const OID_DATA = "1.2.840.113549.1.7.1";
const OID_ENCRYPTED_DATA = "1.2.840.113549.1.7.6";
const OID_CERT_BAG = "1.2.840.113549.1.12.10.1.3";
const OID_KEY_BAG = "1.2.840.113549.1.12.10.1.1";
const OID_SHROUDED_KEY_BAG = "1.2.840.113549.1.12.10.1.2";
const OID_LOCAL_KEY_ID = "1.2.840.113549.1.9.21";
const OID_X509 = "1.2.840.113549.1.9.22.1";
const OID_CNPJ_ICP = Buffer.from("0605604c010303", "hex"); // 2.16.76.1.3.3

function conferirMac(pfx: No, dadosAuth: Buffer, senha: string) {
  const mac = pfx.filhos[2];
  if (!mac) return; // sem MAC (raro): a senha é conferida na decifragem
  const digestInfo = filho(mac, 0);
  const hash = HASH_OID[oid(filho(filho(digestInfo, 0), 0))];
  if (!hash) throw new ErroCertificado("O certificado usa uma cifra que o sistema não lê. Exporte de novo o .pfx.");
  const esperado = octetos(filho(digestInfo, 1));
  const sal = octetos(filho(mac, 1));
  const iter = mac.filhos[2] ? inteiro(mac.filhos[2]) : 1;
  const chave = kdfPkcs12(hash, senhaBmp(senha), sal, 3, createHash(hash).digest().length, iter);
  const obtido = createHmac(hash, chave).update(dadosAuth).digest();
  if (obtido.length !== esperado.length || !timingSafeEqual(obtido, esperado)) {
    throw new ErroCertificado("Senha do certificado incorreta.");
  }
}

interface Saco {
  tipo: string;
  valor: No;
  localKeyId: string | null;
}

function sacos(safeContents: No): Saco[] {
  return safeContents.filhos.map((bag) => {
    let localKeyId: string | null = null;
    const attrs = bag.filhos[2];
    for (const a of attrs?.filhos ?? []) {
      if (oid(filho(a, 0)) === OID_LOCAL_KEY_ID) localKeyId = octetos(filho(filho(a, 1), 0)).toString("hex");
    }
    return { tipo: oid(filho(bag, 0)), valor: filho(filho(bag, 1), 0), localKeyId };
  });
}

function cnpjDoCertificado(x: X509Certificate): string | null {
  const raw = x.raw;
  const i = raw.indexOf(OID_CNPJ_ICP);
  if (i >= 0) {
    const m = raw.subarray(i + OID_CNPJ_ICP.length, i + OID_CNPJ_ICP.length + 40).toString("latin1").match(/\d{14}/);
    if (m) return m[0];
  }
  const cn = x.subject.match(/CN=([^\n]*)/)?.[1] ?? "";
  return cn.match(/:(\d{14})\b/)?.[1] ?? null;
}

/**
 * Lê o .pfx com a senha. Erros em português (ErroCertificado):
 * senha incorreta, arquivo que não é certificado, sem chave privada.
 */
export function lerCertificadoA1(arquivo: Buffer, senha: string): DadosCertificado {
  let pfx: No;
  try {
    pfx = der(arquivo);
  } catch {
    throw new ErroCertificado("O arquivo não é um certificado A1 (.pfx ou .p12).");
  }
  if (pfx.numero !== 16 || pfx.filhos.length < 2 || inteiro(filho(pfx, 0)) !== 3) {
    throw new ErroCertificado("O arquivo não é um certificado A1 (.pfx ou .p12).");
  }
  const authSafe = filho(pfx, 1);
  if (oid(filho(authSafe, 0)) !== OID_DATA) {
    throw new ErroCertificado("O certificado usa um formato que o sistema não lê. Exporte de novo o .pfx.");
  }
  const dadosAuth = octetos(filho(filho(authSafe, 1), 0));
  conferirMac(pfx, dadosAuth, senha);

  const todos: Saco[] = [];
  for (const ci of der(dadosAuth).filhos) {
    const tipo = oid(filho(ci, 0));
    const conteudo = filho(filho(ci, 1), 0);
    if (tipo === OID_DATA) {
      todos.push(...sacos(der(octetos(conteudo))));
    } else if (tipo === OID_ENCRYPTED_DATA) {
      const eci = filho(conteudo, 1);
      const cifrado = octetos(filho(eci, 2));
      todos.push(...sacos(der(decifrarPbe(filho(eci, 1), senha, cifrado))));
    }
  }

  const chaves = todos.filter((s) => s.tipo === OID_KEY_BAG || s.tipo === OID_SHROUDED_KEY_BAG);
  if (!chaves.length) {
    throw new ErroCertificado("O arquivo não traz a chave privada. Exporte o certificado A1 com a chave privada (.pfx).");
  }
  const certs = todos
    .filter((s) => s.tipo === OID_CERT_BAG && oid(filho(s.valor, 0)) === OID_X509)
    .map((s) => ({ s, x: new X509Certificate(octetos(filho(filho(s.valor, 1), 0))) }));
  if (!certs.length) throw new ErroCertificado("O arquivo não traz o certificado. Exporte de novo o .pfx.");
  const idsChave = new Set(chaves.map((c) => c.localKeyId).filter(Boolean));
  const escolhido =
    certs.find((c) => c.s.localKeyId && idsChave.has(c.s.localKeyId)) ?? certs.find((c) => !c.x.ca) ?? certs[0];
  const x = escolhido.x;
  return {
    validoDe: new Date(x.validFrom),
    validoAte: new Date(x.validTo),
    titular: x.subject.match(/CN=([^\n]*)/)?.[1] ?? x.subject,
    cnpj: cnpjDoCertificado(x),
    emissor: x.issuer.match(/CN=([^\n]*)/)?.[1] ?? x.issuer,
    numeroSerie: x.serialNumber,
  };
}
