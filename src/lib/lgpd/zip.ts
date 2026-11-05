// Gerador de ZIP sem dependência (o projeto não tem biblioteca de zip; a escrita
// é curta e fica coberta por teste com `unzip -t`).
// - Compressão deflate assíncrona, em stream (zlib.createDeflateRaw): não trava o servidor.
// - Conteúdo em memória (texto/bytes): cabeçalho comum, tamanhos conhecidos.
// - Conteúdo em fluxo (AsyncIterable): os tamanhos só se sabem no fim, então usa
//   "data descriptor" com tamanhos de 8 bytes e o extra ZIP64 no cabeçalho local.
// - ZIP64 no diretório central quando há mais de 65.535 arquivos ou quando
//   algum tamanho/posição passa de 4 GiB (registro de fim zip64 + localizador + campos extras).
import { createDeflateRaw } from "node:zlib";

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32Parcial(anterior: number, buf: Uint8Array): number {
  let c = anterior ^ 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABELA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function crc32(buf: Uint8Array): number {
  return crc32Parcial(0, buf);
}

function dos(d: Date): { hora: number; data: number } {
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    data: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export type ConteudoZip = string | Uint8Array | AsyncIterable<string | Uint8Array>;
export type EntradaZip = { nome: string; conteudo: ConteudoZip };
export type OpcoesZip = { agora?: Date; /** Só para teste: escreve as estruturas ZIP64 mesmo com arquivos pequenos. */ forcarZip64?: boolean };

const LIMITE32 = 0xffffffff;
const LIMITE16 = 0xffff;

const emBytes = (p: string | Uint8Array) => (typeof p === "string" ? Buffer.from(p, "utf8") : Buffer.from(p));

/** Comprime em stream; devolve os pedaços comprimidos e preenche crc e tamanhos ao terminar. */
async function* comprimir(
  fonte: AsyncIterable<string | Uint8Array>,
  m: { crc: number; bruto: number; comp: number },
): AsyncGenerator<Buffer> {
  const def = createDeflateRaw();
  const alimenta = (async () => {
    for await (const parte of fonte) {
      const b = emBytes(parte);
      if (!b.length) continue;
      m.crc = crc32Parcial(m.crc, b);
      m.bruto += b.length;
      if (!def.write(b)) await new Promise<void>((ok) => def.once("drain", ok));
    }
    def.end();
  })().catch((e) => def.destroy(e as Error));
  for await (const c of def) {
    m.comp += (c as Buffer).length;
    yield c as Buffer;
  }
  await alimenta;
}

async function* umaParte(p: string | Uint8Array): AsyncGenerator<string | Uint8Array> {
  yield p;
}

function extraZip64(valores: bigint[]): Buffer {
  const b = Buffer.alloc(4 + valores.length * 8);
  b.writeUInt16LE(0x0001, 0);
  b.writeUInt16LE(valores.length * 8, 2);
  valores.forEach((v, i) => b.writeBigUInt64LE(v, 4 + i * 8));
  return b;
}

type Central = { nome: Buffer; crc: number; comp: number; bruto: number; offset: number; fluxo: boolean };

/** Gera o ZIP aos pedaços: cada arquivo sai assim que fica pronto. */
export async function* gerarZip(
  entradas: AsyncIterable<EntradaZip> | Iterable<EntradaZip>,
  opcoes: Date | OpcoesZip = {},
): AsyncGenerator<Buffer> {
  const op: OpcoesZip = opcoes instanceof Date ? { agora: opcoes } : opcoes;
  const forcar = !!op.forcarZip64;
  const { hora, data } = dos(op.agora ?? new Date());
  const centrais: Central[] = [];
  let posicao = 0;

  for await (const e of entradas as AsyncIterable<EntradaZip>) {
    const nome = Buffer.from(e.nome, "utf8");
    const fluxo = typeof e.conteudo !== "string" && !(e.conteudo instanceof Uint8Array);
    const m = { crc: 0, bruto: 0, comp: 0 };
    const offset = posicao;

    if (!fluxo) {
      // Tamanhos conhecidos: comprime inteiro (assíncrono) e escreve o cabeçalho completo.
      const partes: Buffer[] = [];
      for await (const c of comprimir(umaParte(e.conteudo as string | Uint8Array), m)) partes.push(c);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(0x0800, 6);
      local.writeUInt16LE(8, 8);
      local.writeUInt16LE(hora, 10);
      local.writeUInt16LE(data, 12);
      local.writeUInt32LE(m.crc, 14);
      local.writeUInt32LE(m.comp, 18);
      local.writeUInt32LE(m.bruto, 22);
      local.writeUInt16LE(nome.length, 26);
      const bloco = Buffer.concat([local, nome, ...partes]);
      posicao += bloco.length;
      yield bloco;
    } else {
      // Fluxo: tamanhos só no fim (data descriptor, bit 3), com extra ZIP64 no cabeçalho local.
      const extra = extraZip64([0n, 0n]);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(45, 4);
      local.writeUInt16LE(0x0800 | 0x0008, 6);
      local.writeUInt16LE(8, 8);
      local.writeUInt16LE(hora, 10);
      local.writeUInt16LE(data, 12);
      local.writeUInt32LE(0, 14);
      local.writeUInt32LE(LIMITE32, 18);
      local.writeUInt32LE(LIMITE32, 22);
      local.writeUInt16LE(nome.length, 26);
      local.writeUInt16LE(extra.length, 28);
      const cab = Buffer.concat([local, nome, extra]);
      posicao += cab.length;
      yield cab;
      for await (const c of comprimir(e.conteudo as AsyncIterable<string | Uint8Array>, m)) {
        posicao += c.length;
        yield c;
      }
      const desc = Buffer.alloc(24);
      desc.writeUInt32LE(0x08074b50, 0);
      desc.writeUInt32LE(m.crc, 4);
      desc.writeBigUInt64LE(BigInt(m.comp), 8);
      desc.writeBigUInt64LE(BigInt(m.bruto), 16);
      posicao += desc.length;
      yield desc;
    }
    centrais.push({ nome, crc: m.crc, comp: m.comp, bruto: m.bruto, offset, fluxo });
  }

  // Diretório central
  const inicioCentral = posicao;
  const blocos: Buffer[] = [];
  for (const c of centrais) {
    const grande = { bruto: forcar || c.bruto >= LIMITE32, comp: forcar || c.comp >= LIMITE32, offset: forcar || c.offset >= LIMITE32 };
    const extraVals: bigint[] = [];
    if (grande.bruto) extraVals.push(BigInt(c.bruto));
    if (grande.comp) extraVals.push(BigInt(c.comp));
    if (grande.offset) extraVals.push(BigInt(c.offset));
    const extra = extraVals.length ? extraZip64(extraVals) : Buffer.alloc(0);
    const versao = extra.length || c.fluxo ? 45 : 20;
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(versao, 4);
    cd.writeUInt16LE(versao, 6);
    cd.writeUInt16LE(c.fluxo ? 0x0800 | 0x0008 : 0x0800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(hora, 12);
    cd.writeUInt16LE(data, 14);
    cd.writeUInt32LE(c.crc, 16);
    cd.writeUInt32LE(grande.comp ? LIMITE32 : c.comp, 20);
    cd.writeUInt32LE(grande.bruto ? LIMITE32 : c.bruto, 24);
    cd.writeUInt16LE(c.nome.length, 28);
    cd.writeUInt16LE(extra.length, 30);
    cd.writeUInt32LE(grande.offset ? LIMITE32 : c.offset, 42);
    blocos.push(cd, c.nome, extra);
  }
  const cdBuf = Buffer.concat(blocos);
  posicao += cdBuf.length;
  yield cdBuf;

  const total = centrais.length;
  const precisa64 = forcar || total >= LIMITE16 || cdBuf.length >= LIMITE32 || inicioCentral >= LIMITE32;
  if (precisa64) {
    const z64 = Buffer.alloc(56);
    z64.writeUInt32LE(0x06064b50, 0);
    z64.writeBigUInt64LE(44n, 4); // tamanho do restante deste registro
    z64.writeUInt16LE(45, 12);
    z64.writeUInt16LE(45, 14);
    z64.writeUInt32LE(0, 16);
    z64.writeUInt32LE(0, 20);
    z64.writeBigUInt64LE(BigInt(total), 24);
    z64.writeBigUInt64LE(BigInt(total), 32);
    z64.writeBigUInt64LE(BigInt(cdBuf.length), 40);
    z64.writeBigUInt64LE(BigInt(inicioCentral), 48);
    const loc = Buffer.alloc(20);
    loc.writeUInt32LE(0x07064b50, 0);
    loc.writeUInt32LE(0, 4);
    loc.writeBigUInt64LE(BigInt(posicao), 8); // onde começa o registro zip64
    loc.writeUInt32LE(1, 16);
    yield Buffer.concat([z64, loc]);
  }
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(precisa64 ? LIMITE16 : total, 8);
  fim.writeUInt16LE(precisa64 ? LIMITE16 : total, 10);
  fim.writeUInt32LE(precisa64 ? LIMITE32 : cdBuf.length, 12);
  fim.writeUInt32LE(precisa64 ? LIMITE32 : inicioCentral, 16);
  yield fim;
}
