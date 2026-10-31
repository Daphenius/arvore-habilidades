import { L, isEnglish } from "./i18n.js?v=1.7.8";
import { actorOperation } from "./operations.js?v=1.7.8";
const INTERNAL = Symbol("skill-tree-operation");
// ═══════════════════════════════════════════════════════════════════════════
//  Árvore da Mesa — núcleo: dados, regras, ficha e automações
//  Módulo Foundry VTT V14, sistema dnd5e 6
// ═══════════════════════════════════════════════════════════════════════════

// Os dados dos personagens ficam em flags.{SCOPE} ("world") — o mesmo da macro antiga,
// para manter todo o progresso já existente.
export const MOD = "arvore-habilidades";
export const VERSION = "1.7.8"; // tem que bater com o module.json
// Registro compartilhado entre os arquivos (janela aberta, área de transferência…)
export const ST = { app: null, open: null, openApp: null, session: null, catalog: null, clipboard: null, synBusy: false, tidy: false };

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
  for (const k of CFG_KEYS) { try { const v = game.settings.get(MOD, k); if (v !== undefined && v !== null) c[k] = v; } catch { } }
  CFG = c;
}
export async function saveCfg(cfg) {
  for (const k of CFG_KEYS) if (k in cfg && cfg[k] !== CFG[k]) await game.settings.set(MOD, k, cfg[k]);
  reloadCfg();
}

// ───────────────────────── listas de opções ─────────────────────────
export let CHANGE_TYPES = [];
export const computeChangeTypes = () => Object.entries(CONFIG.ActiveEffect.changeTypes ?? {})
  .map(([k, v]) => ({ value: k, label: game.i18n.localize(v?.label ?? k) }));
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
  "system.attributes.ac.bonus": L("Bônus na CA"), "system.attributes.hp.bonuses.overall": L("PV extras (total)"),
  "system.attributes.hp.bonuses.level": L("PV extras por nível"), "system.attributes.hp.tempmax": L("PV máximos temporários"),
  "system.attributes.movement.speeds.walk": L("Deslocamento"), "system.attributes.movement.speeds.fly": L("Voo"),
  "system.attributes.movement.speeds.swim": L("Natação"), "system.attributes.movement.hover": L("Pairar"),
  "system.attributes.senses.ranges.darkvision": L("Visão no escuro"), "system.attributes.init.bonus": L("Iniciativa"),
  "system.bonuses.mwak.attack": L("Acerto corpo a corpo (arma)"), "system.bonuses.mwak.damage": L("Dano corpo a corpo (arma)"),
  "system.bonuses.rwak.attack": L("Acerto à distância (arma)"), "system.bonuses.rwak.damage": L("Dano à distância (arma)"),
  "system.bonuses.msak.attack": L("Acerto de magia corpo a corpo"), "system.bonuses.rsak.attack": L("Acerto de magia à distância"),
  "system.bonuses.spell.dc": L("CD de magia"), "system.bonuses.abilities.save": L("Todos os testes de resistência"),
  "system.bonuses.abilities.check": L("Todos os testes de atributo"), "system.bonuses.abilities.skill": L("Todas as perícias"),
  "system.traits.size": L("Tamanho"), "system.traits.dr.value": L("Resistência a dano"), "system.traits.di.value": L("Imunidade a dano"),
  "system.traits.ci.value": L("Imunidade a condição"), "system.traits.languages.value": L("Idiomas")
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
  if (!CHANGE_TYPES.some(c => canonType(c.value) === "add")) console.warn(L("Árvore da Mesa | não encontrei o tipo 'Adicionar' entre"), CHANGE_TYPES);
}
export const FEAT_KINDS = [
  { value: "utility", label: L("Habilidade / Transformação") },
  { value: "attack", label: L("Ataque (rolagem de acerto)") },
  { value: "save", label: L("Teste de resistência (CD)") },
  { value: "heal", label: L("Cura / PV temporários") },
  { value: "none", label: L("Só passiva (sem botão de uso)") }
];
export const ACTIVATIONS = [
  { value: "action", label: L("Ação") }, { value: "bonus", label: L("Ação Bônus") }, { value: "reaction", label: L("Reação") },
  { value: "minute", label: "1 minuto" }, { value: "special", label: L("Especial") }, { value: "", label: L("Nenhuma") }
];
export const RECOVERY = [
  { value: "lr", label: L("Descanso Longo") }, { value: "sr", label: L("Descanso Curto") },
  { value: "day", label: L("Por dia") }, { value: "", label: L("Não recupera") }
];
export const DUR_UNITS = [
  { value: "round", label: "rodadas" }, { value: "minute", label: "minutos" }, { value: "hour", label: "horas" }, { value: "day", label: "dias" }
];
export const DUR_SECONDS = { round: 6, minute: 60, hour: 3600, day: 86400 };
export const SHAPES = [
  { value: "circle", label: L("Círculo") }, { value: "hex", label: L("Hexágono") },
  { value: "diamond", label: L("Losango") }, { value: "square", label: L("Quadrado") }
];
export const SIZES = [{ value: "1", label: "Normal" }, { value: "1.4", label: L("Grande") }, { value: "1.8", label: L("Enorme") }];
// Recursos prontos: o nome dos pontos acompanha a escolha. Só o "Personalizado" tem nome definido pelo mestre.
export const COINS = "@coins";
export const resPresets = () => [
  { value: "@skill", label: L("Pontos de Habilidade"), name: L`Pontos de Habilidade (${CFG.ptsPerLevel} por nível, automático)` },
  { value: "system.details.xp.value", label: "XP", name: L("XP do personagem") },
  { value: COINS, label: L("Ouro"), name: L("Ouro (aceita Platina: 1 PL = 10 PO)") },
  { value: "@custom", label: "", name: L("Personalizado…") }
];
export const presetOf = path => resPresets().find(p => p.value === path && p.value !== "@custom") ?? null;

