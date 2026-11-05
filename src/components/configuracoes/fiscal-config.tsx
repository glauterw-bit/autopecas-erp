"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileKey2, Loader2, PlugZap, Save, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { telaConfigFiscal } from "@/lib/nfe/config-fiscal-servico";

type Tela = Awaited<ReturnType<typeof telaConfigFiscal>>;
type Segredo = "tokenHomologacao" | "tokenProducao" | "cscHomologacao" | "cscProducao";

const REGIMES = [
  ["SIMPLES_NACIONAL", "Simples Nacional"],
  ["SIMPLES_EXCESSO_SUBLIMITE", "Simples Nacional — excesso de sublimite"],
  ["MEI", "MEI"],
  ["LUCRO_PRESUMIDO", "Lucro Presumido"],
  ["LUCRO_REAL", "Lucro Real"],
] as const;
const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

const dataBr = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

function formDe(t: Tela) {
  const f = t.fiscal;
  return {
    ...t.empresa,
    ambiente: f.ambiente,
    modo: t.servidor.envioAutomaticoFocus ? f.modo : "token",
    serieNfe: f.serieNfe,
    serieNfce: f.serieNfce,
    proximoNumeroNfe: f.proximoNumeroNfe ? String(f.proximoNumeroNfe) : "",
    proximoNumeroNfce: f.proximoNumeroNfce ? String(f.proximoNumeroNfce) : "",
    empresaIdFocus: f.empresaIdFocus ?? "",
    idTokenHomologacao: f.idTokenHomologacao,
    idTokenProducao: f.idTokenProducao,
    cstIcmsPadrao: f.cstIcmsPadrao,
    cstPisCofinsSimples: f.cstPisCofinsSimples,
    cstIbsCbs: f.cstIbsCbs,
    cClassTrib: f.cClassTrib,
    emailXml: f.emailXml,
    certificadoValidoAte: f.certificado?.origem === "informado" ? f.certificado.validoAte.slice(0, 10) : "",
  };
}

