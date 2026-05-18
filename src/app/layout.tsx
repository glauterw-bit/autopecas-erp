import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoPeças ERP — Sistema completo com IA",
  description:
    "ERP omnichannel para auto peças com IA Claude para visão computacional, OCR de NF-e, previsão de demanda e integração com marketplaces.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="font-sans">{children}</body>
    </html>
  );
}
