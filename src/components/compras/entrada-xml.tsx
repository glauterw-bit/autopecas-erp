"use client";

import { useRef, useState } from "react";
import { FileCheck2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatBRL } from "@/lib/utils";

// Entrada de nota de compra pelo XML: escolher arquivo -> prévia (nada é
// gravado) -> confirmar -> entra no estoque e atualiza o custo médio.

type Item = {
  codigo: string;
  descricao: string;
  quantidade: number;
  unidade: string;
  valorUnitario: number;
  valorTotal: number;
  ncm: string | null;
  produto: { id: string; sku: string; nome: string } | null;
};
type Previa = {
  chave: string;
  numero: string;
  serie: string;
  emissao: string | null;
  fornecedor: string;
  valorProdutos: number;
  valorTotal: number;
  itens: Item[];
  reconhecidos: number;
  jaImportada: boolean;
  jaRecebida: boolean;
};

export function EntradaXml() {
  const input = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function ler(f: File) {
    setArquivo(f);
    setPrevia(null);
    setErro(null);
    setOk(null);
    if (!/\.xml$/i.test(f.name)) {
      setErro("Escolha o arquivo XML da nota (termina em .xml). PDF e foto ainda não são lidos aqui.");
      return;
    }
    setOcupado(true);
    try {
      const fd = new FormData();
      fd.append("xml", f);
      const r = await fetch("/api/compras/nf-xml/previa", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro ?? "Não foi possível ler a nota.");
      setPrevia(j as Previa);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function darEntrada() {
    if (!arquivo || !previa) return;
    const semVinculo = previa.itens.length - previa.reconhecidos;
    const aviso = semVinculo
      ? `\n\n${semVinculo} item(ns) não foram reconhecidos e NÃO entram no estoque agora.`
      : "";
    if (!window.confirm(`Dar entrada na nota ${previa.numero} de ${previa.fornecedor}?${aviso}`)) return;
    setOcupado(true);
    setErro(null);
    let notaId: string | null = null;
    try {
      const fd = new FormData();
      fd.append("xml", arquivo);
      const r1 = await fetch("/api/nfe/importar", { method: "POST", body: fd });
      const j1 = await r1.json().catch(() => ({}));
      if (!r1.ok) throw new Error(j1.erro ?? "Não foi possível importar a nota.");
      notaId = j1.notaEntradaId as string;
      const r2 = await fetch(`/api/nfe/importar/${notaId}/receber`, { method: "POST" });
      const j2 = await r2.json().catch(() => ({}));
      if (!r2.ok) throw new Error(j2.erro ?? "Não foi possível dar entrada.");
      setOk(
        `Entrada feita: ${j2.itensRecebidos} item(ns) no estoque, custo médio atualizado.` +
          (j2.itensSemVinculo ? ` ${j2.itensSemVinculo} item(ns) ficaram sem produto vinculado.` : ""),
      );
      setPrevia(null);
      setArquivo(null);
      if (input.current) input.current.value = "";
    } catch (e) {
      setErro(
        (e as Error).message +
          (notaId ? " A nota foi importada, mas o estoque NÃO foi atualizado." : ""),
      );
    } finally {
      setOcupado(false);
    }
  }

  const bloqueada = previa?.jaRecebida;
  const semNenhum = previa && previa.reconhecidos === 0;

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) ler(f);
        }}
        className="flex flex-col items-center justify-center rounded-md border-2 border-dashed border-border bg-secondary/40 p-8 text-center text-sm text-muted-foreground"
      >
        <Upload className="mb-2 h-8 w-8" aria-hidden="true" />
        Arraste o XML da nota aqui ou escolha o arquivo
        <label htmlFor="nf-xml" className="sr-only">
          Arquivo XML da nota de compra
        </label>
        <input
          ref={input}
          id="nf-xml"
          type="file"
          accept=".xml,text/xml,application/xml"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) ler(f);
          }}
        />
        <Button className="mt-3" variant="accent" disabled={ocupado} onClick={() => input.current?.click()}>
          {ocupado && !previa ? "Lendo…" : "Selecionar arquivo XML"}
        </Button>
      </div>

      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
      {ok && (
        <p role="status" className="flex items-center gap-2 text-sm text-emerald-600">
          <FileCheck2 className="h-4 w-4" /> {ok}
        </p>
      )}

      {previa && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <Info rotulo="Fornecedor" valor={previa.fornecedor || "—"} />
            <Info rotulo="Nota" valor={`${previa.numero || "—"} / série ${previa.serie || "—"}`} />
            <Info rotulo="Emissão" valor={previa.emissao ? new Date(previa.emissao).toLocaleDateString("pt-BR") : "—"} />
            <Info rotulo="Total da nota" valor={formatBRL(previa.valorTotal)} />
          </div>

          {previa.jaRecebida && (
            <p role="alert" className="rounded-md bg-amber-500/10 p-2 text-sm text-amber-800 dark:text-amber-300">
              Esta nota já deu entrada no estoque. Não é possível dar entrada de novo.
            </p>
          )}
          {!previa.jaRecebida && previa.jaImportada && (
            <p className="rounded-md bg-amber-500/10 p-2 text-sm text-amber-800 dark:text-amber-300">
              Esta nota já foi importada antes, mas o estoque ainda não foi atualizado. Dá para concluir agora.
            </p>
          )}
          {semNenhum && !bloqueada && (
            <p role="alert" className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
              Nenhum item da nota bate com um produto cadastrado (código interno, código de barras ou código do
              fabricante). Cadastre os produtos primeiro em Produtos.
            </p>
          )}

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <caption className="sr-only">Itens da nota</caption>
              <thead className="border-b bg-secondary text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Item da nota</th>
                  <th className="px-3 py-2 text-right font-medium">Qtde</th>
                  <th className="px-3 py-2 text-right font-medium">Custo un.</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 font-medium">Produto na loja</th>
                </tr>
              </thead>
              <tbody>
                {previa.itens.map((i, n) => (
                  <tr key={n} className="border-b">
                    <td className="px-3 py-2">
                      <div className="font-medium">{i.descricao}</div>
                      <div className="font-mono text-xs text-muted-foreground">{i.codigo}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {i.quantidade.toLocaleString("pt-BR")} {i.unidade}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{formatBRL(i.valorUnitario)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatBRL(i.valorTotal)}</td>
                    <td className="px-3 py-2">
                      {i.produto ? (
                        <span>
                          <Badge variant="success">reconhecido</Badge>{" "}
                          <span className="text-xs">{i.produto.sku} · {i.produto.nome}</span>
                        </span>
                      ) : (
                        <Badge variant="warning">não cadastrado</Badge>
                      )}
                    </td>
                  </tr>
                ))}
                {previa.itens.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                      A nota não tem itens.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="accent" disabled={ocupado || bloqueada || semNenhum || undefined} onClick={darEntrada}>
              {ocupado ? "Dando entrada…" : "Dar entrada no estoque"}
            </Button>
            <Button
              variant="outline"
              disabled={ocupado}
              onClick={() => {
                setPrevia(null);
                setArquivo(null);
                if (input.current) input.current.value = "";
              }}
            >
              Cancelar
            </Button>
            <span className="text-xs text-muted-foreground">
              {previa.reconhecidos} de {previa.itens.length} itens reconhecidos. Nada foi gravado ainda.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{rotulo}</div>
      <div className="font-medium">{valor}</div>
    </div>
  );
}