// ── Personalizado: recursos do mestre ──
// kind: counter (contador próprio da árvore) · field (campo da ficha) · skill · xp · coins
export const RES_KINDS = ["counter", "field", "skill", "xp", "coins"];
const KIND_PATH = { skill: "@skill", xp: "system.details.xp.value", coins: COINS };
export function resFromPath(path, label) {
  const kind = path === "@skill" ? "skill" : path === "system.details.xp.value" ? "xp" : path === COINS ? "coins" : (!path || path === "@tree") ? "counter" : "field";
  return { id: uid(), name: String(label || "").trim() || presetOf(path)?.label || L("Pontos"), kind, path: kind === "field" ? path : "" };
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
export const extraName = (t, path) => extraRes(t).find(r => resPath(t, r) === path)?.name ?? "recurso";
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
export const LABEL_DEFAULTS = () => ({ cost: L("Custo"), ranks: L("Níveis"), rankStep: L("Custo extra a cada nível comprado"), extras: L("Custos extras"), gp: L("Peças de Ouro"), pp: L("Peças de Platina"), consume: L("Consome itens") });
export const labelsOf = t => ({ ...LABEL_DEFAULTS(), ...(t?.rules === "custom" ? Object.fromEntries(Object.entries(t.labels ?? {}).filter(([, v]) => String(v ?? "").trim())) : {}) });
export const coinsOn = t => t?.rules !== "custom" || t.useCoins !== false;
export const FILTERS = [
  { value: "", label: L("Mostrar todas") }, { value: "available", label: L("Disponíveis") }, { value: "unlocked", label: L("Desbloqueadas") },
  { value: "locked", label: L("Bloqueadas") }, { value: "attack", label: L("Ataques") }, { value: "transform", label: L("Transformações") },
  { value: "training", label: L("Em treino") }
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
  name: L("Nova habilidade"), img: "icons/svg/book.svg", desc: "", rankDescs: [], x: 0, y: 0,
  cost: 1, costGp: 0, costPp: 0, consume: [], minLevel: 0, prereq: "all", group: "", color: "#c9a227",
  items: [], changes: [], features: [],
  shape: "circle", size: 1, ranks: 1, rankStep: 0, secret: false, replaces: false, synergy: false, trainDays: 0,
  reqAbility: "", reqScore: 0, reqClasses: [], reqRace: "", reqItems: [], reqNodes: [], milestone: "", reqDate: null, shared: "",
  extra: {}
});
export const treeDefaults = () => ({
  name: L("Nova Skill Tree"), desc: "", visible: true, assigned: [], mode: "skill", rules: "dnd",
  refundPlayer: true, refundPct: 100, approval: false, linkStyle: "curve", snap: 10,
  bg: "", bgOpacity: 0.35, sound: "",
  resPath: "system.details.xp.value", resLabel: "XP", costInc: 0,
  // Personalizado: recursos do mestre (o 1º é o principal) e nomes dos campos de custo
  resources: [], labels: {}, useCoins: true,
  // Grandes Feitos desta árvore e bloqueio da árvore inteira (até um Grande Feito ou um item)
  feats: [], lockKind: "", lockFeat: "", lockItem: "", lockHide: false, lockLevel: 0, lockClass: "", lockClassLevel: 0, lockDate: null,
  nodes: [], edges: [], drawings: []
});
export const featDefaults = () => ({ name: L("Novo Grande Feito"), pts: 1, desc: "" });
export const newTree = (name = L("Nova Skill Tree")) => ({ ...treeDefaults(), id: uid(), name });
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
  // 1.7.8: poções e digestão saíram do módulo
  for (const k of ["seq", "digestReq", "potionDC", "sanLoss", "ingredients"]) delete nn[k];
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
  // 1.7.8: árvores do antigo modo Sequências (poções e digestão) viram árvores de pontos comuns
  if (t.mode === "sequence") {
    if (!t.section) t.section = "sequences";
    t.mode = "skill"; t.rules = "custom";
    if (!t.resources?.length) { t.resPath = "@tree"; t.resLabel = L("Pontos"); }
  }
  t.mode = "skill";
  for (const k of ["sanPath", "ctrlKey", "monsterAt", "sanStart", "corruptAt", "corruptTint", "acting"]) delete t[k];
  // árvores antigas com campo próprio da ficha passam a ser do tipo Personalizado
  if (!hadRules) t.rules = !presetOf(t.resPath) ? "custom" : "dnd";
  if (t.rules === "dnd") { if (!presetOf(t.resPath)) t.resPath = "@skill"; t.resources = []; t.labels = {}; t.useCoins = true; }
  else {
    t.resources = (Array.isArray(t.resources) ? t.resources : []).filter(r => r && typeof r === "object")
      .map(r => ({ id: String(r.id || uid()), name: String(r.name ?? "").trim() || L("Pontos"), kind: RES_KINDS.includes(r.kind) ? r.kind : "counter", path: String(r.path ?? "").trim() }));
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
    .map(f => ({ ...featDefaults(), ...f, id: String(f.id || uid()), name: String(f.name ?? "").trim() || L("Grande Feito"), pts: Math.max(0, Number(f.pts) || 0) }));
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

// ───────────────────────── leitura do ator ─────────────────────────
export const actorLevel = a => Number(a?.system?.details?.level ?? a?.system?.details?.cr ?? 0) || 0;
export const unlockedOf = (a, t) => [...(getProp(a, K_UNLOCK(t.id)) ?? [])];
export const ranksOf = (a, t) => clone(getProp(a, K_RANKS(t.id)) ?? []);
export const logOf = a => clone(getProp(a, K_LOG) ?? []);
export const reqsOf = a => clone(getProp(a, K_REQ) ?? []);
export const trainingOf = a => clone(getProp(a, K_TRAIN) ?? []);
export const milestonesOf = a => [...(getProp(a, K_MILES) ?? [])];
export function rankEntry(a, t, n, un = unlockedOf(a, t)) {
  const e = ranksOf(a, t).find(r => r.id === n.id);
  if (e) { e.paidX ??= []; return e; }
  return un.includes(n.id) ? { id: n.id, r: 1, paid: [Number(n.cost) || 0], paidX: [] } : { id: n.id, r: 0, paid: [], paidX: [] };
}
export const rankOf = (a, t, n, un) => rankEntry(a, t, n, un).r;
export const totalRanks = (a, t) => {
  const un = unlockedOf(a, t);
  return t.nodes.reduce((s, n) => s + rankOf(a, t, n, un), 0);
};

// Pontos
export const isSkill = t => t.resPath === "@skill";
export const skillEarned = a => CFG.ptsPerLevel * Math.min(actorLevel(a), CFG.maxLevel);
export const skillAvail = a => skillEarned(a) + (Number(getProp(a, SKILL_BONUS)) || 0) - (Number(getProp(a, SKILL_SPENT)) || 0);
export const resPathOf = t => isSkill(t) ? SKILL_SPENT : (t.resPath === "@tree" ? `flags.${SCOPE}.skillPoints.${t.id}` : t.resPath);
export const isCoins = t => t?.resPath === COINS;
export const coinWorth = a => coin(a, "gp") + coin(a, "pp") * 10;
export const resOf = (a, t) => isSkill(t) ? skillAvail(a) : isCoins(t) ? coinWorth(a) : (Number(getProp(a, resPathOf(t))) || 0);
export const resUpdate = (a, t, delta, manual = false) => {
  if (isCoins(t)) return coinsDelta({}, a, delta);
  if (!isSkill(t)) return { [resPathOf(t)]: Math.max(0, resOf(a, t) + delta) };
  if (manual) return { [SKILL_BONUS]: (Number(getProp(a, SKILL_BONUS)) || 0) + delta };
  return { [SKILL_SPENT]: Math.max(0, (Number(getProp(a, SKILL_SPENT)) || 0) - delta) };
};
// Pontos Míticos: ganhos por Grandes Feitos, usados nas habilidades marcadas como "míticas"
export const isMythic = n => n?.costRes === "mythic";
export const mythicOf = a => Number(getProp(a, K_MYTH)) || 0;
export const featsOf = a => clone(getProp(a, K_FEATS) ?? []);
// Grandes Feitos definidos nas árvores
export const findFeat = (id, trees = getTrees()) => {
  for (const t of trees) { const f = (t.feats ?? []).find(x => x.id === id); if (f) return { tree: t, feat: f }; }
  return null;
};
// histórico: feitos ligados a uma árvore nunca são descartados (eles liberam árvores); avulsos guardam os 50 últimos
export const trimFeats = list => { const loose = new Set(list.filter(f => !f.feat).slice(-50)); return list.filter(f => f.feat || loose.has(f)); };
export const hasFeat = (a, id) => !!id && featsOf(a).some(f => f.feat === id);
// ── habilidades compartilhadas: cópias ligadas em várias árvores ──
// Campos que NÃO são copiados entre as cópias (posição, id e o que depende da árvore)
export const SHARED_SKIP = ["id", "x", "y", "shared", "reqNodes", "group", "presetKey"];
export const sharedCopies = (trees, sid, exceptId = null) => !sid ? [] : trees.flatMap(t => t.nodes.filter(n => n.shared === sid && n.id !== exceptId).map(n => ({ t, n })));
// copia o conteúdo de "src" para todas as outras cópias; devolve quantas mudaram
export function syncShared(trees, src) {
  if (!src?.shared) return 0;
  let k = 0;
  for (const { n } of sharedCopies(trees, src.shared, src.id)) {
    for (const key of Object.keys(src)) if (!SHARED_SKIP.includes(key)) n[key] = clone(src[key]);
    for (const key of Object.keys(n)) if (!SHARED_SKIP.includes(key) && !(key in src)) delete n[key];
    k++;
  }
  return k;
}

// ── datas: Calendário da Mesa quando ativo, senão o tempo nativo do Foundry ──
export const calApi = () => { const m = game.modules?.get?.("calendario-mesa"); return m?.active ? m.api ?? null : null; };
const secPerDay = () => {
  const c = game.time?.calendar?.days;
  const v = c ? (Number(c.hoursPerDay) || 24) * (Number(c.minutesPerHour) || 60) * (Number(c.secondsPerMinute) || 60) : 86400;
  return v > 0 ? v : 86400;
};
// dia do mundo (inteiro)
export function today() {
  const api = calApi();
  try { const d = api?.datas?.hoje?.(); if (Number.isFinite(d)) return d; } catch { }
  return Math.floor((Number(game.time?.worldTime) || 0) / secPerDay());
}
export function dateText(td) {
  if (td === null || td === undefined) return "";
  try { const x = calApi()?.textoDia?.(td); if (x) return x; } catch { }
  const diff = td - today();
  if (isEnglish()) return diff === 0 ? "today" : diff > 0 ? `in ${diff} day(s)` : `${-diff} day(s) ago`;
  return diff === 0 ? "hoje" : diff > 0 ? `daqui a ${diff} dia(s)` : `há ${-diff} dia(s)`;
}

// Árvore bloqueada para este personagem? Devolve o motivo (texto) ou null.
export function treeLock(a, t, trees = getTrees()) {
  if (!t?.lockKind) return null;
  if (t.lockKind === "level") {
    if (!t.lockLevel) return null;
    return a && actorLevel(a) >= t.lockLevel ? null : L`Nível ${t.lockLevel}`;
  }
  if (t.lockKind === "class") {
    const name = String(t.lockClass ?? "").trim(); if (!name) return null;
    const rc = { id: name.toLowerCase(), name, level: t.lockClassLevel };
    return a && hasClass(a, rc) ? null : L`Classe: ${name}${t.lockClassLevel ? ` ${t.lockClassLevel}+` : ""}`;
  }
  if (t.lockKind === "date") {
    if (t.lockDate === null) return null;
    return today() >= t.lockDate ? null : L`Data: ${dateText(t.lockDate)}`;
  }
  if (t.lockKind === "feat") {
    if (!t.lockFeat) return null;
    const ref = findFeat(t.lockFeat, trees);
    if (a && hasFeat(a, t.lockFeat)) return null;
    return L`Grande Feito: ${ref ? ref.feat.name : L("(excluído)")}`;
  }
  const name = String(t.lockItem ?? "").trim();
  if (!name) return null;
  if (a && countItem(a, { name }) > 0) return null;
  return `Item: ${name}`;
}
// árvores que um Grande Feito libera
export const treesOpenedBy = (featId, trees = getTrees()) => trees.filter(t => t.lockKind === "feat" && t.lockFeat === featId);
export const treeHasMythic = t => !!t?.nodes?.some(isMythic);
export const payLabel = (t, n) => isMythic(n) ? L("Pontos Míticos") : t.resLabel;
export const payOf = (a, t, n) => isMythic(n) ? mythicOf(a) : resOf(a, t);
// soma `delta` no recurso certo (negativo = gastar) dentro de `upd`
export function addPay(upd, a, t, n, delta, myth = isMythic(n)) {
  if (!delta) return upd;
  if (myth) upd[K_MYTH] = Math.max(0, (upd[K_MYTH] ?? mythicOf(a)) + delta);
  else addRes(upd, a, t, delta);
  return upd;
}
// soma `delta` no recurso da árvore dentro de `upd`, sem desfazer moedas já alteradas nele
export function addRes(upd, a, t, delta) {
  if (!delta) return upd;
  if (isCoins(t)) return coinsDelta(upd, a, delta);
  return Object.assign(upd, resUpdate(a, t, delta));
}
// De onde saiu um pagamento — guardado junto dele para devolver mesmo se a árvore for excluída ou mudar de recurso
export const resDesc = t => isSkill(t) ? { k: "skill" } : isCoins(t) ? { k: "coins" } : { k: "path", p: resPathOf(t), label: t.resLabel };
export function addResDesc(upd, a, d, delta) {
  if (!delta || !d) return upd;
  if (d.k === "skill") { upd[SKILL_SPENT] = Math.max(0, (Number(upd[SKILL_SPENT] ?? getProp(a, SKILL_SPENT)) || 0) - delta); return upd; }
  if (d.k === "coins") return coinsDelta(upd, a, delta);
  if (!d.p) return upd;
  upd[d.p] = Math.max(0, (Number(upd[d.p] ?? getProp(a, d.p)) || 0) + delta);
  return upd;
}
// devolve um pagamento: Míticos, o recurso registrado nele ou (registros antigos) o recurso atual da árvore
export function payBack(upd, a, t, n, v, x = {}) {
  if (!v) return upd;
  if (x.myth ?? isMythic(n)) { upd[K_MYTH] = Math.max(0, (upd[K_MYTH] ?? mythicOf(a)) + v); return upd; }
  if (x.res) return addResDesc(upd, a, x.res, v);
  return addRes(upd, a, t, v);
}
// índice do pagamento que um reembolso comum devolve: o último que não é temporário
export const refundIndex = e => { const px = e.paidX ?? []; for (let i = (e.paid ?? []).length - 1; i >= 0; i--) if (!px[i]?.temp) return i; return (e.paid ?? []).length - 1; };

// Moedas em PO: recebe em ouro; gasta ouro primeiro e, se faltar, troca platina e devolve o troco em ouro.
const GP = "system.currency.gp", PP = "system.currency.pp";
export function coinsDelta(upd, a, delta) {
  let gp = Number(upd[GP] ?? coin(a, "gp")) || 0, pp = Number(upd[PP] ?? coin(a, "pp")) || 0;
  if (delta >= 0) gp += delta;
  else {
    let need = -delta;
    if (gp >= need) gp -= need;
    else {
      need -= gp;
      const broken = Math.min(pp, Math.ceil(need / 10));
      pp -= broken; gp = Math.max(0, broken * 10 - need);
    }
  }
  upd[GP] = gp; upd[PP] = pp;
  return upd;
}
// custos extras em moedas (PO/PL da habilidade). Ouro que faltar é pago com platina.
export function addCoins(upd, a, gp = 0, pp = 0) {
  if (gp) coinsDelta(upd, a, gp);
  if (pp) upd[PP] = Math.max(0, (Number(upd[PP] ?? coin(a, "pp")) || 0) + pp);
  return upd;
}
export const effCost = (a, t, n, rank) => (Number(n.cost) || 0) + (Number(n.rankStep) || 0) * rank + (isMythic(n) ? 0 : (Number(t.costInc) || 0) * (a ? totalRanks(a, t) : 0));
export const coin = (a, k) => Number(a?.system?.currency?.[k]) || 0;

// Itens da ficha por nome (quantidade)
export const sameName = (i, nm) => i.name.toLowerCase() === String(nm ?? "").toLowerCase();
export const countItem = (a, it) => a.items.filter(i => sameName(i, it.name) || (it.uuid && i._stats?.compendiumSource === it.uuid))
  .reduce((s, i) => s + (Number(i.system?.quantity ?? 1) || 1), 0);
export async function consumeItems(a, list) {
  for (const it of list) {
    let need = Number(it.qty) || 1;
    for (const i of a.items.filter(x => sameName(x, it.name) || (it.uuid && x._stats?.compendiumSource === it.uuid))) {
      if (need <= 0) break;
      const q = Number(i.system?.quantity ?? 1) || 1, take = Math.min(q, need);
      need -= take;
      if (q - take <= 0) await a.deleteEmbeddedDocuments("Item", [i.id]); else await a.updateEmbeddedDocuments("Item", [{ _id: i.id, "system.quantity": q - take }]);
    }
  }
}

// Requisitos
export function hasClass(a, rc) {
  const nm = String(rc.name ?? "").toLowerCase(), id = String(rc.id ?? "").toLowerCase();
  const c = a.items.find(i => i.type === "class" && (i.system?.identifier === id || i.name.toLowerCase() === nm || i.name.toLowerCase() === id));
  return !!c && (!Number(rc.level) || (Number(c.system?.levels) || 0) >= Number(rc.level));
}
export function hasRace(a, race) {
  const r = String(race).toLowerCase();
  if (a.items.some(i => i.type === "race" && (i.name.toLowerCase() === r || i.system?.identifier === r))) return true;
  const d = a.system?.details?.race;
  return String(typeof d === "string" ? d : (d?.name ?? "")).toLowerCase() === r;
}
export function hasItem(a, it) {
  return a.items.some(i => sameName(i, it.name) || (it.uuid && i._stats?.compendiumSource === it.uuid));
}

// Lista de requisitos com ✔/✖ (a = null mostra só a lista). kind "cost" = pagamento extra.
export function reqChecklist(a, t, n, un = [], rank = 0) {
  const LIST = [];
  const add = (label, test, kind = "req") => LIST.push({ label, ok: a ? !!test() : null, kind });
  if (t.lockKind && treeLock(null, t)) add(L`🔒 Skill Tree liberada por ${treeLock(null, t)}`, () => !treeLock(a, t));
  if (rank === 0) {
    const parents = parentsOf(t, n.id);
    if (parents.length) {
      const names = parents.map(p => nodeById(t, p)?.name).filter(Boolean);
      add(n.prereq === "any" ? L`Ter uma destas: ${names.join(", ")}` : L`Ter: ${names.join(L(" e "))}`,
        () => n.prereq === "any" ? parents.some(p => un.includes(p)) : parents.every(p => un.includes(p)));
    }
    if (n.group) {
      const rival = a && t.nodes.find(o => o.id !== n.id && o.group === n.group && un.includes(o.id));
      add(rival ? L`Escolha exclusiva: já escolheu "${rival.name}"` : L`Escolha exclusiva "${n.group}" — só uma do grupo`, () => !rival);
    }
  }
  if (Number(n.minLevel)) add(L`Nível ${n.minLevel}+${a ? L` (atual ${actorLevel(a)})` : ""}`, () => actorLevel(a) >= Number(n.minLevel));
  if (n.reqAbility && Number(n.reqScore)) {
    const name = ABILITIES.find(x => x.value === n.reqAbility)?.label ?? n.reqAbility;
    const v = a ? Number(a.system?.abilities?.[n.reqAbility]?.value) || 0 : 0;
    add(`${name} ${n.reqScore}+${a ? L` (atual ${v})` : ""}`, () => v >= Number(n.reqScore));
  }
  const rcs = n.reqClasses.filter(c => c.id);
  if (rcs.length) add(L`Classe: ${rcs.map(c => `${c.name}${Number(c.level) ? L` nível ${c.level}+` : ""}`).join(L(" ou "))}`, () => rcs.some(c => hasClass(a, c)));
  if (n.reqRace) add(L`Raça: ${n.reqRace}`, () => hasRace(a, n.reqRace));
  for (const it of n.reqItems) add(L`Possuir: ${it.name}`, () => hasItem(a, it));
  for (const rn of n.reqNodes ?? []) {
    const allT = ST.app?.trees ?? getTrees();
    const rt = allT.find(x => x.id === rn.tree), rnode = nodeById(rt, rn.node);
    const minR = Math.max(1, Number(rn.rank) || 1);
    add(L`Combo: ter ${rnode?.name ?? rn.name ?? "?"}${minR > 1 ? L` nível ${minR}+` : ""} (${rt?.name ?? L("outra árvore")})`,
      () => rt && rnode && rankOf(a, rt, rnode) >= minR);
  }
  if (n.milestone) add(L`Marco: ${n.milestone}`, () => milestonesOf(a).includes(n.milestone));
  if (n.reqDate !== null && n.reqDate !== undefined) add(L`A partir de: ${dateText(n.reqDate)}`, () => today() >= n.reqDate);
  {
    if (coinsOn(t) && Number(n.costGp)) add(L`Custo: ${n.costGp} PO${a ? L` (você tem ${coinWorth(a)} em ouro e platina)` : ""}`, () => coinWorth(a) - (isCoins(t) ? effCost(a, t, n, rankOf(a, t, n)) : 0) >= Number(n.costGp), "cost");
    if (coinsOn(t) && Number(n.costPp)) add(L`Custo: ${n.costPp} PL${a ? L` (você tem ${coin(a, "pp")})` : ""}`, () => coin(a, "pp") >= Number(n.costPp), "cost");
    for (const [p, v] of Object.entries(nodeExtras(t, n))) add(L`Custo: ${v} ${extraName(t, p)}${a ? L` (você tem ${Number(getProp(a, p)) || 0})` : ""}`, () => (Number(getProp(a, p)) || 0) >= v, "cost");
    for (const it of n.consume) add(L`Consome: ${Number(it.qty) || 1}× ${it.name}${a ? L` (você tem ${countItem(a, it)})` : ""}`, () => countItem(a, it) >= (Number(it.qty) || 1), "cost");
  }
  return LIST;
}

export function nodeState(a, t, n) {
  const max = Math.max(1, Number(n.ranks) || 1);
  if (!a) return { key: "none", reasons: [], checks: reqChecklist(null, t, n), rank: 0, max, cost: Number(n.cost) || 0, canBuy: false };
  const un = unlockedOf(a, t);
  const rank = rankOf(a, t, n, un);
  const cost = effCost(a, t, n, rank);
  const tr = trainingOf(a).find(x => x.tree === t.id && x.node === n.id);
  if (tr) return { key: "training", reasons: [L`Em treino: falta(m) ${tr.left} descanso(s) longo(s)`], checks: [], rank, max, cost, canBuy: false, training: tr };
  if (rank >= max) return { key: "unlocked", reasons: [], checks: [], rank, max, cost, canBuy: false, maxed: true };
  const checks = reqChecklist(a, t, n, un, rank);
  const reasons = checks.filter(c => !c.ok && c.kind !== "cost").map(c => c.label);
  const costFail = checks.filter(c => !c.ok && c.kind === "cost").map(c => c.label);
  if (n.synergy) {
    return { key: rank > 0 ? "unlocked" : "locked", reasons: [L("Sinergia: libera sozinha quando os requisitos são cumpridos"), ...reasons], checks, rank, max, cost: 0, canBuy: false, synergy: true };
  }
  const res = payOf(a, t, n);
  const poorMain = res < cost;
  const poor = poorMain || costFail.length > 0;
  const canBuy = !reasons.length && !poor;
  const key = rank > 0 ? "unlocked" : reasons.length ? "locked" : poor ? "poor" : "available";
  if (poorMain) reasons.push(L`${payLabel(t, n)} insuficientes (${res}/${cost})`);
  reasons.push(...costFail);
  return { key, reasons, checks, rank, max, cost, canBuy, res, poor };
}

export function wouldCycle(t, from, to) {
  const stack = [to], seen = new Set();
  while (stack.length) {
    const cur = stack.pop();
    if (cur === from) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    t.edges.filter(e => e.from === cur).forEach(e => stack.push(e.to));
  }
  return false;
}

// Texto amigável de uma mudança de efeito: "Bônus na CA +2"
export function changeLabel(c) {
  const key = c.key ?? "";
  let name = KEY_LABELS[key];
  if (!name) {
    const m = key.match(/^system\.abilities\.(\w+)\.(value|bonuses\.save|bonuses\.check)$/);
    if (m) { const ab = ABILITIES.find(x => x.value === m[1])?.label ?? m[1]; name = m[2] === "value" ? ab : m[2] === "bonuses.save" ? L`TR de ${ab}` : L`Teste de ${ab}`; }
  }
  if (!name) { const m = key.match(/^system\.skills\.(\w+)\./); if (m) name = L`Perícia ${lbl(D5.skills?.[m[1]]) || m[1]}`; }
  name ??= key.replace(/^system\./, "");
  const ty = canonType(c.type), v = String(c.value ?? "").trim();
  let val = v;
  if (key === "system.traits.size") val = lbl(D5.actorSizes?.[v]) || v;
  if (ty === "add" || ty === "2") return `${name} ${/^[+-]/.test(v) ? "" : "+"}${val}`;
  if (ty === "subtract") return `${name} −${val}`;
  if (ty === "override" || ty === "5") return `${name} vira ${val}`;
  if (ty === "multiply" || ty === "1") return `${name} ×${val}`;
  if (ty === "upgrade" || ty === "4") return L`${name} no mínimo ${val}`;
  if (ty === "downgrade" || ty === "3") return L`${name} no máximo ${val}`;
  return `${name}: ${val}`;
}

// Classes e raças existentes no Foundry (itens do mundo + compêndios)
export async function loadCatalog() {
  const out = { class: new Map(), race: new Map() };
  const add = (type, name, identifier, img) => {
    const id = String(identifier || name).toLowerCase();
    if (!out[type].has(id)) out[type].set(id, { id, name, img });
  };
  for (const i of game.items) if (i.type in out) add(i.type, i.name, i.system?.identifier, i.img);
  for (const p of game.packs) {
    if (p.documentName !== "Item") continue;
    try {
      const idx = await p.getIndex({ fields: ["type", "system.identifier"] });
      for (const e of idx) if (e.type in out) add(e.type, e.name, e.system?.identifier, e.img);
    } catch (e) { /* compêndio sem acesso */ }
  }
  const sort = m => [...m.values()].sort((x, y) => x.name.localeCompare(y.name));
  return { classes: sort(out.class), races: sort(out.race) };
}

// ───────────────────────── geração de documentos ─────────────────────────
export function effectData(base, changes) {
  const eff = { ...base };
  const list = changes.filter(c => c.key);
  eff.system = { ...eff.system, changes: list.map(c => ({ key: migrateKey(c.key), type: systemType(c.type), value: String(c.value) })) };
  return eff;
}
export const descToHTML = s => String(s ?? "").split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");

// Descrição do nível: usa a do nível atual; se estiver vazia, a do nível anterior mais próximo
export function descForRank(n, rank) {
  for (let r = rank; r >= 2; r--) { const d = n.rankDescs?.[r - 2]; if (d && String(d).trim()) return d; }
  return n.desc;
}

// Campos da habilidade na ficha que podem mudar por nível
export const RANK_FIELDS = [
  { k: "desc", label: L("Descrição"), kinds: ["utility", "attack", "save", "heal", "none"], area: true },
  { k: "uses", label: L("Usos"), kinds: ["utility", "attack", "save", "heal", "none"] },
  { k: "durValue", label: L("Duração"), kinds: ["utility", "attack", "save", "heal"] },
  { k: "formula", label: L("Dano / Cura"), kinds: ["attack", "save", "heal"] },
  { k: "toHit", label: L("Bônus de acerto"), kinds: ["attack"] },
  { k: "saveDC", label: "CD", kinds: ["save"] },
  { k: "range", label: L("Alcance"), kinds: ["utility", "attack", "save", "heal"] },
  { k: "tokenSize", label: L("Tamanho do token"), kinds: ["utility", "attack", "save"], transform: true }
];
// valor do nível: o do nível atual; se vazio, o do nível anterior mais próximo; nível 1 = valor base
export const pickRank = (base, list, rank) => {
  for (let r = rank; r >= 2; r--) { const v = list?.[r - 2]; if (v !== undefined && v !== null && String(v).trim() !== "") return v; }
  return base;
};

export function withRank(n, rank) {
  const nn = clone(n);
  const sub = v => typeof v === "string" ? v.replace(/@rank/g, String(rank)) : v;
  const chg = c => ({ ...c, value: sub(pickRank(c.value, c.values, rank)) });
  nn.changes = nn.changes.map(chg);
  nn.features = nn.features.map(f => {
    const ff = { ...f, changes: f.changes.map(chg) };
    for (const { k } of RANK_FIELDS) ff[k] = pickRank(f[k], f.byRank?.[k], rank);
    for (const k of ["formula", "toHit", "desc", "saveDC", "durValue", "range"]) ff[k] = sub(ff[k]);
    if (typeof ff.uses === "string") ff.uses = Number(sub(ff.uses)) || 0;
    ff.tokenSize = Number(ff.tokenSize) || 0;
    return ff;
  });
  nn.desc = sub(descForRank(n, rank));
  return nn;
}

export function buildFeatureItem(n, f, fi, t, rank, max) {
  const rid = () => foundry.utils.randomID(16);
  const actId = rid(), effId = rid();
  const temp = f.changes.filter(c => c.key);
  const seconds = f.durValue ? (Number(f.durValue) || 0) * (DUR_SECONDS[f.durUnits] ?? 60) : 0;
  const name = featName(n, f, fi);
  const stFlags = {
    tree: t.id, node: n.id, fi, generated: true, name, kind: f.kind,
    transform: !!f.transform, autoApply: f.autoApply !== false, tokenImg: f.tokenImg || "",
    fxLight: f.fxLight || "", fxRadius: Number(f.fxRadius) || 6, fxSound: f.fxSound || "", fxArt: f.fxArt || "",
    charge: Number(f.chargeMax) > 0 ? { max: Number(f.chargeMax), hit: Number(f.chargeHit) || 0, crit: Number(f.chargeCrit) || 0, dmg: Number(f.chargeDamaged) || 0 } : null,
    tokenSize: Number(f.tokenSize) || 0, endIncap: f.endIncap !== false, seconds
  };
  const effects = temp.length ? [effectData({
    _id: effId, name, img: f.img || n.img || "icons/svg/aura.svg", transfer: false, disabled: false,
    description: L`Efeito ao usar ${name}.`, flags: { [SCOPE]: { skillTree: stFlags } }
  }, temp)] : [];
  const system = {
    description: { value: descToHTML([f.desc || (fi === 0 ? n.desc : ""), L`Em jogo:\n${featureRules(f)}`].filter(Boolean).join("\n\n")) },
    uses: Number(f.chargeMax) > 0 ? { max: String(f.chargeMax), spent: Number(f.chargeMax), recovery: [] }
      : f.uses ? { max: String(f.uses), spent: 0, recovery: f.recovery ? [{ period: f.recovery, type: "recoverAll" }] : [] }
      : { max: "", spent: 0, recovery: [] },
    activities: {}
  };
  if (f.kind !== "none") {
    const act = {
      _id: actId, type: f.kind,
      activation: { type: f.activation || "", value: ["action", "bonus", "reaction"].includes(f.activation) ? 1 : null, condition: "" },
      consumption: { targets: Number(f.chargeMax) > 0 ? [{ type: "itemUses", target: "", value: String(f.chargeMax) }] : f.uses ? [{ type: "itemUses", target: "", value: "1" }] : [], scaling: { allowed: false } },
      duration: f.durValue ? { value: String(f.durValue), units: f.durUnits, concentration: false } : { units: "inst" },
      range: f.range ? { value: String(f.range), units: f.rangeUnits || "ft" } : { units: f.kind === "utility" ? "self" : "" },
      target: { affects: (f.kind === "utility" || (f.kind === "heal" && f.range === "" && f.rangeUnits === "self")) ? { type: "self" } : { type: "creature", count: String(Number(f.targets) || 1) } },
      effects: temp.length ? [{ _id: effId }] : []
    };
    const parts = f.formula ? [{ custom: { enabled: true, formula: f.formula }, types: f.damageType ? [f.damageType] : [] }] : [];
    if (f.kind === "attack") {
      act.attack = { ability: f.ability || "", bonus: f.toHit || "", flat: false, type: { value: f.attackType, classification: f.classification } };
      act.damage = { includeBase: false, parts };
    } else if (f.kind === "heal") {
      act.healing = { custom: { enabled: true, formula: f.formula || "1d8" }, types: [f.healType || "healing"] };
    } else if (f.kind === "save") {
      act.save = { ability: [f.saveAbility || "con"], dc: { calculation: f.saveDC ? "" : "spellcasting", formula: f.saveDC || "" } };
      act.damage = { onSave: f.onSave || "half", parts };
    }
    system.activities[actId] = act;
  }
  return {
    name: max > 1 ? `${name} (${rank}/${max})` : name, type: "feat", img: f.img || n.img || "icons/svg/book.svg", system, effects,
    flags: { [SCOPE]: { skillTree: stFlags } }
  };
}

export function featureSummary(f) {
  if (!f) return "";
  const p = [];
  const act = ACTIVATIONS.find(x => x.value === f.activation)?.label;
  if (f.kind !== "none" && act && f.activation) p.push(act);
  if (f.kind === "none") p.push(L("Passiva"));
  if (Number(f.chargeMax) > 0) p.push(L`Carga ${f.chargeMax}`);
  else if (f.uses) p.push(`${f.uses}× ${f.recovery ? L("por ") + RECOVERY.find(x => x.value === f.recovery)?.label : L("(não recupera)")}`);
  if (f.durValue) p.push(`${f.durValue} ${DUR_UNITS.find(x => x.value === f.durUnits)?.label ?? f.durUnits}`);
  if (f.kind === "attack") p.push(L`Ataque ${f.attackType === "ranged" ? L("à distância") : L("corpo a corpo")}${f.toHit ? ` (+${f.toHit})` : ""}`);
  if (f.kind === "save") p.push(L`TR de ${ABILITIES.find(a => a.value === f.saveAbility)?.label ?? f.saveAbility}${f.saveDC ? ` CD ${f.saveDC}` : L(" (CD de magia)")}`);
  if (f.kind === "heal") p.push(f.healType === "temphp" ? L`${f.formula} PV temporários` : L`Cura ${f.formula}`);
  else if (f.formula) p.push(`${f.formula} ${DAMAGE_TYPES.find(d => d.value === f.damageType)?.label ?? ""}`.trim());
  if (f.transform) p.push(L("Transformação"));
  return p.join(" · ");
}

// Texto de regras sem ambiguidade, gerado a partir da habilidade
export const abLabel = k => ABILITIES.find(a => a.value === k)?.label ?? k;
export const unitLabel = u => ({ ft: L("pés"), m: "m", touch: "toque", self: "pessoal" })[u] ?? u;
export function dcText(f) {
  const m = String(f.saveDC ?? "").match(/@abilities\.(\w+)\.mod/);
  if (m) return L`CD 8 + proficiência + mod. de ${abLabel(m[1])}`;
  return f.saveDC ? `CD ${f.saveDC}` : L("CD de magia");
}
export function featureRules(f, extra = "") {
  const OUT = [];
  const act = f.kind === "none" ? L("Passiva") : (ACTIVATIONS.find(x => x.value === f.activation)?.label || L("Sem ação"));
  const usos = f.kind === "none" ? "" : f.uses ? L`${f.uses} uso(s) por ${RECOVERY.find(x => x.value === f.recovery)?.label ?? "descanso"}` : L("à vontade");
  const alc = f.range ? `alcance ${f.range} ${unitLabel(f.rangeUnits)}` : (f.rangeUnits === "touch" ? "toque" : "");
  const dur = f.durValue ? `dura ${f.durValue} ${DUR_UNITS.find(x => x.value === f.durUnits)?.label ?? ""}` : "";
  OUT.push([act, usos, alc, dur].filter(Boolean).join(" · ") + ".");
  const dano = (fm, tp) => L`${fm} de dano ${(DAMAGE_TYPES.find(d => d.value === tp)?.label ?? tp ?? "").toLowerCase()}`.trim();
  if (f.kind === "attack") OUT.push(L`Faça um ataque ${f.attackType === "ranged" ? L("à distância") : L("corpo a corpo")} ${f.classification === "spell" ? L("mágico") : f.classification === "unarmed" ? "desarmado" : L("com arma")}${f.ability ? ` usando ${f.ability === "spellcasting" ? L("o atributo de conjuração") : abLabel(f.ability)}` : ""}${f.toHit ? L` (+${f.toHit} no acerto)` : ""}. Se acertar: ${dano(f.formula, f.damageType)}.`);
  if (f.kind === "save") OUT.push(L`${Number(f.targets) > 1 ? L`Até ${f.targets} alvos fazem` : L("O alvo faz")} um TR de ${abLabel(f.saveAbility)} (${dcText(f)}). Falha: ${f.formula ? dano(f.formula, f.damageType) : L("sofre o efeito")}${f.onSave === "half" ? L("; sucesso: metade do dano") : f.onSave === "none" ? "; sucesso: nada acontece" : "; sucesso: dano total"}.`);
  if (f.kind === "heal") OUT.push(`${Number(f.targets) > 1 ? L`Até ${f.targets} criaturas recebem` : L("Uma criatura recebe")} ${f.healType === "temphp" ? L`${f.formula} PV temporários` : L`${f.formula} PV de cura`}.`);
  const ch = (f.changes ?? []).filter(c => c.key);
  if (ch.length) OUT.push(L`Enquanto ativo: ${ch.map(changeLabel).join("; ")}.${f.kind === "utility" && f.autoApply !== false ? L(" O efeito entra sozinho ao usar e sai quando a duração acaba.") : L(" Aplique o efeito pelo botão do cartão no chat.")}`);
  if (Number(f.chargeMax) > 0) OUT.push(L`Ultimate com carga: começa vazia (0/${f.chargeMax}) e enche ${[Number(f.chargeHit) ? L`+${f.chargeHit} a cada ataque que acerta` : "", Number(f.chargeCrit) ? L`+${f.chargeCrit} a cada acerto crítico` : "", Number(f.chargeDamaged) ? L`+${f.chargeDamaged} quando você sofre dano` : ""].filter(Boolean).join(", ") || L("quando o mestre conceder")}. Só pode ser usada cheia e gasta toda a carga.`);
  if (f.transform) OUT.push(L`É uma transformação${f.endIncap !== false ? L(": termina antes se você ficar Incapacitado") : ""}${f.tokenSize ? L`; o token fica com ${f.tokenSize}×${f.tokenSize} quadrados` : ""}.`);
  if (f.note) OUT.push(f.note);
  if (extra) OUT.push(extra);
  return OUT.join("\n");
}

export const isMine = (doc, t, n) => {
  const f = doc.flags?.[SCOPE]?.skillTree;
  return f?.tree === t.id && f?.node === n.id;
};

export async function grant(a, t, node, rank = 1) {
  const max = Math.max(1, Number(node.ranks) || 1);
  const n = withRank(node, rank);
  const created = [];
  const itemsData = [];
  for (const uuid of n.items) {
    const src = await fromUuid(uuid);
    if (!src) throw new Error(L`Item não encontrado: ${uuid}. A compra não foi concluída.`);
    const d = src.toObject();
    delete d._id;
    foundry.utils.setProperty(d, `flags.${SCOPE}.skillTree`, { tree: t.id, node: n.id });
    foundry.utils.setProperty(d, "_stats.compendiumSource", uuid);
    itemsData.push(d);
  }
  if (itemsData.length) created.push(...(await a.createEmbeddedDocuments("Item", itemsData)).map(i => i.name));
  for (const [fi, f] of n.features.entries()) {
    const data = buildFeatureItem(n, f, fi, t, rank, max);
    try {
      const [it] = await a.createEmbeddedDocuments("Item", [data]);
      created.push(it.name);
    } catch (err) {
      console.error(L("Árvore da Mesa | falha ao criar habilidade completa"), err, data);
      ui.notifications.warn(L`Não consegui criar o botão de uso de "${data.name}" (veja o console). Criei só a descrição.`);
      const [it] = await a.createEmbeddedDocuments("Item", [{ ...data, system: { description: data.system.description, uses: data.system.uses }, effects: [] }]);
      created.push(it.name);
    }
  }
  const changes = n.changes.filter(c => c.key);
  if (changes.length) {
    await a.createEmbeddedDocuments("ActiveEffect", [effectData({
      name: max > 1 ? `${n.name} (${rank}/${max})` : n.name, img: n.img || "icons/svg/aura.svg", origin: a.uuid, disabled: false,
      description: L`Concedido pela Skill Tree "${t.name}".`,
      flags: { [SCOPE]: { skillTree: { tree: t.id, node: n.id } } }
    }, changes)]);
    created.push(L`efeito "${n.name}"`);
  }
  return created;
}

export async function revoke(a, t, n) {
  const items = a.items.filter(i => isMine(i, t, n)).map(i => i.id);
  const effects = a.effects.filter(e => isMine(e, t, n)).map(e => e.id);
  if (items.length) await a.deleteEmbeddedDocuments("Item", items);
  if (effects.length) await a.deleteEmbeddedDocuments("ActiveEffect", effects);
}

// ───────────────────────── chat e efeitos visuais ─────────────────────────
export function box(html, c = "#c9a227") { return `<div style="border:1px solid ${esc(c)};border-radius:8px;padding:8px;background:#1d2029;color:#eee">${html}</div>`; }
export function chat(a, html, extra = {}) {
  return ChatMessage.create({ speaker: a ? ChatMessage.getSpeaker({ actor: a }) : { alias: "Skill Tree" }, content: box(html), ...extra });
}
export const whisperOwners = (a, html, c) => ChatMessage.create({ whisper: [...ownersOf(a).map(u => u.id), ...gmIds()], speaker: { alias: "Skill Tree" }, content: box(html, c) });

export function cinematicCard(a, t, n, { rank, max, cost, got, extra }) {
  const c = esc(n.color || "#e8c14a");
  const titulo = n.synergy ? L("Sinergia Ativada") : rank > 1 ? L("Habilidade Aprimorada") : L("Nova Habilidade");
  const pago = [cost ? `${cost} ${t.resLabel}` : "", extra?.gp ? `${extra.gp} PO` : "", extra?.pp ? `${extra.pp} PL` : "",
    ...Object.entries(extra?.ex ?? {}).map(([p, v]) => v ? `${v} ${extraName(t, p)}` : "")].filter(Boolean).join(" + ");
  return `<div style="position:relative;overflow:hidden;border-radius:10px;border:2px solid ${c};background:radial-gradient(circle at 50% 30%, ${c}44 0%, #1d2029 45%, #0d0e12 100%);color:#eee;text-align:center;padding:12px 8px;box-shadow:inset 0 0 18px ${c}66">
    <div style="font-size:10px;letter-spacing:4px;text-transform:uppercase;color:${c}">✦ ${titulo} ✦</div>
    <img src="${esc(n.img)}" style="width:76px;height:76px;border-radius:50%;border:3px solid ${c};box-shadow:0 0 20px ${c};margin:10px auto 6px;display:block;object-fit:cover">
    <div style="font-size:20px;font-weight:bold;color:${c};text-shadow:0 0 8px #000">${esc(n.name)}</div>
    ${max > 1 ? L`<div style="font-size:13px;margin-top:2px">${"★".repeat(rank)}${"☆".repeat(Math.max(0, max - rank))} &nbsp;Nível ${rank}/${max}</div>` : ""}
    <div style="font-size:12px;opacity:.85;margin-top:4px">${esc(a.name)} · ${esc(t.name)}${pago ? ` · −${esc(pago)}` : ""}</div>
    ${got?.length ? L`<div style="font-size:11px;opacity:.75;margin-top:4px">Recebeu: ${esc(got.join(", "))}</div>` : ""}
  </div>`;
}

export function playFx(a, t, n) {
  try {
    const snd = treeSound(t);
    if (snd) AH?.play({ src: snd, volume: 0.8, autoplay: true, loop: false }, true);
  } catch (e) { console.warn("Skill Tree | som", e); }
  try {
    const color = foundry.utils.Color.from(n.color || "#e8c14a");
    for (const tok of a.getActiveTokens()) {
      canvas?.ping?.(tok.center, { style: "pulse", color, duration: 1600, size: tok.w * 1.6 });
      canvas?.interface?.createScrollingText(tok.center, `✦ ${n.name}`, {
        anchor: CONST.TEXT_ANCHOR_POINTS.TOP, fontSize: 30, fill: n.color || "#e8c14a",
        stroke: 0x000000, strokeThickness: 5, jitter: 0.2, duration: 2500
      });
    }
  } catch (e) { console.warn(L("Skill Tree | animação"), e); }
}

export const addLog = (a, e) => [...logOf(a), { at: Date.now(), by: game.user.name, ...e }].slice(-80);

// ───────────────────────── desbloquear / reembolsar ─────────────────────────
// free: sem custo e sem requisitos · paid: o que já foi pago antes (treino) · quiet: sem card/efeitos
export async function doUnlock(a, t, n, options = {}, token) {
  if (!game.user.isGM && token !== INTERNAL && (options.free || options.paid || t?.approval || !canSee(t, a?.id))) throw new Error(L("Esta compra exige autorização do mestre."));
  const result = await actorOperation(a, tx => unlock(tx, t, n, options));
  if (result) await checkSynergies(a, t, options.quiet);
  return result;
}
async function unlock(a, t, n, { free = false, paid = null, quiet = false } = {}) {
  if (!a || !t || !n) return false;
  const st = nodeState(a, t, n);
  if (st.key === "training" && !paid) { ui.notifications.warn(L`"${n.name}" ainda está em treino.`); return false; }
  if (st.rank >= st.max) { if (!quiet) ui.notifications.warn(L`"${n.name}" já está no nível máximo.`); return false; }
  if (!free && !st.canBuy) { ui.notifications.warn(st.reasons.join(" · ") || L("Indisponível.")); return false; }
  const cost = free ? (paid?.cost ?? 0) : st.cost;
  const gp = free ? (paid?.gp ?? 0) : (coinsOn(t) ? Number(n.costGp) || 0 : 0);
  const pp = free ? (paid?.pp ?? 0) : (coinsOn(t) ? Number(n.costPp) || 0 : 0);
  const ex = free ? (paid?.ex ?? {}) : nodeExtras(t, n);
  const res = paid?.res ?? resDesc(t);

  // treino: paga agora e recebe depois
  if (!free && Number(n.trainDays) > 0) {
    const upd = {
      [K_TRAIN]: [...trainingOf(a), { id: uid(), tree: t.id, node: n.id, left: Number(n.trainDays), cost, gp, pp, ex, res, myth: isMythic(n), at: Date.now() }],
      [K_LOG]: addLog(a, { tree: t.id, treeName: t.name, node: n.id, nodeName: n.name, act: "train", cost })
    };
    addPay(upd, a, t, n, -cost);
    if (gp) addCoins(upd, a, -gp);
    if (pp) addCoins(upd, a, 0, -pp);
    addExtras(upd, a, ex, -1);
    await a.update(upd);
    if (n.consume.length) await consumeItems(a, n.consume);
    chat(a, L`⏳ <b>${esc(a.name)}</b> começou a treinar <b>${esc(n.name)}</b> — pronto em ${n.trainDays} descanso(s) longo(s).`);
    return true;
  }

  const un = unlockedOf(a, t);
  const newRank = st.rank + 1;
  const ranks = ranksOf(a, t).filter(r => r.id !== n.id);
  const entry = rankEntry(a, t, n, un);
  entry.r = newRank; entry.paid = [...(entry.paid ?? []), cost]; entry.paidX = [...(entry.paidX ?? []), { gp, pp, ex, res, myth: isMythic(n) }];
  ranks.push(entry);
  const upd = {
    [K_UNLOCK(t.id)]: [...new Set([...un, n.id])],
    [K_RANKS(t.id)]: ranks,
    [K_LOG]: addLog(a, { tree: t.id, treeName: t.name, node: n.id, nodeName: n.name, act: free && !paid ? "grant" : "unlock", rank: newRank, cost })
  };
  if (cost && !paid) addPay(upd, a, t, n, -cost);
  if (!free) {
    if (gp) addCoins(upd, a, -gp);
    if (pp) addCoins(upd, a, 0, -pp);
    addExtras(upd, a, ex, -1);
  }
  const reqs = reqsOf(a);
  const reqsLeft = reqs.filter(r => !(r.tree === t.id && r.node === n.id));
  if (reqsLeft.length !== reqs.length) upd[K_REQ] = reqsLeft;
  await a.update(upd);
  if (!free && n.consume.length) await consumeItems(a, n.consume);

  if (newRank > 1) await revoke(a, t, n);
  const got = await grant(a, t, n, newRank);
  if (n.replaces && newRank === 1) for (const p of parentsOf(t, n.id)) if (un.includes(p)) await revoke(a, t, nodeById(t, p));
  if (!quiet) {
    playFx(a, t, n);
    await chat(a, cinematicCard(a, t, n, { rank: newRank, max: st.max, cost, got, extra: { gp, pp, ex } }));
  }
  return true;
}

// Sinergias e combos em todas as árvores do personagem
const synergyBusy = new Set();
export async function checkAllSynergies(a, quiet = false) {
  const key = a.uuid ?? a.id;
  if (synergyBusy.has(key)) return;
  synergyBusy.add(key);
  try {
    const trees = (ST.app?.trees ?? getTrees()).filter(t => t.nodes.some(x => x.synergy));
    for (const t of trees) await checkSynergies(a, t, quiet, true);
  } finally { synergyBusy.delete(key); }
}
// Sinergias: liberam e somem sozinhas conforme os requisitos
export async function checkSynergies(a, t, quiet = false, inner = false) {
  if (!inner) return checkAllSynergies(a, quiet);
  for (let loop = 0; loop < 5; loop++) {
    let changed = false;
    const un = unlockedOf(a, t);
    for (const n of t.nodes.filter(x => x.synergy)) {
      const has = un.includes(n.id);
      const checks = reqChecklist(a, t, n, un, 0).filter(c => c.kind !== "cost");
      const ok = checks.length > 0 && checks.every(c => c.ok);
      if (ok && !has) { await doUnlock(a, t, n, { free: true, quiet }, INTERNAL); changed = true; break; }
      if (!ok && has) {
        await actorOperation(a, async tx => {
          await revoke(tx, t, n);
          await tx.update({ [K_UNLOCK(t.id)]: unlockedOf(tx,t).filter(id => id !== n.id), [K_RANKS(t.id)]: ranksOf(tx, t).filter(r => r.id !== n.id) });
        });
        if (!quiet) chat(a, L`<b>${esc(a.name)}</b> perdeu a sinergia <b>${esc(n.name)}</b>.`);
        changed = true; break;
      }
    }
    if (!changed) return;
  }
}

export function blockersOf(a, t, n) {
  const un = unlockedOf(a, t);
  return t.edges.filter(e => e.from === n.id && un.includes(e.to)).map(e => nodeById(t, e.to)).filter(c => {
    if (!c || c.synergy) return false;
    const others = parentsOf(t, c.id).filter(p => p !== n.id);
    return !(c.prereq === "any" && others.some(p => un.includes(p)));
  });
}

export async function doRefund(a, t, n, options = {}) {
  if (!game.user.isGM && (!t.refundPlayer || !canSee(t, a?.id))) throw new Error(L("Reembolso não autorizado para esta árvore."));
  const result = await actorOperation(a, tx => refund(tx, t, n, options));
  if (result) await checkSynergies(a, t, options.quiet);
  return result;
}
export function refundDependents(a, t, n, nextRank) {
  const trees = [...(ST.app?.trees ?? getTrees()).filter(x => x.id !== t.id), t];
  return trees.flatMap(tree => tree.nodes.filter(node => !node.synergy && rankOf(a,tree,node) > 0
    && (node.reqNodes ?? []).some(r => r.tree === t.id && r.node === n.id && Math.max(1,Number(r.rank)||1) > nextRank))
    .map(node => ({tree,node})));
}
async function refund(a, t, n, { quiet = false } = {}) {
  const un = unlockedOf(a, t);
  const entry = rankEntry(a, t, n, un);
  if (!entry.r) return false;
  const dependents = refundDependents(a,t,n,entry.r - 1);
  if (dependents.length) { ui.notifications.warn(L`Reembolse primeiro: ${dependents.map(d => d.node.name).join(", ")}`); return false; }
  if (entry.r === 1) {
    const blk = blockersOf(a, t, n);
    if (blk.length) { ui.notifications.warn(L`Reembolse primeiro: ${blk.map(b => b.name).join(", ")}`); return false; }
  }
  const pct = Math.max(0, Math.min(100, Number(t.refundPct ?? 100))) / 100;
  // devolve o último pagamento permanente; níveis temporários continuam até expirar
  const idx = refundIndex(entry);
  const back = Math.floor((Number(entry.paid?.[idx] ?? n.cost) || 0) * pct);
  const bx = entry.paidX?.[idx] ?? {};
  const backGp = Math.floor((Number(bx.gp) || 0) * pct), backPp = Math.floor((Number(bx.pp) || 0) * pct);
  entry.r -= 1;
  entry.paid = (entry.paid ?? []).filter((_, i) => i !== idx); entry.paidX = (entry.paidX ?? []).filter((_, i) => i !== idx);
  const ranks = ranksOf(a, t).filter(r => r.id !== n.id);
  if (entry.r > 0) ranks.push(entry);
  const upd = {
    [K_UNLOCK(t.id)]: entry.r > 0 ? un : un.filter(id => id !== n.id),
    [K_RANKS(t.id)]: ranks,
    [K_LOG]: addLog(a, { tree: t.id, treeName: t.name, node: n.id, nodeName: n.name, act: "refund", rank: entry.r, cost: back })
  };
  payBack(upd, a, t, n, back, bx);
  if (backGp) addCoins(upd, a, backGp);
  if (backPp) addCoins(upd, a, 0, backPp);
  addExtras(upd, a, bx.ex, 1, pct);
  if (bx.temp) upd[K_TEMP] = tempsOf(a).filter(x => x.id !== bx.temp);
  await revoke(a, t, n);
  await a.update(upd);
  if (entry.r > 0) await grant(a, t, n, entry.r);
  if (entry.r === 0 && n.replaces) {
    for (const p of parentsOf(t, n.id)) if (un.includes(p)) { const pn = nodeById(t, p); await grant(a, t, pn, rankOf(a, t, pn)); }
  }
  if (!quiet) await chat(a, `<b>${esc(a.name)}</b> ${entry.r > 0 ? L`reduziu <b>${esc(n.name)}</b> para o nível ${entry.r}` : `reembolsou <b>${esc(n.name)}</b>`} <small>(+${[back ? `${back} ${(bx.myth ?? isMythic(n)) ? L("Pontos Míticos") : t.resLabel}` : "", backGp ? `${backGp} PO` : "", backPp ? `${backPp} PL` : ""].filter(Boolean).join(", ") || "nada"})</small>`);
  return true;
}

// ───────────────────────── pontos presos (habilidades que não existem mais) ─────────────────────────
// Quando uma Skill Tree ou uma habilidade é excluída (ou trocada por uma versão importada), o que o
// personagem pagou nela ficava preso: os pontos não voltavam e os itens continuavam na ficha.
// orphanScan só calcula; fixOrphans devolve tudo e limpa a ficha.
export function orphanScan(a, trees = getTrees()) {
  const byId = new Map(trees.map(t => [t.id, t]));
  const fl = a?.flags?.[SCOPE] ?? {};
  const gone = (tid, nid) => { const t = byId.get(tid); return !t || !nodeById(t, nid); };
  const r = { upd: {}, skill: 0, other: [], myth: 0, gp: 0, pp: 0, ex: {}, unknown: false, nodes: [], items: [], effects: [] };
  const log = logOf(a);
  const nameOf = (tid, nid) => log.findLast(e => e.tree === tid && e.node === nid && e.nodeName)?.nodeName
    ?? a.items.find(i => stFlag(i)?.tree === tid && stFlag(i)?.node === nid)?.name ?? L("habilidade excluída");
  // devolve um valor pago: Míticos, recurso da árvore (se ela ainda existe e não usa Pontos de Habilidade) ou Pontos de Habilidade
  const back = (tid, v, x = {}) => {
    v = Number(v) || 0;
    r.gp += Number(x.gp) || 0; r.pp += Number(x.pp) || 0;
    r.ex = sumExtras(r.ex, x.ex);
    if (!v) return;
    if (x.myth) { r.myth += v; return; }
    const t = byId.get(tid);
    const d = x.res ?? (t ? resDesc(t) : { k: "skill" });
    if (d.k === "skill") r.skill += v; else r.other.push([d, v]);
  };
  const tids = new Set([...Object.keys(fl.skillTree ?? {}), ...Object.keys(fl.skillRanks ?? {})]);
  for (const tid of tids) {
    const un = Array.isArray(fl.skillTree?.[tid]) ? fl.skillTree[tid] : [];
    const rk = Array.isArray(fl.skillRanks?.[tid]) ? fl.skillRanks[tid] : [];
    const unG = un.filter(id => gone(tid, id)), rkG = rk.filter(e => e && gone(tid, e.id));
    if (!unG.length && !rkG.length) continue;
    for (const e of rkG) (e.paid ?? []).forEach((v, i) => back(tid, v, e.paidX?.[i] ?? {}));
    // desbloqueio muito antigo, sem registro do que foi pago
    if (unG.some(id => !rkG.some(e => e.id === id))) r.unknown = true;
    for (const id of new Set([...unG, ...rkG.map(e => e.id)])) r.nodes.push(nameOf(tid, id));
    r.upd[K_UNLOCK(tid)] = un.filter(id => !gone(tid, id));
    r.upd[K_RANKS(tid)] = rk.filter(e => e && !gone(tid, e.id));
  }
  // treinos de habilidades que não existem mais
  const train = trainingOf(a), trainKeep = train.filter(e => !gone(e.tree, e.node));
  if (trainKeep.length !== train.length) {
    for (const e of train.filter(x => gone(x.tree, x.node))) { back(e.tree, e.cost, { gp: e.gp, pp: e.pp, ex: e.ex, myth: e.myth }); r.nodes.push(L`${nameOf(e.tree, e.node)} (treino)`); }
    r.upd[K_TRAIN] = trainKeep;
  }
  // temporárias de habilidades que não existem mais
  const temps = tempsOf(a), tempKeep = temps.filter(e => !gone(e.tree, e.node));
  if (tempKeep.length !== temps.length) r.upd[K_TEMP] = tempKeep;
  // pedidos pendentes de habilidades que não existem mais
  const reqs = reqsOf(a), reqKeep = reqs.filter(x => !gone(x.tree, x.node));
  if (reqKeep.length !== reqs.length) r.upd[K_REQ] = reqKeep;
  // itens e efeitos na ficha vindos dessas habilidades
  r.items = a.items.filter(i => { const f = stFlag(i); return f?.tree && f?.node && gone(f.tree, f.node); }).map(i => i.id);
  r.effects = a.effects.filter(e => { const f = stFlag(e); return f?.tree && f?.node && gone(f.tree, f.node); }).map(e => e.id);

  // Pontos de Habilidade: "gastos" nunca fica abaixo do que as habilidades existentes custaram
  const spent = Number(getProp(a, SKILL_SPENT)) || 0;
  let expected = 0;
  for (const t of trees.filter(isSkill)) {
    const un = unlockedOf(a, t);
    for (const n of t.nodes) {
      const e = rankEntry(a, t, n, un);
      (e.paid ?? []).forEach((v, i) => { if (!(e.paidX?.[i]?.myth ?? isMythic(n))) expected += Number(v) || 0; });
    }
  }
  for (const e of trainKeep) { const t = byId.get(e.tree); if (t && isSkill(t) && !e.myth) expected += Number(e.cost) || 0; }
  const hasOrphans = Object.keys(r.upd).length > 0 || r.items.length > 0 || r.effects.length > 0;
  if (hasOrphans) {
    const target = r.unknown ? expected : Math.max(expected, spent - r.skill);
    r.newSpent = Math.min(spent, target);
    r.skillBack = spent - r.newSpent;
  } else { r.newSpent = spent; r.skillBack = 0; }
  r.found = hasOrphans;
  return r;
}

// Devolve os pontos e remove da ficha o que veio de habilidades excluídas. Só o mestre.
export async function fixOrphans(actors = null, { trees = null, quiet = false } = {}) {
  if (!game.user.isGM) return [];
  trees ??= getTrees();
  actors ??= game.actors.filter(a => a.type === "character");
  const report = [];
  for (const actor of actors) {
    await actorOperation(actor, async a => {
    const r = orphanScan(a, trees);
    if (!r.found) return;
    const upd = { ...r.upd };
    if (r.newSpent !== (Number(getProp(a, SKILL_SPENT)) || 0)) upd[SKILL_SPENT] = r.newSpent;
    if (r.myth) upd[K_MYTH] = mythicOf(a) + r.myth;
    if (r.gp) addCoins(upd, a, r.gp);
    if (r.pp) addCoins(upd, a, 0, r.pp);
    addExtras(upd, a, r.ex, 1);
    for (const [d, v] of r.other) addResDesc(upd, a, d, v);
    const parts = [r.skillBack ? L`${r.skillBack} Pontos de Habilidade` : "", r.myth ? L`${r.myth} Pontos Míticos` : "",
      ...r.other.map(([d, v]) => `${v} ${d.k === "coins" ? L("Ouro") : d.label || L("Pontos")}`), r.gp ? `${r.gp} PO` : "", r.pp ? `${r.pp} PL` : "", Object.keys(r.ex).length ? "recursos extras" : ""].filter(Boolean);
    upd[K_LOG] = addLog(a, { act: "orphan", nodeName: r.nodes.join(", "), cost: r.skillBack });
    if (r.items.length) await a.deleteEmbeddedDocuments("Item", r.items.filter(id => a.items.has(id)));
    if (r.effects.length) await a.deleteEmbeddedDocuments("ActiveEffect", r.effects.filter(id => a.effects.has(id)));
    await a.update(upd);
    report.push({ actor: a, back: parts, nodes: r.nodes });
    if (!quiet) whisperOwners(a, L`↺ <b>${esc(a.name)}</b> recebeu de volta ${parts.length ? `<b>${esc(parts.join(", "))}</b>` : L("o que foi pago")} de habilidades que não existem mais na Skill Tree.${r.nodes.length ? `<br><small>${esc([...new Set(r.nodes)].join(", "))}</small>` : ""}`);
    });
  }
  return report;
}

// ───────────────────────── treino ─────────────────────────
export async function advanceTraining(a, days = 1) {
  await actorOperation(a, async tx => {
    const list = trainingOf(tx);
    if (!list.length) return;
    const trees = getTrees();
    for (const e of list) e.left = Math.max(0, (Number(e.left) || 0) - days);
    await tx.update({ [K_TRAIN]: list });
    for (const e of list.filter(x => x.left <= 0)) {
      const t = trees.find(x => x.id === e.tree), n = nodeById(t, e.node);
      if (!t || !n) continue;
      const ok = await unlock(tx, t, n, { free: true, paid: { cost: e.cost, gp: e.gp, pp: e.pp, ex: e.ex, res: e.res } });
      if (!ok) continue;
      await tx.update({ [K_TRAIN]: trainingOf(tx).filter(x => x.id !== e.id) });
    }
  });
  await checkAllSynergies(a);
}
export function cancelTraining(a,t,n) { return actorOperation(a, tx => cancelTrainingInner(tx,t,n)); }
async function cancelTrainingInner(a, t, n) {
  const list = trainingOf(a);
  const e = list.find(x => x.tree === t.id && x.node === n.id);
  if (!e) return;
  const upd = { [K_TRAIN]: list.filter(x => x !== e) };
  payBack(upd, a, t, n, Number(e.cost) || 0, { myth: !!e.myth, res: e.res });
  if (e.gp) addCoins(upd, a, e.gp);
  if (e.pp) addCoins(upd, a, 0, e.pp);
  addExtras(upd, a, e.ex, 1);
  await a.update(upd);
  chat(a, L`<b>${esc(a.name)}</b> desistiu do treino de <b>${esc(n.name)}</b> (custos devolvidos).`);
}

// ───────────────────────── pedidos ao mestre ─────────────────────────
export async function sendRequest(a, t, n, cost) {
  const reqs = reqsOf(a);
  if (reqs.some(r => r.tree === t.id && r.node === n.id)) return ui.notifications.info(L("Você já pediu essa habilidade. Aguarde o mestre."));
  const req = { id: uid(), tree: t.id, node: n.id, user: game.user.id, at: Date.now() };
  await a.update({ [K_REQ]: [...reqs, req] });
  await ChatMessage.create({
    whisper: gmIds(), speaker: ChatMessage.getSpeaker({ actor: a }),
    content: box(L`<div style="display:flex;gap:8px;align-items:center"><img src="${esc(n.img)}" width="40" height="40" style="border:none;border-radius:50%">
      <div><b>${esc(a.name)}</b> pede para desbloquear <b>${esc(n.name)}</b><br><small>${esc(t.name)}${cost ? ` · ${cost} ${esc(t.resLabel)}` : ""}</small></div></div>
      <div style="display:flex;gap:6px;margin-top:6px">
        <button type="button" data-st-req="approve" data-actor="${a.id}" data-req="${req.id}">✔ Aprovar</button>
        <button type="button" data-st-req="deny" data-actor="${a.id}" data-req="${req.id}">✖ Recusar</button>
      </div>`)
  });
  ui.notifications.info(L("Pedido enviado ao mestre."));
}

export async function handleRequest(actorId, reqId, approve) {
  if (!game.user.isGM) throw new Error(L("Somente o mestre pode aprovar pedidos."));
  const a = game.actors.get(actorId);
  const req = a && reqsOf(a).find(r => r.id === reqId);
  if (!req) return ui.notifications.info(L("Esse pedido já foi resolvido."));
  const t = getTrees().find(x => x.id === req.tree);
  const n = nodeById(t, req.node);
  if (!t || !n) {
    await a.update({ [K_REQ]: reqsOf(a).filter(r => r.id !== reqId) });
    return ui.notifications.warn(L("A habilidade desse pedido não existe mais."));
  }
  if (approve) {
    const ok = await doUnlock(a, t, n);
    if (!ok) return;
    if (Number(n.trainDays) > 0) await a.update({ [K_REQ]: reqsOf(a).filter(r => r.id !== reqId) });
  } else {
    await a.update({
      [K_REQ]: reqsOf(a).filter(r => r.id !== reqId),
      [K_LOG]: addLog(a, { tree: t.id, treeName: t.name, node: n.id, nodeName: n.name, act: "deny" })
    });
    whisperOwners(a, L`O mestre recusou o pedido de <b>${esc(a.name)}</b> para <b>${esc(n.name)}</b>.`, "#b55");
  }
  ST.app?.render();
}

// ───────────────────────── automações de fundo (sessão) ─────────────────────────
export const isActiveGM = () => game.users.activeGM?.id === game.user.id;
export const stFlag = d => d?.flags?.[SCOPE]?.skillTree;

export async function checkLevel(a) {
  if (!a || a.type !== "character") return;
  await new Promise(r => setTimeout(r, 200));
  const lvl = actorLevel(a), last = getProp(a, K_LASTLVL);
  if (last === undefined || last === null) return a.update({ [K_LASTLVL]: lvl });
  if (lvl === Number(last)) return;
  const ganho = CFG.ptsPerLevel * (Math.min(lvl, CFG.maxLevel) - Math.min(Number(last), CFG.maxLevel));
  await a.update({ [K_LASTLVL]: lvl, ...(lvl > Number(last) ? { [K_LOG]: addLog(a, { act: "level", rank: lvl, cost: ganho }) } : {}) });
  if (lvl < Number(last) || !CFG.levelNotice) return;
  const usa = getTrees().some(t => isSkill(t) && t.assigned.includes(a.id));
  if (!usa || ganho <= 0) return;
  try { AH?.play({ src: CFG.defaultSound, volume: 0.8, autoplay: true, loop: false }, true); } catch { }
  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: a }),
    content: L`<div style="border:2px solid #5fbf6a;border-radius:10px;padding:10px;background:radial-gradient(circle,#5fbf6a33,#1d2029 70%);color:#eee;text-align:center">
      <div style="font-size:10px;letter-spacing:4px;color:#5fbf6a">✦ SUBIU DE NÍVEL ✦</div>
      <div style="font-size:18px;font-weight:bold;margin:4px 0">${esc(a.name)} — Nível ${lvl}</div>
      <div>Ganhou <b style="color:#7d7">${ganho} Pontos de Habilidade</b> (total disponível: ${skillAvail(a)})</div></div>`
  });
}

