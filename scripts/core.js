// ═══════════════════════════════════════════════════════════════════════════
//  Árvore da Mesa — núcleo: constantes, registro compartilhado (ST), configurações, listas de opções, modelos e leitura das árvores
// ═══════════════════════════════════════════════════════════════════════════

import { loc } from "./idioma.js";
import { treeLock } from "./regras.js";

// marca operações internas (ex.: sinergias liberadas pelo próprio módulo)
export const INTERNAL = Symbol("skill-tree-operation");


// Os dados dos personagens ficam em flags.{SCOPE} ("world") — o mesmo da macro antiga,
// para manter todo o progresso já existente.
export const MOD = "arvore-habilidades";
// Versão: vem só do module.json (o Foundry lê na hora de carregar o mundo)
export const moduleVersion = () => game.modules?.get(MOD)?.version ?? "";
// Registro compartilhado entre os arquivos (janela aberta, área de transferência…)
export const ST = { app: null, open: null, openApp: null, session: null, catalog: null, clipboard: null, tidy: false };

export const SCOPE = "world";
export const R = 32; // raio base da habilidade em px
export const { ApplicationV2, DialogV2 } = foundry.applications.api;
export const TE = foundry.applications.ux.TextEditor.implementation;
export const FP = foundry.applications.apps.FilePicker.implementation;
export const AH = foundry.audio.AudioHelper;
export const getProp = foundry.utils.getProperty;
export const clone = foundry.utils.deepClone;
export const uid = () => foundry.utils.randomID(8);
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const saveFile = foundry.utils.saveDataToFile;
export const isTyping = el => !!el?.closest?.("input, textarea, select, [contenteditable]");
// Limpa HTML que veio de descrições (digitadas ou importadas de JSON) antes de ir para a tela:
// tira scripts, iframes e afins, atributos on* e links/imagens com "javascript:".
export function sanitizarHTML(html) {
  const s = String(html ?? "");
  if (!s) return "";
  if (typeof DOMParser === "undefined") return esc(s);
  const doc = new DOMParser().parseFromString(`<body>${s}</body>`, "text/html");
  doc.querySelectorAll("script, iframe, object, embed, style, link, meta, base, form").forEach(el => el.remove());
  for (const el of doc.body.querySelectorAll("*")) {
    for (const at of [...el.attributes]) {
      const nome = at.name.toLowerCase(), v = at.value.replace(/[\s\u0000-\u001f]/g, "").toLowerCase();
      if (nome.startsWith("on") || ((nome === "href" || nome === "src" || nome === "xlink:href" || nome === "action" || nome === "formaction") && (v.startsWith("javascript:") || v.startsWith("vbscript:") || v.startsWith("data:text/html")))) el.removeAttribute(at.name);
    }
  }
  return doc.body.innerHTML;
}
// o que cada ação do histórico vira no texto ("fulano desbloqueou X")
export const LOG_VERBS = () => ({ unlock: loc("ARVORE.Regras.desbloqueou"), temp: loc("ARVORE.Regras.recebeuTemporaria"), grant: loc("ARVORE.Regras.recebeuDoMestre"), refund: loc("ARVORE.Regras.reembolsou"), deny: loc("ARVORE.Regras.teveRecusado"), reset: loc("ARVORE.Regras.resetou"), train: loc("ARVORE.Regras.comecouATreinar"), orphan: loc("ARVORE.Regras.recebeuDeVoltaOsPontosDe") });
// idioma do Foundry para datas (pt-BR, en…)
export const dateLang = () => game.i18n?.lang || "pt-BR";

// ───────────────────────── chaves no ator ─────────────────────────
export const K_UNLOCK = id => `flags.${SCOPE}.skillTree.${id}`;
export const K_RANKS = id => `flags.${SCOPE}.skillRanks.${id}`;
export const K_LOG = `flags.${SCOPE}.skillLog`;
export const K_REQ = `flags.${SCOPE}.skillReq`;
export const K_TRAIN = `flags.${SCOPE}.skillTraining`;
export const K_MILES = `flags.${SCOPE}.milestones`;
export const K_LASTLVL = `flags.${SCOPE}.skillPoints.lastLevel`;
export const K_AVAIL = `flags.${SCOPE}.skillAvail`;
export const K_TEMP = `flags.${SCOPE}.skillTemp`;
// descansos longos feitos por jogadores, esperando o mestre contar (o gancho do dnd5e só roda no cliente de quem descansou)
export const K_RESTQ = `flags.${SCOPE}.stRestQ`;
export const SKILL_SPENT = `flags.${SCOPE}.skillPoints.spent`;
export const SKILL_BONUS = `flags.${SCOPE}.skillPoints.bonus`;
export const K_MYTH = `flags.${SCOPE}.mythic.value`;
export const K_FEATS = `flags.${SCOPE}.mythic.feats`;

