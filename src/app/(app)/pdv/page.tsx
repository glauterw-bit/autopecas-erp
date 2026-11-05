import { exigirPerfilPagina } from "@/lib/auth/pagina";
import { PdvClient } from "@/components/pdv/pdv-client";

export const dynamic = "force-dynamic";

export default async function PdvPage() {
  await exigirPerfilPagina("/pdv");
  return <PdvClient />;
}
