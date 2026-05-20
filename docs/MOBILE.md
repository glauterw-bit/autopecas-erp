# App Mobile — PWA + Wrapper Nativo

O AutoPeças ERP entrega o app mobile de **3 formas**:

## 1. PWA (zero instalação)

URL: `https://seu-dominio/m`

- Instalável direto do navegador (Chrome/Safari) — vira ícone na home.
- Service Worker (`/sw.js`) cacheia assets e fila offline para vendas.
- Scanner de código de barras nativo via [BarcodeDetector API](https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API) (Chrome Android, Safari iOS 17+).
- Funciona offline para consulta de catálogo e abertura de orçamento (sync quando recupera conexão).

**Pros:** sem App Store, deploy instantâneo, custo zero.
**Contras:** algumas APIs nativas limitadas (push notifications no iOS exige Safari 16.4+, NFC só Android).

## 2. App nativo Capacitor (publicação App Store / Play Store)

Mesmo código React, empacotado como app iOS/Android.

### Setup

```bash
# 1) Instalar Capacitor
npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android

# 2) Plugins nativos úteis para auto peças
npm i @capacitor/camera @capacitor/barcode-scanner @capacitor/push-notifications \
      @capacitor/geolocation @capacitor/local-notifications @capacitor/status-bar \
      @capacitor/splash-screen @capacitor/share @capacitor/network

# 3) Adicionar plataformas
npx cap add ios
npx cap add android

# 4) Sincronizar mudanças web → nativo
npx cap sync

# 5) Abrir no IDE
npx cap open ios       # Xcode
npx cap open android   # Android Studio
```

A config (`capacitor.config.ts`) já aponta `server.url` para a URL do Railway,
ou seja: o app carrega o PWA do servidor (sempre atualizado) e usa só os
plugins nativos. **Não precisa rebuild do app a cada release**.

### Quando rebuildar o app nativo
- Adicionar/remover plugin nativo (camera, push, NFC).
- Mudar permissions/entitlements (Info.plist / AndroidManifest).
- Bumpar versão minor para subir nas lojas.

## 3. Trusted Web Activity (Android)

Para Android, alternativa ao Capacitor: Bubblewrap envolve o PWA num TWA — Play
Store aceita, mas sem código nativo. Bom para times pequenos.

```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest=https://seu-dominio/manifest.json
bubblewrap build
```

## Decisão recomendada para AutoPeças

| Cenário | Recomendação |
|---|---|
| Vendedor interno (loja com Wi-Fi) | PWA puro — `/m` |
| Vendedor externo (visita oficinas) | Capacitor com plugins nativos (scanner+GPS) |
| Cliente final mecânico | PWA — instala via QR Code do PDV |
| App nas lojas (marketing) | Capacitor |

## Como o PWA já cobre os pré-requisitos

- **manifest.json** — instalação, ícones, shortcuts
- **sw.js** — cache cache-first + network-first /api + sync offline
- **viewport meta** — sem zoom, sem barra de URL, theme color laranja
- **apple-mobile-web-app-capable** — fullscreen no iOS
- **Background Sync API** — fila de orçamentos quando volta a rede

## Push notifications

- PWA: web push padrão (VAPID). Suporta Chrome/Edge/Firefox/Safari 16.4+.
- Capacitor: APNs (iOS) + FCM (Android) com `@capacitor/push-notifications`.
- Use casos: ruptura iminente, pedido marketplace, fatura próximo do vencimento, ordem de serviço pronta.