// ───────────────────────── configurações globais ─────────────────────────
export const settingsDefaults = () => ({ ptsPerLevel: 7, maxLevel: 30, sheetButton: true, sheetTab: true, levelNotice: true, availNotice: true, defaultSound: "sounds/notify.wav" });
export let CFG = settingsDefaults();
export const CFG_KEYS = Object.keys(settingsDefaults());
export function reloadCfg() {
  const c = settingsDefaults();
  for (const k of CFG_KEYS) { try { const v = game.settings.get(MOD, k); if (v !== undefined && v !== null) c[k] = v; } catch (e) { console.warn(`Árvore da Mesa | configuração "${k}" (usando o padrão)`, e); } }
  CFG = c;
}
export async function saveCfg(cfg) {
  for (const k of CFG_KEYS) if (k in cfg && cfg[k] !== CFG[k]) await game.settings.set(MOD, k, cfg[k]);
  reloadCfg();
}

// ───────────────────────── listas de opções ─────────────────────────
export let CHANGE_TYPES = [];
// No Foundry 14, CONFIG.ActiveEffect.changeTypes só traz os tipos EXTRAS (do sistema e de módulos,
// como "dnd5e.bonus" ou o do Automated Conditions 5e). Os tipos básicos são do próprio Foundry e
// não aparecem ali, então entram sempre primeiro na lista.
export const CORE_CHANGE_TYPES = [
  { value: "add", label: "ARVORE.Efeito.add" }, { value: "multiply", label: "ARVORE.Efeito.multiply" },
  { value: "override", label: "ARVORE.Efeito.override" }, { value: "upgrade", label: "ARVORE.Efeito.upgrade" },
  { value: "downgrade", label: "ARVORE.Efeito.downgrade" }, { value: "custom", label: "ARVORE.Efeito.custom" }
];
export const computeChangeTypes = () => {
  const extras = Object.entries(CONFIG.ActiveEffect?.changeTypes ?? {})
    .map(([k, v]) => ({ value: k, label: game.i18n.localize(v?.label ?? k) }));
  const base = CORE_CHANGE_TYPES.filter(c => !extras.some(e => e.value === c.value)).map(c => ({ value: c.value, label: loc(c.label) }));
  return [...base, ...extras];
};
// Guardamos sempre um nome "canônico" (add, override…) e traduzimos para o tipo do sistema ao criar o efeito.
// LEGACY_MODES converte os números de modo salvos por versões antigas (Foundry 13).
export const LEGACY_MODES = { 0: "custom", 1: "multiply", 2: "add", 3: "downgrade", 4: "upgrade", 5: "override" };
export const TYPE_RX = {
  add: /^add$|adicion|\badd\b|somar/i, override: /overrid|substitu|sobrescrev/i, multiply: /multipl/i,
  upgrade: /upgrade|aument|melhor|máximo entre/i, downgrade: /downgrade|diminu|reduz|piora/i, subtract: /subtra/i, custom: /custom|personaliz/i
};
export function canonType(v) {
  const s = String(v ?? "");
  if (TYPE_RX[s] || s === "add") return s;
  if (s in LEGACY_MODES) return LEGACY_MODES[s];
  if (s.includes(".") && CHANGE_TYPES.some(c => c.value === s)) return s; // tipo extra de sistema/módulo
  const ct = CHANGE_TYPES.find(c => c.value === s);
  for (const [k, rx] of Object.entries(TYPE_RX)) if (rx.test(s) || (ct && rx.test(ct.label))) return k;
  return s;
}
export function systemType(v) {
  const canon = canonType(v);
  if (CHANGE_TYPES.some(c => c.value === canon)) return canon;
  const byKey = CHANGE_TYPES.find(c => c.value.toLowerCase() === canon);
  if (byKey) return byKey.value;
  const rx = TYPE_RX[canon];
  const byLabel = rx && CHANGE_TYPES.find(c => rx.test(c.value) || rx.test(c.label));
  if (byLabel) return byLabel.value;
  return canon;
}
export const DEFAULT_TYPE = "add";

