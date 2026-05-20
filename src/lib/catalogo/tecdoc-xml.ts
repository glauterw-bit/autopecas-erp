import { prisma } from "../db";

// TecDoc XML (TAF — TecDoc Automotive Format)
// ===========================================
// Formato oficial TecAlliance. Estrutura hierárquica:
//
// <TecDocData>
//   <Manufacturers>
//     <Manufacturer id="123" name="Bosch" country="DE">
//       <Models>
//         <Model id="456" name="Civic" yearFrom="2007" yearTo="2016">
//           <Types>
//             <Type id="789" description="2.0 LXR" engine="K20Z2" hp="150" fuel="FLEX"/>
//           </Types>
//         </Model>
//       </Models>
//     </Manufacturer>
//   </Manufacturers>
//   <Articles>
//     <Article id="A1" brand="Bosch" name="Vela NGK" gtin="..." oem="...">
//       <Compatibilities>
//         <Compatibility typeId="789" position="DIANTEIRA"/>
//       </Compatibilities>
//     </Article>
//   </Articles>
// </TecDocData>
//
// O parser não usa libs externas (zero-dep) para evitar bundle inflado.

export interface TafProgresso {
  montadoras: number;
  modelos: number;
  versoes: number;
  produtos: number;
  aplicacoes: number;
}

// Tokenizer XML mínimo - suficiente para o TAF que é bem-formado.
type Node = { tag: string; attrs: Record<string, string>; children: Node[]; text?: string };

export function parseXml(texto: string): Node[] {
  let i = 0;
  const tokens: Node[] = [];
  const stack: Node[] = [];
  function pula() {
    while (i < texto.length && /[\s]/.test(texto[i])) i++;
  }
  function lerNome() {
    let s = "";
    while (i < texto.length && /[A-Za-z0-9_:.-]/.test(texto[i])) { s += texto[i]; i++; }
    return s;
  }
  function lerAttrs(): Record<string, string> {
    const attrs: Record<string, string> = {};
    while (i < texto.length && texto[i] !== ">" && texto[i] !== "/") {
      pula();
      if (texto[i] === ">" || texto[i] === "/") break;
      const nome = lerNome();
      if (!nome) { i++; continue; }
      pula();
      if (texto[i] === "=") {
        i++; pula();
        const q = texto[i];
        if (q === '"' || q === "'") {
          i++;
          let val = "";
          while (i < texto.length && texto[i] !== q) { val += texto[i]; i++; }
          i++;
          attrs[nome] = val;
        }
      } else {
        attrs[nome] = "";
      }
    }
    return attrs;
  }
  while (i < texto.length) {
    if (texto[i] === "<") {
      i++;
      if (texto[i] === "!" || texto[i] === "?") {
        // skip declaration/comment
        while (i < texto.length && texto[i] !== ">") i++;
        i++;
        continue;
      }
      if (texto[i] === "/") {
        i++;
        const nome = lerNome();
        while (i < texto.length && texto[i] !== ">") i++;
        i++;
        const fechado = stack.pop();
        if (!fechado || fechado.tag !== nome) {
          // malformado — ignora
        }
        continue;
      }
      const tag = lerNome();
      const attrs = lerAttrs();
      const node: Node = { tag, attrs, children: [] };
      if (texto[i] === "/") {
        i++; i++; // /,>
        if (stack.length === 0) tokens.push(node);
        else stack[stack.length - 1].children.push(node);
      } else {
        i++; // >
        if (stack.length === 0) tokens.push(node);
        else stack[stack.length - 1].children.push(node);
        stack.push(node);
      }
    } else {
      // texto interno
      let s = "";
      while (i < texto.length && texto[i] !== "<") { s += texto[i]; i++; }
      const t = s.trim();
      if (t && stack.length > 0) {
        stack[stack.length - 1].text = (stack[stack.length - 1].text ?? "") + t;
      }
    }
  }
  return tokens;
}

