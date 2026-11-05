import { exigirPerfilPagina } from "@/lib/auth/pagina";
import { telaConfigFiscal } from "@/lib/nfe/config-fiscal-servico";
import { FiscalConfig } from "@/components/configuracoes/fiscal-config";

export const dynamic = "force-dynamic";

export default async function ConfiguracaoFiscalPage() {
  const u = await exigirPerfilPagina("/configuracoes/fiscal");
  const tela = await telaConfigFiscal(u.empresaId);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Configuração fiscal</h1>
        <p className="text-muted-foreground">
          Dados que a nota fiscal precisa: certificado digital, inscrição estadual, série, CSC da NFC-e e o
          token da Focus NFe. Confira os padrões fiscais com o contador da loja.
        </p>
      </div>
      <FiscalConfig inicial={tela} />
    </div>
  );
}