// dnd5e 6: o cartão de uso é uma mensagem do tipo "usage" e guarda o item em message.system
export async function onUsageMessage(msg) {
  if (msg.type !== "usage") return;
  const item = msg.getAssociatedItem();
  if (!item?.actor?.items.has(item.id)) return; // item já apagado da ficha
  const a = item.actor;
  // Transformação aplicada sozinha
  const st = stFlag(item);
  if (!st || st.autoApply === false || !(st.transform || st.kind === "utility")) return;
  if (a.effects.some(e => stFlag(e)?.generated && stFlag(e).node === st.node && (stFlag(e).fi ?? 0) === (st.fi ?? 0))) return;
  const src = item.effects.find(e => stFlag(e)?.generated);
  if (!src) return;
  const data = src.toObject();
  delete data._id;
  Object.assign(data, { transfer: false, disabled: false, origin: item.uuid });
  await a.createEmbeddedDocuments("ActiveEffect", [data]);
}

export async function endTransforms(a, onlyIncap = false) {
  const ids = a.effects.filter(e => stFlag(e)?.transform && (!onlyIncap || stFlag(e).endIncap)).map(e => e.id);
  if (ids.length) await a.deleteEmbeddedDocuments("ActiveEffect", ids);
}

// ── barras de carga ──
export const chargeItems = a => a?.items?.filter(i => stFlag(i)?.charge) ?? [];
export async function addCharge(a, kind, amount = 1, onlyItem = null) {
  for (const it of onlyItem ? [onlyItem] : chargeItems(a)) {
    const ch = stFlag(it).charge;
    const gain = kind === "manual" ? amount : (Number(ch[kind]) || 0) * amount;
    if (!gain) continue;
    const max = Number(it.system?.uses?.max) || ch.max, spent = Number(it.system?.uses?.spent ?? max);
    if (spent <= 0) continue;
    const novo = Math.max(0, spent - gain);
    await it.update({ "system.uses.spent": novo });
    if (novo === 0) chat(a, L`⚡ <b>${esc(a.name)}</b>: <b>${esc(it.name)}</b> está <b>carregada</b>!`);
  }
}
export async function onAttackMessage(msg) {
  if (msg.type !== "attack") return;
  const a = msg.getAssociatedActor();
  if (!a || !chargeItems(a).length) return;
  const roll = msg.rolls?.[0]; if (!roll) return;
  // sem alvo marcado conta como acerto; alvo sem CA conhecida (cobertura total) conta como erro
  const targets = msg.system?.evaluatedTargets ?? [];
  const hit = targets.length ? targets.some(tg => !tg.isMiss) : true;
  const crit = !!roll.isCritical;
  if (hit || crit) await addCharge(a, "hit");
  if (crit) await addCharge(a, "crit");
}
export const _stHp = new Map();
export async function onHpChange(a, changes, options) {
  if (!getProp(changes, "system.attributes.hp")) return;
  const hp = a.system?.attributes?.hp ?? {};
  const now = (Number(hp.value) || 0) + (Number(hp.temp) || 0);
  const old = options?.dnd5e?.hp ? (Number(options.dnd5e.hp.value) || 0) + (Number(options.dnd5e.hp.temp) || 0) : _stHp.get(a.id);
  _stHp.set(a.id, now);
  if (old !== undefined && now < old && chargeItems(a).length) await addCharge(a, "dmg");
}

