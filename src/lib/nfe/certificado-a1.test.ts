import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ErroCertificado, lerCertificadoA1, RC2_PITABLE, rc2Bloco } from "./certificado-a1";

// O .pfx de teste é gerado aqui mesmo, com o openssl da máquina, em formatos
// diferentes: OpenSSL 3 (PBES2/AES, padrão atual), "-legacy" (RC2-40 + 3DES,
// como o Windows exporta) e 3DES puro. Sem openssl, os testes de arquivo pulam.

function acharOpenssl(): string | null {
  for (const c of ["/opt/homebrew/bin/openssl", "/usr/local/bin/openssl", "/usr/bin/openssl"]) {
    if (existsSync(c)) {
      try {
        if (/OpenSSL 3/.test(execFileSync(c, ["version"]).toString())) return c;
      } catch {
        /* próximo */
      }
    }
  }
  try {
    const v = execFileSync("openssl", ["version"]).toString();
    return /OpenSSL 3/.test(v) ? "openssl" : null;
  } catch {
    return null;
  }
}

const OPENSSL = acharOpenssl();
const dir = mkdtempSync(path.join(tmpdir(), "pfx-teste-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function gerarPfx(nome: string, dias: number, extraExport: string[], san = true): { pfx: Buffer; cert: X509Certificate } {
  const key = path.join(dir, `${nome}.key`);
  const crt = path.join(dir, `${nome}.crt`);
  const out = path.join(dir, `${nome}.pfx`);
  const req = [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", crt,
    "-days", String(dias), "-subj", "/C=BR/O=ICP-Brasil/CN=AUTO PECAS TESTE LTDA:12345678000195",
  ];
  if (san) req.push("-addext", "subjectAltName=otherName:2.16.76.1.3.3;PRINTABLESTRING:98765432000110");
  execFileSync(OPENSSL!, req, { stdio: "ignore" });
  execFileSync(
    OPENSSL!,
    ["pkcs12", "-export", "-inkey", key, "-in", crt, "-out", out, "-passout", "pass:senha-123", ...extraExport],
    { stdio: "ignore" },
  );
  return { pfx: readFileSync(out), cert: new X509Certificate(readFileSync(crt)) };
}

describe("RC2 (RFC 2268, seção 5 — vetores de teste)", () => {
  it("PITABLE é uma permutação de 0..255", () => {
    expect(new Set(RC2_PITABLE).size).toBe(256);
  });
  it("decifra os vetores oficiais", () => {
    const h = (s: string) => Buffer.from(s, "hex");
    expect(rc2Bloco(h("0000000000000000"), 63, h("ebb773f993278eff")).toString("hex")).toBe("0000000000000000");
    expect(rc2Bloco(h("ffffffffffffffff"), 64, h("278b27e42e2f0d49")).toString("hex")).toBe("ffffffffffffffff");
    expect(rc2Bloco(h("3000000000000000"), 64, h("30649edf9be7d2c2")).toString("hex")).toBe("1000000000000001");
  });
});

describe.skipIf(!OPENSSL)("lerCertificadoA1 (pfx gerado no teste)", () => {
  it("OpenSSL 3 padrão (PBES2/AES-256): validade, titular e CNPJ do SubjectAltName", () => {
    const { pfx, cert } = gerarPfx("aes", 40, []);
    const d = lerCertificadoA1(pfx, "senha-123");
    expect(d.validoAte.getTime()).toBe(new Date(cert.validTo).getTime());
    expect(d.validoDe.getTime()).toBe(new Date(cert.validFrom).getTime());
    const dias = (d.validoAte.getTime() - Date.now()) / 86_400_000;
    expect(dias).toBeGreaterThan(39.9);
    expect(dias).toBeLessThan(40.1);
    expect(d.titular).toBe("AUTO PECAS TESTE LTDA:12345678000195");
    expect(d.cnpj).toBe("98765432000110"); // OID ICP-Brasil tem prioridade sobre o CN
  });

  it("formato legado do Windows (RC2-40 no certificado, 3DES na chave)", () => {
    const { pfx, cert } = gerarPfx("legado", 5, ["-legacy"], false);
    const d = lerCertificadoA1(pfx, "senha-123");
    expect(d.validoAte.getTime()).toBe(new Date(cert.validTo).getTime());
    expect(d.cnpj).toBe("12345678000195"); // sem SAN: lê do CN
  });

  it("3DES no certificado e na chave", () => {
    const { pfx, cert } = gerarPfx("3des", 400, ["-certpbe", "PBE-SHA1-3DES", "-keypbe", "PBE-SHA1-3DES", "-macalg", "sha1"]);
    expect(lerCertificadoA1(pfx, "senha-123").validoAte.getTime()).toBe(new Date(cert.validTo).getTime());
  });

  it("senha errada: mensagem clara", () => {
    const { pfx } = gerarPfx("senha", 10, []);
    expect(() => lerCertificadoA1(pfx, "outra")).toThrow(ErroCertificado);
    expect(() => lerCertificadoA1(pfx, "outra")).toThrow("Senha do certificado incorreta.");
  });

  it("arquivo que não é .pfx", () => {
    expect(() => lerCertificadoA1(Buffer.from("não sou um certificado"), "x")).toThrow(/não é um certificado A1/);
    expect(() => lerCertificadoA1(Buffer.alloc(0), "x")).toThrow(ErroCertificado);
  });
});
