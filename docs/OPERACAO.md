# Operação (runbook)

Para quem opera o sistema no dia a dia. Curto de propósito.

## Publicar e voltar atrás (Railway)
- Publicar: só com pedido do dono. `railway up` na raiz (ou push, se o deploy automático estiver ligado). Depois confira `railway deployment list --service autopecas-app`, o `/api/health` e os logs do `[bootstrap]`.
- O healthcheck é `/api/health` (só testa o banco). Se falhar, o Railway mantém a versão anterior no ar.
- Voltar atrás: no painel do Railway, serviço `autopecas-app`, Deployments, escolha o último bom e use Redeploy/Rollback. **Atenção:** o rollback volta o código, não o banco. Migração já aplicada continua aplicada; por isso mudanças destrutivas são feitas em duas etapas.
- O worker (`npm run worker`) é outro serviço e precisa de `REDIS_URL`. Publique os dois.

## Ler logs
- `railway logs --service autopecas-app` (e do worker).
- Erros saem em **uma linha JSON** com `nivel`, `rota`, `empresaId`, `requestId`, `mensagem` e `stack`. Sem CPF/CNPJ, e-mail ou telefone (são mascarados).
- Quando um usuário relatar "Erro interno, código X": procure o código X nos logs (`railway logs | grep X`). O mesmo código volta no header `x-request-id`.
- Com `SENTRY_DSN`, os mesmos erros também vão ao Sentry (etiquetas `rota`, `requestId`, `empresaId`).

## Saúde e alertas
- `/api/health`: público e rápido (só o banco). Use no monitor externo.
- `/api/health/detalhado`: manda `Authorization: Bearer <HEALTH_TOKEN>` (ou header `x-health-token`). Mostra banco e latência, migrações pendentes, Redis, sinal do worker (heartbeat a cada 30 s; velho há mais de 3 min é problema), filas (falhas acima de 20 ou espera acima de 500), notas em EMITINDO há mais de 30 min, eventos de webhook com erro nas últimas 24 h (5 ou mais é problema) e **nomes** das envs faltando. Responde 503 se algo está ruim. Sem `HEALTH_TOKEN` configurado, responde 404.
- Alerta: o worker roda a mesma checagem a cada 5 min. Se algo estiver ruim, envia para `ALERTA_WEBHOOK_URL` e/ou `ALERTA_EMAIL` (e-mail usa o Resend já configurado). O mesmo problema não é repetido em menos de 1 h (a memória do aviso zera se o worker reiniciar). **Se o worker cair, o alerta cai junto**: por isso o monitor externo é obrigatório.
- Formato do webhook: `POST` JSON `{"content": "...", "text": "...", "message": "...", "title": "AutoPeças ERP"}`. Discord lê `content`, Slack lê `text`. Para ntfy.sh use a URL do tópico (`https://ntfy.sh/seu-topico`); ele recebe o JSON como texto da mensagem, então para notificação limpa prefira Discord/Slack ou um servidor ntfy com o formato JSON habilitado (hipótese: não testado com ntfy.sh público).
- Monitor externo grátis: crie uma conta no UptimeRobot ou no BetterStack, adicione um monitor HTTP em `https://<seu-app>/api/health`, intervalo de 5 min (o plano grátis do UptimeRobot permite 5 min; confira o plano atual), e ligue o aviso por e-mail ou WhatsApp/Telegram. Opcionalmente um segundo monitor em `/api/health/detalhado` com o header do token (BetterStack permite cabeçalho; o grátis do UptimeRobot pode não permitir).

## Quando algo cai
- **Focus NFe fora:** notas ficam em EMITINDO e o job de consulta tenta de novo (1, 5, 15 e 60 min, depois de hora em hora; após 24 h vai para revisão). Não reemita à mão enquanto a Focus não voltar (risco de nota duplicada). Veja o status da Focus e avise as lojas que a venda continua, nota depois.
- **SEFAZ fora/instável:** a Focus segura e reenvia. Mesma conduta: aguarde, não duplique. Contingência fiscal é decisão do contador da loja.
- **Banco fora:** `/api/health` dá 503 e o Railway reinicia. Veja o status do Postgres no painel. Se for perda de dados, restaure o backup (abaixo). Não rode nada pesado no banco de produção.
- **Redis fora:** o site e o PDV seguem; param sync de marketplaces, consulta automática de notas e alertas. Reinicie o Redis no Railway, depois o worker. Webhooks enfileirados voltam a ser processados quando o Redis volta.

## Backup e restauração
Ver `docs/BACKUP.md` (pg_dump fora do Railway, retenção, agenda e teste de restauração). Teste a restauração num banco descartável antes de precisar dela.

## Rotação de segredos
Troque no Railway (Variables) e publique/reinicie app e worker.
- `SESSION_SECRET`: derruba as sessões B2B (todos precisam entrar de novo).
- `HEALTH_TOKEN`, `WEBHOOK_TOKEN`, `FOCUS_WEBHOOK_TOKEN`: troque também do outro lado (monitor, painel da Focus, marketplaces) na mesma hora, senão os webhooks passam a ser recusados.
- `FOCUS_NFE_TOKEN`, `OPENAI_API_KEY`, `RESEND_API_KEY`, chaves S3: gere a nova no provedor, atualize, confirme que funciona, só então revogue a antiga.
- `DATABASE_URL`: troque a senha no Postgres e a variável juntas; é o que mais causa queda se errar.
- Segredo vazado em log/chat: troque na hora, sem esperar.

## Checklist das envs
Obrigatórias (o boot avisa e o health detalhado mostra os nomes que faltam): `DATABASE_URL` (sem ela o boot para), `SESSION_SECRET` (32+ caracteres), `WEBHOOK_TOKEN`, `APP_URL`.
Recomendadas conforme o uso: `REDIS_URL` (worker, filas), `FOCUS_NFE_TOKEN` e `FOCUS_WEBHOOK_TOKEN` (fiscal), `META_APP_SECRET` (WhatsApp), `ML_STATE_SECRET` (Mercado Livre), `OPENAI_API_KEY` (IA), `RESEND_API_KEY` + `EMAIL_FROM` (e-mail), `S3_*` (imagens e backup).
Operação: `SENTRY_DSN`, `HEALTH_TOKEN`, `ALERTA_WEBHOOK_URL`, `ALERTA_EMAIL`, `SUPORTE_WHATSAPP`, `SUPORTE_EMAIL`, `SUPORTE_HORARIO`.
Lista no código: `src/lib/operacao/env.ts`.

## CI
`.github/workflows/ci.yml` roda em todo push e PR: instala, aplica as migrações num Postgres 15 vazio, confere que o schema bate com as migrações, tsc, testes (incluindo os de integração) e build. Ele passa a valer quando o arquivo for para o GitHub (`git push`); depois, em Settings, Branches, exija o check "CI / verificar" antes de juntar PR.