export async function onEffectCreated(eff) {
  const a = eff.parent;
  if (a?.documentName !== "Actor") return;
  if ([...(eff.statuses ?? [])].some(s => INCAP.includes(s))) return endTransforms(a, true);
  const st = stFlag(eff);
  if (!st?.generated) return;
  const dup = a.effects.find(e => e.id !== eff.id && stFlag(e)?.generated && stFlag(e).node === st.node && (stFlag(e).fi ?? 0) === (st.fi ?? 0));
  if (dup) return eff.delete();
  if (!st.transform) {
    const end = {};
    if (st.seconds) {
      end.time = game.time.worldTime + st.seconds;
      const cb = game.combats?.active;
      if (cb?.started && cb.combatants.some(c => c.actorId === a.id)) { end.combat = cb.id; end.round = cb.round + Math.max(1, Math.ceil(st.seconds / 6)); }
    }
    await eff.update({ [`flags.${SCOPE}.stState`]: { orig: [], end } });
    chat(a, `✨ <b>${esc(a.name)}</b> usou <b>${esc(st.name ?? eff.name)}</b>${st.seconds ? ` <small>(${st.seconds >= 60 ? Math.round(st.seconds / 60) + " min" : st.seconds + " s"})</small>` : ""}`);
    return;
  }
  if (a.statuses && [...a.statuses].some(s => INCAP.includes(s)) && st.endIncap) return eff.delete();
  const orig = [];
  for (const td of a.getActiveTokens(false, true)) {
    orig.push({ scene: td.parent?.id, id: td.id, src: td.texture?.src, w: td.width, h: td.height, light: st.fxLight ? td.toObject().light : null });
    const upd = {};
    if (st.fxLight) {
      const rr = Number(st.fxRadius) || 6;
      upd.light = { dim: rr, bright: rr / 2, color: st.fxLight, alpha: 0.6, animation: { type: "pulse", speed: 3, intensity: 5 } };
    }
    if (st.tokenImg) upd["texture.src"] = st.tokenImg;
    if (st.tokenSize) { upd.width = st.tokenSize; upd.height = st.tokenSize; }
    if (Object.keys(upd).length) await td.update(upd);
  }
  const end = {};
  if (st.seconds) {
    end.time = game.time.worldTime + st.seconds;
    const cb = game.combats?.active;
    if (cb?.started && cb.combatants.some(c => c.actorId === a.id)) {
      end.combat = cb.id; end.round = cb.round + Math.max(1, Math.ceil(st.seconds / 6));
    }
  }
  await eff.update({ [`flags.${SCOPE}.stState`]: { orig, end } });
  if (st.fxSound) try { AH?.play({ src: st.fxSound, volume: 0.9, autoplay: true, loop: false }, true); } catch (e) { console.warn("Skill Tree | som", e); }
  try {
    const color = foundry.utils.Color.from(st.fxLight || "#e8c14a");
    for (const tok of a.getActiveTokens()) canvas?.ping?.(tok.center, { style: "pulse", color, duration: 1800, size: tok.w * 2 });
  } catch { }
  const dur = st.seconds ? ` <small>(${st.seconds >= 60 ? Math.round(st.seconds / 60) + " min" : st.seconds + " s"})</small>` : "";
  if (st.fxArt) ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: a }), content: `<div style="border:2px solid ${esc(st.fxLight || "#e8c14a")};border-radius:10px;overflow:hidden;background:#0d0e12;color:#eee;text-align:center">
    <img src="${esc(st.fxArt)}" style="width:100%;max-height:280px;object-fit:cover;border:none;display:block">
    <div style="padding:6px;font-size:16px;font-weight:bold;color:${esc(st.fxLight || "#e8c14a")}">✨ ${esc(a.name)} — ${esc(st.name ?? eff.name)}${dur}</div></div>` });
  else chat(a, `✨ <b>${esc(a.name)}</b> ativou <b>${esc(st.name ?? eff.name)}</b>${dur}`);
}

