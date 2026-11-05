"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { eanValido, ncmValido } from "@/lib/crm/qualidade-cadastro";

// Cadastro de produto. Enter avança de campo (leitor de código de barras
// "digita" Enter ao final do EAN); Ctrl+Enter salva.

type Opcao = { id: string; nome: string };
type Campos = {
  sku: string;
  nome: string;
  marcaId: string;
  categoriaId: string;
  unidade: string;
  localizacao: string;
  codigoFabricante: string;
  codigoOem: string;
  codigoBarras: string;
  custoMedio: string;
  precoVenda: string;
  estoqueMinimo: string;
  ncm: string;
  cest: string;
  origemFiscal: string;
};

const VAZIO: Campos = {
  sku: "",
  nome: "",
  marcaId: "",
  categoriaId: "",
  unidade: "UN",
  localizacao: "",
  codigoFabricante: "",
  codigoOem: "",
  codigoBarras: "",
  custoMedio: "",
  precoVenda: "",
  estoqueMinimo: "",
  ncm: "",
  cest: "",
  origemFiscal: "0",
};

const UNIDADES = ["UN", "PC", "PAR", "JG", "KG", "L", "M"];
const ORIGENS = [
  ["0", "0 · Nacional"],
  ["1", "1 · Importada, compra direta"],
  ["2", "2 · Importada, comprada no Brasil"],
  ["3", "3 · Nacional com mais de 40% de conteúdo importado"],
  ["4", "4 · Nacional, produção conforme processos básicos"],
  ["5", "5 · Nacional com até 40% de conteúdo importado"],
  ["6", "6 · Importada, sem similar nacional"],
  ["7", "7 · Importada comprada no Brasil, sem similar nacional"],
  ["8", "8 · Nacional com mais de 70% de conteúdo importado"],
] as const;