// Caminhos que o dnd5e 6 mudou de lugar. As árvores antigas são corrigidas ao carregar.
const KEY_MOVES = [
  [/^system\.attributes\.movement\.(walk|burrow|climb|fly|jump|swim)$/, "system.attributes.movement.speeds.$1"],
  [/^system\.attributes\.senses\.(darkvision|blindsight|tremorsense|truesight)$/, "system.attributes.senses.ranges.$1"],
  [/^system\.attributes\.ac\.base$/, "system.attributes.ac.armor"]
];
export function migrateKey(key) {
  const k = String(key ?? "").trim();
  for (const [rx, to] of KEY_MOVES) if (rx.test(k)) return k.replace(rx, to);
  return k;
}
const fixChanges = list => (Array.isArray(list) ? list : []).map(c => ({ ...c, key: migrateKey(c.key) }));

export const KEY_HINTS = [
  "system.attributes.ac.bonus", "system.attributes.hp.bonuses.overall", "system.attributes.hp.bonuses.level",
  "system.attributes.movement.speeds.walk", "system.attributes.movement.speeds.fly", "system.attributes.init.bonus",
  "system.bonuses.mwak.attack", "system.bonuses.mwak.damage", "system.bonuses.rwak.attack", "system.bonuses.rwak.damage",
  "system.bonuses.msak.attack", "system.bonuses.rsak.attack", "system.bonuses.spell.dc",
  "system.bonuses.abilities.save", "system.bonuses.abilities.check", "system.bonuses.abilities.skill",
  "system.abilities.str.value", "system.abilities.dex.value", "system.abilities.con.value",
  "system.abilities.int.value", "system.abilities.wis.value", "system.abilities.cha.value",
  "system.abilities.str.bonuses.save", "system.abilities.dex.bonuses.save",
  "system.skills.prc.bonuses.check", "system.skills.ste.bonuses.check", "system.skills.ath.value",
  "system.traits.dr.value", "system.traits.di.value", "system.traits.ci.value", "system.traits.languages.value",
  "system.traits.size", "system.attributes.hp.tempmax"
];
export const KEY_LABELS = {
  "system.attributes.ac.bonus": "ARVORE.Regras.bonusNaCa", "system.attributes.hp.bonuses.overall": "ARVORE.Regras.pvExtrasTotal",
  "system.attributes.hp.bonuses.level": "ARVORE.Regras.pvExtrasPorNivel", "system.attributes.hp.tempmax": "ARVORE.Regras.pvMaximosTemporarios",
  "system.attributes.movement.speeds.walk": "ARVORE.Regras.deslocamento", "system.attributes.movement.speeds.fly": "ARVORE.Regras.voo",
  "system.attributes.movement.speeds.swim": "ARVORE.Regras.natacao", "system.attributes.movement.hover": "ARVORE.Regras.pairar",
  "system.attributes.senses.ranges.darkvision": "ARVORE.Regras.visaoNoEscuro", "system.attributes.init.bonus": "ARVORE.Regras.iniciativa",
  "system.bonuses.mwak.attack": "ARVORE.Regras.acertoCorpoACorpoArma", "system.bonuses.mwak.damage": "ARVORE.Regras.danoCorpoACorpoArma",
  "system.bonuses.rwak.attack": "ARVORE.Regras.acertoADistanciaArma", "system.bonuses.rwak.damage": "ARVORE.Regras.danoADistanciaArma",
  "system.bonuses.msak.attack": "ARVORE.Regras.acertoDeMagiaCorpoACorpo", "system.bonuses.rsak.attack": "ARVORE.Regras.acertoDeMagiaADistancia",
  "system.bonuses.spell.dc": "ARVORE.Regras.cdDeMagia", "system.bonuses.abilities.save": "ARVORE.Regras.todosOsTestesDeResistencia",
  "system.bonuses.abilities.check": "ARVORE.Regras.todosOsTestesDeAtributo", "system.bonuses.abilities.skill": "ARVORE.Regras.todasAsPericias",
  "system.traits.size": "ARVORE.Comum.tamanho", "system.traits.dr.value": "ARVORE.Regras.resistenciaADano", "system.traits.di.value": "ARVORE.Regras.imunidadeADano",
  "system.traits.ci.value": "ARVORE.Regras.imunidadeACondicao", "system.traits.languages.value": "ARVORE.Regras.idiomas"
};
export let D5 = {};
export const lbl = v => game.i18n.localize(typeof v === "string" ? v : (v?.label ?? ""));
export let ABILITIES = [];
export let DAMAGE_TYPES = [];
// Listas que dependem do sistema/Foundry já carregados (chamada no "setup")
export function initCore() {
  CHANGE_TYPES = computeChangeTypes();
  D5 = CONFIG.DND5E ?? {};
  ABILITIES = Object.entries(D5.abilities ?? {}).map(([k, v]) => ({ value: k, label: lbl(v) || k }));
  DAMAGE_TYPES = Object.entries(D5.damageTypes ?? {}).map(([k, v]) => ({ value: k, label: lbl(v) || k }))
    .concat(Object.entries(D5.healingTypes ?? {}).map(([k, v]) => ({ value: k, label: lbl(v) || k })));
  reloadCfg();
  if (!CHANGE_TYPES.some(c => c.value === "add")) console.warn(loc("ARVORE.Regras.arvoreDaMesaNaoEncontreiOTipo"), CHANGE_TYPES);
}
export const FEAT_KINDS = [
  { value: "utility", label: "ARVORE.Regras.habilidadeTransformacao" },
  { value: "attack", label: "ARVORE.Regras.ataqueRolagemDeAcerto" },
  { value: "save", label: "ARVORE.Regras.testeDeResistenciaCd" },
  { value: "heal", label: "ARVORE.Regras.curaPvTemporarios" },
  { value: "none", label: "ARVORE.Regras.soPassivaSemBotaoDeUso" }
];
export const ACTIVATIONS = [
  { value: "action", label: "ARVORE.Regras.acao" }, { value: "bonus", label: "ARVORE.Regras.acaoBonus" }, { value: "reaction", label: "ARVORE.Regras.reacao" },
  { value: "minute", label: "ARVORE.Regras.umMinuto" }, { value: "special", label: "ARVORE.Regras.especial" }, { value: "", label: "ARVORE.Regras.nenhuma" }
];
export const RECOVERY = [
  { value: "lr", label: "ARVORE.Regras.descansoLongo" }, { value: "sr", label: "ARVORE.Regras.descansoCurto" },
  { value: "day", label: "ARVORE.Regras.porDia" }, { value: "", label: "ARVORE.Regras.naoRecupera" }
];
export const DUR_UNITS = [
  { value: "round", label: "ARVORE.Regras.rodadas" }, { value: "minute", label: "ARVORE.Regras.minutos" }, { value: "hour", label: "ARVORE.Regras.horas" }, { value: "day", label: "ARVORE.Regras.dias" }
];
export const DUR_SECONDS = { round: 6, minute: 60, hour: 3600, day: 86400 };
export const SHAPES = [
  { value: "circle", label: "ARVORE.Regras.circulo" }, { value: "hex", label: "ARVORE.Regras.hexagono" },
  { value: "diamond", label: "ARVORE.Regras.losango" }, { value: "square", label: "ARVORE.Regras.quadrado" }
];
export const SIZES = [{ value: "1", label: "ARVORE.Regras.normal" }, { value: "1.4", label: "ARVORE.Regras.grande" }, { value: "1.8", label: "ARVORE.Regras.enorme" }];
// Recursos prontos: o nome dos pontos acompanha a escolha. Só o "Personalizado" tem nome definido pelo mestre.
export const COINS = "@coins";
export const resPresets = () => [
  { value: "@skill", label: loc("ARVORE.Comum.pontosDeHabilidade"), name: loc("ARVORE.Regras.pontosDeHabilidadePorNivelAutomatico", { ptsPerLevel: CFG.ptsPerLevel }) },
  { value: "system.details.xp.value", label: "XP", name: loc("ARVORE.Comum.xpDoPersonagem") },
  { value: COINS, label: loc("ARVORE.Regras.ouro"), name: loc("ARVORE.Regras.ouroAceitaPlatina1Pl10Po") },
  { value: "@custom", label: "", name: loc("ARVORE.Regras.personalizado") }
];
export const presetOf = path => resPresets().find(p => p.value === path && p.value !== "@custom") ?? null;