export function FiscalConfig({ inicial }: { inicial: Tela }) {
  const [tela, setTela] = useState(inicial);
  const [form, setForm] = useState(() => formDe(inicial));
  // undefined = não mexe; "" ou texto = novo valor; null = apagar
  const [segredos, setSegredos] = useState<Partial<Record<Segredo, string | null>>>({});
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [teste, setTeste] = useState<{ ok: boolean; etapas: Array<{ nome: string; ok: boolean; mensagem: string }> } | null>(null);
  const [cert, setCert] = useState<{ senha: string; enviando: boolean; msg: string | null; erro: boolean }>({
    senha: "", enviando: false, msg: null, erro: false,
  });
  const arquivoRef = useRef<HTMLInputElement>(null);

  const simples = ["SIMPLES_NACIONAL", "SIMPLES_EXCESSO_SUBLIMITE", "MEI"].includes(form.regimeTributario);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function atualizar(t: Tela) {
    setTela(t);
    setForm(formDe(t));
    setSegredos({});
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setMsg(null);
    setCampos({});
    try {
      const corpo: Record<string, unknown> = { ...form };
      for (const [k, v] of Object.entries(segredos)) if (v !== undefined && v !== "") corpo[k] = v;
      const res = await fetch("/api/configuracoes/fiscal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const json = await res.json();
      if (!res.ok) {
        setCampos(json.campos ?? {});
        setMsg({ tipo: "erro", texto: json.erro ?? "Não foi possível salvar." });
        return;
      }
      atualizar(json);
      const focus = json.focus as { ok: boolean; mensagem: string } | null;
      setMsg(
        focus && !focus.ok
          ? { tipo: "erro", texto: `Salvo aqui, mas a Focus não aceitou: ${focus.mensagem}` }
          : { tipo: "ok", texto: focus ? `Salvo. ${focus.mensagem}` : "Configuração salva." },
      );
    } catch {
      setMsg({ tipo: "erro", texto: "Sem conexão com o servidor. Tente de novo." });
    } finally {
      setSalvando(false);
    }
  }

  async function testar() {
    setTestando(true);
    setTeste(null);
    try {
      const res = await fetch("/api/configuracoes/fiscal/testar", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setTeste({ ok: false, etapas: [{ nome: "Teste", ok: false, mensagem: json.erro ?? "Falhou." }] });
        return;
      }
      setTeste({ ok: json.ok, etapas: json.etapas });
      setTela(json.tela);
    } catch {
      setTeste({ ok: false, etapas: [{ nome: "Teste", ok: false, mensagem: "Sem conexão com o servidor." }] });
    } finally {
      setTestando(false);
    }
  }

  async function enviarCertificado() {
    const arquivo = arquivoRef.current?.files?.[0];
    if (!arquivo) return setCert((c) => ({ ...c, msg: "Escolha o arquivo .pfx do certificado.", erro: true }));
    if (!cert.senha) return setCert((c) => ({ ...c, msg: "Digite a senha do certificado.", erro: true }));
    setCert((c) => ({ ...c, enviando: true, msg: null }));
    const fd = new FormData();
    fd.append("arquivo", arquivo);
    fd.append("senha", cert.senha);
    fd.append("enviarFocus", form.modo === "api" ? "1" : "0");
    try {
      const res = await fetch("/api/configuracoes/fiscal/certificado", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setCert((c) => ({ ...c, enviando: false, msg: json.erro ?? "Não foi possível ler o certificado.", erro: true }));
        return;
      }
      if (arquivoRef.current) arquivoRef.current.value = "";
      setCert({ senha: "", enviando: false, msg: json.mensagem, erro: false });
      atualizar(json.tela);
    } catch {
      setCert((c) => ({ ...c, enviando: false, msg: "Sem conexão com o servidor.", erro: true }));
    }
  }

  const erro = (k: string) => (campos[k] ? <p className="mt-1 text-xs text-destructive">{campos[k]}</p> : null);
  const campo = (k: keyof typeof form, rotulo: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{rotulo}</span>
      <Input value={String(form[k] ?? "")} onChange={set(k)} aria-invalid={!!campos[k]} {...props} />
      {erro(k)}
    </label>
  );
  const segredo = (k: Segredo, rotulo: string) => {
    const atual = tela.fiscal[k];
    const apagar = segredos[k] === null;
    return (
      <label className="block text-sm">
        <span className="mb-1 block font-medium">{rotulo}</span>
        <div className="flex gap-2">
          <Input
            type="password"
            autoComplete="off"
            value={typeof segredos[k] === "string" ? (segredos[k] as string) : ""}
            disabled={apagar}
            placeholder={atual.configurado ? `salvo (${atual.mascara}) — digite para trocar` : "não informado"}
            onChange={(e) => setSegredos((s) => ({ ...s, [k]: e.target.value }))}
            aria-invalid={!!campos[k] || !!atual.erro}
          />
          {atual.configurado && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10"
              onClick={() => setSegredos((s) => ({ ...s, [k]: apagar ? undefined : null }))}
            >
              {apagar ? "Manter" : "Apagar"}
            </Button>
          )}
        </div>
        {atual.erro && <p className="mt-1 text-xs text-destructive">{atual.erro}</p>}
        {erro(k)}
      </label>
    );
  };

  const certificado = tela.fiscal.certificado;
  const pendentes = tela.checklist.filter((i) => i.bloqueia && !i.ok);

  return (
    <form onSubmit={salvar} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span>Pronto para emitir?</span>
            <Badge variant={pendentes.length ? "warning" : "success"}>
              {pendentes.length ? `${pendentes.length} pendência(s)` : "Pronto"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-2 text-sm">
            {tela.checklist.map((i) => (
              <li key={i.id} className="flex items-start gap-2">
                {i.ok ? (
                  i.aviso ? <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                ) : i.bloqueia ? (
                  <XCircle className="mt-0.5 h-4 w-4 text-destructive" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
                )}
                <div>
                  <div className="font-medium">{i.rotulo}</div>
                  <div className="text-muted-foreground">{i.detalhe}</div>
                  {i.aviso && <div className="text-amber-700">{i.aviso}</div>}
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Enquanto houver item com X vermelho, o sistema não emite a nota e mostra o que falta.</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={testar} disabled={testando}>
              {testando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}
              Testar configuração
            </Button>
            <span className="text-xs text-muted-foreground">Consulta a Focus em homologação. Não emite nota.</span>
          </div>
          {teste && (
            <ul className="space-y-1 rounded-md border p-3 text-sm" aria-live="polite">
              {teste.etapas.map((e) => (
                <li key={e.nome} className={e.ok ? "text-emerald-700" : "text-destructive"}>
                  <strong>{e.nome}:</strong> {e.mensagem}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Empresa</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="block text-sm md:col-span-1">
            <span className="mb-1 block font-medium">Regime tributário</span>
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.regimeTributario} onChange={set("regimeTributario")}>
              {REGIMES.map(([v, r]) => (
                <option key={v} value={v}>{r}</option>
              ))}
            </select>
            {erro("regimeTributario")}
          </label>
          {campo("inscEstadual", "Inscrição estadual (IE)", { inputMode: "numeric" })}
          {campo("inscMunicipal", "Inscrição municipal (opcional)")}
          {campo("cnaeFiscal", "CNAE principal", { inputMode: "numeric", placeholder: "4530703" })}
          {campo("logradouro", "Rua")}
          {campo("numero", "Número")}
          {campo("complemento", "Complemento")}
          {campo("bairro", "Bairro")}
          {campo("municipio", "Cidade")}
          <label className="block text-sm">
            <span className="mb-1 block font-medium">UF</span>
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.uf} onChange={set("uf")}>
              <option value="">—</option>
              {UFS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
            {erro("uf")}
          </label>
          {campo("cep", "CEP", { inputMode: "numeric" })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Emissão</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset className="space-y-2 text-sm">
            <legend className="mb-1 font-medium">Ambiente</legend>
            <label className="flex items-center gap-2">
              <input type="radio" name="ambiente" value="homologacao" checked={form.ambiente === "homologacao"} onChange={set("ambiente")} />
              Homologação (teste, nota sem valor legal)
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="ambiente" value="producao" checked={form.ambiente === "producao"} onChange={set("ambiente")} />
              Produção (nota de verdade, com valor legal)
            </label>
            {form.ambiente === "producao" && !tela.servidor.permiteProducao && (
              <p className="text-amber-700">O servidor ainda está travado em homologação. As notas continuam saindo como teste até o suporte liberar.</p>
            )}
          </fieldset>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {campo("serieNfe", "Série da NF-e", { inputMode: "numeric" })}
            {campo("proximoNumeroNfe", "Próximo número NF-e (opcional)", { inputMode: "numeric" })}
            {campo("serieNfce", "Série da NFC-e", { inputMode: "numeric" })}
            {campo("proximoNumeroNfce", "Próximo número NFC-e (opcional)", { inputMode: "numeric" })}
          </div>
          <p className="text-xs text-muted-foreground">
            Se a loja já emitia nota em outro sistema, use a mesma série e o número seguinte ao último emitido. Confira com o contador.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileKey2 className="h-4 w-4" /> Focus NFe e certificado digital
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset className="space-y-2 text-sm">
            <legend className="mb-1 font-medium">Como o certificado chega à Focus</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio" name="modo" value="api" checked={form.modo === "api"} onChange={set("modo")}
                disabled={!tela.servidor.envioAutomaticoFocus}
              />
              O sistema envia o certificado e os dados para a Focus
              {!tela.servidor.envioAutomaticoFocus && <span className="text-muted-foreground">(não disponível neste servidor)</span>}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="modo" value="token" checked={form.modo === "token"} onChange={set("modo")} />
              A Focus já tem o certificado; informo só o token
            </label>
          </fieldset>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {segredo("tokenHomologacao", "Token da Focus — homologação")}
            {segredo("tokenProducao", "Token da Focus — produção")}
          </div>
          {form.modo === "api" && campo("empresaIdFocus", "ID da empresa na Focus (deixe vazio para o sistema cadastrar)", { inputMode: "numeric" })}

          <div className="rounded-md border p-3 text-sm">
            <div className="mb-2 font-medium">Certificado A1</div>
            {certificado ? (
              <p>
                Válido até <strong>{dataBr(certificado.validoAte)}</strong>
                {certificado.titular ? ` — ${certificado.titular}` : ""}
                {certificado.origem === "informado" && " (data informada pela loja)"}
                {certificado.origem === "focus" && " (lido da Focus)"}
                {certificado.enviadoFocusEm ? ` — enviado à Focus em ${dataBr(certificado.enviadoFocusEm)}` : ""}
              </p>
            ) : (
              <p className="text-muted-foreground">Nenhum certificado lido ainda.</p>
            )}
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <Input ref={arquivoRef} type="file" accept=".pfx,.p12,application/x-pkcs12" aria-label="Arquivo do certificado (.pfx)" />
              <Input
                type="password" autoComplete="off" placeholder="Senha do certificado" value={cert.senha}
                onChange={(e) => setCert((c) => ({ ...c, senha: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void enviarCertificado();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={enviarCertificado} disabled={cert.enviando}>
                {cert.enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {form.modo === "api" ? "Ler e enviar para a Focus" : "Ler validade"}
              </Button>
            </div>
            {cert.msg && <p className={`mt-2 ${cert.erro ? "text-destructive" : "text-emerald-700"}`}>{cert.msg}</p>}
            <p className="mt-2 text-xs text-muted-foreground">O sistema não guarda o arquivo nem a senha. Guarda só a validade e o titular.</p>
            {form.modo === "token" && (
              <div className="mt-3 max-w-xs">
                {campo("certificadoValidoAte", "Ou informe a validade do certificado", { type: "date" })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>NFC-e: CSC (código de segurança do contribuinte)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">O CSC e o id do token são gerados no site da SEFAZ do estado, um para teste e outro para produção.</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {segredo("cscHomologacao", "CSC — homologação")}
            {campo("idTokenHomologacao", "Id do token — homologação", { inputMode: "numeric", placeholder: "000001" })}
            {segredo("cscProducao", "CSC — produção")}
            {campo("idTokenProducao", "Id do token — produção", { inputMode: "numeric", placeholder: "000001" })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Padrões fiscais da empresa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Valem para o produto que não tiver o campo no cadastro. Peça estes códigos ao contador; o sistema não escolhe por você.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {campo("cstIcmsPadrao", simples ? "CSOSN padrão do ICMS" : "CST padrão do ICMS", { inputMode: "numeric", placeholder: simples ? "102" : "00" })}
            {simples ? (
              campo("cstPisCofinsSimples", "CST de PIS/COFINS", { inputMode: "numeric", placeholder: "49" })
            ) : (
              <p className="text-xs text-muted-foreground md:pt-6">
                PIS/COFINS no regime normal: vêm do cadastro do produto (monofásico ou CST 01).
              </p>
            )}
            {campo("cstIbsCbs", "CST de IBS/CBS", { inputMode: "numeric", placeholder: "000" })}
            {campo("cClassTrib", "cClassTrib", { inputMode: "numeric", placeholder: "6 dígitos" })}
          </div>
          <div className="max-w-md">
            {campo("emailXml", "E-mail para receber o XML (contador)", { type: "email" })}
            <p className="mt-1 text-xs text-muted-foreground">Fica guardado na configuração. O envio automático do XML para este e-mail ainda não está ligado.</p>
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 flex items-center gap-3 border-t bg-background py-3">
        <Button type="submit" disabled={salvando}>
          {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar
        </Button>
        {msg && <span className={msg.tipo === "ok" ? "text-sm text-emerald-700" : "text-sm text-destructive"}>{msg.texto}</span>}
      </div>
    </form>
  );
}
