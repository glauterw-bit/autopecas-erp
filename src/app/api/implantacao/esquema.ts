import { z } from "zod";
import { ENTIDADES } from "@/lib/implantacao/tipos";

// CSV vai como texto no JSON. 15 MB cobre ~100 mil produtos; acima disso, use o script.
export const MAX_CSV = 15 * 1024 * 1024;

export const corpoBase = z.object({
  entidade: z.enum(ENTIDADES),
  csv: z.string().min(1, "Arquivo vazio").max(MAX_CSV, "Arquivo grande demais para a tela: use scripts/importar-csv.ts"),
  mapa: z.record(z.string(), z.string().nullable()).optional(),
});
