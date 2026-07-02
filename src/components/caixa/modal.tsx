"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

// Modal simples (overlay + card) usado pelas ações do caixa.

export function Modal({
  titulo,
  onFechar,
  children,
}: {
  titulo: string;
  onFechar: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onFechar}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div
        className="w-full max-w-md rounded-xl border bg-card p-5 text-card-foreground shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">{titulo}</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onFechar} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
