import { Worker } from "bullmq";
import { sincronizarTodos } from "@/lib/catalogo/tecdoc-sync";
import { connection } from "../queues";

export const tecdocCronWorker = new Worker(
  "catalogo:tecdoc",
  async () => {
    return sincronizarTodos();
  },
  { connection, concurrency: 1 },
);
