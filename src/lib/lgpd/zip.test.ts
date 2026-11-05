import { describe, expect, it } from "vitest";
import { inflateRawSync } from "node:zlib";
import { crc32, gerarZip } from "./zip";
import { celulaCsv, linhasParaCsv } from "./csv";

async function juntar(g: AsyncGenerator<Buffer>) {
  const partes: Buffer[] = [];
  for await (const p of g) partes.push(p);
  return Buffer.concat(partes);
}

// Leitor mínimo pelo diretório central, para provar que o ZIP é válido.
function ler(zip: Buffer): Record<string, string> {
  const fim = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const total = zip.readUInt16LE(fim + 10);
  let p = zip.readUInt32LE(fim + 16);
  const out: Record<string, string> = {};
  for (let i = 0; i < total; i++) {
    const crc = zip.readUInt32LE(p + 16);
    const comp = zip.readUInt32LE(p + 20);
    const nomeLen = zip.readUInt16LE(p + 28);
    const local = zip.readUInt32LE(p + 42);
    const nome = zip.subarray(p + 46, p + 46 + nomeLen).toString("utf8");
    const dados = inflateRawSync(zip.subarray(local + 30 + nomeLen, local + 30 + nomeLen + comp));
    expect(crc32(dados)).toBe(crc);
    out[nome] = dados.toString("utf8");
    p += 46 + nomeLen;
  }
  return out;
}

describe("zip sem dependência", () => {
  it("crc32 bate com o valor conhecido", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });

  it("gera um ZIP legível com nomes em UTF-8", async () => {
    const zip = await juntar(gerarZip([{ nome: "xml/nota-ç.xml", conteudo: "<a>ação</a>" }, { nome: "b.csv", conteudo: "x;y" }]));
    expect(ler(zip)).toEqual({ "xml/nota-ç.xml": "<a>ação</a>", "b.csv": "x;y" });
  });
});

describe("csv da exportação", () => {
  it("separa por ponto e vírgula, protege aspas e fórmulas", () => {
    expect(celulaCsv('a;"b"')).toBe('"a;""b"""');
    expect(celulaCsv("=1+1")).toBe("'=1+1");
    expect(celulaCsv(-5)).toBe("-5");
  });

  it("omite colunas secretas", () => {
    const csv = linhasParaCsv([{ id: "1", nome: "Ana", senhaHashB2B: "hash" }], { omitir: ["senhaHashB2B"] });
    expect(csv).toContain("id;nome");
    expect(csv).not.toContain("hash");
  });
});
