// ═══════════════════════════════════════════════════════════════════════════
//  Árvore da Mesa — idioma
//  Os textos ficam em lang/pt-BR.json e lang/en.json (padrão do Foundry).
//  loc(chave, { n: 3 }), com chave no formato ARVORE.Area.nome, devolve o texto no idioma do usuário,
//  trocando {n} pelo valor. O HTML fica no código; o texto fica no JSON.
//  O que vem do mestre (nomes, descrições) entra pelos valores e nunca é traduzido.
// ═══════════════════════════════════════════════════════════════════════════

export function loc(key, data) {
  const s = globalThis.game?.i18n?.localize?.(key) ?? key;
  if (!data) return s;
  // só troca os {nomes} que vieram em data; o resto do texto fica como está
  return s.replace(/\{(\w+)\}/g, (m, k) => Object.hasOwn(data, k) ? String(data[k] ?? "") : m);
}

// "en" ou não: para os poucos lugares em que a gramática muda mais que o texto
export const isEnglish = () => !String(globalThis.game?.i18n?.lang ?? "pt").toLowerCase().startsWith("pt");

// Listas de opções montadas quando o arquivo carrega (tipos de efeito, ativações…)
// guardam a chave; no "i18nInit", quando o idioma já é conhecido, viram o texto.
// Guardamos a chave original para poder traduzir de novo se preciso.
const ORIGINAL = new WeakMap();
export function localizeLists(values) {
  const isKey = s => typeof s === "string" && s.startsWith("ARVORE.");
  const fix = (obj, k) => {
    const keys = ORIGINAL.get(obj) ?? {};
    const key = keys[k] ?? obj[k];
    if (!isKey(key)) return;
    keys[k] = key; ORIGINAL.set(obj, keys);
    obj[k] = loc(key);
  };
  for (const v of values) {
    if (Array.isArray(v)) { for (const o of v) if (o && typeof o === "object") for (const k of ["label", "name", "hint"]) fix(o, k); continue; }
    if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) for (const k of Object.keys(v)) fix(v, k);
  }
}
