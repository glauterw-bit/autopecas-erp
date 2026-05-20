// Impressora térmica ESC/POS (Bematech, Epson, Elgin, etc.)
// =========================================================
// Gera o binário ESC/POS do cupom para impressão direta.
// O agente local do PDV (mesmo do TEF) recebe esse buffer e manda
// para a impressora via USB/Serial/Rede.

const ESC = 0x1b;
const GS = 0x1d;

export class EscPosBuilder {
  private buf: number[] = [];

  init() {
    this.buf.push(ESC, 0x40);
    return this;
  }

  texto(s: string) {
    for (const c of s) this.buf.push(c.charCodeAt(0));
    return this;
  }

  linha(s = "") {
    this.texto(s + "\n");
    return this;
  }

  negrito(on: boolean) {
    this.buf.push(ESC, 0x45, on ? 1 : 0);
    return this;
  }

  centralizar() {
    this.buf.push(ESC, 0x61, 1);
    return this;
  }
  alinharEsquerda() {
    this.buf.push(ESC, 0x61, 0);
    return this;
  }
  alinharDireita() {
    this.buf.push(ESC, 0x61, 2);
    return this;
  }

  duploTamanho(on: boolean) {
    this.buf.push(GS, 0x21, on ? 0x11 : 0x00);
    return this;
  }

  separador(caractere = "-", colunas = 48) {
    return this.linha(caractere.repeat(colunas));
  }

  // QR Code (modelo 2). Usado para Pix copia-e-cola e NFC-e.
  qrCode(texto: string) {
    const len = texto.length + 3;
    const pL = len & 0xff;
    const pH = (len >> 8) & 0xff;
    this.buf.push(GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0x00);
    this.buf.push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, 0x08); // tamanho módulo
    this.buf.push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x30); // correção
    this.buf.push(GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30);
    for (const c of texto) this.buf.push(c.charCodeAt(0));
    this.buf.push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30); // imprime
    return this;
  }

  cortar() {
    this.buf.push(GS, 0x56, 0x42, 0x00);
    return this;
  }

  abrirGaveta() {
    this.buf.push(ESC, 0x70, 0x00, 0x40, 0x50);
    return this;
  }

  build(): Buffer {
    return Buffer.from(this.buf);
  }
}

// Helpers de alto nível para cupom de venda.
export interface DadosCupom {
  empresa: { razaoSocial: string; cnpj: string; endereco?: string };
  numeroVenda: number;
  itens: Array<{ nome: string; quantidade: number; precoUnitario: number; total: number }>;
  total: number;
  formaPagamento: string;
  cliente?: string;
  veiculo?: string;
  nfceChave?: string;
  nfceQrCode?: string;
}

export function cupomVenda(d: DadosCupom): Buffer {
  const b = new EscPosBuilder().init().centralizar().negrito(true).duploTamanho(true);
  b.linha(d.empresa.razaoSocial.toUpperCase()).duploTamanho(false).negrito(false);
  b.linha(`CNPJ ${d.empresa.cnpj}`);
  if (d.empresa.endereco) b.linha(d.empresa.endereco);
  b.separador();
  b.alinharEsquerda().linha(`CUPOM #${d.numeroVenda}`);
  if (d.cliente) b.linha(`Cliente: ${d.cliente}`);
  if (d.veiculo) b.linha(`Veículo: ${d.veiculo}`);
  b.separador();
  for (const it of d.itens) {
    b.linha(it.nome.slice(0, 47));
    b.linha(
      `  ${it.quantidade.toFixed(2)} x R$ ${it.precoUnitario.toFixed(2).padStart(8)}  = R$ ${it.total.toFixed(2).padStart(10)}`,
    );
  }
  b.separador();
  b.alinharDireita().negrito(true).linha(`TOTAL: R$ ${d.total.toFixed(2)}`).negrito(false);
  b.alinharEsquerda().linha(`Pagamento: ${d.formaPagamento}`);
  if (d.nfceQrCode) {
    b.separador().centralizar().linha("Consulte sua NFC-e em:").qrCode(d.nfceQrCode);
    if (d.nfceChave) b.linha(`Chave: ${d.nfceChave}`);
  }
  b.linha("\n\n").cortar();
  return b.build();
}
