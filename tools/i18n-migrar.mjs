// ═══════════════════════════════════════════════════════════════════════════
//  Migração única (1.9.0): troca o L`…` caseiro por chaves do Foundry.
//
//  Uso (na raiz do repositório, com a versão 1.8.x ainda com scripts/i18n.js):
//    cd tools && npm i && cd ..
//    node tools/i18n-migrar.mjs            → só relatório
//    node tools/i18n-migrar.mjs --gravar   → reescreve scripts/*.js e lang/*.json
//
//  Como funciona:
//  - lê cada script com um parser de verdade (acorn) e acha todo L`…` e L("…");
//  - separa o HTML (fica no código) do texto (vai para o JSON). Atributos de
//    texto (placeholder, data-tooltip, title, aria-label) também viram chave;
//  - um trecho de texto com ${x} no meio vira uma chave só com {x};
//  - o inglês de cada trecho é calculado com o próprio motor antigo, então a
//    tradução fica igual à que existia;
//  - no fim, confere cada uso: monta o texto antigo e o novo (em PT e EN) com
//    valores de teste e avisa se algo mudou.
//  Esta ferramenta fica no repositório como registro; não vai para o ZIP.
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const acorn = require("acorn");
const walk = require("acorn-walk");

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SCRIPTS = path.join(ROOT, "scripts");
const GRAVAR = process.argv.includes("--gravar");

globalThis.Hooks ??= { once() {}, on() {} };
const OLD = await import(path.join(SCRIPTS, "i18n.js"));
const oldPT = (strings, vals) => { OLD.setLang("pt-BR"); return OLD.L(strings, ...vals); };
const oldEN = (strings, vals) => { OLD.setLang("en"); return OLD.L(strings, ...vals); };
const enPiece = s => { OLD.setLang("en"); return OLD.L(s); };

