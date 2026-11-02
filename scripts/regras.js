// ═══════════════════════════════════════════════════════════════════════════
//  Árvore da Mesa — regras: leitura do personagem, níveis, custos, pagamentos, pré-requisitos, bloqueios e sinergias
// ═══════════════════════════════════════════════════════════════════════════

import { loc } from "./idioma.js";
import {
  ABILITIES, CFG, COINS, D5, INTERNAL, KEY_LABELS, K_FEATS, K_LOG, K_MILES, K_MYTH, K_RANKS, K_REQ,
  K_TRAIN, K_UNLOCK, SCOPE, SKILL_BONUS, SKILL_SPENT, ST, canonType, clone, coinsOn, esc, extraName,
  getProp, getTrees, lbl, nodeById, nodeExtras, parentsOf
} from "./core.js";
import { chat } from "./chat.js";
import { doUnlock } from "./compras.js";
import { revoke } from "./itens.js";
import { actorOperation } from "./operations.js";

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
// Só leitura: não clona a lista (rankEntry clona porque quem chama altera a entrada).
// Mesmo resultado de rankEntry(...).r: a entrada salva; senão 1 se está na lista antiga de desbloqueadas.
export function rankOf(a, t, n, un) {
  const e = (getProp(a, K_RANKS(t.id)) ?? []).find(r => r.id === n.id);
  if (e) return e.r;
  return (un ?? getProp(a, K_UNLOCK(t.id)) ?? []).includes(n.id) ? 1 : 0;
}
// Soma dos níveis comprados numa árvore. effCost chama isto para cada habilidade a cada desenho da
// janela: lê as listas do personagem uma vez, sem clonar (antes clonava a lista inteira por habilidade).
export function totalRanks(a, t) {
  const first = new Map();
  for (const r of getProp(a, K_RANKS(t.id)) ?? []) if (!first.has(r.id)) first.set(r.id, r);
  const un = getProp(a, K_UNLOCK(t.id)) ?? [];
  return t.nodes.reduce((s, n) => s + (first.has(n.id) ? first.get(n.id).r : un.includes(n.id) ? 1 : 0), 0);
}

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
export const SHARED_SKIP = ["id", "x", "y", "shared", "reqNodes", "group"];
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
  try { const d = api?.datas?.hoje?.(); if (Number.isFinite(d)) return d; } catch (e) { console.warn("Árvore da Mesa | data do Calendário da Mesa (usando o tempo do mundo)", e); }
  return Math.floor((Number(game.time?.worldTime) || 0) / secPerDay());
}
export function dateText(td) {
  if (td === null || td === undefined) return "";
  try { const x = calApi()?.textoDia?.(td); if (x) return x; } catch (e) { console.warn("Árvore da Mesa | texto da data do Calendário da Mesa", e); }
  const diff = td - today();
  return diff === 0 ? loc("ARVORE.Regras.hoje") : diff > 0 ? loc("ARVORE.Regras.daquiADias", { n: diff }) : loc("ARVORE.Regras.haDias", { n: -diff });
}

