// Leitura de CSV exportado de planilha ou de sistema antigo
// =========================================================
// - Detecta o separador (";" do Excel em português, "," ou TAB).
// - Aceita aspas com separador e quebra de linha dentro, e "" como aspas.
// - Remove BOM e linhas totalmente vazias.
// Planilha .xlsx: salvar como "CSV UTF-8" ou "CSV (separado por ponto e vírgula)".

export type CsvLido = {
  cabecalhos: string[];
  linhas: string[][]; // só dados, sem o cabeçalho
  numeroLinha: number[]; // número da linha no arquivo (1 = cabeçalho) de cada linha de dados
  separador: string;
};

export function detectarSeparador(primeiraLinha: string): string {
  const candidatos = [";", ",", "\t", "|"];
  let melhor = ";";
  let max = -1;
  for (const c of candidatos) {
    // conta fora de aspas
    let n = 0;
    let dentro = false;
    for (const ch of primeiraLinha) {
      if (ch === '"') dentro = !dentro;
      else if (ch === c && !dentro) n++;
    }
    if (n > max) {
      max = n;
      melhor = c;
    }
  }
  return melhor;
}

export function lerCsv(texto: string, separador?: string): CsvLido {
  const t = texto.replace(/^﻿/, "");
  const fimPrimeira = t.search(/\r?\n/);
  const sep = separador ?? detectarSeparador(fimPrimeira >= 0 ? t.slice(0, fimPrimeira) : t);

  const registros: { campos: string[]; linha: number }[] = [];
  let campo = "";
  let campos: string[] = [];
  let dentro = false;
  let linhaAtual = 1;
  let linhaInicio = 1;

  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (dentro) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          campo += '"';
          i++;
        } else dentro = false;
      } else {
        if (ch === "\n") linhaAtual++;
        campo += ch;
      }
      continue;
    }
    if (ch === '"' && campo.trim() === "") {
      campo = "";
      dentro = true;
    } else if (ch === sep) {
      campos.push(campo);
      campo = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      campos.push(campo);
      registros.push({ campos, linha: linhaInicio });
      campos = [];
      campo = "";
      linhaAtual++;
      linhaInicio = linhaAtual;
    } else {
      campo += ch;
    }
  }
  if (campo !== "" || campos.length > 0) {
    campos.push(campo);
    registros.push({ campos, linha: linhaInicio });
  }

  const naoVazios = registros.filter((r) => r.campos.some((c) => c.trim() !== ""));
  if (naoVazios.length === 0) return { cabecalhos: [], linhas: [], numeroLinha: [], separador: sep };
  const [cab, ...resto] = naoVazios;
  return {
    cabecalhos: cab.campos.map((c) => c.trim()),
    linhas: resto.map((r) => r.campos.map((c) => c.trim())),
    numeroLinha: resto.map((r) => r.linha),
    separador: sep,
  };
}

// Gera CSV (separador ";", que o Excel em português abre direto).
export function gerarCsv(linhas: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + linhas.map((l) => l.map(esc).join(";")).join("\r\n") + "\r\n";
}