// ── Personalizado: recursos do mestre ──
// kind: counter (contador próprio da árvore) · field (campo da ficha) · skill · xp · coins
export const RES_KINDS = ["counter", "field", "skill", "xp", "coins"];
const KIND_PATH = { skill: "@skill", xp: "system.details.xp.value", coins: COINS };
export function resFromPath(path, label) {
  const kind = path === "@skill" ? "skill" : path === "system.details.xp.value" ? "xp" : path === COINS ? "coins" : (!path || path === "@tree") ? "counter" : "field";
  return { id: uid(), name: String(label || "").trim() || presetOf(path)?.label || loc("ARVORE.Comum.pontos"), kind, path: kind === "field" ? path : "" };
}
// caminho na ficha de um recurso; extras em contador próprio ficam em flags por árvore
export function resPath(t, r, primary = false) {
  if (KIND_PATH[r.kind]) return KIND_PATH[r.kind];
  if (r.kind === "field" && r.path) return r.path;
  return primary ? "@tree" : `flags.${SCOPE}.stRes.${t.id}.${r.id}`;
}
export function syncPrimary(t) {
  const r = t.resources?.[0]; if (!r) return;
  t.resPath = resPath(t, r, true); t.resLabel = r.name;
}
// recursos extras (2º em diante). Só campos e contadores: os automáticos ficam para o principal.
export const extraRes = t => t?.rules === "custom" ? (t.resources ?? []).slice(1).filter(r => r.kind === "counter" || r.kind === "field" || r.kind === "xp") : [];
// custo de uma habilidade nos recursos extras, por caminho na ficha: { caminho: valor }
export function nodeExtras(t, n) {
  const out = {};
  for (const r of extraRes(t)) { const v = Number(n?.extra?.[r.id]) || 0; if (v > 0) out[resPath(t, r)] = (out[resPath(t, r)] ?? 0) + v; }
  return out;
}
export const extraName = (t, path) => extraRes(t).find(r => resPath(t, r) === path)?.name ?? loc("ARVORE.Regras.recurso");
export function addExtras(upd, a, ex, sign = 1, pct = 1) {
  for (const [p, v0] of Object.entries(ex ?? {})) {
    const v = sign > 0 ? Math.floor((Number(v0) || 0) * pct) : (Number(v0) || 0);
    if (!v) continue;
    upd[p] = Math.max(0, (Number(upd[p] ?? getProp(a, p)) || 0) + sign * v);
  }
  return upd;
}
export const sumExtras = (...list) => { const o = {}; for (const ex of list) for (const [p, v] of Object.entries(ex ?? {})) o[p] = (o[p] ?? 0) + (Number(v) || 0); return o; };
// rótulos dos campos de custo (o mestre renomeia no Personalizado)
export const LABEL_DEFAULTS = () => ({ cost: loc("ARVORE.Regras.custo"), ranks: loc("ARVORE.Regras.niveis"), rankStep: loc("ARVORE.Regras.custoExtraACadaNivelComprado"), extras: loc("ARVORE.Regras.custosExtras"), gp: loc("ARVORE.Comum.pecasDeOuro"), pp: loc("ARVORE.Comum.pecasDePlatina"), consume: loc("ARVORE.Regras.consomeItens") });
export const labelsOf = t => ({ ...LABEL_DEFAULTS(), ...(t?.rules === "custom" ? Object.fromEntries(Object.entries(t.labels ?? {}).filter(([, v]) => String(v ?? "").trim())) : {}) });
export const coinsOn = t => t?.rules !== "custom" || t.useCoins !== false;
export const FILTERS = [
  { value: "", label: "ARVORE.Regras.mostrarTodas" }, { value: "available", label: "ARVORE.Regras.disponiveis" }, { value: "unlocked", label: "ARVORE.Regras.desbloqueadas" },
  { value: "locked", label: "ARVORE.Regras.bloqueadas" }, { value: "attack", label: "ARVORE.Regras.ataques" }, { value: "transform", label: "ARVORE.Regras.transformacoes" },
  { value: "training", label: "ARVORE.Comum.emTreino" }
];
// cores de desenho suaves (cansam menos a vista)
export const DRAW_COLORS = ["#d1b46e", "#f2efe8", "#cf7f78", "#d6a066", "#7fb48a", "#76abc4", "#7f95cf", "#a58bc8", "#c98aa8", "#8c7458", "#9aa0a6", "#2a2a2e"];
export const INCAP = ["incapacitated", "unconscious", "paralyzed", "petrified", "stunned"];
export const opts = (list, cur) => list.map(o => `<option value="${esc(o.value)}" ${String(cur ?? "") === String(o.value) ? "selected" : ""}>${esc(o.label)}</option>`).join("");

