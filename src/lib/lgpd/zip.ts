// Gerador de ZIP mínimo, sem dependência (o projeto não tem biblioteca de zip).
// Cada arquivo é comprimido (deflate) e enviado na ordem; o diretório central
// vai no fim. Não usa ZIP64: serve para até 4 GB por arquivo e 65 mil arquivos.
import { deflateRawSync } from "node:zlib";

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABELA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dos(d: Date): { hora: number; data: number } {
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    data: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export type EntradaZip = { nome: string; conteudo: string | Uint8Array };

/** Gera o ZIP aos pedaços: cada arquivo sai assim que fica pronto. */
export async function* gerarZip(
  entradas: AsyncIterable<EntradaZip> | Iterable<EntradaZip>,
  agora = new Date(),
): AsyncGenerator<Buffer> {
  const { hora, data } = dos(agora);
  const central: Buffer[] = [];
  let posicao = 0;
  let total = 0;

  for await (const e of entradas as AsyncIterable<EntradaZip>) {
    const nome = Buffer.from(e.nome, "utf8");
    const bruto = typeof e.conteudo === "string" ? Buffer.from(e.conteudo, "utf8") : Buffer.from(e.conteudo);
    const comp = deflateRawSync(bruto);
    const crc = crc32(bruto);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // versão necessária
    local.writeUInt16LE(0x0800, 6); // nomes em UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(hora, 10);
    local.writeUInt16LE(data, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(bruto.length, 22);
    local.writeUInt16LE(nome.length, 26);
    local.writeUInt16LE(0, 28);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(hora, 12);
    cd.writeUInt16LE(data, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(comp.length, 20);
    cd.writeUInt32LE(bruto.length, 24);
    cd.writeUInt16LE(nome.length, 28);
    cd.writeUInt32LE(posicao, 42);
    central.push(Buffer.concat([cd, nome]));

    const pedaco = Buffer.concat([local, nome, comp]);
    posicao += pedaco.length;
    total++;
    yield pedaco;
  }

  const cdBuf = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(total, 8);
  fim.writeUInt16LE(total, 10);
  fim.writeUInt32LE(cdBuf.length, 12);
  fim.writeUInt32LE(posicao, 16);
  yield cdBuf;
  yield fim;
}
