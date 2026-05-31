import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoPeças ERP — Sistema completo com IA",
  description:
    "ERP omnichannel para auto peças com IA Claude para visão computacional, OCR de NF-e, previsão de demanda e integração com marketplaces.",
};

// Aplica o tema salvo antes da pintura para evitar flash (FOUC).
const themeScript = `
(function(){try{var t=localStorage.getItem('ap-theme');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