// ───────────────────────── modelos de dados ─────────────────────────
export const featureDefaults = () => ({
  name: "", img: "", desc: "", kind: "utility", activation: "action", uses: 0, recovery: "lr",
  durValue: "", durUnits: "minute", range: "", rangeUnits: "ft",
  attackType: "melee", classification: "weapon", ability: "", toHit: "",
  formula: "", damageType: "", saveAbility: "con", saveDC: "", onSave: "half", changes: [],
  transform: false, autoApply: true, tokenImg: "", tokenSize: 0, endIncap: true, healType: "healing", targets: 1, note: "",
  chargeMax: 0, chargeHit: 1, chargeCrit: 0, chargeDamaged: 0,
  fxLight: "", fxRadius: 6, fxSound: "", fxArt: ""
});
export const nodeDefaults = () => ({
  name: loc("ARVORE.Regras.novaHabilidade"), img: "icons/svg/book.svg", desc: "", rankDescs: [], x: 0, y: 0,
  cost: 1, costGp: 0, costPp: 0, consume: [], minLevel: 0, prereq: "all", group: "", color: "#c9a227",
  items: [], changes: [], features: [],
  shape: "circle", size: 1, ranks: 1, rankStep: 0, secret: false, replaces: false, synergy: false, trainDays: 0,
  reqAbility: "", reqScore: 0, reqClasses: [], reqRace: "", reqItems: [], reqNodes: [], milestone: "", reqDate: null, shared: "",
  extra: {}
});
export const treeDefaults = () => ({
  name: loc("ARVORE.Regras.novaSkillTree"), desc: "", visible: true, assigned: [], mode: "skill", rules: "dnd",
  refundPlayer: true, refundPct: 100, approval: false, linkStyle: "curve", snap: 10,
  bg: "", bgOpacity: 0.35, sound: "",
  resPath: "system.details.xp.value", resLabel: "XP", costInc: 0,
  // Personalizado: recursos do mestre (o 1º é o principal) e nomes dos campos de custo
  resources: [], labels: {}, useCoins: true,
  // Grandes Feitos desta árvore e bloqueio da árvore inteira (até um Grande Feito ou um item)
  feats: [], lockKind: "", lockFeat: "", lockItem: "", lockHide: false, lockLevel: 0, lockClass: "", lockClassLevel: 0, lockDate: null,
  nodes: [], edges: [], drawings: []
});
export const featDefaults = () => ({ name: loc("ARVORE.Comum.novoGrandeFeito"), pts: 1, desc: "" });
export const newTree = (name = loc("ARVORE.Regras.novaSkillTree")) => ({ ...treeDefaults(), id: uid(), name });
export const newNode = (x, y, extra = {}) => ({ ...nodeDefaults(), id: uid(), x, y, ...extra });