export async function onEffectDeleted(eff) {
  const a = eff.parent;
  if (a?.documentName !== "Actor") return;
  const st = stFlag(eff);
  if (!st?.generated) return;
  const orig = eff.flags?.[SCOPE]?.stState?.orig ?? [];
  for (const o of orig) {
    const td = game.scenes.get(o.scene)?.tokens.get(o.id);
    if (td) await td.update({ "texture.src": o.src, width: o.w, height: o.h, ...(o.light ? { light: o.light } : {}) });
  }
  if (orig.length || st.seconds) chat(a, `<b>${esc(a.name)}</b>: <b>${esc(st.name ?? eff.name)}</b> terminou.`);
}

export async function checkExpiry() {
  for (const a of game.actors) {
    for (const e of a.effects) {
      if (!stFlag(e)?.generated) continue;
      const end = e.flags?.[SCOPE]?.stState?.end;
      if (!end) continue;
      const cb = end.combat ? game.combats.get(end.combat) : null;
      const byRound = cb && end.round && cb.round >= end.round;
      const byTime = end.time && game.time.worldTime >= end.time && !cb;
      if (byRound || byTime) await e.delete();
    }
  }
}

export function bindRequestButtons(html) {
  if (!game.user.isGM) return;
  const el = html instanceof HTMLElement ? html : null;
  el?.querySelectorAll("[data-st-req]").forEach(btn => btn.addEventListener("click", ev => {
    ev.preventDefault();
    btn.disabled = true;
    handleRequest(btn.dataset.actor, btn.dataset.req, btn.dataset.stReq === "approve");
  }));
}

