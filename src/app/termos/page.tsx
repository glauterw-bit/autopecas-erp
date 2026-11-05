import type { Metadata } from "next";
import { DocumentoLegal, H2, Lista, P, Preencher } from "@/components/legal/documento";

export const metadata: Metadata = { title: "Termos de uso | AutoPeças ERP" };

export default function TermosPage() {
  return (
    <DocumentoLegal titulo="Termos de uso">
      <P>
        Estes termos valem entre <strong><Preencher>razão social do SaaS</Preencher></strong>, CNPJ{" "}
        <Preencher>CNPJ</Preencher>, com sede em <Preencher>endereço completo</Preencher> (&quot;nós&quot;), e a empresa que
        contrata o AutoPeças ERP (&quot;a loja&quot;). Ao criar a conta ou usar o sistema, a loja aceita estes termos.
      </P>

      <H2>1. O que é o serviço e qual é o plano</H2>
      <P>
        O AutoPeças ERP é um sistema pela internet para lojas de autopeças: cadastro de peças com aplicação
        veicular, balcão/PDV, estoque, compras, financeiro, emissão de notas por provedor fiscal e integrações
        com marketplaces. A loja usa o sistema por assinatura, no plano e preço informados na contratação:{" "}
        <Preencher>planos, valores e o que cada plano inclui</Preencher>. Recursos marcados como &quot;piloto&quot; ou
        &quot;beta&quot; podem mudar e ter menos garantia.
      </P>

      <H2>2. Teste grátis</H2>
      <P>
        A loja pode testar por <Preencher>número de dias do teste grátis</Preencher>, sem cobrança. Terminado o teste, a
        conta só continua com a contratação de um plano. Se a loja não contratar, tratamos como cancelamento
        (item 5): os dados ficam disponíveis para exportação e depois são apagados.
      </P>

      <H2>3. Pagamento e atraso</H2>
      <Lista>
        <li>A cobrança é feita <Preencher>periodicidade e meios de pagamento</Preencher>, por meio de um provedor de cobrança.</li>
        <li>
          <strong>Atraso, passo a passo.</strong> O PDV não para de repente: a loja continua vendendo normalmente por,
          no mínimo, 15 dias depois do vencimento.
          <ol className="mt-1 list-decimal space-y-1 pl-6">
            <li><strong>Aviso</strong>, do vencimento até o 15º dia de atraso: o sistema avisa na tela e por e-mail. Tudo continua funcionando, inclusive o PDV.</li>
            <li><strong>Somente leitura</strong>, do 16º dia até o <Preencher>dia da suspensão; sugestão: 30º dia</Preencher>: a loja consulta e exporta os dados, mas não lança novas vendas, compras ou alterações.</li>
            <li><strong>Suspensão</strong>, depois disso: o acesso é bloqueado até o pagamento. Os dados são guardados e nada é apagado por causa do atraso.</li>
          </ol>
        </li>
        <li>Pagando o que está em aberto, o acesso volta ao normal.</li>
        <li>Reajuste de preço: avisamos com <Preencher>antecedência, em dias</Preencher> por e-mail.</li>
      </Lista>

      <H2>4. Uso correto</H2>
      <P>
        A loja é responsável pelos acessos dos seus usuários (senha, 2FA, perfis) e pelos dados que cadastra. Não
        pode usar o sistema para atividade ilegal, tentar acessar dados de outra empresa nem sobrecarregar o serviço.
      </P>

      <H2>5. Cancelamento, exportação e exclusão dos dados</H2>
      <Lista>
        <li>A loja pode cancelar a qualquer momento <Preencher>forma de cancelar, por exemplo pelo e-mail de suporte</Preencher>.</li>
        <li>
          <strong>Exportação em até 30 dias:</strong> depois do cancelamento a loja tem 30 dias para baixar os dados
          em Configurações → Meus dados (arquivos CSV e os XMLs de notas que o sistema tem gravados). Se precisar de
          ajuda, nós fazemos a exportação a pedido.
        </li>
        <li>
          <strong>Exclusão depois de 90 dias do cancelamento.</strong> Passado esse prazo, apagamos os dados
          operacionais da loja (cadastros, vendas, estoque, financeiro, usuários e integrações).
        </li>
        <li>
          <strong>O que não apagamos por obrigação legal:</strong> os documentos fiscais (notas e XMLs) e os
          lançamentos contábeis, que ficam guardados por 5 anos, porque o Fisco pode cobrar tributo nesse período
          (Código Tributário Nacional, Lei 5.172/1966, arts. 173 e 174). Esses dados ficam só guardados, sem uso para
          outra finalidade. Também mantemos o registro dos aceites e do histórico de auditoria, sem documento completo.
        </li>
      </Lista>

      <H2>6. Responsabilidade fiscal</H2>
      <P>
        O sistema calcula impostos e prepara a nota com base nas regras e nos cadastros que a loja informa. Mesmo
        assim, <strong>a responsabilidade pela nota fiscal, pelo cálculo e pelo recolhimento dos tributos é do contribuinte
        (a loja) e do contador dela</strong>. A loja deve conferir cadastro de produto (NCM, CFOP, CST/CSOSN e afins),
        regime tributário e o resultado antes de emitir. Quando o sistema encontra dúvida fiscal, ele bloqueia e explica
        em vez de emitir. Não substituímos o contador.
      </P>

      <H2>7. Disponibilidade</H2>
      <P>
        Trabalhamos para o sistema ficar no ar, mas não prometemos funcionamento sem interrupção.{" "}
        <Preencher>meta de disponibilidade, se o dono quiser assumir uma, e janela de manutenção</Preencher>. Serviços de
        terceiros (provedor de notas, marketplaces, internet da loja) podem falhar fora do nosso controle. Avisamos
        manutenções programadas com antecedência quando possível.
      </P>

      <H2>8. Limites de responsabilidade</H2>
      <P>
        Na medida permitida em lei, nossa responsabilidade se limita ao valor pago pela loja nos{" "}
        <Preencher>12 meses (sugestão)</Preencher> anteriores ao fato e não inclui lucros cessantes nem multas fiscais
        decorrentes de informação errada cadastrada pela loja. Nada aqui retira direitos que a lei não permita limitar.
      </P>

      <H2>9. Dados pessoais</H2>
      <P>
        Sobre os dados dos clientes da loja, a loja é a controladora e nós somos operadores, nos termos do{" "}
        <a href="/dpa" className="underline">contrato de operador de dados</a>. Sobre os dados de cadastro da própria
        loja e de seus usuários, somos controladores, como explica a{" "}
        <a href="/privacidade" className="underline">política de privacidade</a>.
      </P>

      <H2>10. Suporte</H2>
      <P>
        Suporte por <Preencher>canais: e-mail/WhatsApp</Preencher>, em <Preencher>horário de atendimento</Preencher>, com
        prazo de primeira resposta de <Preencher>prazo</Preencher>.
      </P>

      <H2>11. Mudanças nestes termos</H2>
      <P>
        Quando mudarmos estes termos, publicamos nova versão e pedimos novo aceite quando o usuário entrar no sistema.
        Guardamos quem aceitou, qual versão e quando.
      </P>

      <H2>12. Lei e foro</H2>
      <P>
        Valem as leis do Brasil. Fica eleito o foro da comarca de <Preencher>comarca</Preencher> para resolver dúvidas
        sobre estes termos, ressalvado o foro que a lei determinar para o consumidor, se for o caso.
      </P>

      <H2>Contato</H2>
      <P>Dúvidas sobre estes termos: <Preencher>e-mail de contato</Preencher>.</P>
    </DocumentoLegal>
  );
}
