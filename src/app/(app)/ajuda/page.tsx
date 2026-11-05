import { exigirPerfilPagina } from "@/lib/auth/pagina";
import { LifeBuoy, MessageCircle, Mail } from "lucide-react";

// Ajuda e suporte. O canal vem de env (SUPORTE_WHATSAPP, SUPORTE_EMAIL, SUPORTE_HORARIO).
// Página de servidor: lê a env a cada pedido.
export const dynamic = "force-dynamic";

const PERGUNTAS: { titulo: string; resposta: string }[] = [
  {
    titulo: "Primeiros passos",
    resposta:
      "Cadastre os produtos (ou importe a planilha), confira o estoque, cadastre os usuários e seus perfis e faça uma venda de teste no PDV. Peça nota fiscal só depois de a configuração fiscal estar pronta.",
  },
  {
    titulo: "Como cadastrar um produto",
    resposta:
      "Em Produtos, use o botão de novo produto. Preencha nome, código, preço e dados fiscais (NCM, origem). Sem os dados fiscais o sistema não deixa emitir nota do item.",
  },
  {
    titulo: "Como vender no PDV",
    resposta:
      "Abra o caixa, leia o código de barras ou digite o nome da peça, escolha o cliente se precisar, confira o total e finalize com a forma de pagamento. A venda só entra nos números depois de finalizada.",
  },
  {
    titulo: "Como fazer uma devolução",
    resposta:
      "Abra a tela de devolução do PDV (Devolução), localize a venda original e escolha os itens e as quantidades. O estoque volta e, se a venda tinha nota, o sistema orienta a nota de devolução.",
  },
  {
    titulo: "Como emitir a nota fiscal",
    resposta:
      "Use a tela Fiscal (e a opção de emitir nota na venda, quando houver). O sistema confere os dados antes de enviar e explica o que está errado, se algo estiver. Se houver dúvida fiscal, ele bloqueia em vez de deixar passar.",
  },
  {
    titulo: "Como importar produtos, clientes ou estoque",
    resposta:
      "Use a importação em Configurações (Implantação). Envie a planilha, veja a prévia com os erros apontados linha a linha, corrija e só então confirme. Nada é gravado antes da confirmação.",
  },
  {
    titulo: "Usuários e perfis",
    resposta:
      "Quem administra cria os usuários em Configurações. Cada perfil enxerga só o que precisa: por exemplo, o caixa não vê financeiro. Se uma tela mostrar 'sem acesso', peça a quem administra para ajustar o perfil.",
  },
  {
    titulo: "A nota não saiu. O que fazer?",
    resposta:
      "Em Fiscal, veja a situação da nota. Em 'Emitindo' ela está sendo processada: aguarde alguns minutos, o sistema consulta sozinho. Se ficar 'Rejeitada', leia o motivo, corrija o cadastro (muitas vezes NCM, CFOP ou endereço do cliente) e emita de novo. Se passar de 30 minutos em 'Emitindo' ou o motivo não fizer sentido, chame o suporte e informe o número da venda.",
  },
];

export default async function AjudaPage() {
  await exigirPerfilPagina("/ajuda", "ESTOQUISTA"); // qualquer usuário logado (ESTOQUISTA é o perfil mais baixo)
  const whats = process.env.SUPORTE_WHATSAPP?.replace(/\D/g, "");
  const email = process.env.SUPORTE_EMAIL;
  const horario = process.env.SUPORTE_HORARIO;
  const temCanal = !!(whats || email);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <LifeBuoy className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Ajuda</h1>
      </div>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Falar com o suporte</h2>
        {temCanal ? (
          <div className="mt-3 space-y-2 text-sm">
            {whats && (
              <a className="flex items-center gap-2 text-accent underline" href={`https://wa.me/${whats}`} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </a>
            )}
            {email && (
              <a className="flex items-center gap-2 text-accent underline" href={`mailto:${email}`}>
                <Mail className="h-4 w-4" /> {email}
              </a>
            )}
            {horario && <p className="text-muted-foreground">Atendimento: {horario}</p>}
            <p className="text-muted-foreground">
              Se aparecer uma mensagem de erro com um código, envie o código junto. Ele ajuda a achar o problema.
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            O canal de suporte ainda não foi configurado. Fale com quem administra o sistema na sua loja.
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Perguntas frequentes</h2>
        {PERGUNTAS.map((p) => (
          <details key={p.titulo} className="rounded-lg border bg-card p-4">
            <summary className="cursor-pointer text-sm font-medium">{p.titulo}</summary>
            <p className="mt-2 text-sm text-muted-foreground">{p.resposta}</p>
          </details>
        ))}
      </section>
    </div>
  );
}
