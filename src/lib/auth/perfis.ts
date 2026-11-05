// Perfis e acesso às telas (sem dependência de banco: serve no servidor e no menu).
// Ordem hierárquica; o de número maior pode tudo que o menor pode.
export const HIERARQUIA: Record<string, number> = {
  ADMIN: 100,
  GERENTE: 80,
  FINANCEIRO: 60,
  VENDEDOR: 50,
  CAIXA: 50,
  TECNICO: 40,
  ESTOQUISTA: 30,
};

export function podePerfil(atual: string, necessario: string): boolean {
  return (HIERARQUIA[atual] ?? 0) >= (HIERARQUIA[necessario] ?? 100);
}

// Perfil mínimo por tela (prefixo da rota). Vale a mais específica.
// Financeiro, contábil e fiscal exigem FINANCEIRO ou acima (CLAUDE.md).
// As demais seguem o perfil que as rotas de API da mesma área já exigem.
export const PERFIL_MINIMO_ROTAS: Record<string, string> = {
  "/dashboard": "ESTOQUISTA",
  "/pdv": "CAIXA",
  "/caixa": "CAIXA",
  "/produtos": "ESTOQUISTA",
  "/estoque": "ESTOQUISTA",
  "/clientes": "VENDEDOR",
  "/veiculos": "VENDEDOR",
  "/fornecedores": "ESTOQUISTA",
  "/compras": "ESTOQUISTA",
  "/compras/sugestao": "GERENTE",
  "/financeiro": "FINANCEIRO",
  "/os": "TECNICO",
  "/comissoes": "GERENTE",
  "/fiscal": "FINANCEIRO",
  "/contabil": "FINANCEIRO",
  "/marketplaces": "GERENTE",
  "/b2b": "VENDEDOR",
  "/rma": "VENDEDOR",
  "/hardware": "GERENTE",
  "/m": "VENDEDOR",
  "/ia": "VENDEDOR",
  "/relatorios": "GERENTE",
  "/configuracoes": "ADMIN",
  "/conta": "ESTOQUISTA",
  "/ajuda": "ESTOQUISTA",
  "/onboarding": "ADMIN",
};

/** Perfil mínimo da rota; rota fora do mapa exige ADMIN (nega por padrão). */
export function perfilMinimoDaRota(caminho: string): string {
  const limpo = caminho.split("?")[0].replace(/\/+$/, "") || "/";
  let melhor: string | null = null;
  for (const prefixo of Object.keys(PERFIL_MINIMO_ROTAS)) {
    if (limpo === prefixo || limpo.startsWith(prefixo + "/")) {
      if (melhor === null || prefixo.length > melhor.length) melhor = prefixo;
    }
  }
  return melhor ? PERFIL_MINIMO_ROTAS[melhor] : "ADMIN";
}

export function podeAbrirRota(perfil: string, caminho: string): boolean {
  return podePerfil(perfil, perfilMinimoDaRota(caminho));
}
