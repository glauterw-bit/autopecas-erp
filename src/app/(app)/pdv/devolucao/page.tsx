import { exigirPerfilPagina } from "@/lib/auth/pagina";
import { DevolucaoClient } from "@/components/pdv/devolucao-client";

export const dynamic = "force-dynamic";

export default async function DevolucaoPage() {
  await exigirPerfilPagina("/pdv/devolucao");
  return <DevolucaoClient />;
}