export const playerCharacters = () => game.actors.filter(a => a.type === "character" || a.hasPlayerOwner)
  .sort((x, y) => x.name.localeCompare(y.name));
export const ownersOf = a => game.users.filter(u => !u.isGM && a.testUserPermission(u, "OWNER"));
export const gmIds = () => game.users.filter(u => u.isGM).map(u => u.id);
export const catOf = t => t?.section || "fantasy";
export const canSee = (t, actorId) => Array.isArray(t.assigned) ? t.assigned.includes(actorId) : !!t.visible;
// o jogador vê a árvore? (atribuída e, se o mestre escolheu esconder, já liberada)
export const playerSees = (t, a) => !!a && canSee(t, a.id) && !(t.lockHide && treeLock(a, t));

export function normalizeNode(n) {
  const nn = { ...nodeDefaults(), ...n };
  for (const k of ["items", "changes", "features", "consume", "reqClasses", "reqItems", "rankDescs", "reqNodes"]) nn[k] = Array.isArray(nn[k]) ? nn[k] : [];
  // migração antiga: poções e digestão saíram do módulo
  // e os modelos prontos antigos (presetKey) também
  for (const k of ["seq", "digestReq", "potionDC", "sanLoss", "ingredients", "presetKey"]) delete nn[k];
  nn.extra = nn.extra && typeof nn.extra === "object" && !Array.isArray(nn.extra) ? Object.fromEntries(Object.entries(nn.extra).map(([k, v]) => [k, Math.max(0, Number(v) || 0)])) : {};
  // versão antiga: uma única habilidade na ficha
  if (n.feature) { if (n.feature.enabled && !nn.features.length) nn.features = [n.feature]; delete nn.feature; }
  nn.changes = fixChanges(nn.changes);
  nn.features = nn.features.map(f => { const ff = { ...featureDefaults(), ...f }; ff.changes = fixChanges(ff.changes); ff.byRank ??= {}; delete ff.enabled; return ff; });
  nn.size = Number(nn.size) || 1;
  nn.reqDate = nn.reqDate === null || nn.reqDate === "" || !Number.isFinite(Number(nn.reqDate)) ? null : Math.trunc(Number(nn.reqDate));
  nn.x = Number(nn.x) || 0; nn.y = Number(nn.y) || 0;
  if (!nn.reqClasses.length && nn.reqClass) nn.reqClasses = String(nn.reqClass).split(",").map(x => x.trim()).filter(Boolean)
    .map(o => { const [nm, lv] = o.split(":").map(x => x.trim()); return { id: nm.toLowerCase(), name: nm, level: Number(lv) || 0 }; });
  if (!nn.reqItems.length && nn.reqItem) nn.reqItems = String(nn.reqItem).split(",").map(x => x.trim()).filter(Boolean)
    .map(nm => ({ uuid: "", name: nm, img: "icons/svg/item-bag.svg" }));
  delete nn.reqClass; delete nn.reqItem;
  return nn;
}
export function normalizeTree(t) {
  const legacyAssigned = !Array.isArray(t.assigned);
  const hadRules = t.rules === "dnd" || t.rules === "custom";
  // 1.3.1: "Peças de Ouro" virou "Ouro", que também aceita Platina (mesma escala em PO)
  if (t.resPath === "system.currency.gp") t.resPath = COINS;
  Object.assign(t, { ...treeDefaults(), ...t });
  // migração antiga: árvores do antigo modo Sequências (poções e digestão) viram árvores de pontos comuns
  if (t.mode === "sequence") {
    if (!t.section) t.section = "sequences";
    t.mode = "skill"; t.rules = "custom";
    if (!t.resources?.length) { t.resPath = "@tree"; t.resLabel = loc("ARVORE.Comum.pontos"); }
  }
  t.mode = "skill";
  for (const k of ["sanPath", "ctrlKey", "monsterAt", "sanStart", "corruptAt", "corruptTint", "acting", "preset"]) delete t[k];
  // árvores antigas com campo próprio da ficha passam a ser do tipo Personalizado
  if (!hadRules) t.rules = !presetOf(t.resPath) ? "custom" : "dnd";
  if (t.rules === "dnd") { if (!presetOf(t.resPath)) t.resPath = "@skill"; t.resources = []; t.labels = {}; t.useCoins = true; }
  else {
    t.resources = (Array.isArray(t.resources) ? t.resources : []).filter(r => r && typeof r === "object")
      .map(r => ({ id: String(r.id || uid()), name: String(r.name ?? "").trim() || loc("ARVORE.Comum.pontos"), kind: RES_KINDS.includes(r.kind) ? r.kind : "counter", path: String(r.path ?? "").trim() }));
    // primeiro recurso = o que já era usado pela árvore
    if (!t.resources.length) t.resources = [resFromPath(t.resPath, t.resLabel)];
    syncPrimary(t);
    t.labels = { ...(t.labels && typeof t.labels === "object" ? t.labels : {}) };
    t.useCoins = t.useCoins !== false;
  }
  const pre = presetOf(t.resPath);
  if (pre && t.rules === "dnd") t.resLabel = pre.label;
  if (legacyAssigned) t.assigned = t.visible ? playerCharacters().filter(a => a.hasPlayerOwner).map(a => a.id) : [];
  if (t.sound === "sounds/notify.wav") t.sound = "";
  t.feats = (Array.isArray(t.feats) ? t.feats : []).filter(f => f && typeof f === "object")
    .map(f => ({ ...featDefaults(), ...f, id: String(f.id || uid()), name: String(f.name ?? "").trim() || loc("ARVORE.Comum.grandeFeito"), pts: Math.max(0, Number(f.pts) || 0) }));
  if (!["", "feat", "item", "level", "class", "date"].includes(t.lockKind)) t.lockKind = "";
  t.lockLevel = Math.max(0, Number(t.lockLevel) || 0); t.lockClassLevel = Math.max(0, Number(t.lockClassLevel) || 0);
  t.lockDate = Number.isFinite(Number(t.lockDate)) && t.lockDate !== null && t.lockDate !== "" ? Math.trunc(Number(t.lockDate)) : null;
  t.nodes = t.nodes.map(normalizeNode);
  return t;
}
// ── armazenamento (configurações do mundo) ──
export const getData = (k, d) => { try { return game.settings.get(MOD, k) ?? d; } catch { return d; } };
export const setData = (k, v) => game.settings.set(MOD, k, v);
export const loadTrees = () => clone(getData("trees", { list: [] })?.list ?? []).map(normalizeTree);
export const saveTrees = list => setData("trees", { list: clone(list) });
export const loadTemplates = () => clone(getData("templates", { list: [] })?.list ?? []);
export const saveTemplates = list => setData("templates", { list: clone(list) });
// cópia em cache só para leitura (fichas, automações) — refeita quando as árvores mudam
export let TREES_CACHE = null;
export const getTrees = () => (TREES_CACHE ??= loadTrees());
export const invalidateTrees = () => { TREES_CACHE = null; };
export const rOf = n => R * (Number(n?.size) || 1);
export const parentsOf = (t, id) => t.edges.filter(e => e.to === id).map(e => e.from);
export const nodeById = (t, id) => t?.nodes.find(n => n.id === id);
export const featName = (n, f, i) => f.name?.trim() || (n.features.length > 1 && i > 0 ? `${n.name} ${i + 1}` : n.name);
export const treeSound = t => t.sound === "none" ? "" : (t.sound || CFG.defaultSound);

