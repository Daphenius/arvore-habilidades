// ═══════════════════════════════════════════════════════════════════════════
//  Refaz os imports entre os arquivos de scripts/: cada arquivo importa só o
//  que usa, direto do arquivo que define o nome.
//
//  Uso (na raiz do repositório):
//    cd tools && npm i && cd ..
//    node tools/arrumar-imports.mjs           → mostra o que mudaria
//    node tools/arrumar-imports.mjs --gravar  → reescreve os imports
//
//  - Lê cada arquivo com um parser e uma análise de escopo de verdade
//    (acorn + eslint-scope), então só conta nomes que o arquivo usa sem declarar.
//  - Se um nome é usado em outro arquivo mas não estava exportado, põe "export".
//  - Mantém apelidos (import { DialogV2 as DialogBase }) e "import * as X".
//  - Avisa se um nome é exportado por dois arquivos e o import não diz qual.
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const acorn = require("acorn");
const eslintScope = require("eslint-scope");

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DIR = path.join(ROOT, "scripts");
const GRAVAR = process.argv.includes("--gravar");
const parse = src => acorn.parse(src, { ecmaVersion: 2024, sourceType: "module", ranges: true });

const files = fs.readdirSync(DIR).filter(f => f.endsWith(".js")).sort();
const SRC = Object.fromEntries(files.map(f => [f, fs.readFileSync(path.join(DIR, f), "utf8")]));

// nomes declarados no topo de cada arquivo (exportados ou não)
function topLevel(f) {
  const ast = parse(SRC[f]);
  const decl = new Map(); // nome → { exported, start (início da declaração) }
  const add = (name, exported, node) => decl.set(name, { exported, start: node.start });
  for (const st of ast.body) {
    const d = st.type === "ExportNamedDeclaration" ? st.declaration : st;
    const exported = st.type === "ExportNamedDeclaration";
    if (!d) { // export { a, b }
      for (const s of st.specifiers ?? []) if (decl.has(s.local.name)) decl.get(s.local.name).exported = true;
      continue;
    }
    if (d.type === "FunctionDeclaration" || d.type === "ClassDeclaration") add(d.id.name, exported, st);
    if (d.type === "VariableDeclaration") for (const v of d.declarations) for (const n of names(v.id)) add(n, exported, st);
  }
  return { ast, decl };
}
function names(p) {
  if (!p) return [];
  if (p.type === "Identifier") return [p.name];
  if (p.type === "ObjectPattern") return p.properties.flatMap(x => names(x.value ?? x.argument));
  if (p.type === "ArrayPattern") return p.elements.flatMap(names);
  if (p.type === "RestElement") return names(p.argument);
  if (p.type === "AssignmentPattern") return names(p.left);
  return [];
}
const TOP = Object.fromEntries(files.map(f => [f, topLevel(f)]));
const owners = name => files.filter(f => TOP[f].decl.has(name));

const plan = {};
const needExport = {}; // arquivo → Set de nomes
const problems = [];
for (const f of files) {
  const { ast } = TOP[f];
  // imports locais atuais (para manter apelidos e o arquivo escolhido quando há dois donos)
  const old = new Map(); // nome local → { from, imported }
  const keep = [];       // imports que não são entre scripts/ (ou "* as")
  for (const st of ast.body) {
    if (st.type !== "ImportDeclaration") continue;
    const from = st.source.value;
    const local = from.startsWith("./") && files.includes(from.slice(2));
    if (!local || st.specifiers.some(s => s.type !== "ImportSpecifier")) { keep.push(st); continue; }
    for (const s of st.specifiers) old.set(s.local.name, { from: from.slice(2), imported: s.imported.name });
  }
  // nomes usados e não declarados no arquivo (ignorando os imports locais, que vamos refazer)
  const stripped = ast.body.filter(st => !(st.type === "ImportDeclaration" && !keep.includes(st)));
  const sm = eslintScope.analyze({ ...ast, body: stripped }, { ecmaVersion: 2024, sourceType: "module" });
  const free = new Set(sm.globalScope.through.map(r => r.identifier.name));
  const imp = new Map(); // arquivo → [especificadores]
  for (const name of [...free].sort()) {
    let from, imported = name;
    const o = old.get(name);
    if (o) {
      imported = o.imported;
      const ow = owners(imported);
      from = ow.includes(o.from) ? o.from : ow.length === 1 ? ow[0] : null;
      if (!from) { problems.push(`${f}: "${imported}" está em ${ow.join(", ") || "nenhum arquivo"}`); continue; }
    } else {
      let ow = owners(name).filter(x => x !== f);
      if (!ow.length) continue; // global do Foundry (game, ui, Hooks…)
      // dois arquivos com o mesmo nome: vale o que exporta (o outro é um ajudante local)
      const exp = ow.filter(x => TOP[x].decl.get(name).exported);
      if (ow.length > 1 && exp.length === 1) ow = exp;
      if (ow.length > 1) { problems.push(`${f}: "${name}" está em ${ow.join(", ")}; escolha no import`); continue; }
      from = ow[0];
    }
    if (from === f) continue;
    if (!TOP[from].decl.get(imported).exported) (needExport[from] ??= new Set()).add(imported);
    if (!imp.has(from)) imp.set(from, []);
    imp.get(from).push(imported === name ? name : `${imported} as ${name}`);
  }
  plan[f] = { keep, imp };
}

// ── gravar ──
let changed = 0;
for (const f of files) {
  let src = SRC[f];
  const { ast, decl } = TOP[f];
  const { keep, imp } = plan[f];
  // 1. "export" onde faltar (de baixo para cima, para não mexer nas posições)
  const ex = [...(needExport[f] ?? [])].map(n => decl.get(n).start).sort((a, b) => b - a);
  for (const at of [...new Set(ex)]) src = src.slice(0, at) + "export " + src.slice(at);
  // 2. troca o bloco de imports pelo novo
  const imports = ast.body.filter(st => st.type === "ImportDeclaration");
  const lines = [
    ...keep.map(st => SRC[f].slice(st.start, st.end)),
    ...[...imp.entries()].sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b)).map(([from, list]) => fmt(from, list))
  ].join("\n");
  if (imports.length) {
    const shift = ex.filter(at => at < imports[0].start).length * 7; // "export " antes dos imports (não acontece)
    const a = imports[0].start + shift, b = imports[imports.length - 1].end + shift;
    src = src.slice(0, a) + lines + src.slice(b);
  } else if (lines) {
    const hdr = src.match(/^(\/\/[^\n]*\n)*\n?/)[0];
    src = hdr + lines + "\n\n" + src.slice(hdr.length);
  }
  if (src !== SRC[f]) { changed++; console.log(`${GRAVAR ? "gravado" : "mudaria"}: ${f}`); if (GRAVAR) fs.writeFileSync(path.join(DIR, f), src); }
}
for (const p of problems) console.log("ATENÇÃO", p);
console.log(`${changed} arquivo(s)`);
if (problems.length) process.exitCode = 1;

function order(f) { return ["idioma.js", "core.js"].indexOf(f) + 1 || 9; }
function fmt(from, list) {
  const one = `import { ${list.join(", ")} } from "./${from}";`;
  if (one.length <= 120) return one;
  const rows = [];
  let row = "";
  for (const x of list) { if ((row + x).length > 100) { rows.push(row.trimEnd()); row = ""; } row += x + ", "; }
  rows.push(row.replace(/, $/, ""));
  return `import {\n  ${rows.join("\n  ")}\n} from "./${from}";`;
}
