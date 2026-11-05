import Link from "next/link";
import { PackageX, PhoneCall, ShieldCheck, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Os números da aposta "Balcão que aprende": vendas perdidas registradas,
// % do cadastro com aplicação verificada e oficinas em risco contatadas.
export function BalcaoCard(props: {
  vendasPerdidas7d: number;
  pctVerificado: number;
  produtosEmRevisao: number;
  oficinasEmRisco: number;
  oficinasContatadas7d: number;
}) {
  const itens = [
    {
      href: "/relatorios/vendas-perdidas",
      icon: PackageX,
      titulo: "Vendas perdidas (7 dias)",
      valor: String(props.vendasPerdidas7d),
      sub: "registradas no balcão",
    },
    {
      href: "/produtos/qualidade?problema=NAO_VERIFICADO",
      icon: ShieldCheck,
      titulo: "Aplicação verificada",
      valor: `${props.pctVerificado}%`,
      sub: "do cadastro ativo",
    },
    {
      href: "/produtos/qualidade?problema=REVISAO",
      icon: Wrench,
      titulo: "Produtos para revisar",
      valor: String(props.produtosEmRevisao),
      sub: "marcados por devolução ou à mão",
    },
    {
      href: "/clientes/em-risco",
      icon: PhoneCall,
      titulo: "Oficinas em risco",
      valor: String(props.oficinasEmRisco),
      sub: `${props.oficinasContatadas7d} contatada(s) nos últimos 7 dias`,
    },
  ];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Balcão que aprende</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {itens.map((i) => {
          const Icon = i.icon;
          return (
            <Link
              key={i.titulo}
              href={i.href}
              className="rounded-md border p-3 transition-colors hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Icon className="h-3.5 w-3.5" /> {i.titulo}
              </div>
              <div className="mt-1 text-2xl font-bold">{i.valor}</div>
              <div className="text-xs text-muted-foreground">{i.sub}</div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
