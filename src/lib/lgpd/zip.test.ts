import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createWriteStream, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
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

// ZIP64: valida com o `unzip -t` do sistema (se não houver unzip, o teste é pulado).
function temUnzip(): boolean {
  try { execFileSync("unzip", ["-v"], { stdio: "ignore" }); return true; } catch { return false; }
}

async function gravarETestar(entradas: Iterable<{ nome: string; conteudo: never } | { nome: string; conteudo: string | AsyncIterable<string> }>, opcoes = {}) {
  const dir = mkdtempSync(join(tmpdir(), "zip64-"));
  try {
    const arq = join(dir, "t.zip");
    await pipeline(Readable.from(gerarZip(entradas as never, opcoes)), createWriteStream(arq));
    return execFileSync("unzip", ["-t", arq], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function* csvEmPartes(n: number) {
  yield "a;b\r\n";
  for (let i = 0; i < n; i++) yield `${i};linha ${i}\r\n`;
}

describe.skipIf(!temUnzip())("zip64 e fluxo, conferidos pelo unzip -t", () => {
  it("entrada em fluxo (CSV por lotes) e entrada comum passam no unzip -t", async () => {
    const saida = await gravarETestar([
      { nome: "grande.csv", conteudo: csvEmPartes(50_000) as never },
      { nome: "pequeno.txt", conteudo: "olá" },
    ]);
    expect(saida).toContain("No errors detected");
    expect(saida).toContain("OK");
  });

  it("estruturas ZIP64 forçadas (registro de fim, localizador e extras) passam no unzip -t", async () => {
    const saida = await gravarETestar(
      [{ nome: "a.txt", conteudo: "A" }, { nome: "b.csv", conteudo: csvEmPartes(10) as never }],
      { forcarZip64: true },
    );
    expect(saida).toContain("No errors detected");
  });

  it("70.000 arquivos pequenos (acima de 65.535 entradas) passam no unzip -t", async () => {
    function* muitos() {
      for (let i = 0; i < 70_000; i++) yield { nome: `xml/n${i}.xml`, conteudo: `<n>${i}</n>` };
    }
    const saida = await gravarETestar(muitos());
    expect(saida).toContain("No errors detected");
    expect(saida).toContain("xml/n69999.xml");
  }, 300_000);
});

describe("download cancelado no meio", () => {
  it("parar de ler o ZIP solta o compressor e para de consumir a fonte", async () => {
    let lidos = 0;
    let finalizada = false;
    async function* fonteGrande() {
      try {
        for (let i = 0; i < 100_000; i++) {
          lidos++;
          // texto pouco compressível para encher o buffer do deflate
          yield Buffer.from(Array.from({ length: 2048 }, (_, k) => (i * 31 + k * 17) % 251));
        }
      } finally {
        finalizada = true;
      }
    }
    const g = gerarZip([{ nome: "grande.bin", conteudo: fonteGrande() }]);
    await g.next();
    await g.next();
    await g.return(undefined); // o cliente fechou a conexão
    // dá uma volta no loop de eventos para a alimentação perceber o fechamento
    await new Promise((r) => setTimeout(r, 50));
    expect(finalizada).toBe(true);
    expect(lidos).toBeLessThan(100_000);
  }, 10_000);
});
