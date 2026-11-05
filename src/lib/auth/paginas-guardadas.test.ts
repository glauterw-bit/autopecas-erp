import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Toda página dentro de (app) precisa chamar exigirPerfilPagina: página nova
// sem guarda renderizaria para qualquer perfil logado.
function paginas(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) return paginas(p);
    return nome === "page.tsx" ? [p] : [];
  });
}

describe("páginas internas", () => {
  it("todas chamam exigirPerfilPagina", () => {
    const raiz = path.join(process.cwd(), "src/app/(app)");
    const semGuarda = paginas(raiz).filter((p) => !readFileSync(p, "utf8").includes("exigirPerfilPagina("));
    expect(semGuarda.map((p) => path.relative(raiz, p))).toEqual(["sem-acesso/page.tsx"]);
  });
});
