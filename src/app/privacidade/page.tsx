import type { Metadata } from "next";
import { DocumentoLegal, H2, Lista, P, Preencher } from "@/components/legal/documento";

export const metadata: Metadata = { title: "Política de privacidade | AutoPeças ERP" };

export default function PrivacidadePage() {
  return (
    <DocumentoLegal titulo="Política de privacidade">
      <P>
        Esta política explica como tratamos dados pessoais no AutoPeças ERP, conforme a Lei 13.709/2018 (LGPD). Quem
        responde por ele é <strong><Preencher>razão social do SaaS</Preencher></strong>, CNPJ{" "}
        <Preencher>CNPJ</Preencher>, <Preencher>endereço</Preencher>.
      </P>

      <H2>1. Quem é quem</H2>
      <Lista>
        <li><strong>Dados da própria loja e dos usuários dela</strong> (cadastro da empresa, dados de login, cobrança): somos <strong>controladores</strong>.</li>
        <li><strong>Dados dos clientes, fornecedores e vendas da loja</strong>, que a loja coloca no sistema: a loja é a <strong>controladora</strong> e nós somos <strong>operadores</strong>, só tratamos conforme as instruções dela (veja o <a href="/dpa" className="underline">contrato de operador de dados</a>). Quem é cliente de uma loja deve pedir os seus direitos à própria loja.</li>
      </Lista>

      <H2>2. Quais dados coletamos, para quê e com qual base legal</H2>
      <Lista>
        <li>
          <strong>Cadastro da loja e dos usuários</strong> (razão social, CNPJ, endereço, e-mail e telefone da empresa; nome, e-mail, perfil
          e hash da senha dos usuários; opcionalmente o segredo do 2FA). Para criar a conta e prestar o serviço.
          Base: execução de contrato (LGPD, art. 7º, V).
        </li>
        <li>
          <strong>Registros de acesso e segurança</strong> (IP, navegador, datas de login, sessões, histórico de auditoria). Para segurança, prevenção a
          fraude e prova de quem fez o quê. Base: legítimo interesse (art. 7º, IX) e exercício regular de direitos (art. 7º, VI).
        </li>
        <li>
          <strong>Aceite dos documentos legais</strong> (usuário, versão, IP, navegador, data). Para provar o aceite. Base: exercício regular de direitos (art. 7º, VI).
        </li>
        <li>
          <strong>Cobrança</strong> (plano, vencimentos, situação do pagamento; os dados de cartão ou conta ficam no provedor de cobrança, não
          em nosso banco). Base: execução de contrato (art. 7º, V) e obrigação legal fiscal (art. 7º, II).
        </li>
        <li>
          <strong>Dados que a loja lança no sistema</strong> (clientes: nome, CPF/CNPJ, contato, endereço, veículos e placas; fornecedores; vendas;
          financeiro; notas fiscais). Tratados como operadores, para a loja operar o negócio. A base legal é da loja, normalmente execução de contrato
          com o cliente (art. 7º, V) e obrigação legal fiscal (art. 7º, II).
        </li>
        <li>
          <strong>Documentos fiscais e lançamentos contábeis</strong>: guardados por obrigação legal (art. 7º, II) mesmo depois do cancelamento.
        </li>
      </Lista>
      <P>Não vendemos dados e não usamos os dados dos clientes da loja para anúncios.</P>

      <H2>3. Suboperadores</H2>
      <div id="suboperadores" />
      <P>
        Empresas que recebem dados para o serviço funcionar. O país indica onde a empresa opera; lojas e usuários devem
        saber que há transferência internacional quando o país não for o Brasil (LGPD, art. 33).
      </P>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left"><th className="p-2">Empresa</th><th className="p-2">Para quê</th><th className="p-2">País</th><th className="p-2">O que recebe</th></tr>
          </thead>
          <tbody className="align-top">
            <tr className="border-b"><td className="p-2">Railway</td><td className="p-2">Hospedagem do sistema e do banco de dados</td><td className="p-2"><Preencher>país/região do projeto no Railway</Preencher></td><td className="p-2">Todos os dados do sistema (é onde ficam guardados)</td></tr>
            <tr className="border-b"><td className="p-2">Focus NFe</td><td className="p-2">Emissão e consulta de notas fiscais</td><td className="p-2">Brasil <Preencher>confirmar local dos servidores</Preencher></td><td className="p-2">Dados da nota: emitente, destinatário (nome, documento, endereço), itens e valores</td></tr>
            <tr className="border-b"><td className="p-2">OpenAI</td><td className="p-2">Assistente de IA, <strong>só quando a loja usa</strong> os recursos de IA</td><td className="p-2">Estados Unidos <Preencher>confirmar</Preencher></td><td className="p-2">Recebe: a pergunta ou mensagem digitada, e dados de produto, preço e estoque necessários para responder. Não enviamos CPF/CNPJ, e-mail, endereço, dados financeiros nem senhas; se quem escreve a mensagem digitar esse tipo de dado no texto, ele vai junto. A IA sugere e a pessoa confirma; ela não define preço nem estoque.</td></tr>
            <tr className="border-b"><td className="p-2">Asaas</td><td className="p-2">Cobrança da assinatura</td><td className="p-2">Brasil <Preencher>confirmar; só vale quando a cobrança estiver ativa</Preencher></td><td className="p-2">Nome/razão social, CNPJ e e-mail do responsável pela assinatura, valores</td></tr>
            <tr className="border-b"><td className="p-2">Resend</td><td className="p-2">Envio de e-mails do sistema (convite de usuário, redefinição de senha, avisos)</td><td className="p-2">Estados Unidos <Preencher>confirmar</Preencher></td><td className="p-2">E-mail do destinatário e o texto da mensagem</td></tr>
            <tr className="border-b"><td className="p-2">Mercado Livre e Shopee</td><td className="p-2">Sincronizar anúncios, pedidos e mensagens, <strong>só quando a loja conecta</strong> a conta</td><td className="p-2"><Preencher>país de cada uma</Preencher></td><td className="p-2">Anúncios, estoque e preços que a loja publica; recebemos pedidos e mensagens dos compradores. Cada marketplace é controlador dos dados dele, conforme os termos dele.</td></tr>
          </tbody>
        </table>
      </div>
      <P>Se incluirmos ou trocarmos suboperador, esta lista é atualizada e a loja é avisada.</P>

      <H2>4. Por quanto tempo guardamos</H2>
      <Lista>
        <li>Dados da loja: enquanto o contrato durar e por mais 90 dias depois do cancelamento (30 dias para exportar), quando os dados operacionais são apagados.</li>
        <li>Documentos fiscais e lançamentos contábeis: 5 anos, por obrigação legal (Código Tributário Nacional, Lei 5.172/1966, arts. 173 e 174).</li>
        <li>Sessões de login: 7 dias.</li>
        <li>Registros de auditoria e aceites: <Preencher>prazo de guarda</Preencher>.</li>
      </Lista>

      <H2>5. Direitos do titular</H2>
      <P>
        Você pode pedir: confirmação de que tratamos seus dados, acesso, correção, anonimização, bloqueio ou eliminação
        de dados desnecessários, portabilidade, informação sobre com quem compartilhamos, e revogar o consentimento,
        quando for essa a base (LGPD, art. 18). Para os dados que tratamos como controladores, escreva ao encarregado
        (item 6); respondemos em até <Preencher>prazo de resposta, a lei pede resposta simplificada imediata ou completa em até 15 dias</Preencher>.
        Se você é cliente de uma loja, o pedido deve ir à loja, que usa o sistema para exportar ou remover seus dados;
        notas fiscais e vendas já emitidas continuam guardadas porque a lei exige.
      </P>

      <H2>6. Encarregado pelo tratamento de dados (DPO)</H2>
      <P>
        Nome: <Preencher>nome do encarregado</Preencher> · E-mail: <Preencher>e-mail do encarregado</Preencher>
      </P>

      <H2>7. Segurança e incidentes</H2>
      <P>
        Usamos isolamento de dados por empresa, senhas com hash, 2FA, perfis de acesso e registro de auditoria (detalhes
        no <a href="/dpa" className="underline">DPA</a>). Se houver incidente que possa causar risco ou dano relevante,
        avisamos as lojas afetadas e, quando formos os controladores, a ANPD e os titulares, nos prazos da lei (art. 48
        da LGPD e Resolução CD/ANPD nº 15/2024).
      </P>

      <H2>8. Cookies</H2>
      <P>
        Usamos só cookies essenciais: o cookie de sessão de login (&quot;ap_auth&quot;, que expira em 7 dias) e o de
        funcionamento da segurança do portal. Guardamos também no navegador a preferência de tema claro/escuro. Não usamos
        cookies de publicidade nem de rastreamento, por isso não há faixa de consentimento de cookies.
      </P>

      <H2>9. Mudanças</H2>
      <P>Avisamos no sistema quando esta política mudar de forma relevante. A versão e a data ficam no topo.</P>
    </DocumentoLegal>
  );
}