// Árvore bloqueada para este personagem? Devolve o motivo (texto) ou null.
export function treeLock(a, t, trees = getTrees()) {
  if (!t?.lockKind) return null;
  if (t.lockKind === "level") {
    if (!t.lockLevel) return null;
    return a && actorLevel(a) >= t.lockLevel ? null : `${loc("ARVORE.Comum.nivel2")} ${t.lockLevel}`;
  }
  if (t.lockKind === "class") {
    const name = String(t.lockClass ?? "").trim(); if (!name) return null;
    const rc = { id: name.toLowerCase(), name, level: t.lockClassLevel };
    return a && hasClass(a, rc) ? null : `${loc("ARVORE.Regras.classe")} ${name}${t.lockClassLevel ? ` ${t.lockClassLevel}+` : ""}`;
  }
  if (t.lockKind === "date") {
    if (t.lockDate === null) return null;
    return today() >= t.lockDate ? null : `${loc("ARVORE.Regras.data")} ${dateText(t.lockDate)}`;
  }
  if (t.lockKind === "feat") {
    if (!t.lockFeat) return null;
    const ref = findFeat(t.lockFeat, trees);
    if (a && hasFeat(a, t.lockFeat)) return null;
    return `${loc("ARVORE.Comum.grandeFeito2")} ${ref ? ref.feat.name : loc("ARVORE.Regras.excluido")}`;
  }
  const name = String(t.lockItem ?? "").trim();
  if (!name) return null;
  if (a && countItem(a, { name }) > 0) return null;
  return `${loc("ARVORE.Regras.item")} ${name}`;
}
// árvores que um Grande Feito libera
export const treesOpenedBy = (featId, trees = getTrees()) => trees.filter(t => t.lockKind === "feat" && t.lockFeat === featId);
export const treeHasMythic = t => !!t?.nodes?.some(isMythic);
export const payLabel = (t, n) => isMythic(n) ? loc("ARVORE.Comum.pontosMiticos") : t.resLabel;
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
// Plano de pagamento em moedas, calculado num saldo provisório antes de gravar.
// A PL exigida sai só da platina e fica reservada; o ouro sai do ouro e, se faltar, da platina
// que sobrou (1 PL = 10 PO), com o troco em ouro. Uma moeda nunca paga dois custos.
export function coinPlan(gp, pp, gold = 0, plat = 0) {
  gp = Math.max(0, Number(gp) || 0); pp = Math.max(0, Number(pp) || 0);
  gold = Math.max(0, Number(gold) || 0); plat = Math.max(0, Number(plat) || 0);
  if (pp < plat) return { ok: false, gp, pp };
  const restPp = pp - plat;
  if (gp >= gold) return { ok: true, gp: gp - gold, pp: restPp };
  const need = gold - gp, broken = Math.ceil(need / 10);
  if (broken > restPp) return { ok: false, gp, pp };
  return { ok: true, gp: broken * 10 - need, pp: restPp - broken };
}
export const canPayCoins = (a, gold, plat) => coinPlan(coin(a, "gp"), coin(a, "pp"), gold, plat).ok;
// Desconta de uma vez ouro e platina em `upd` (sobre o que já foi alterado nele). Sem saldo, lança erro
// e a operação protegida desfaz o resto: nunca grava um pagamento pela metade.
export function spendCoins(upd, a, gold = 0, plat = 0) {
  if (!(Number(gold) > 0) && !(Number(plat) > 0)) return upd;
  const p = coinPlan(upd[GP] ?? coin(a, "gp"), upd[PP] ?? coin(a, "pp"), gold, plat);
  if (!p.ok) throw new Error(loc("ARVORE.Regras.moedasInsuficientes", { gold: Number(gold) || 0, plat: Number(plat) || 0 }));
  upd[GP] = p.gp; upd[PP] = p.pp;
  return upd;
}
// Ouro que a compra pede no total: o custo principal (árvore em Ouro) mais os PO extras da habilidade.
export const goldNeeded = (a, t, n, cost) => (isCoins(t) && !isMythic(n) ? Number(cost) || 0 : 0) + (coinsOn(t) ? Number(n.costGp) || 0 : 0);
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
// Quantidade de um item da ficha. Sem o campo quantity (item que não empilha) conta como 1 unidade.
// Zero, negativo ou valor que não é número = nenhuma unidade. Usada na conferência e no consumo.
export function itemQty(i) {
  const q = i?.system?.quantity;
  if (q === undefined || q === null) return 1;
  const v = typeof q === "string" && !q.trim() ? NaN : Number(q);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}
