import { z } from "zod";
import { cnpjValido, limparCnpj } from "../validacao/cnpj";
import { validarSenhaNova } from "../auth/token";

// Validação do cadastro self-service (/cadastro). Sem banco: testável.

const so = (v: string) => v.replace(/\D/g, "");

export const cadastroSchema = z.object({
  razaoSocial: z.string().trim().min(3, "Informe a razão social.").max(150),
  cnpj: z
    .string()
    .transform(limparCnpj)
    .refine(cnpjValido, "CNPJ inválido. Confira os números."),
  nome: z.string().trim().min(2, "Informe seu nome.").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(200),
  celular: z
    .string()
    .transform(so)
    .refine((n) => /^(55)?[1-9]\d9\d{8}$/.test(n), "Celular inválido. Use DDD + número, ex.: (11) 91234-5678."),
  senha: z.string().max(200),
  // Obrigatório: sem aceite não há cadastro.
  aceite: z.literal(true, { errorMap: () => ({ message: "É preciso aceitar os Termos de Uso e a Política de Privacidade." }) }),
  // Honeypot: campo escondido na tela; gente não preenche, robô sim.
  website: z.string().optional(),
});

export type DadosCadastro = z.infer<typeof cadastroSchema>;

/** Valida o cadastro; devolve a primeira mensagem de erro em português, ou os dados. */
export function validarCadastro(bruto: unknown): { ok: true; dados: DadosCadastro } | { ok: false; erro: string } {
  const r = cadastroSchema.safeParse(bruto);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? "Dados inválidos." };
  const problemaSenha = validarSenhaNova(r.data.senha);
  if (problemaSenha) return { ok: false, erro: problemaSenha };
  return { ok: true, dados: r.data };
}

export function celularSemPais(n: string): string {
  return n.length > 11 && n.startsWith("55") ? n.slice(2) : n;
}