const AREA = {
  "core.js": "Regras", "app.js": "Janela", "app-actions.js": "Acoes", "app-canvas.js": "Mapa",
  "app-dialogs.js": "Dialogos", "app-editor.js": "Editor", "app-io.js": "Importar", "app-panel.js": "Painel",
  "app-tools.js": "Ferramentas", "app-undo.js": "Desfazer", "app-welcome.js": "Guia", "ui-kit.js": "Interface",
  "main.js": "Inicio", "operations.js": "Operacoes"
};
const ATTRS = new Set(["placeholder", "data-tooltip", "title", "aria-label"]);
const FN = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);
const hasWords = s => /[A-Za-zÀ-ÿ]/.test(s.replace(/&[a-z#0-9]+;/gi, ""));

// ── 1. achar os usos ──────────────────────────────────────────────────────
const files = fs.readdirSync(SCRIPTS).filter(f => f.endsWith(".js") && f !== "i18n.js").sort();
const PER = {};          // arquivo → { src, sites }
const manual = [];       // usos que a ferramenta não converte sozinha
for (const f of files) {
  const src = fs.readFileSync(path.join(SCRIPTS, f), "utf8");
  const ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: "module" });
  const sites = [];
  walk.ancestor(ast, {
    TaggedTemplateExpression(node, _s, anc) {
      if (node.tag.type === "Identifier" && node.tag.name === "L") sites.push({ node, kind: "tag", top: isTop(anc) });
    },
    CallExpression(node, _s, anc) {
      if (node.callee.type !== "Identifier" || node.callee.name !== "L") return;
      const a = node.arguments[0];
      const ok = node.arguments.length === 1 && ((a.type === "Literal" && typeof a.value === "string") || (a.type === "TemplateLiteral" && !a.expressions.length));
      if (ok) sites.push({ node, kind: "call", top: isTop(anc) });
      else manual.push(`${f}:${lineOf(src, node.start)}  ${src.slice(node.start, node.end).slice(0, 80)}`);
    }
  });
  sites.sort((a, b) => a.node.start - b.node.start);
  PER[f] = { src, sites };
}
function isTop(anc) {
  for (const a of anc) {
    if (FN.has(a.type)) return false;
    if (a.type === "PropertyDefinition" && !a.static) return false;
  }
  return true;
}
function lineOf(src, i) { return src.slice(0, i).split("\n").length; }

// ── 2. separar HTML de texto ──────────────────────────────────────────────
// itens: { s: texto já interpretado } | { e: nó da expressão }
function itemsOf(site, src) {
  const n = site.node;
  if (site.kind === "call") {
    const a = n.arguments[0];
    return [{ s: a.type === "Literal" ? a.value : a.quasis[0].value.cooked }];
  }
  const q = n.quasi, out = [];
  q.quasis.forEach((x, i) => { out.push({ s: x.value.cooked }); if (i < q.expressions.length) out.push({ e: q.expressions[i] }); });
  return out;
}
// devolve partes: { code: "texto cru" } | { expr: nó } | { run: [itens] }
function segment(items) {
  const parts = [];
  let mode = "text", quote = null, attrRun = null, tagBuf = "", rawUntil = null;
  let run = [];
  const code = s => { if (!s) return; const l = parts[parts.length - 1]; if (l && l.code !== undefined) l.code += s; else parts.push({ code: s }); };
  const flushRun = () => { if (run.length) parts.push({ run }); run = []; };
  const addRun = (arr, s) => { const l = arr[arr.length - 1]; if (l && l.s !== undefined) l.s += s; else arr.push({ s }); };
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    if (it.e) {
      if (mode === "text" && !rawUntil) run.push({ e: it.e });
      else if (attrRun) attrRun.push({ e: it.e });
      else { if (mode === "tag") tagBuf += "\u0000"; parts.push({ expr: it.e }); }
      continue;
    }
    const s = it.s;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (mode === "text") {
        if (rawUntil) {
          if (s.startsWith(rawUntil, i)) { rawUntil = null; } else { code(c); continue; }
        }
        const nx = s[i + 1];
        const startsTag = c === "<" && (nx ? /[a-zA-Z\/!]/.test(nx) : !!items[k + 1]?.e);
        if (startsTag) { flushRun(); mode = "tag"; tagBuf = "<"; code(c); continue; }
        addRun(run, c);
        continue;
      }
      // dentro de uma tag
      if (attrRun) {
        if (c === quote) { finishAttr(); code(c); quote = null; tagBuf += c; continue; }
        addRun(attrRun, c); continue;
      }
      if (quote) { code(c); tagBuf += c; if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'") {
        const m = tagBuf.match(/([a-zA-Z:-]+)\s*=\s*$/);
        quote = c; code(c); tagBuf += c;
        if (m && ATTRS.has(m[1].toLowerCase())) attrRun = [];
        continue;
      }
      if (c === ">") {
        code(c); mode = "text";
        const name = (tagBuf.match(/^<\s*([a-zA-Z]+)/) || [])[1]?.toLowerCase();
        if (name === "style" || name === "script") rawUntil = `</${name}`;
        tagBuf = ""; continue;
      }
      code(c); tagBuf += c;
    }
  }
  if (attrRun) finishAttr();
  flushRun();
  return parts;
  function finishAttr() { parts.push({ run: attrRun, attr: true }); attrRun = null; }
}
// tira das pontas de um trecho o que não é texto (espaços, ${x} sozinhos)
function trimRun(run) {
  const before = [], after = [];
  const r = run.map(x => ({ ...x }));
  for (;;) {
    const f = r[0];
    if (!f) break;
    if (f.e) { before.push(f); r.shift(); continue; }
    const m = f.s.match(/^\s+/);
    if (m) { before.push({ s: m[0] }); f.s = f.s.slice(m[0].length); }
    if (!f.s) { r.shift(); continue; }
    break;
  }
  for (;;) {
    const l = r[r.length - 1];
    if (!l) break;
    if (l.e) { after.unshift(l); r.pop(); continue; }
    const m = l.s.match(/\s+$/);
    if (m) { after.unshift({ s: m[0] }); l.s = l.s.slice(0, -m[0].length); }
    if (!l.s) { r.pop(); continue; }
    break;
  }
  return { before, core: r, after };
}

