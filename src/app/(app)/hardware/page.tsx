import { Printer, CreditCard, Cpu, ScanLine, Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const dispositivos = [
  {
    icon: CreditCard,
    titulo: "TEF — SiTef PinPad",
    descricao:
      "Cartão débito/crédito/voucher, Pix QR no display, parcelamento até 12x. Cancelamento NSU, confirmação obrigatória.",
    detalhe: "src/lib/pdv/tef.ts — AgenteTefClient (HTTP 127.0.0.1:60906)",
    bandeiras: ["Visa", "Mastercard", "Elo", "Hipercard", "Amex", "Pix"],
  },
  {
    icon: Cpu,
    titulo: "SAT-CF-e (modelo 59)",
    descricao:
      "Equipamento autenticador para CF-e em estados que ainda usam SAT (principalmente SP). Envio, consulta e cancelamento.",
    detalhe: "src/lib/pdv/sat.ts — SatLocalClient (HTTP 127.0.0.1:60907)",
    bandeiras: ["Dimep", "Bematech", "Elgin", "Sweda", "Tanca"],
  },
  {
    icon: Printer,
    titulo: "Impressora térmica ESC/POS",
    descricao:
      "Builder de bytes ESC/POS para cupom de venda, cupom NFC-e com QR Code, abertura de gaveta automática.",
    detalhe: "src/lib/pdv/impressora.ts — EscPosBuilder + cupomVenda()",
    bandeiras: ["Bematech", "Epson", "Elgin", "Daruma", "Diebold"],
  },
  {
    icon: ScanLine,
    titulo: "Leitor código de barras / QR",
    descricao:
      "Suporte nativo via HID (teclado). PDV já bipa SKU/EAN/OEM no campo de busca sem driver extra.",
    detalhe: "Componente PDV já integrado",
    bandeiras: ["Honeywell", "Zebra", "Bematech", "Elgin"],
  },
  {
    icon: Receipt,
    titulo: "Balança de checkout",
    descricao:
      "Captura peso para produtos vendidos por kg (lubrificantes a granel, sucata). Protocolo Toledo Prix III, Filizola Platina, Urano POP-S.",
    detalhe: "src/lib/pdv/balanca.ts — BalancaLocalClient + parsers protocolares",
    bandeiras: ["Toledo Prix III", "Toledo Prix 6", "Filizola Platina", "Urano POP-S"],
  },
];

export default function HardwarePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Hardware PDV</h1>
        <p className="text-muted-foreground">
          Integração com equipamentos físicos do balcão via Agente Local
          (HTTP 127.0.0.1). O sistema cloud envia comandos; o agente fala
          USB/Serial/Ethernet com cada dispositivo.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {dispositivos.map((d) => {
          const Icon = d.icon;
          return (
            <Card key={d.titulo}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent/10 text-accent">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-base">{d.titulo}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{d.descricao}</p>
                <div className="mt-3 font-mono text-xs text-muted-foreground">{d.detalhe}</div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {d.bandeiras.map((b) => (
                    <Badge key={b} variant="outline" className="text-xs">{b}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
