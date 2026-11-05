import type { Metadata } from "next";
import "./globals.css";

const titulo = "AutoPeças ERP: sistema para loja de autopeças";
const descricao =
  "Achar a peça certa rápido, nota que sai certa, estoque que bate e nenhum cliente esquecido. Sistema para lojas de autopeças, em fase de piloto. Teste grátis por 14 dias.";

export const metadata: Metadata = {
  title: titulo,
  description: descricao,
  openGraph: {
    title: titulo,
    description: descricao,
    type: "website",
    locale: "pt_BR",
    siteName: "AutoPeças ERP",
  },
  twitter: { card: "summary", title: titulo, description: descricao },
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