// Botão "Skill Tree" no cabeçalho da ficha
export function addSheetButton(app, html) {
  if (!CFG.sheetButton) return;
  const a = app.document;
  if (a?.documentName !== "Actor") return;
  if (!game.user.isGM && !getTrees().some(t => canSee(t, a.id))) return;
  const header = app.window?.header ?? app.element?.querySelector(".window-header");
  if (!header || header.querySelector(".st-sheet-btn")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "header-control st-sheet-btn";
  btn.dataset.tooltip = "Skill Tree";
  btn.style.cssText = "width:auto;padding:0 6px;color:#e8c14a;background:none;border:none;cursor:pointer";
  btn.innerHTML = '<i class="fas fa-sitemap"></i>';
  btn.addEventListener("click", ev => { ev.preventDefault(); ev.stopPropagation(); ST.open?.(a.id); });
  const anchor = header.querySelector('[data-action="close"], .close, .header-control:last-child');
  if (anchor) header.insertBefore(btn, anchor); else header.appendChild(btn);
}

// ───────────────────────── aba "Skill Tree" na ficha ─────────────────────────
// (estilos em styles/arvore-habilidades.css)

export function sheetTabHTML(a) {
  const trees = getTrees().filter(t => playerSees(t, a));
  if (!trees.length) return L`<p class="sts-muted">Nenhuma Skill Tree atribuída a ${esc(a.name)}. O mestre atribui pela janela da Árvore da Mesa.</p>`;
  const usesSkill = trees.some(isSkill);
  const reqs = reqsOf(a), train = trainingOf(a);
  const stars = (r, m) => m > 1 ? `<span class="sts-stars">${"★".repeat(r)}${"☆".repeat(Math.max(0, m - r))}</span>` : "";
  const top = L`<div class="sts-top">
    ${usesSkill ? L`<div class="sts-stat" data-tooltip="${CFG.ptsPerLevel} por nível (até o nível ${CFG.maxLevel}): ${skillEarned(a)} ganhos · ${Number(getProp(a, SKILL_SPENT)) || 0} gastos · ajuste do mestre ${Number(getProp(a, SKILL_BONUS)) || 0}"><b>${skillAvail(a)}</b><small>Pontos de Habilidade</small></div>` : ""}
    ${trees.some(treeHasMythic) || mythicOf(a) ? L`<div class="sts-stat" style="border-color:#e000ff88" data-tooltip="${esc(featsOf(a).slice(-5).map(f => `${f.text} (+${f.pts})`).join(" · ") || L("Ganhos com Grandes Feitos"))}"><b style="color:#f5b8ff">✦ ${mythicOf(a)}</b><small>Pontos Míticos</small></div>` : ""}
    <div class="sts-stat"><b>${actorLevel(a)}</b><small>Nível</small></div>
    <div class="sts-stat"><b>${trees.reduce((s, t) => s + unlockedOf(a, t).length, 0)}</b><small>Habilidades</small></div>
    ${reqs.length ? L`<div class="sts-stat"><b>${reqs.length}</b><small>Pedido(s) ao mestre</small></div>` : ""}
    ${train.length ? L`<div class="sts-stat"><b>${train.length}</b><small>Em treino</small></div>` : ""}
  </div>`;

  const cards = trees.map(t => {
    const un = unlockedOf(a, t);
    const states = t.nodes.map(n => ({ n, st: nodeState(a, t, n) }));
    const avail = states.filter(x => x.st.canBuy).length;
    const pct = t.nodes.length ? Math.round(un.length / t.nodes.length * 100) : 0;
    const owned = states.filter(x => x.st.rank > 0).map(({ n, st }) => {
      const nr = withRank(n, st.rank);
      const resumo = [...nr.features.map((f, i) => `${featName(n, f, i)}: ${featureSummary(f)}`), ...nr.changes.filter(c => c.key).map(changeLabel)].join(" · ");
      return L`<div class="sts-skill" data-st-open="${t.id}" data-st-node="${n.id}" style="--c:${esc(n.color || "#c9a227")}" data-tooltip="Abrir na Skill Tree">
        <img src="${esc(n.img)}"><div class="sts-txt"><b>${esc(n.name)} ${stars(st.rank, st.max)}</b>${resumo ? `<small>${esc(resumo)}</small>` : ""}</div>
        ${st.canBuy ? L`<span class="sts-up">▲ pode subir</span>` : ""}</div>`;
    }).join("");
    const tr = train.filter(e => e.tree === t.id).map(e => L`<div class="sts-line">⏳ ${esc(nodeById(t, e.node)?.name ?? "?")} — faltam ${e.left} descanso(s) longo(s)</div>`).join("");
    let extra = "";
    if (!isSkill(t)) extra = `<div class="sts-line">${esc(t.resLabel)}: <b>${resOf(a, t)}</b></div>`;
    return L`<div class="sts-card">
      <div class="sts-head"><h3>${esc(t.name)}</h3>
        ${avail ? L`<span class="sts-pill green">${avail} disponível(is)</span>` : ""}
        <span class="sts-pill">${un.length}/${t.nodes.length}</span>
        <button type="button" class="sts-open" data-st-open="${t.id}"><i class="fas fa-sitemap"></i> Abrir</button></div>
      <div class="sts-bar"><div style="width:${pct}%"></div></div>
      ${treeLock(a, t) ? L`<div class="sts-line">🔒 Bloqueada — liberada por ${esc(treeLock(a, t))}</div>` : ""}
      ${extra}${tr}
      ${owned || L`<p class="sts-muted">Nenhuma habilidade desbloqueada ainda.${avail ? L(" Clique em <b>Abrir</b> para escolher.") : ""}</p>`}
    </div>`;
  }).join("");

  const miles = milestonesOf(a);
  const log = logOf(a).slice(-5).reverse();
  const verbo = { unlock: "desbloqueou", temp: L("recebeu temporária"), grant: "recebeu", refund: "reembolsou", deny: "teve recusado", reset: "resetou", train: L("começou a treinar"), orphan: L("recebeu de volta os pontos de") };
  return `${top}${cards}
    ${miles.length ? L`<div class="sts-card"><div class="sts-head"><h3>🏆 Marcos</h3></div>${miles.map(m => `<span class="sts-pill blue" style="margin:2px;display:inline-block">${esc(m)}</span>`).join("")}</div>` : ""}
    ${log.length ? L`<div class="sts-card"><div class="sts-head"><h3>Histórico recente</h3></div>${log.map(e => `<div class="sts-line">• ${new Date(e.at).toLocaleDateString("pt-BR")} — ${verbo[e.act] ?? e.act} <b>${esc(e.nodeName ?? e.treeName ?? "")}</b>${e.rank > 1 ? L` (nível ${e.rank})` : ""}</div>`).join("")}</div>` : ""}`;
}

// liga os cliques "Abrir" de um painel da aba
export function bindSheetPanel(panel, a) {
  panel.querySelectorAll("[data-st-open]").forEach(el => el.addEventListener("click", ev => {
    ev.preventDefault(); ev.stopPropagation();
    ST.open?.(a.id, el.dataset.stOpen, el.dataset.stNode);
  }));
}
export const sheetTabWanted = a => !!a && CFG.sheetTab && (getTrees().some(t => canSee(t, a.id)) || (game.user.isGM && a.type === "character"));

// ── Tidy 5e Sheets: a aba é registrada pela API da própria Tidy ──
export const TIDY_TAB = "arvore-habilidades-skill-tree";
export const isTidySheet = (app, root) => !!(root?.classList.contains("tidy5e-sheet") || root?.closest(".tidy5e-sheet") || /tidy/i.test(app?.constructor?.name ?? ""));
export function registerTidyTab(api) {
  api ??= game.modules.get("tidy5e-sheet")?.api;
  if (!api?.registerCharacterTab || ST.tidy) return false;
  const actorOf = ctx => ctx?.actor ?? ctx?.document ?? null;
  const make = () => new api.models.HtmlTab({
    title: "Skill Tree",
    tabId: TIDY_TAB,
    iconClass: "fa-solid fa-sitemap",
    enabled: ctx => sheetTabWanted(actorOf(ctx)),
    html: ctx => { const a = actorOf(ctx); return a ? `<div class="st-sheet-tab st-tidy">${sheetTabHTML(a)}</div>` : ""; },
    onRender: params => {
      const a = params.app?.document ?? actorOf(params.data);
      const panel = params.tabContentsElement?.querySelector(".st-tidy") ?? params.tabContentsElement;
      if (a && panel) bindSheetPanel(panel, a);
    }
  });
  try {
    api.registerCharacterTab(make());
    api.registerNpcTab?.(make());
    ST.tidy = true;
    for (const app of foundry.applications.instances.values())
      if (app.rendered && isTidySheet(app, app.element) && app.document?.documentName === "Actor") app.render();
    return true;
  } catch (e) { console.warn(L("Skill Tree | não consegui registrar a aba na Tidy 5e"), e); return false; }
}

export function addSheetTab(app) {
  if (!CFG.sheetTab) return;
  const a = app.document;
  if (a?.documentName !== "Actor") return;
  const root = app.element;
  if (!(root instanceof HTMLElement)) return;
  // na Tidy a aba é dela: só atualiza o conteúdo quando as árvores mudam
  if (ST.tidy && isTidySheet(app, root)) {
    const panel = root.querySelector(".st-sheet-tab.st-tidy");
    if (panel) { panel.innerHTML = sheetTabHTML(a); bindSheetPanel(panel, a); }
    return;
  }
  if (!sheetTabWanted(a)) return;
  root.querySelectorAll(".st-nav, .st-sheet-tab").forEach(el => el.remove());
  const first = root.querySelector('.tab[data-tab][data-group="primary"]') ?? root.querySelector(".tab[data-tab]");
  if (!first) return;
  const group = first.dataset.group ?? "primary";
  const body = first.parentElement;
  const sysItem = root.querySelector(`[data-tab="${first.dataset.tab}"]:not(.tab)`) ?? root.querySelector(`[data-tab]:not(.tab)`);
  const nav = sysItem?.parentElement;
  if (!body || !nav) return;

  const item = document.createElement(sysItem.tagName === "BUTTON" ? "button" : "a");
  if (item.tagName === "BUTTON") item.type = "button";
  item.className = `${sysItem.className.replace(/\bactive\b/g, "")} st-nav`.trim();
  item.dataset.tooltip = "Skill Tree";
  item.setAttribute("aria-label", "Skill Tree");
  const iconOnly = !!sysItem.querySelector("i, img, dnd5e-icon") && !sysItem.textContent.trim();
  item.innerHTML = iconOnly ? '<i class="fas fa-sitemap"></i>' : '<i class="fas fa-sitemap"></i> Skill Tree';
  nav.appendChild(item);

  const panel = document.createElement("section");
  panel.className = "tab st-sheet-tab";
  panel.innerHTML = sheetTabHTML(a);
  body.appendChild(panel);

  const activate = on => {
    app._stTab = on;
    if (on) {
      nav.querySelectorAll(".active").forEach(el => el.classList.remove("active"));
      body.querySelectorAll(":scope > .tab.active").forEach(el => el.classList.remove("active"));
      item.classList.add("active"); panel.classList.add("active");
    } else { item.classList.remove("active"); panel.classList.remove("active"); }
  };
  item.addEventListener("click", ev => { ev.preventDefault(); ev.stopPropagation(); activate(true); });
  nav.addEventListener("click", ev => {
    const other = ev.target.closest?.("[data-tab]");
    if (!other || other === item || !app._stTab) return;
    activate(false);
    const tab = other.dataset.tab;
    setTimeout(() => {
      if (body.querySelector(":scope > .tab.active")) return;
      other.classList.add("active");
      body.querySelector(`:scope > .tab[data-tab="${tab}"]`)?.classList.add("active");
      if (app.tabGroups) app.tabGroups[other.dataset.group ?? group] = tab;
    }, 0);
  }, true);
  bindSheetPanel(panel, a);
  if (app._stTab) activate(true);
}

// ───────────────────────── habilidades temporárias ─────────────────────────
// Lista no ator: { id, tree, node, kind: "rests" | "date", left, until, at, by }
export const tempsOf = a => clone(getProp(a, K_TEMP) ?? []);
export const tempOf = (a, t, n) => tempsOf(a).find(e => e.tree === t.id && e.node === n.id) ?? null;
export function tempText(e) {
  if (!e) return "";
  if (e.kind === "rests") return L`some depois de ${e.left} descanso(s) longo(s)`;
  return L`some em ${dateText(e.until)}`;
}
// Concede de graça e marca para sumir sozinha. kind "rests" (left = descansos) ou "date" (until = dia do mundo).
export async function grantTemp(a, t, n, { kind = "rests", left = 1, until = null } = {}) {
  if (!game.user.isGM) throw new Error(L("Esta ação é exclusiva do mestre."));
  const st = nodeState(a, t, n);
  if (st.rank >= st.max) { ui.notifications.warn(L`"${n.name}" já está no nível máximo.`); return false; }
  const ok = await doUnlock(a, t, n, { free: true, quiet: true });
  if (!ok) return false;
  const e = { id: uid(), tree: t.id, node: n.id, kind, left: Math.max(1, Number(left) || 1), until: until === null ? null : Math.trunc(Number(until)), at: Date.now() };
  if (kind === "date" && (e.until === null || !Number.isFinite(e.until))) e.until = today() + 1;
  // marca o pagamento (grátis) deste nível como temporário: é ele que sai quando expirar
  const ranks = ranksOf(a, t), re = ranks.find(r => r.id === n.id);
  if (re) { re.paidX ??= []; while (re.paidX.length < (re.paid ?? []).length) re.paidX.push({}); re.paidX[re.paidX.length - 1] = { ...(re.paidX.at(-1) ?? {}), temp: e.id }; }
  await a.update({ [K_RANKS(t.id)]: ranks, [K_TEMP]: [...tempsOf(a), e], [K_LOG]: addLog(a, { tree: t.id, treeName: t.name, node: n.id, nodeName: n.name, act: "temp" }) });
  whisperOwners(a, L`⌛ <b>${esc(a.name)}</b> recebeu <b>${esc(n.name)}</b> temporariamente — ${tempText(e)}.`, "#d2a25e");
  return true;
}
// Tira o nível dado por esta temporária (o registro marcado com ela), sem devolver nada e sem travar por dependentes.
async function removeRank(a, t, n, tempId) {
  const un = unlockedOf(a, t), entry = rankEntry(a, t, n, un);
  if (!entry.r) return;
  const idx = (entry.paidX ?? []).findIndex(x => x?.temp === tempId);
  if (idx < 0) return; // esse nível já foi reembolsado
  entry.r -= 1;
  entry.paid = (entry.paid ?? []).filter((_, i) => i !== idx); entry.paidX = (entry.paidX ?? []).filter((_, i) => i !== idx);
  const ranks = ranksOf(a, t).filter(r => r.id !== n.id); if (entry.r > 0) ranks.push(entry);
  await revoke(a, t, n);
  await a.update({ [K_UNLOCK(t.id)]: entry.r > 0 ? un : un.filter(id => id !== n.id), [K_RANKS(t.id)]: ranks });
  if (entry.r > 0) await grant(a, t, n, entry.r);
}
export async function endTemp(a, tempId, { keep = false, quiet = false } = {}) {
  const list = tempsOf(a), e = list.find(x => x.id === tempId);
  if (!e) return false;
  await a.update({ [K_TEMP]: list.filter(x => x.id !== tempId) });
  if (keep) {
    // vira permanente: tira a marca de temporário do registro do nível
    const t = getTrees().find(x => x.id === e.tree);
    if (t) { const ranks = ranksOf(a, t); let hit = false; for (const r of ranks) for (const x of r.paidX ?? []) if (x?.temp === tempId) { delete x.temp; hit = true; } if (hit) await a.update({ [K_RANKS(t.id)]: ranks }); }
    return true;
  }
  const t = getTrees().find(x => x.id === e.tree), n = nodeById(t, e.node);
  if (t && n) {
    await actorOperation(a, tx => removeRank(tx, t, n, e.id));
    await checkSynergies(a, t, true);
    if (!quiet) whisperOwners(a, L`⌛ O efeito temporário de <b>${esc(n.name)}</b> acabou para <b>${esc(a.name)}</b>.`, "#d2a25e");
  }
  return true;
}
// descanso longo: conta 1; data: confere o dia
export async function tickTemps(a, { rest = false } = {}) {
  const list = tempsOf(a); if (!list.length) return;
  const now = today(); const end = [];
  let changed = false;
  for (const e of list) {
    if (e.kind === "rests" && rest) { e.left = Math.max(0, (Number(e.left) || 1) - 1); changed = true; if (e.left <= 0) end.push(e.id); }
    if (e.kind === "date" && e.until !== null && now >= e.until) end.push(e.id);
  }
  if (changed) await a.update({ [K_TEMP]: list });
  for (const id of end) await endTemp(a, id);
}
// Um descanso longo para o personagem: avança o treino e conta as temporárias por descanso
export async function longRest(a) {
  if (!a) return false;
  const had = trainingOf(a).length || tempsOf(a).some(e => e.kind === "rests");
  if (trainingOf(a).length) await advanceTraining(a, 1);
  await tickTemps(a, { rest: true });
  return !!had;
}
// quem tem treino ou temporária por descanso
export const restingActors = () => game.actors.filter(x => trainingOf(x).length || tempsOf(x).some(e => e.kind === "rests"));
export async function longRestAll() {
  const list = restingActors();
  for (const a of list) await longRest(a);
  return list;
}
// conta o descanso e avisa o mestre (sem aviso quando o personagem não tem treino nem temporária por descanso)
export async function restCounted(a, times = 1) {
  let any = false;
  for (let i = 0; i < times; i++) any = (await longRest(a)) || any;
  if (any) ui.notifications.info(L`Descanso longo de ${a.name}: treino e habilidades temporárias contados.`);
  return any;
}
// descansos que jogadores fizeram pela ficha (também os feitos enquanto o mestre estava fora)
const RESTQ_BUSY = new Set();
export async function processRestQueue(a) {
  if (!a || !isActiveGM() || RESTQ_BUSY.has(a.id)) return;
  const n = Number(getProp(a, K_RESTQ)) || 0;
  if (n <= 0) return;
  RESTQ_BUSY.add(a.id);
  try {
    await a.update({ [K_RESTQ]: 0 });
    await restCounted(a, Math.min(n, 30));
  } finally { RESTQ_BUSY.delete(a.id); }
}
export async function processAllRestQueues() {
  for (const a of game.actors.filter(x => Number(getProp(x, K_RESTQ)) > 0)) await processRestQueue(a);
}
export async function tickAllTemps(opts = {}) {
  for (const a of game.actors.filter(x => getProp(x, K_TEMP)?.length)) await tickTemps(a, opts);
}

// ───────────────────────── aviso de habilidade disponível ─────────────────────────
// Chaves "árvore:habilidade:nível" do que o personagem pode comprar agora
export function availableNow(a, trees = getTrees()) {
  const out = [];
  for (const t of trees) {
    if (!playerSees(t, a)) continue;
    for (const n of t.nodes) { const st = nodeState(a, t, n); if (st.canBuy) out.push(`${t.id}:${n.id}:${st.rank}`); }
  }
  return out.sort();
}
// Compara com a última vez; o que for novo vira um aviso para o dono. quiet: só guarda (ex.: logo depois de uma compra).
export async function checkAvailable(a, { quiet = false, trees = getTrees() } = {}) {
  if (!a || a.type !== "character" || !game.user.isGM) return [];
  const now = availableNow(a, trees);
  const before = getProp(a, K_AVAIL);
  const fresh = Array.isArray(before) ? now.filter(k => !before.includes(k)) : [];
  if (!Array.isArray(before) || before.length !== now.length || fresh.length) await a.update({ [K_AVAIL]: now });
  if (quiet || !fresh.length || !CFG.availNotice) return [];
  const byTree = new Map();
  for (const k of fresh) {
    const [tid, nid, r] = k.split(":"); const t = trees.find(x => x.id === tid), n = nodeById(t, nid);
    if (!t || !n) continue;
    const label = `${n.secret && Number(r) === 0 ? L("??? (habilidade secreta)") : n.name}${Number(r) > 0 ? L` → nível ${Number(r) + 1}` : ""}`;
    if (!byTree.has(t)) byTree.set(t, []);
    byTree.get(t).push(label);
  }
  if (!byTree.size) return [];
  const lines = [...byTree].map(([t, list]) => `<b>${esc(t.name)}</b>: ${esc(list.join(", "))}`).join("<br>");
  whisperOwners(a, L`✨ <b>${esc(a.name)}</b> já pode desbloquear:<br>${lines}`, "#7fb48a");
  return fresh;
}
const availTimers = new Map();
export function queueAvailable(a, quiet = false) {
  if (!a?.id || a.type !== "character") return;
  const prev = availTimers.get(a.id);
  if (prev) { clearTimeout(prev.t); quiet = quiet && prev.quiet; }
  const t = setTimeout(() => { availTimers.delete(a.id); checkAvailable(game.actors.get(a.id) ?? a, { quiet }).catch(e => console.error("Skill Tree | aviso", e)); }, 900);
  availTimers.set(a.id, { t, quiet });
}

export function installSessionHooks() {
  ST.open = async (id, treeId, nodeId) => {
    const app = ST.openApp?.();
    if (!app) return;
    app.actorId = id; app.sel = nodeId ?? null; app.planning = false;
    if (treeId && app.visibleTrees().some(t => t.id === treeId)) app.treeId = treeId;
    else {
      const first = app.trees.find(t => canSee(t, id));
      if (first && !canSee(app.tree ?? {}, id)) app.treeId = first.id;
    }
    const tt = app.trees.find(t => t.id === app.treeId);
    if (tt) app.category = catOf(tt);
    if (nodeId) app.panelOpen = true;
    app.render();
    app.bringToFront();
  };
  registerTidyTab();
  if (ST.session) return;
  const H = [];
  const on = (name, fn) => H.push([name, Hooks.on(name, (...args) => { try { return Promise.resolve(fn(...args)).catch(e => console.error("Skill Tree |", name, e)); } catch (e) { console.error("Skill Tree |", name, e); } })]);
  const levelHook = item => { if (isActiveGM() && item?.type === "class" && item.parent) checkLevel(item.parent); };
  const itemAvail = item => { if (isActiveGM() && item?.parent?.type === "character") queueAvailable(item.parent); };
  on("updateItem", (item, changes) => { if (getProp(changes, "system.levels") !== undefined) levelHook(item); itemAvail(item); });
  on("createItem", item => { levelHook(item); itemAvail(item); });
  on("deleteItem", item => { levelHook(item); itemAvail(item); });
  // configurações e árvores mudaram (em qualquer cliente)
  const onSetting = s => {
    const key = s?.key ?? "";
    if (!key.startsWith(`${MOD}.`)) return;
    const k = key.slice(MOD.length + 1);
    if (k === "trees") invalidateTrees();
    if (CFG_KEYS.includes(k)) reloadCfg();
  };
  on("updateSetting", onSetting);
  on("createSetting", onSetting);
  on("createChatMessage", msg => { if (isActiveGM()) { onUsageMessage(msg); onAttackMessage(msg); } });
  on("updateActor", (a, changes, options) => {
    if (!isActiveGM()) return;
    onHpChange(a, changes, options);
    const fl = changes?.flags?.[SCOPE] ?? {};
    if (Number(fl.stRestQ) > 0) { processRestQueue(a); return; }
    const keys = Object.keys(fl);
    if (keys.length === 1 && keys[0] === "skillAvail" && !changes.system) return; // a própria gravação do aviso
    // depois de uma compra/reembolso só atualiza a lista, sem aviso (o jogador está vendo a árvore)
    queueAvailable(a, "skillTree" in fl || "skillRanks" in fl || "skillTraining" in fl);
  });
  on("createActiveEffect", eff => { if (isActiveGM()) onEffectCreated(eff); });
  on("deleteActiveEffect", eff => { if (isActiveGM()) onEffectDeleted(eff); });
  on("updateCombat", (c, ch) => { if (isActiveGM() && ("round" in ch || "turn" in ch)) checkExpiry(); });
  on("updateWorldTime", () => { if (isActiveGM()) checkExpiry(); });
  // Descanso longo pela ficha. O dnd5e só avisa no computador de quem descansou:
  // no mestre conta na hora; no jogador, marca na ficha e o mestre conta quando receber.
  on("dnd5e.restCompleted", (actor, result, config) => {
    const long = result?.longRest ?? (result?.type === "long" || config?.type === "long");
    if (!long || !actor) return;
    if (isActiveGM()) return restCounted(actor);
    if (!actor.isOwner) return;
    return actor.update({ [K_RESTQ]: (Number(getProp(actor, K_RESTQ)) || 0) + 1 });
  });
  // botão "Descanso longo" do Calendário da Mesa: só avança o relógio, então conta o descanso aqui
  on("calendarioMesa.descansoLongo", async () => {
    if (!game.user.isGM) return;
    const list = await longRestAll();
    if (list.length) ui.notifications.info(L`Descanso longo: treino e habilidades temporárias contados para ${list.length} personagem(ns).`);
  });
  // dia novo: temporárias com data e árvores/habilidades que abrem numa data
  let lastDay = null;
  const dayTick = async () => {
    if (!isActiveGM()) return;
    const d = today(); if (d === lastDay) return; lastDay = d;
    await tickAllTemps();
    for (const a of playerCharacters()) if (a.type === "character") queueAvailable(a);
  };
  on("calendarioMesa.novoDia", dayTick);
  on("updateWorldTime", dayTick);
  on("renderChatMessageHTML", (msg, html) => bindRequestButtons(html));
  on("renderActorSheetV2", app => { addSheetButton(app); addSheetTab(app); });
  // atualiza a aba quando as Skill Trees mudam
  on("updateSetting", s => {
    if (s?.key !== `${MOD}.trees`) return;
    for (const app of foundry.applications.instances.values())
      if (app.rendered && app.document?.documentName === "Actor") addSheetTab(app);
  });
  ST.session = H;
  if (isActiveGM()) {
    for (const a of playerCharacters()) if (a.type === "character" && getProp(a, K_LASTLVL) === undefined) a.update({ [K_LASTLVL]: actorLevel(a) });
  }
  document.querySelectorAll("#chat [data-st-req], .chat-log [data-st-req]").forEach(b => bindRequestButtons(b.parentElement));
  for (const app of foundry.applications.instances.values()) if (app.rendered) { addSheetButton(app); addSheetTab(app); }
}


// ───────────────────────── migração da macro antiga ─────────────────────────
// Na primeira vez, copia árvores, modelos e configurações que estavam nos flags da macro.
export async function migrateFromMacro() {
  if (!isActiveGM() || getData("migrated", false)) return;
  const macro = game.macros.find(m => m.flags?.[SCOPE]?.trees?.length) ?? game.macros.getName("Árvore de Habilidades");
  const f = macro?.flags?.[SCOPE] ?? {};
  let n = 0;
  if (Array.isArray(f.trees) && f.trees.length && !(getData("trees", { list: [] })?.list ?? []).length) { await saveTrees(f.trees); n = f.trees.length; }
  if (Array.isArray(f.templates) && f.templates.length) await saveTemplates(f.templates);
  if (f.presets) await setData("presets", f.presets);
  if (f.session) await setData("session", f.session);
  if (f.settings) await saveCfg({ ...CFG, ...f.settings });
  await setData("migrated", true);
  invalidateTrees();
  if (n) ui.notifications.info(L`Árvore da Mesa: ${n} Skill Tree(s) trazidas da macro "${macro.name}". A macro antiga pode ser apagada.`);
}

// Efeitos já criados nas fichas com caminhos antigos (antes do dnd5e 6). Roda uma vez por mundo.
export async function migrateEffectKeys() {
  if (!isActiveGM() || getData("keysMigrated", false)) return;
  const fix = async eff => {
    if (!stFlag(eff)) return 0;
    const src = eff._source.system?.changes ?? [];
    if (!src.some(c => migrateKey(c.key) !== c.key)) return 0;
    await eff.update({ "system.changes": src.map(c => ({ ...c, key: migrateKey(c.key) })) });
    return 1;
  };
  let n = 0;
  for (const a of game.actors) {
    for (const e of a.effects) n += await fix(e);
    for (const i of a.items) if (stFlag(i)) for (const e of i.effects) n += await fix(e);
  }
  await setData("keysMigrated", true);
  if (n) console.log(L`Árvore da Mesa | ${n} efeito(s) atualizados para os caminhos do dnd5e 6`);
}

// 1.1.1: jogadores passam a poder reembolsar em todas as Skill Trees já existentes. Roda uma vez por mundo.
export async function migrateRefundPlayer() {
  if (!isActiveGM() || getData("refundMigrated", false)) return;
  const list = clone(getData("trees", { list: [] })?.list ?? []);
  let n = 0;
  for (const t of list) if (t && t.refundPlayer !== true) { t.refundPlayer = true; n++; }
  if (n) { await saveTrees(list); invalidateTrees(); }
  await setData("refundMigrated", true);
  if (n) console.log(L`Árvore da Mesa | reembolso pelo jogador ligado em ${n} Skill Tree(s)`);
}

// ───────────────────────── temas de cor ─────────────────────────
// cores de amostra: fundo, cartão, destaque
export const THEMES = [
  { id: "dourado", name: "Dourado", sw: ["#16181d", "#20232a", "#c2a253"] },
  { id: "azul", name: "Azul", sw: ["#14181f", "#1e242e", "#6f9ccf"] },
  { id: "roxo", name: "Roxo", sw: ["#17161c", "#221f2a", "#9a86bf"] },
  { id: "esmeralda", name: "Esmeralda", sw: ["#141917", "#1e2522", "#6aaa88"] },
  { id: "carmesim", name: "Carmesim", sw: ["#1a1617", "#251f20", "#c07a72"] },
  { id: "claro", name: "Claro", sw: ["#efebe3", "#f8f6f1", "#94773a"] }
];
export function applyTheme(id) {
  const t = THEMES.some(x => x.id === id) ? id : "dourado";
  if (t === "dourado") delete document.documentElement.dataset.stTheme; else document.documentElement.dataset.stTheme = t;
}

// ───────────────────────── configurações registradas ─────────────────────────
export function registerSettings() {
  const reg = (k, o) => game.settings.register(MOD, k, { scope: "world", ...o });
  reg("sections", { config: false, type: Object, default: { list: [{ id: "fantasy", name: L("Fantasia") }] } });
  reg("trees", { config: false, type: Object, default: { list: [] } });
  reg("templates", { config: false, type: Object, default: { list: [] } });
  reg("presets", { config: false, type: Object, default: {} });
  reg("session", { config: false, type: Object, default: {} });
  reg("migrated", { config: false, type: Boolean, default: false });
  reg("keysMigrated", { config: false, type: Boolean, default: false });
  reg("refundMigrated", { config: false, type: Boolean, default: false });
  reg("pendingCleanup", { config: false, type: Boolean, default: false });
  reg("gmUndo", { config: false, type: Object, default: { list: [] } });
  game.settings.register(MOD, "welcomeSeen", { scope: "client", config: false, type: Boolean, default: false });
  game.settings.register(MOD, "theme", {
    scope: "client", config: true, type: String, default: "dourado", name: "ARVORE.Settings.theme.Name", hint: "ARVORE.Settings.theme.Hint",
    choices: Object.fromEntries(THEMES.map(x => [x.id, `ARVORE.Theme.${x.id}`])), onChange: v => applyTheme(v)
  });
  const d = settingsDefaults();
  reg("ptsPerLevel", { config: true, type: Number, default: d.ptsPerLevel, name: "ARVORE.Settings.ptsPerLevel.Name", hint: "ARVORE.Settings.ptsPerLevel.Hint" });
  reg("maxLevel", { config: true, type: Number, default: d.maxLevel, name: "ARVORE.Settings.maxLevel.Name", hint: "ARVORE.Settings.maxLevel.Hint" });
  reg("availNotice", { config: true, type: Boolean, default: d.availNotice, name: "ARVORE.Settings.availNotice.Name", hint: "ARVORE.Settings.availNotice.Hint" });
  reg("levelNotice", { config: true, type: Boolean, default: d.levelNotice, name: "ARVORE.Settings.levelNotice.Name", hint: "ARVORE.Settings.levelNotice.Hint" });
  reg("sheetButton", { config: true, type: Boolean, default: d.sheetButton, name: "ARVORE.Settings.sheetButton.Name", hint: "ARVORE.Settings.sheetButton.Hint" });
  reg("sheetTab", { config: true, type: Boolean, default: d.sheetTab, name: "ARVORE.Settings.sheetTab.Name", hint: "ARVORE.Settings.sheetTab.Hint" });
  reg("defaultSound", { config: true, type: String, default: d.defaultSound, filePicker: "audio", name: "ARVORE.Settings.defaultSound.Name", hint: "ARVORE.Settings.defaultSound.Hint" });
}