/** "1.234,56" ou "89,9" -> número; vazio -> 0; inválido -> NaN. */
function paraNumero(v: string): number {
  const t = v.trim();
  if (!t) return 0;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

function validar(f: Campos): Partial<Record<keyof Campos, string>> {
  const e: Partial<Record<keyof Campos, string>> = {};
  if (!f.sku.trim()) e.sku = "Informe o código interno (SKU).";
  if (f.nome.trim().length < 2) e.nome = "Informe o nome do produto (mínimo 2 letras).";
  if (f.codigoBarras.trim() && !eanValido(f.codigoBarras.trim()))
    e.codigoBarras = "Código de barras inválido: confira os números e o dígito final (8, 12, 13 ou 14 números).";
  if (f.ncm.trim() && !ncmValido(f.ncm.replace(/\D/g, ""))) e.ncm = "NCM precisa ter 8 números (ex.: 8708.30.90).";
  if (f.cest.trim() && f.cest.replace(/\D/g, "").length !== 7) e.cest = "CEST precisa ter 7 números (ex.: 01.001.00).";
  for (const k of ["custoMedio", "precoVenda", "estoqueMinimo"] as const) {
    if (Number.isNaN(paraNumero(f[k]))) e[k] = "Use só números, ex.: 89,90.";
  }
  return e;
}

export function FormNovoProduto({ marcas, categorias }: { marcas: Opcao[]; categorias: Opcao[] }) {
  const router = useRouter();
  const [f, setF] = useState<Campos>(VAZIO);
  const [erros, setErros] = useState<Partial<Record<keyof Campos, string>>>({});
  const [salvando, setSalvando] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const set = (k: keyof Campos) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((a) => ({ ...a, [k]: ev.target.value }));

  async function salvar(ev?: React.FormEvent) {
    ev?.preventDefault();
    setErroGeral(null);
    const e = validar(f);
    setErros(e);
    const primeiro = Object.keys(e)[0];
    if (primeiro) {
      formRef.current?.querySelector<HTMLElement>(`#np-${primeiro}`)?.focus();
      return;
    }
    setSalvando(true);
    try {
      const r = await fetch("/api/produtos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sku: f.sku.trim(),
          nome: f.nome.trim(),
          marcaId: f.marcaId || null,
          categoriaId: f.categoriaId || null,
          unidade: f.unidade,
          localizacao: f.localizacao,
          codigoFabricante: f.codigoFabricante,
          codigoOem: f.codigoOem,
          codigoBarras: f.codigoBarras.trim(),
          custoMedio: paraNumero(f.custoMedio),
          precoVenda: paraNumero(f.precoVenda),
          estoqueMinimo: paraNumero(f.estoqueMinimo),
          ncm: f.ncm,
          cest: f.cest,
          origemFiscal: Number(f.origemFiscal),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro ?? "Não foi possível salvar o produto.");
      router.push(`/produtos/${j.id}`);
      router.refresh();
    } catch (err) {
      setErroGeral((err as Error).message);
      setSalvando(false);
    }
  }

  // Enter vai para o próximo campo (o leitor de código de barras termina com Enter).
  function aoTeclar(ev: React.KeyboardEvent<HTMLFormElement>) {
    const alvo = ev.target as HTMLElement;
    if (ev.key !== "Enter") return;
    if (ev.ctrlKey || ev.metaKey) {
      ev.preventDefault();
      salvar();
      return;
    }
    if (alvo.tagName === "INPUT") {
      ev.preventDefault();
      const campos = Array.from(
        formRef.current?.querySelectorAll<HTMLElement>("input:not([disabled]), select:not([disabled])") ?? [],
      );
      const i = campos.indexOf(alvo);
      campos[i + 1]?.focus();
    }
  }

  const campo = (
    k: keyof Campos,
    rotulo: string,
    opts: { dica?: string; obrigatorio?: boolean; inputMode?: "decimal" | "numeric"; autoFocus?: boolean; maxLength?: number } = {},
  ) => (
    <div>
      <label htmlFor={`np-${k}`} className="text-sm font-medium">
        {rotulo}
        {opts.obrigatorio && <span aria-hidden="true"> *</span>}
      </label>
      <Input
        id={`np-${k}`}
        value={f[k]}
        onChange={set(k)}
        inputMode={opts.inputMode}
        autoFocus={opts.autoFocus}
        maxLength={opts.maxLength}
        required={opts.obrigatorio}
        aria-invalid={erros[k] ? true : undefined}
        aria-describedby={`np-${k}-msg`}
        className="mt-1"
      />
      <p id={`np-${k}-msg`} className={erros[k] ? "mt-1 text-xs text-destructive" : "mt-1 text-xs text-muted-foreground"}>
        {erros[k] ?? opts.dica ?? ""}
      </p>
    </div>
  );

  const selecao = (k: keyof Campos, rotulo: string, opcoes: readonly (readonly [string, string])[], vazio?: string) => (
    <div>
      <label htmlFor={`np-${k}`} className="text-sm font-medium">
        {rotulo}
      </label>
      <select
        id={`np-${k}`}
        value={f[k]}
        onChange={set(k)}
        className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {vazio !== undefined && <option value="">{vazio}</option>}
        {opcoes.map(([v, n]) => (
          <option key={v} value={v}>
            {n}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs">&nbsp;</p>
    </div>
  );

  return (
    <form ref={formRef} onSubmit={salvar} onKeyDown={aoTeclar} noValidate className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Cadastro</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-x-4 gap-y-1 md:grid-cols-2">
          {campo("sku", "Código interno (SKU)", { obrigatorio: true, autoFocus: true, maxLength: 40, dica: "O código que a loja usa para achar a peça" })}
          {campo("nome", "Nome do produto", { obrigatorio: true, maxLength: 200, dica: "Ex.: Pastilha de freio dianteira Sprinter 415" })}
          {selecao("marcaId", "Marca", marcas.map((m) => [m.id, m.nome] as const), "Sem marca")}
          {selecao("categoriaId", "Categoria", categorias.map((c) => [c.id, c.nome] as const), "Sem categoria")}
          {selecao("unidade", "Unidade", UNIDADES.map((u) => [u, u] as const))}
          {campo("localizacao", "Localização na loja", { maxLength: 60, dica: "Ex.: A3-B12" })}
          {campo("custoMedio", "Custo (R$)", { inputMode: "decimal", dica: "O custo médio é refeito a cada nota de compra" })}
          {campo("precoVenda", "Preço de venda (R$)", { inputMode: "decimal" })}
          {campo("estoqueMinimo", "Estoque mínimo", { inputMode: "decimal", dica: "Abaixo disso a peça entra na sugestão de compra" })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Códigos</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-x-4 gap-y-1 md:grid-cols-2">
          {campo("codigoFabricante", "Código do fabricante", { maxLength: 60, dica: "Como está na caixa da peça" })}
          {campo("codigoOem", "Código original (OEM)", { maxLength: 60, dica: "Prefixo e sufixo fazem diferença" })}
          {campo("codigoBarras", "Código de barras (EAN)", { inputMode: "numeric", maxLength: 14, dica: "Pode bipar com o leitor. 8, 12, 13 ou 14 números" })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Dados fiscais</CardTitle>
          <p className="text-xs text-muted-foreground">
            Sem NCM a nota não sai. Se não souber, deixe em branco e peça ao contador; o produto fica marcado como
            cadastro incompleto.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-x-4 gap-y-1 md:grid-cols-2">
          {campo("ncm", "NCM", { inputMode: "numeric", maxLength: 10, dica: "8 números, ex.: 8708.30.90" })}
          {campo("cest", "CEST", { inputMode: "numeric", maxLength: 9, dica: "7 números, ex.: 01.001.00. Só para quem tem ST" })}
          {selecao("origemFiscal", "Origem da mercadoria", ORIGENS)}
        </CardContent>
      </Card>

      {erroGeral && (
        <p role="alert" className="text-sm text-destructive">
          {erroGeral}
        </p>
      )}
      {Object.keys(erros).length > 0 && (
        <p role="alert" className="text-sm text-destructive">
          Confira os campos marcados em vermelho.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="accent" disabled={salvando}>
          {salvando ? "Salvando…" : "Cadastrar produto"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/produtos")} disabled={salvando}>
          Cancelar
        </Button>
        <span className="text-xs text-muted-foreground">Enter passa para o próximo campo. Ctrl+Enter cadastra.</span>
      </div>
    </form>
  );
}