export function topoNodes(t) {
  const indeg = {};
  t.nodes.forEach(n => { indeg[n.id] = 0; });
  t.edges.forEach(e => { indeg[e.to] = (indeg[e.to] ?? 0) + 1; });
  const q = t.nodes.filter(n => !indeg[n.id]), out = [];
  while (q.length) {
    const n = q.shift(); out.push(n);
    for (const e of t.edges.filter(e => e.from === n.id)) if (--indeg[e.to] === 0) { const c = nodeById(t, e.to); if (c) q.push(c); }
  }
  return out;
}


// Campos da habilidade na ficha que podem mudar por nível
export const RANK_FIELDS = [
  { k: "desc", label: "ARVORE.Comum.descricao", kinds: ["utility", "attack", "save", "heal", "none"], area: true },
  { k: "uses", label: "ARVORE.Regras.usos", kinds: ["utility", "attack", "save", "heal", "none"] },
  { k: "durValue", label: "ARVORE.Comum.duracao", kinds: ["utility", "attack", "save", "heal"] },
  { k: "formula", label: "ARVORE.Regras.danoCura", kinds: ["attack", "save", "heal"] },
  { k: "toHit", label: "ARVORE.Comum.bonusDeAcerto", kinds: ["attack"] },
  { k: "saveDC", label: "CD", kinds: ["save"] },
  { k: "range", label: "ARVORE.Comum.alcance", kinds: ["utility", "attack", "save", "heal"] },
  { k: "tokenSize", label: "ARVORE.Regras.tamanhoDoToken", kinds: ["utility", "attack", "save"], transform: true }
];

// ───────────────────────── temas de cor ─────────────────────────
// cores de amostra: fundo, cartão, destaque
export const THEMES = [
  { id: "dourado", name: "ARVORE.Theme.dourado", sw: ["#16181d", "#20232a", "#c2a253"] },
  { id: "azul", name: "ARVORE.Theme.azul", sw: ["#14181f", "#1e242e", "#6f9ccf"] },
  { id: "roxo", name: "ARVORE.Theme.roxo", sw: ["#17161c", "#221f2a", "#9a86bf"] },
  { id: "esmeralda", name: "ARVORE.Theme.esmeralda", sw: ["#141917", "#1e2522", "#6aaa88"] },
  { id: "carmesim", name: "ARVORE.Theme.carmesim", sw: ["#1a1617", "#251f20", "#c07a72"] },
  { id: "claro", name: "ARVORE.Theme.claro", sw: ["#efebe3", "#f8f6f1", "#94773a"] }
];
export function applyTheme(id) {
  const t = THEMES.some(x => x.id === id) ? id : "dourado";
  if (t === "dourado") delete document.documentElement.dataset.stTheme; else document.documentElement.dataset.stTheme = t;
}