export async function importarTafXml(opts: {
  empresaId: string;
  xml: string;
}): Promise<TafProgresso> {
  const tree = parseXml(opts.xml);
  const root = tree[0];
  if (!root) throw new Error("XML TAF vazio");

  const progresso: TafProgresso = {
    montadoras: 0, modelos: 0, versoes: 0, produtos: 0, aplicacoes: 0,
  };
  const tecdocToVersao = new Map<string, string>();
  const tecdocToProduto = new Map<string, string>();

  const manufacturersNode = root.children.find((c) => c.tag === "Manufacturers");
  if (manufacturersNode) {
    for (const mnf of manufacturersNode.children) {
      if (mnf.tag !== "Manufacturer") continue;
      const montadora = await prisma.montadora.upsert({
        where: { nome: mnf.attrs.name },
        update: { pais: mnf.attrs.country || undefined },
        create: { nome: mnf.attrs.name, pais: mnf.attrs.country || undefined },
      });
      progresso.montadoras++;
      const modelsNode = mnf.children.find((c) => c.tag === "Models");
      if (!modelsNode) continue;
      for (const mod of modelsNode.children) {
        if (mod.tag !== "Model") continue;
        const modelo = await prisma.modeloVeiculo.upsert({
          where: { montadoraId_nome: { montadoraId: montadora.id, nome: mod.attrs.name } },
          update: {
            anoInicio: mod.attrs.yearFrom ? Number(mod.attrs.yearFrom) : undefined,
            anoFim: mod.attrs.yearTo ? Number(mod.attrs.yearTo) : undefined,
          },
          create: {
            montadoraId: montadora.id,
            nome: mod.attrs.name,
            anoInicio: mod.attrs.yearFrom ? Number(mod.attrs.yearFrom) : undefined,
            anoFim: mod.attrs.yearTo ? Number(mod.attrs.yearTo) : undefined,
          },
        });
        progresso.modelos++;
        const typesNode = mod.children.find((c) => c.tag === "Types");
        if (!typesNode) continue;
        for (const t of typesNode.children) {
          if (t.tag !== "Type") continue;
          const existente = await prisma.versaoVeiculo.findFirst({
            where: { modeloId: modelo.id, descricao: t.attrs.description },
            select: { id: true },
          });
          const versao = existente
            ? existente
            : await prisma.versaoVeiculo.create({
                data: {
                  modeloId: modelo.id,
                  descricao: t.attrs.description,
                  motor: t.attrs.engine || undefined,
                  potenciaCv: t.attrs.hp ? Number(t.attrs.hp) : undefined,
                },
              });
          tecdocToVersao.set(t.attrs.id, versao.id);
          if (!existente) progresso.versoes++;
        }
      }
    }
  }

  const articlesNode = root.children.find((c) => c.tag === "Articles");
  if (articlesNode) {
    for (const a of articlesNode.children) {
      if (a.tag !== "Article") continue;
      const sku = `TD-${a.attrs.id}`;
      let marcaId: string | null = null;
      if (a.attrs.brand) {
        const marca = await prisma.marca.upsert({
          where: { nome: a.attrs.brand },
          update: {},
          create: { nome: a.attrs.brand },
        });
        marcaId = marca.id;
      }
      const p = await prisma.produto.upsert({
        where: { empresaId_sku: { empresaId: opts.empresaId, sku } },
        update: {
          codigoBarras: a.attrs.gtin || undefined,
          codigoOem: a.attrs.oem || undefined,
        },
        create: {
          empresaId: opts.empresaId,
          sku,
          nome: a.attrs.name,
          codigoBarras: a.attrs.gtin || undefined,
          codigoOem: a.attrs.oem || undefined,
          marcaId,
        },
      });
      tecdocToProduto.set(a.attrs.id, p.id);
      progresso.produtos++;
      const compatsNode = a.children.find((c) => c.tag === "Compatibilities");
      if (!compatsNode) continue;
      for (const cmp of compatsNode.children) {
        if (cmp.tag !== "Compatibility") continue;
        const versaoId = tecdocToVersao.get(cmp.attrs.typeId);
        if (!versaoId) continue;
        const existe = await prisma.aplicacaoVeicular.findFirst({
          where: { produtoId: p.id, versaoId },
          select: { id: true },
        });
        if (existe) continue;
        await prisma.aplicacaoVeicular.create({
          data: { produtoId: p.id, versaoId },
        });
        progresso.aplicacoes++;
      }
    }
  }

  return progresso;
}