export const itemMatches = (i, it) => sameName(i, it.name) || (!!it.uuid && i._stats?.compendiumSource === it.uuid);
export const itemNeed = it => Number(it?.qty) || 1;
export const countItem = (a, it) => a.items.filter(i => itemMatches(i, it)).reduce((s, i) => s + itemQty(i), 0);
// Plano de consumo para a lista inteira: cada unidade da ficha serve a uma exigência só, mesmo com
// exigências repetidas ou que apontam para o mesmo item por nome e por UUID. A distribuição não depende
// da ordem da lista: é um fluxo máximo (exigências → itens que servem → estoque de cada item), então
// uma exigência genérica nunca "rouba" a unidade que só uma exigência mais restrita pode usar.
// Se existe alguma distribuição que paga tudo, ela é encontrada.
export function consumePlan(a, list) {
  const reqs = (list ?? []).map(it => ({ it, want: itemNeed(it) }));
  const items = a.items.filter(i => itemQty(i) > 0);
  const R = reqs.length, I = items.length, S = R + I, T = S + 1, N = T + 1;
  const cap = Array.from({ length: N }, () => new Array(N).fill(0));
  reqs.forEach((r, k) => {
    cap[S][k] = r.want;
    items.forEach((i, j) => { if (itemMatches(i, r.it)) cap[k][R + j] = r.want; });
  });
  items.forEach((i, j) => { cap[R + j][T] = itemQty(i); });
  const flow = Array.from({ length: N }, () => new Array(N).fill(0));
  // caminhos aumentantes mais curtos (Edmonds–Karp); as listas aqui são pequenas
  for (;;) {
    const prev = new Array(N).fill(-1); prev[S] = S;
    const queue = [S];
    for (let q = 0; q < queue.length && prev[T] < 0; q++) {
      const u = queue[q];
      for (let v = 0; v < N; v++) if (prev[v] < 0 && cap[u][v] - flow[u][v] > 0) { prev[v] = u; queue.push(v); }
    }
    if (prev[T] < 0) break;
    let push = Infinity;
    for (let v = T; v !== S; v = prev[v]) push = Math.min(push, cap[prev[v]][v] - flow[prev[v]][v]);
    for (let v = T; v !== S; v = prev[v]) { flow[prev[v]][v] += push; flow[v][prev[v]] -= push; }
  }
  const take = new Map(), left = new Map(a.items.map(i => [i.id, itemQty(i)]));
  items.forEach((i, j) => { const q = flow[R + j][T]; if (q > 0) { take.set(i.id, q); left.set(i.id, itemQty(i) - q); } });
  const lines = reqs.map((r, k) => ({ it: r.it, want: r.want, got: flow[S][k], ok: flow[S][k] >= r.want }));
  return { ok: lines.every(l => l.ok), lines, take, left };
}
// Consome os itens de uma vez. Se faltar qualquer unidade agora, lança erro antes de mexer na ficha
// (dentro de actorOperation, o que já foi gravado na compra é desfeito).
export async function consumeItems(a, list) {
  const plan = consumePlan(a, list);
  if (!plan.ok) {
    const miss = plan.lines.filter(l => !l.ok).map(l => `${l.it.name} (${l.got}/${l.want})`).join(", ");
    throw new Error(loc("ARVORE.Regras.itensInsuficientes", { itens: miss }));
  }
  const del = [], upd = [];
  for (const [id, q] of plan.take) {
    const i = a.items.get?.(id) ?? a.items.find(x => x.id === id);
    if (plan.left.get(id) <= 0) del.push(id); else upd.push({ _id: id, "system.quantity": itemQty(i) - q });
  }
  if (upd.length) await a.updateEmbeddedDocuments("Item", upd);
  if (del.length) await a.deleteEmbeddedDocuments("Item", del);
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
  if (t.lockKind && treeLock(null, t)) add(`${loc("ARVORE.Regras.skillTreeLiberadaPor")} ${treeLock(null, t)}`, () => !treeLock(a, t));
  if (rank === 0) {
    const parents = parentsOf(t, n.id);
    if (parents.length) {
      const names = parents.map(p => nodeById(t, p)?.name).filter(Boolean);
      add(n.prereq === "any" ? `${loc("ARVORE.Regras.terUmaDestas")} ${names.join(", ")}` : `${loc("ARVORE.Regras.ter")} ${names.join(` ${loc("ARVORE.Regras.e")} `)}`,
        () => n.prereq === "any" ? parents.some(p => un.includes(p)) : parents.every(p => un.includes(p)));
    }
    if (n.group) {
      const rival = a && t.nodes.find(o => o.id !== n.id && o.group === n.group && un.includes(o.id));
      add(rival ? loc("ARVORE.Regras.escolhaExclusivaJaEscolheu", { name: rival.name }) : loc("ARVORE.Regras.escolhaExclusivaSoUmaDoGrupo", { group: n.group }), () => !rival);
    }
  }
  if (Number(n.minLevel)) add(`${loc("ARVORE.Regras.nivel", { minLevel: n.minLevel })}${a ? ` ${loc("ARVORE.Regras.atual", { a: actorLevel(a) })}` : ""}`, () => actorLevel(a) >= Number(n.minLevel));
  if (n.reqAbility && Number(n.reqScore)) {
    const name = ABILITIES.find(x => x.value === n.reqAbility)?.label ?? n.reqAbility;
    const v = a ? Number(a.system?.abilities?.[n.reqAbility]?.value) || 0 : 0;
    add(`${name} ${n.reqScore}+${a ? ` ${loc("ARVORE.Regras.atual2", { v })}` : ""}`, () => v >= Number(n.reqScore));
  }
  const rcs = n.reqClasses.filter(c => c.id);
  if (rcs.length) add(`${loc("ARVORE.Regras.classe")} ${rcs.map(c => `${c.name}${Number(c.level) ? ` ${loc("ARVORE.Regras.nivel2", { level: c.level })}` : ""}`).join(` ${loc("ARVORE.Regras.ou")} `)}`, () => rcs.some(c => hasClass(a, c)));
  if (n.reqRace) add(`${loc("ARVORE.Regras.raca")} ${n.reqRace}`, () => hasRace(a, n.reqRace));
  for (const it of n.reqItems) add(`${loc("ARVORE.Regras.possuir")} ${it.name}`, () => hasItem(a, it));
  for (const rn of n.reqNodes ?? []) {
    const allT = ST.app?.trees ?? getTrees();
    const rt = allT.find(x => x.id === rn.tree), rnode = nodeById(rt, rn.node);
    const minR = Math.max(1, Number(rn.rank) || 1);
    add(loc("ARVORE.Regras.comboTer", { v: rnode?.name ?? rn.name ?? "?", v2: minR > 1 ? ` ${loc("ARVORE.Regras.nivel3", { minR })}` : "", v3: rt?.name ?? loc("ARVORE.Regras.outraArvore") }),
      () => rt && rnode && rankOf(a, rt, rnode) >= minR);
  }
  if (n.milestone) add(`${loc("ARVORE.Regras.marco")} ${n.milestone}`, () => milestonesOf(a).includes(n.milestone));
  if (n.reqDate !== null && n.reqDate !== undefined) add(`${loc("ARVORE.Regras.aPartirDe")} ${dateText(n.reqDate)}`, () => today() >= n.reqDate);
  {
    // ouro e platina conferidos juntos: a PL fica reservada e não completa o ouro
    if (coinsOn(t) && Number(n.costGp)) add(`${loc("ARVORE.Regras.custoPo", { costGp: n.costGp })}${a ? ` ${loc("ARVORE.Regras.voceTemEmOuroEPlatina", { a: coinWorth(a) })}` : ""}`, () => canPayCoins(a, goldNeeded(a, t, n, effCost(a, t, n, rankOf(a, t, n))), Number(n.costPp) || 0), "cost");
    if (coinsOn(t) && Number(n.costPp)) add(`${loc("ARVORE.Regras.custoPl", { costPp: n.costPp })}${a ? ` ${loc("ARVORE.Regras.voceTem", { a: coin(a, "pp") })}` : ""}`, () => coin(a, "pp") >= Number(n.costPp), "cost");
    for (const [p, v] of Object.entries(nodeExtras(t, n))) add(`${loc("ARVORE.Regras.custo2")} ${v} ${extraName(t, p)}${a ? ` ${loc("ARVORE.Regras.voceTem2", { v: Number(getProp(a, p)) || 0 })}` : ""}`, () => (Number(getProp(a, p)) || 0) >= v, "cost");
    // consumo conferido para a lista inteira: exigências repetidas não usam a mesma unidade duas vezes
    const plan = a ? consumePlan(a, n.consume) : null;
    n.consume.forEach((it, i) => add(`${loc("ARVORE.Regras.consome", { v: itemNeed(it) })} ${it.name}${a ? ` ${loc("ARVORE.Regras.voceTem", { a: countItem(a, it) })}` : ""}`, () => !!plan?.lines[i]?.ok, "cost"));
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
  if (tr) return { key: "training", reasons: [loc("ARVORE.Regras.emTreinoFaltaMDescansoSLongo", { left: tr.left })], checks: [], rank, max, cost, canBuy: false, training: tr };
  if (rank >= max) return { key: "unlocked", reasons: [], checks: [], rank, max, cost, canBuy: false, maxed: true };
  const checks = reqChecklist(a, t, n, un, rank);
  const reasons = checks.filter(c => !c.ok && c.kind !== "cost").map(c => c.label);
  const costFail = checks.filter(c => !c.ok && c.kind === "cost").map(c => c.label);
  if (n.synergy) {
    return { key: rank > 0 ? "unlocked" : "locked", reasons: [loc("ARVORE.Regras.sinergiaLiberaSozinhaQuandoOs"), ...reasons], checks, rank, max, cost: 0, canBuy: false, synergy: true };
  }
  const res = payOf(a, t, n);
  const poorMain = isCoins(t) && !isMythic(n) ? !canPayCoins(a, cost, coinsOn(t) ? Number(n.costPp) || 0 : 0) : res < cost;
  const poor = poorMain || costFail.length > 0;
  const canBuy = !reasons.length && !poor;
  const key = rank > 0 ? "unlocked" : reasons.length ? "locked" : poor ? "poor" : "available";
  if (poorMain) reasons.push(`${payLabel(t, n)} ${loc("ARVORE.Regras.insuficientes", { res, cost })}`);
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
    if (m) { const ab = ABILITIES.find(x => x.value === m[1])?.label ?? m[1]; name = m[2] === "value" ? ab : m[2] === "bonuses.save" ? `${loc("ARVORE.Regras.trDe")} ${ab}` : `${loc("ARVORE.Regras.testeDe")} ${ab}`; }
  }
  if (!name) { const m = key.match(/^system\.skills\.(\w+)\./); if (m) name = `${loc("ARVORE.Regras.pericia")} ${lbl(D5.skills?.[m[1]]) || m[1]}`; }
  name ??= key.replace(/^system\./, "");
  const ty = canonType(c.type), v = String(c.value ?? "").trim();
  let val = v;
  if (key === "system.traits.size") val = lbl(D5.actorSizes?.[v]) || v;
  if (ty === "add" || ty === "2") return `${name} ${/^[+-]/.test(v) ? "" : "+"}${val}`;
  if (ty === "subtract") return `${name} −${val}`;
  if (ty === "override" || ty === "5") return `${name} ${loc("ARVORE.Regras.vira")} ${val}`;
  if (ty === "multiply" || ty === "1") return `${name} ×${val}`;
  if (ty === "upgrade" || ty === "4") return `${name} ${loc("ARVORE.Regras.noMinimo")} ${val}`;
  if (ty === "downgrade" || ty === "3") return `${name} ${loc("ARVORE.Regras.noMaximo")} ${val}`;
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
// Sinergias: liberam e somem sozinhas conforme os requisitos.
// Chamada de fora (inner = false), confere TODAS as árvores do personagem, não só "t": uma
// compra em "t" pode liberar ou derrubar sinergias de outra árvore (pré-requisito em outra
// árvore, item ganho, Grande Feito). checkAllSynergies chama de volta com inner = true, árvore a árvore.
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
        if (!quiet) chat(a, `<b>${esc(a.name)}</b> ${loc("ARVORE.Regras.perdeuASinergia")} <b>${esc(n.name)}</b>.`);
        changed = true; break;
      }
    }
    if (!changed) return;
  }
}