// ── 3. chaves ─────────────────────────────────────────────────────────────
function paramName(e, src, used) {
  let b = "v";
  const last = x => x.type === "Identifier" ? x.name : x.type === "MemberExpression" && !x.computed ? x.property.name : null;
  b = last(e) ?? (e.type === "CallExpression" && e.arguments[0] ? (last(e.arguments[0]) ?? (e.callee.type === "Identifier" ? e.callee.name : null)) : null) ?? "v";
  b = String(b).replace(/\W/g, "") || "v";
  let n = b, i = 2;
  while (used.has(n)) n = b + i++;
  used.add(n);
  return n;
}
const RUNS = [];   // { file, pt, en, params:[{name, e}] }
function keyRun(file, core, src) {
  const used = new Set(), params = [];
  let pt = "", en = "";
  for (const x of core) {
    if (x.e) { const name = paramName(x.e, src, used); params.push({ name, e: x.e }); pt += `{${name}}`; en += `{${name}}`; }
    else { pt += x.s; en += enPiece(x.s); }
  }
  const r = { file, pt, en, params };
  RUNS.push(r);
  return r;
}
function slug(pt) {
  const w = pt.replace(/\{[^}]*\}/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/<[^>]*>|&[a-z#0-9]+;/gi, " ").toLowerCase().match(/[a-z0-9]+/g) ?? ["texto"];
  let s = w[0];
  for (const x of w.slice(1)) { if (s.length >= 28) break; s += x[0].toUpperCase() + x.slice(1); }
  return /^[0-9]/.test(s) ? "n" + s : s;
}

// ── 4. gerar o código novo ────────────────────────────────────────────────
const escTpl = s => s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
const PLAN = new Map();  // site → partes processadas
for (const [f, { src, sites }] of Object.entries(PER)) {
  for (const site of sites) {
    const parts = segment(itemsOf(site, src)).map(p => {
      if (!p.run) return p;
      const { before, core, after } = trimRun(p.run);
      const words = core.some(x => x.s !== undefined && hasWords(x.s));
      if (!words) return { raw: p.run };
      return { before, after, key: keyRun(f, core, src) };
    });
    PLAN.set(site, parts);
  }
}
// chaves: texto usado em mais de um arquivo vai para "Comum"
const filesOf = new Map();
for (const r of RUNS) { if (!filesOf.has(r.pt)) filesOf.set(r.pt, new Set()); filesOf.get(r.pt).add(r.file); }
const KEYS = new Map(), PT = {}, EN = {};
for (const r of RUNS) {
  if (KEYS.has(r.pt)) { r.k = KEYS.get(r.pt); continue; }
  const area = filesOf.get(r.pt).size > 1 ? "Comum" : AREA[r.file] ?? "Outros";
  let k = `ARVORE.${area}.${slug(r.pt)}`, i = 2;
  while (PT[k] !== undefined) k = `ARVORE.${area}.${slug(r.pt)}${i++}`;
  KEYS.set(r.pt, k); r.k = k; PT[k] = r.pt; EN[k] = r.en;
}

function gen(f, site) {
  const { src } = PER[f];
  const parts = PLAN.get(site);
  const tcall = (r, top) => {
    if (top) return JSON.stringify(r.k);
    if (!r.params.length) return `loc(${JSON.stringify(r.k)})`;
    const obj = r.params.map(p => { const s = rewrite(f, p.e.start, p.e.end); return s === p.name ? s : `${p.name}: ${s}`; }).join(", ");
    return `loc(${JSON.stringify(r.k)}, { ${obj} })`;
  };
  const plainOnly = parts.length === 1 && parts[0].key && !parts[0].before.length && !parts[0].after.length;
  if (plainOnly) return tcall(parts[0].key, site.top);
  if (site.top) throw new Error(`${f}:${lineOf(src, site.node.start)} uso no topo do arquivo com HTML — converter à mão`);
  let out = "`";
  const piece = x => x.e ? "${" + rewrite(f, x.e.start, x.e.end) + "}" : escTpl(x.s);
  for (const p of parts) {
    if (p.code !== undefined) out += escTpl(p.code);
    else if (p.expr) out += "${" + rewrite(f, p.expr.start, p.expr.end) + "}";
    else if (p.raw) out += p.raw.map(piece).join("");
    else out += p.before.map(piece).join("") + "${" + tcall(p.key, false) + "}" + p.after.map(piece).join("");
  }
  return out + "`";
}
function rewrite(f, start, end) {
  const { src, sites } = PER[f];
  let out = "", at = start;
  for (const s of sites) {
    if (s.node.start < at || s.node.end > end) continue;
    out += src.slice(at, s.node.start) + gen(f, s);
    at = s.node.end;
  }
  return out + src.slice(at, end);
}

// ── 5. conferir: texto antigo × novo, em PT e EN ──────────────────────────
const SENT = i => `\u0001${i}\u0001`;
let checked = 0;
const diffs = [];
for (const [f, { src, sites }] of Object.entries(PER)) {
  for (const site of sites) {
    const items = itemsOf(site, src);
    const strings = items.filter(x => x.s !== undefined).map(x => x.s);
    const vals = items.filter(x => x.e).map((_, i) => SENT(i));
    if (site.kind === "call") { strings.length = 1; }
    const exprIdx = new Map(items.filter(x => x.e).map((x, i) => [x.e, i]));
    const render = dict => PLAN.get(site).map(p => {
      const v = x => x.e ? SENT(exprIdx.get(x.e)) : x.s;
      if (p.code !== undefined) return p.code;
      if (p.expr) return SENT(exprIdx.get(p.expr));
      if (p.raw) return p.raw.map(v).join("");
      const r = p.key; let s = dict[r.k];
      for (const pr of r.params) s = s.split(`{${pr.name}}`).join(SENT(exprIdx.get(pr.e)));
      return p.before.map(v).join("") + s + p.after.map(v).join("");
    }).join("");
    const oldArgs = site.kind === "call" ? [strings[0], []] : [Object.assign([...strings], { raw: strings }), vals];
    const o = site.kind === "call" ? [OLD.L((OLD.setLang("pt-BR"), strings[0])), OLD.L((OLD.setLang("en"), strings[0]))] : [oldPT(oldArgs[0], vals), oldEN(oldArgs[0], vals)];
    const nPT = render(PT), nEN = render(EN);
    checked++;
    if (o[0] !== nPT || o[1] !== nEN) diffs.push({ at: `${f}:${lineOf(src, site.node.start)}`, oldEN: o[1], newEN: nEN, oldPT: o[0], newPT: nPT });
  }
}

// ── 6. relatório e gravação ───────────────────────────────────────────────
const untranslated = Object.keys(PT).filter(k => PT[k] === EN[k]);
const tops = Object.entries(PER).flatMap(([f, x]) => x.sites.filter(s => s.top).map(s => `${f}:${lineOf(x.src, s.node.start)}`));
console.log(`usos: ${checked} · chaves: ${Object.keys(PT).length} · diferenças: ${diffs.length} · sem inglês: ${untranslated.length} · no topo do arquivo: ${tops.length}`);
for (const d of diffs.slice(0, 40)) console.log("DIF", d.at, "\n  antes EN:", JSON.stringify(d.oldEN).slice(0, 300), "\n  depois  :", JSON.stringify(d.newEN).slice(0, 300), d.oldPT !== d.newPT ? "\n  (PT também mudou)" : "");
if (manual.length) console.log("CONVERTER À MÃO:\n  " + manual.join("\n  "));
fs.writeFileSync(path.join(ROOT, "tools", "i18n-relatorio.json"), JSON.stringify({ untranslated: Object.fromEntries(untranslated.map(k => [k, PT[k]])), tops, diffs }, null, 1));

if (GRAVAR) {
  for (const [f, x] of Object.entries(PER)) {
    if (!x.sites.length) continue;
    let out = rewrite(f, 0, x.src.length);
    // import do idioma: só o que o arquivo usa
    out = out.replace(/^import \{([^}]*)\} from ["']\.\/i18n\.js["'];?\n/m, (m, names) => {
      const keep = names.split(",").map(s => s.trim()).filter(n => n && n !== "L" && n !== "relabel" && n !== "i18nReady" && n !== "setLang");
      const need = ["loc", ...keep].filter((n, i, a) => a.indexOf(n) === i);
      return `import { ${need.join(", ")} } from "./idioma.js";\n`;
    });
    fs.writeFileSync(path.join(SCRIPTS, f), out);
  }
  for (const [lang, dict] of [["pt-BR", PT], ["en", EN]]) {
    const p = path.join(ROOT, "lang", `${lang}.json`);
    const cur = JSON.parse(fs.readFileSync(p, "utf8"));
    const sorted = Object.fromEntries(Object.entries({ ...cur, ...dict }).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(p, JSON.stringify(sorted, null, 2) + "\n");
  }
  console.log("gravado.");
}
