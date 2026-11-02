// Lista textos em português escritos direto no código (fora de lang/*.json).
// Uso: node tools/achar-texto-cru.mjs
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const acorn = require("acorn"), walk = require("acorn-walk");
const dir = new URL("../scripts/", import.meta.url);
const PT = /[ãõçáéíóúâêô]|\b(de|da|do|para|não|com|uma|um|ao|na|no|os|as|que|seu|sua|está|habilidade|árvore|personagem|pontos?)\b/i;
let n = 0;
for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".js"))) {
  const src = fs.readFileSync(new URL(f, dir), "utf8");
  const ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: "module" });
  const hit = (node, text, anc) => {
    const t = text.replace(/<[^>]*>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").trim();
    if (!t || !PT.test(t) || /^ARVORE\./.test(t)) return;
    // mensagens só do console e chaves de flags/configs não aparecem para o usuário
    const call = anc.slice().reverse().find(a => a.type === "CallExpression");
    const callee = call && src.slice(call.callee.start, call.callee.end);
    if (/^console\./.test(callee ?? "")) return;
    n++; console.log(`${f}:${src.slice(0, node.start).split("\n").length}  ${JSON.stringify(t).slice(0, 110)}`);
  };
  walk.ancestor(ast, {
    Literal(node, _s, anc) { if (typeof node.value === "string") hit(node, node.value, anc); },
    TemplateElement(node, _s, anc) { hit(node, node.value.cooked ?? "", anc); }
  });
}
console.log(`total: ${n}`);
