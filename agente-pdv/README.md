# Agente PDV — Agente Local de Hardware

Executável Node.js que roda **na máquina da loja** e faz a ponte entre o ERP
web (navegador) e o hardware do PDV: PinPad TEF, equipamento SAT-CF-e,
impressora térmica ESC/POS e balança serial.

> **Aviso sobre o SAT.** Em São Paulo o SAT-CF-e acabou: a Portaria SRE 79/2024
> proíbe emitir CF-e-SAT a partir de 01/01/2026 (fonte: `docs/conhecimento/fiscal-tributario.md`).
> No varejo de SP, o cupom fiscal é a **NFC-e** (modelo 65), emitida pelo ERP.
> O adaptador SAT abaixo só serve para lojas de outros estados que ainda usam o equipamento.
> TEF, impressora e balança continuam valendo.

Um único processo abre 3 servidores HTTP escutando **somente em 127.0.0.1**:

| Porta | Serviço | Endpoints |
|-------|---------|-----------|
| 60906 | TEF + Impressora | `POST /api/tef/venda`, `POST /api/tef/cancelamento`, `POST /api/tef/confirmar`, `POST /api/tef/pix`, `POST /api/impressora/imprimir` |
| 60907 | SAT-CF-e | `POST /api/sat/enviar-cfe`, `GET /api/sat/consultar`, `POST /api/sat/cancelar` |
| 60908 | Balança | `GET /api/balanca/peso`, `POST /api/balanca/zerar`, `POST /api/balanca/tara` |

Os contratos casam com os clients do ERP em `src/lib/pdv/{tef,sat,balanca,impressora}.ts`.

## Instalação na máquina da loja

1. Instale o **Node.js 20 ou superior** (https://nodejs.org — versão LTS).
2. Copie a pasta `agente-pdv/` para a máquina (ex.: `C:\agente-pdv` ou `/opt/agente-pdv`).
3. Dentro da pasta:

```bash
npm install     # instala o serialport (opcional — só necessário p/ balança real)
npm start       # sobe o agente
```

Você deve ver no console:

```
[TEF] escutando em http://127.0.0.1:60906
[SAT] escutando em http://127.0.0.1:60907
[BALANCA] escutando em http://127.0.0.1:60908
[AGENTE] Agente PDV iniciado em modo SIMULADO
```

Para rodar como serviço, use o Agendador de Tarefas (Windows, "ao iniciar
sessão") ou uma unit do systemd (Linux) chamando `npm start` nesta pasta.

## Configuração (variáveis de ambiente)

| Variável | Default | Descrição |
|----------|---------|-----------|
| `AGENTE_MODO` | `simulado` | `simulado` responde tudo fake (homologação/demonstração). `real` usa os adaptadores de hardware em `adaptadores/`. |
| `IMPRESSORA_IP` | — | IP da impressora térmica de rede (envia ESC/POS cru via TCP 9100). Sem IP, tenta USB `/dev/usb/lp0` (Linux) ou `IMPRESSORA_COMPARTILHAMENTO` (Windows). |
| `IMPRESSORA_PORTA` | `9100` | Porta RAW da impressora de rede. |
| `IMPRESSORA_DISPOSITIVO` | `/dev/usb/lp0` | Device file da impressora USB no Linux. |
| `IMPRESSORA_COMPARTILHAMENTO` | — | Compartilhamento no Windows, ex.: `\\localhost\CUPOM` (impressão via `copy /b`). |
| `BALANCA_PORTA` | `/dev/ttyUSB0` (Linux) / `COM3` (Windows) | Porta serial da balança. |
| `BALANCA_MODELO` | `TOLEDO_PRIX_III` | `TOLEDO_PRIX_III`, `TOLEDO_PRIX_6`, `FILIZOLA_PLATINA`, `URANO_POP_S`, `GENERICO`. |
| `BALANCA_BAUD` | `9600` | Baud rate da serial (Toledo = 9600-8N1). |
| `SITEF_IP` / `SITEF_LOJA` / `SITEF_TERMINAL` | — | Credenciamento SiTef (modo real, ver `adaptadores/tef-sitef.js`). |
| `SAT_DLL` / `SAT_CODIGO_ATIVACAO` / `SAT_SIGN_AC` | — | DLL do fabricante SAT e credenciais (modo real, ver `adaptadores/sat.js`). |

Exemplo em produção (Linux):

```bash
AGENTE_MODO=real IMPRESSORA_IP=192.168.0.50 BALANCA_PORTA=/dev/ttyUSB0 BALANCA_MODELO=TOLEDO_PRIX_III npm start
```

## Testando cada serviço com curl

**TEF — venda crédito (valor em centavos):**

```bash
curl -s -X POST http://127.0.0.1:60906/api/tef/venda \
  -H 'content-type: application/json' \
  -d '{"valor":15000,"documento":"VENDA-123","forma":"CREDITO","parcelas":3,"cnpj":"11222333000144"}'
```

**TEF — Pix, confirmação e cancelamento:**

```bash
curl -s -X POST http://127.0.0.1:60906/api/tef/pix -H 'content-type: application/json' -d '{"valor":5000,"documento":"VENDA-124"}'
curl -s -X POST http://127.0.0.1:60906/api/tef/confirmar -H 'content-type: application/json' -d '{"nsu":"000000001"}'
curl -s -X POST http://127.0.0.1:60906/api/tef/cancelamento -H 'content-type: application/json' -d '{"nsu":"000000001"}'
```

**SAT — emitir CF-e, consultar e cancelar:**

```bash
curl -s -X POST http://127.0.0.1:60907/api/sat/enviar-cfe \
  -H 'content-type: application/json' \
  -d '{"cnpjEmitente":"11222333000144","ieEmitente":"111222333444","itens":[{"codigo":"P001","descricao":"OLEO 15W40 GRANEL","ncm":"27101932","cfop":"5405","unidade":"L","quantidade":2,"valorUnitario":39.9,"cstIcms":"60"}],"pagamento":[{"codigo":"01","valor":79.8}]}'

curl -s http://127.0.0.1:60907/api/sat/consultar
curl -s -X POST http://127.0.0.1:60907/api/sat/cancelar -H 'content-type: application/json' -d '{"chave":"<chave de 44 dígitos>"}'
```

**Balança — leitura de peso:**

```bash
curl -s 'http://127.0.0.1:60908/api/balanca/peso?modelo=TOLEDO_PRIX_III'
```

**Impressora — imprimir cupom (buffer ESC/POS em base64):**

```bash
curl -s -X POST http://127.0.0.1:60906/api/impressora/imprimir \
  -H 'content-type: application/json' \
  -d "{\"dadosBase64\":\"$(printf '\x1b\x40\x1b\x61\x01AUTO PECAS TESTE\nCUPOM #1\n\x1d\x56\x42\x00' | base64)\"}"
```

Em modo simulado o cupom decodificado aparece no console do agente.

## Segurança

- O agente escuta **apenas em 127.0.0.1** — nunca é acessível de outras
  máquinas da rede ou da internet. Não altere o bind para `0.0.0.0`.
- O CORS responde ao preflight com `Access-Control-Allow-Private-Network: true`,
  exigido pelo Chrome (Private Network Access) para que uma página **https**
  do ERP chame `http://127.0.0.1`.
- Não há autenticação nos endpoints: qualquer processo local pode acioná-los.
  Isso é o padrão de mercado para agentes TEF locais, mas mantenha a máquina
  do PDV restrita (sem uso pessoal, antivírus ativo).
- Credenciais (código de ativação do SAT, credenciamento SiTef) ficam em
  variáveis de ambiente da máquina — não as commite em repositório.
