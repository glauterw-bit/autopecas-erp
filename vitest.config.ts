import path from "node:path";
import { defineConfig } from "vitest/config";

// Alias "@/" igual ao tsconfig, para testes de rota poderem mockar "@/lib/db".
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { environment: "node" },
});
