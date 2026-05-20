import type { CapacitorConfig } from "@capacitor/cli";

// Capacitor config — empacota o PWA mobile (/m) como app nativo iOS/Android.
//
// Build:
//   1) npx next build && npx next export -o out   (gera HTML estático opcional)
//   2) Ou rodar `next start` num servidor e usar `server.url`
//   3) npx cap add ios && npx cap add android
//   4) npx cap sync
//   5) npx cap open ios | open android   (abre Xcode / Android Studio)
//
// Em produção: aponta server.url para a URL do Railway → app fica leve.

const config: CapacitorConfig = {
  appId: "com.autopecas.erp",
  appName: "AutoPeças",
  webDir: "out",
  server: {
    url: "https://autopecas-app-production.up.railway.app/m",
    cleartext: false,
    // Permite navegação fora do domínio (gateway de pagamento, marketplaces)
    allowNavigation: [
      "*.openai.com",
      "*.anthropic.com",
      "*.bcb.gov.br",
      "*.mercadolivre.com.br",
      "*.shopee.com.br",
    ],
  },
  ios: {
    contentInset: "always",
    backgroundColor: "#0a0a0a",
    scheme: "AutoPecas",
    preferredContentMode: "mobile",
  },
  android: {
    backgroundColor: "#0a0a0a",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    Camera: {
      androidScaleType: "centerCrop",
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#ea580c",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#ea580c",
    },
    StatusBar: {
      style: "dark",
      backgroundColor: "#ea580c",
      overlaysWebView: false,
    },
    BarcodeScanner: {
      cameraDirection: "back",
    },
    Geolocation: {
      permissions: ["location"],
    },
  },
};

export default config;
