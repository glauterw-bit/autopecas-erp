import axios from "axios";

// Balança de checkout
// ===================
// Auto peças vende produtos por peso (lubrificantes a granel, sucata, etc.).
// O sistema fala com a balança via o "Agente Local PDV" (HTTP 127.0.0.1) que
// internamente abre a porta serial (RS-232 ou USB virtual) e implementa o
// protocolo de cada fabricante:
//
//   - Toledo Prix III / 9091  → ENQ (0x05), balança devolve STX peso ETX
//   - Toledo Prix 6           → AA 55 00, devolve frame binário
//   - Filizola Platina        → comando "STX P ETX", devolve "STX peso ETX checksum"
//   - Urano POP-S             → comando "PESO\r", devolve "$NNNN\r"
//
// A camada cloud nunca conversa com a serial direto — sempre passa pelo agente.

export type ModeloBalanca =
  | "TOLEDO_PRIX_III"
  | "TOLEDO_PRIX_6"
  | "FILIZOLA_PLATINA"
  | "URANO_POP_S"
  | "GENERICO";

export interface LeituraBalanca {
  peso: number;      // kg
  estavel: boolean;  // true se a balança sinalizou estabilização
  unidade: "kg" | "g";
  modelo: ModeloBalanca;
  bruto?: string;    // resposta original para auditoria
}

export class BalancaLocalClient {
  constructor(private readonly baseUrl = "http://127.0.0.1:60908") {}

  async lerPeso(modelo: ModeloBalanca = "TOLEDO_PRIX_III"): Promise<LeituraBalanca> {
    const { data } = await axios.get(`${this.baseUrl}/api/balanca/peso`, {
      params: { modelo },
      timeout: 5000,
    });
    return data as LeituraBalanca;
  }

  // Aguarda leitura estável (balança sinaliza estabilidade, ou polling até
  // 3 leituras consecutivas iguais dentro de 5s).
  async lerPesoEstavel(modelo: ModeloBalanca = "TOLEDO_PRIX_III"): Promise<LeituraBalanca> {
    const inicio = Date.now();
    let ultima: LeituraBalanca | null = null;
    let iguais = 0;
    while (Date.now() - inicio < 5000) {
      const cur = await this.lerPeso(modelo);
      if (cur.estavel) return cur;
      if (ultima && Math.abs(cur.peso - ultima.peso) < 0.005) {
        iguais++;
        if (iguais >= 3) return cur;
      } else {
        iguais = 0;
      }
      ultima = cur;
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!ultima) throw new Error("Falha ao ler balança");
    return ultima;
  }

  async zerar(modelo: ModeloBalanca = "TOLEDO_PRIX_III") {
    await axios.post(`${this.baseUrl}/api/balanca/zerar`, { modelo });
  }

  async tara(pesoTara: number, modelo: ModeloBalanca = "TOLEDO_PRIX_III") {
    await axios.post(`${this.baseUrl}/api/balanca/tara`, { peso: pesoTara, modelo });
  }
}

// Implementação de referência do parser de cada protocolo — usado pelo
// Agente Local. Mantemos aqui para documentação e testes.
//
// Toledo Prix III: encia ENQ (0x05). Balança responde:
//   STX (0x02) + 5 bytes ASCII peso em gramas + ETX (0x03) + CR (0x0D)
//   Ex.: STX "01234" ETX CR  → 1234g (estável) ou "I" no início = instável
export function parseToledoPrix3(buffer: Buffer): LeituraBalanca {
  const s = buffer.toString("ascii");
  const stxIdx = s.indexOf("\x02");
  const etxIdx = s.indexOf("\x03");
  if (stxIdx < 0 || etxIdx < 0) throw new Error("Frame Toledo inválido");
  const body = s.slice(stxIdx + 1, etxIdx);
  const instavel = body.startsWith("I");
  const num = body.replace(/[^0-9.]/g, "");
  const gramas = Number(num);
  return {
    peso: gramas / 1000,
    estavel: !instavel,
    unidade: "kg",
    modelo: "TOLEDO_PRIX_III",
    bruto: s,
  };
}

// Filizola Platina: STX P ETX → STX "+00.000kg" ETX BCC
export function parseFilizolaPlatina(buffer: Buffer): LeituraBalanca {
  const s = buffer.toString("ascii");
  const stx = s.indexOf("\x02");
  const etx = s.indexOf("\x03");
  if (stx < 0 || etx < 0) throw new Error("Frame Filizola inválido");
  const body = s.slice(stx + 1, etx);
  const m = body.match(/([+-]?\d+\.\d+)\s*(kg|g)?/i);
  if (!m) throw new Error("Não foi possível ler peso Filizola");
  const peso = Number(m[1]);
  return {
    peso: m[2]?.toLowerCase() === "g" ? peso / 1000 : peso,
    estavel: true,
    unidade: "kg",
    modelo: "FILIZOLA_PLATINA",
    bruto: s,
  };
}

// Urano POP-S: "PESO\r" → "$1234.56\r" (kg com decimal)
export function parseUranoPopS(buffer: Buffer): LeituraBalanca {
  const s = buffer.toString("ascii").trim();
  if (!s.startsWith("$")) throw new Error("Frame Urano inválido");
  const peso = Number(s.slice(1));
  return {
    peso: Number.isNaN(peso) ? 0 : peso,
    estavel: true,
    unidade: "kg",
    modelo: "URANO_POP_S",
    bruto: s,
  };
}
