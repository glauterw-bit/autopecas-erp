import type { Metadata } from "next";
import { DocumentoLegal, H2, Lista, P, Preencher } from "@/components/legal/documento";

export const metadata: Metadata = { title: "Contrato de operador de dados (DPA) | AutoPeças ERP" };

export default function DpaPage() {
  return (
    <DocumentoLegal titulo="Contrato de operador de dados (DPA)">
      <P>
        Este contrato complementa os <a href="/termos" className="underline">termos de uso</a> e trata dos dados pessoais
        que a loja coloca no sistema. A <strong>loja</strong> (contratante) é a <strong>controladora</strong> dos dados dos clientes
        dela, dos seus fornecedores e dos seus usuários finais; <strong><Preencher>razão social do SaaS</Preencher></strong>,
        CNPJ <Preencher>CNPJ</Preencher> (&quot;nós&quot;), é a <strong>operadora</strong>, nos termos da Lei 13.709/2018 (LGPD), art. 5º,
        incisos VI e VII.
      </P>

      <H2>1. Objeto e dados tratados</H2>
      <P>
        Hospedar e processar, em nome da loja, os dados necessários ao funcionamento do sistema: cadastro de clientes
        (nome, CPF/CNPJ, contato, endereço, veículos), fornecedores, vendas, financeiro, notas fiscais e usuários da loja.
        Duração: enquanto durar o contrato, mais os prazos de devolução e eliminação do item 8.
      </P>

      <H2>2. Instruções da loja</H2>
      <P>
        Tratamos os dados só para prestar o serviço e conforme as instruções da loja, que são: este contrato, os
        termos de uso e o que a loja faz no sistema. Não usamos os dados dos clientes da loja para outra finalidade,
        nem para marketing nosso. Se uma instrução nos parecer contrária à lei, avisamos a loja (LGPD, art. 39).
      </P>

      <H2>3. Confidencialidade</H2>
      <P>
        Quem trabalha conosco e acessa dados está sujeito a dever de sigilo. O acesso a dados de uma loja só acontece
        para suporte pedido pela loja, para segurança ou por obrigação legal.
      </P>

      <H2>4. Segurança</H2>
      <P>Medidas que existem hoje no sistema:</P>
      <Lista>
        <li>Isolamento por empresa: toda consulta ao banco filtra pela empresa do usuário logado, que vem da sessão e nunca do pedido enviado pelo navegador.</li>
        <li>Senhas guardadas só como hash (PBKDF2 com SHA-512 e sal individual), nunca em texto.</li>
        <li>Autenticação em dois fatores (2FA por aplicativo) disponível para os usuários.</li>
        <li>Perfis de acesso por função (administrador, gerente, financeiro, vendedor, caixa, estoquista, técnico), com a regra de dar a cada pessoa só o que ela precisa.</li>
        <li>Sessão com validade de 7 dias, em cookie de uso exclusivo do servidor, e limite de tentativas no login.</li>
        <li>Registro de auditoria (quem, o quê, antes e depois) para alterações de preço, estoque, desconto, cancelamento, estorno e para os pedidos de dados da LGPD; o registro não guarda CPF/CNPJ completo.</li>
        <li>Máscara de CPF/CNPJ e de tokens nos registros de erro do servidor.</li>
        <li>Criptografia dos segredos de integração (chaves e tokens) guardados no banco: <strong>em andamento</strong>, ainda não concluída. Até lá, o acesso ao banco é restrito.</li>
      </Lista>
      <P>
        <Preencher>Outras medidas de infraestrutura que o dono confirmar (backup, criptografia em trânsito e em repouso na hospedagem, controle de acesso da equipe)</Preencher>.
        Se medidas listadas aqui mudarem para pior, avisamos a loja.
      </P>

      <H2>5. Suboperadores</H2>
      <P>
        A loja autoriza o uso dos suboperadores listados na{" "}
        <a href="/privacidade#suboperadores" className="underline">política de privacidade</a> (hospedagem, emissão de
        notas, IA quando a loja usa, cobrança, e-mail e marketplaces que a própria loja conecta). Avisamos a loja por
        e-mail com <Preencher>antecedência, sugestão 15 dias</Preencher> antes de incluir ou trocar um suboperador; a loja
        pode se opor por motivo razoável e, sem acordo, cancelar sem multa. Exigimos dos suboperadores obrigações de
        proteção compatíveis com este contrato. Quando houver transferência internacional, seguimos o art. 33 da LGPD e o
        regulamento da ANPD sobre o tema (Resolução CD/ANPD nº 19/2024, a confirmar na revisão jurídica).
      </P>

      <H2>6. Incidentes de segurança</H2>
      <P>
        Se tomarmos conhecimento de incidente que afete dados pessoais da loja, avisamos a loja sem demora e em até{" "}
        <Preencher>prazo, sugestão 48 horas</Preencher> depois de confirmado, com o que soubermos: o que aconteceu, que
        dados e quantos titulares, o que já foi feito e o que a loja deve fazer. A loja, como controladora, decide se
        comunica a ANPD e os titulares (LGPD, art. 48). O Regulamento de Comunicação de Incidente de Segurança, Resolução
        CD/ANPD nº 15/2024, fixa 3 dias úteis para essa comunicação quando o incidente puder trazer risco ou dano
        relevante; por isso o nosso aviso é rápido. Ajudamos a loja com as informações para a comunicação. (Confirmar a
        redação atual da resolução na revisão jurídica.)
      </P>

      <H2>7. Direitos dos titulares e auditoria</H2>
      <Lista>
        <li>Os titulares (clientes finais da loja) fazem os pedidos à loja. O sistema tem as ferramentas para a loja atender: exportar os dados de um cliente em JSON e remover os dados pessoais dele (anonimizar), mantendo vendas e notas por obrigação fiscal. Se o titular nos procurar direto, encaminhamos à loja.</li>
        <li>Damos à loja as informações necessárias para mostrar que cumprimos este contrato. A loja pode pedir auditoria uma vez por ano, com aviso de <Preencher>antecedência</Preencher>, durante horário comercial, sem expor dados de outras lojas, e por conta da loja.</li>
        <li>Ajudamos a loja a responder à ANPD em assuntos ligados a este tratamento.</li>
      </Lista>

      <H2>8. Devolução e eliminação</H2>
      <Lista>
        <li>Em até 30 dias após o cancelamento a loja pode exportar seus dados (Configurações → Meus dados): arquivos CSV e os XMLs de notas gravados no sistema.</li>
        <li>Passados 90 dias do cancelamento, eliminamos os dados operacionais da loja.</li>
        <li>Continuam guardados só os documentos fiscais e lançamentos contábeis, por 5 anos, por obrigação legal (CTN, arts. 173 e 174; LGPD, art. 16, I), além do registro de aceites e do histórico de auditoria sem documento completo.</li>
        <li>Se a loja pedir antes, e não houver obrigação legal em contrário, eliminamos antes.</li>
      </Lista>

      <H2>9. Responsabilidade</H2>
      <P>
        Cada parte responde pelos danos que causar ao descumprir a LGPD e este contrato, nos termos do art. 42 da lei e
        dos limites dos termos de uso.
      </P>

      <H2>10. Lei e foro</H2>
      <P>Lei brasileira. Foro da comarca de <Preencher>comarca</Preencher>.</P>

      <H2>Contato para assuntos de dados</H2>
      <P>Encarregado (DPO): <Preencher>nome e e-mail do encarregado</Preencher>.</P>
    </DocumentoLegal>
  );
}
