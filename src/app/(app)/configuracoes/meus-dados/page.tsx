import { exigirPerfilPagina } from "@/lib/auth/pagina";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function MeusDadosPage() {
  await exigirPerfilPagina("/configuracoes/meus-dados", "ADMIN");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Meus dados</h1>
        <p className="text-muted-foreground">
          Leve uma cópia dos dados da sua loja e atenda pedidos dos seus clientes sobre os dados deles.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Baixar todos os dados da empresa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Gera um arquivo ZIP com planilhas (CSV) de produtos, aplicações veiculares, estoque, clientes, fornecedores, vendas e itens,
            contas a receber e a pagar e movimentação de estoque, mais os XMLs das notas que o sistema tem gravados. Senhas não vão no arquivo.
          </p>
          <p>
            Pode demorar alguns instantes em lojas com muito movimento. Dá para pedir até 3 vezes por hora. Cada pedido fica registrado.
          </p>
          <a
            href="/api/lgpd/exportar"
            className="inline-block rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground"
          >
            Baixar meus dados (ZIP)
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pedido de um cliente seu sobre os dados dele</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Gerente ou administrador pode baixar os dados de um cliente (JSON) ou remover os dados pessoais dele. Vendas e notas ficam,
            porque a lei exige. A remoção não é feita se o cliente tiver conta a receber em aberto.
          </p>
          <p className="text-muted-foreground">
            Por enquanto isso é feito pelo endereço <code>/api/lgpd/titular</code> (consulte o suporte); a tela de atendimento virá depois.
          </p>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Leia também os <Link href="/termos" className="underline">termos de uso</Link>, a{" "}
        <Link href="/privacidade" className="underline">política de privacidade</Link> e o{" "}
        <Link href="/dpa" className="underline">contrato de operador de dados</Link>.
      </p>
    </div>
  );
}
