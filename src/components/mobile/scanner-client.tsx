"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ScanLine } from "lucide-react";

// Scanner de código de barras usando a Web BarcodeDetector API (Chrome/Edge
// Android e iOS Safari 17+). Para navegadores sem suporte, exibe input manual.
// Detecta EAN-13, EAN-8, Code-128, QR Code (NFC-e), DataMatrix.

interface ProdutoEncontrado {
  id: string;
  sku: string;
  nome: string;
  marca: string | null;
  precoVenda: number;
  estoque: number;
}

interface BarcodeDetectorPolyfill {
  new (opts: { formats: string[] }): {
    detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string; format: string }>>;
  };
}

export function ScannerClient() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ativo, setAtivo] = useState(false);
  const [codigoLido, setCodigoLido] = useState<string | null>(null);
  const [produto, setProduto] = useState<ProdutoEncontrado | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erroBusca, setErroBusca] = useState<string | null>(null);

  useEffect(() => {
    type WindowExtra = typeof window & { BarcodeDetector?: BarcodeDetectorPolyfill };
    const W = window as WindowExtra;
    if (!W.BarcodeDetector) {
      setErro("Seu navegador não suporta scanner nativo. Use o input abaixo.");
      return;
    }
    const detector = new W.BarcodeDetector({
      formats: ["ean_13", "ean_8", "code_128", "code_39", "qr_code", "data_matrix"],
    });

    let stream: MediaStream | null = null;
    let parar = false;

    async function iniciar() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setAtivo(true);

        const loop = async () => {
          if (parar || !videoRef.current) return;
          try {
            const codigos = await detector.detect(videoRef.current);
            if (codigos.length > 0) {
              setCodigoLido(codigos[0].rawValue);
              await buscar(codigos[0].rawValue);
              return;
            }
          } catch {
            /* ignora frames com falha */
          }
          requestAnimationFrame(loop);
        };
        loop();
      } catch (e) {
        setErro((e as Error).message);
      }
    }

    iniciar();

    return () => {
      parar = true;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function buscar(codigo: string) {
    setCarregando(true);
    try {
      setErroBusca(null);
      const r = await fetch(`/api/produtos/buscar-pdv?q=${encodeURIComponent(codigo)}`);
      if (!r.ok) throw new Error("Não foi possível buscar agora. Confira a conexão e tente de novo.");
      const lista = (await r.json()) as ProdutoEncontrado[];
      setProduto(lista[0] ?? null);
      if (!lista[0]) setErroBusca("Nenhuma peça com esse código.");
    } catch (e) {
      setProduto(null);
      setErroBusca((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b p-3">
        <Link href="/m" className="rounded-md p-1.5">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-base font-semibold">Bipar peça</h1>
      </header>

      <div className="relative aspect-square w-full bg-black">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          muted
        />
        {ativo && !produto && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-2/3 w-4/5 rounded-2xl border-4 border-accent">
              <ScanLine className="absolute inset-0 m-auto h-12 w-12 animate-pulse text-accent" />
            </div>
          </div>
        )}
        {erro && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4 text-center text-sm text-white">
            {erro}
          </div>
        )}
      </div>

      <div className="flex-1 p-4">
        {codigoLido && (
          <div className="mb-3 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <CheckCircle2 className="mr-1 inline h-4 w-4" />
            Código lido: <strong className="font-mono">{codigoLido}</strong>
          </div>
        )}
        {carregando && <p className="text-sm text-muted-foreground">Buscando...</p>}
        {erroBusca && !carregando && (
          <p role="alert" className="text-sm text-destructive">
            {erroBusca}
          </p>
        )}
        {produto && (
          <div className="rounded-xl border bg-card p-4">
            <div className="text-xs text-muted-foreground">SKU {produto.sku}</div>
            <div className="text-lg font-semibold">{produto.nome}</div>
            <div className="mt-1 text-sm text-muted-foreground">{produto.marca}</div>
            <div className="mt-3 flex items-end justify-between">
              <div>
                <div className="text-xs text-muted-foreground">Estoque</div>
                <div className="font-semibold">{produto.estoque} un</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Preço</div>
                <div className="text-2xl font-bold">
                  {produto.precoVenda.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </div>
              </div>
            </div>
          </div>
        )}

        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const v = String(fd.get("codigo") ?? "");
            if (v) {
              setCodigoLido(v);
              buscar(v);
            }
          }}
        >
          <label htmlFor="scanner-codigo" className="text-xs text-muted-foreground">Digitar código:</label>
          <input
            id="scanner-codigo"
            name="codigo"
            placeholder="SKU, EAN ou OEM"
            className="mt-1 h-12 w-full rounded-md border bg-background px-3 text-base"
          />
        </form>
      </div>
    </div>
  );
}
