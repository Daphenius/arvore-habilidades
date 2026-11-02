// ═══════════════════════════════════════════════════════════════════════════
//  Árvore da Mesa — compras: desbloquear, reembolsar, pontos presos e treino
// ═══════════════════════════════════════════════════════════════════════════

import { loc } from "./idioma.js";
import {
  INTERNAL, K_LOG, K_MYTH, K_RANKS, K_REQ, K_TEMP, K_TRAIN, K_UNLOCK, SCOPE, SKILL_SPENT, ST,
  addExtras, canSee, coinsOn, esc, getProp, getTrees, nodeById, nodeExtras, parentsOf, sumExtras, uid
} from "./core.js";
import { addLog, chat, cinematicCard, playFx, whisperOwners } from "./chat.js";
import { stFlag } from "./hooks.js";
import { grant, revoke } from "./itens.js";
import { actorOperation } from "./operations.js";
import {
  addCoins, addPay, addResDesc, checkAllSynergies, checkSynergies, consumeItems, isMythic, isSkill,
  logOf, mythicOf, nodeState, payBack, rankEntry, rankOf, ranksOf, refundIndex, reqsOf, resDesc,
  trainingOf, unlockedOf
} from "./regras.js";
import { tempsOf } from "./temporarias.js";

// ───────────────────────── desbloquear / reembolsar ─────────────────────────
// free: sem custo e sem requisitos · paid: o que já foi pago antes (treino) · quiet: sem card/efeitos
export async function doUnlock(a, t, n, options = {}, token) {
  if (!game.user.isGM && token !== INTERNAL && (options.free || options.paid || t?.approval || !canSee(t, a?.id))) throw new Error(loc("ARVORE.Regras.estaCompraExigeAutorizacaoDo"));
  const result = await actorOperation(a, tx => unlock(tx, t, n, options));
  if (result) await checkSynergies(a, t, options.quiet);
  return result;
}
// temp: registro de habilidade temporária (grantTemp) — entra na mesma gravação da compra
async function unlock(a, t, n, { free = false, paid = null, quiet = false, temp = null } = {}) {
  if (!a || !t || !n) return false;
  const st = nodeState(a, t, n);
  if (st.key === "training" && !paid) { ui.notifications.warn(loc("ARVORE.Regras.aindaEstaEmTreino", { name: n.name })); return false; }
  if (st.rank >= st.max) { if (!quiet) ui.notifications.warn(loc("ARVORE.Comum.jaEstaNoNivelMaximo", { name: n.name })); return false; }
  if (!free && !st.canBuy) { ui.notifications.warn(st.reasons.join(" · ") || loc("ARVORE.Comum.indisponivel")); return false; }
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
    chat(a, `⏳ <b>${esc(a.name)}</b> ${loc("ARVORE.Regras.comecouATreinar")} <b>${esc(n.name)}</b> ${loc("ARVORE.Regras.prontoEmDescansoSLongoS", { trainDays: n.trainDays })}`);
    return true;
  }

  const un = unlockedOf(a, t);
  const newRank = st.rank + 1;
  const ranks = ranksOf(a, t).filter(r => r.id !== n.id);
  const entry = rankEntry(a, t, n, un);
  // o pagamento (grátis) de uma temporária fica marcado com ela: é ele que sai quando expirar
  entry.r = newRank; entry.paid = [...(entry.paid ?? []), cost]; entry.paidX = [...(entry.paidX ?? []), { gp, pp, ex, res, myth: isMythic(n), ...(temp ? { temp: temp.id } : {}) }];
  ranks.push(entry);
  const upd = {
    [K_UNLOCK(t.id)]: [...new Set([...un, n.id])],
    [K_RANKS(t.id)]: ranks,
    [K_LOG]: addLog(a, { tree: t.id, treeName: t.name, node: n.id, nodeName: n.name, act: temp ? "temp" : free && !paid ? "grant" : "unlock", rank: newRank, cost })
  };
  if (temp) upd[K_TEMP] = [...tempsOf(a), temp];
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

export function blockersOf(a, t, n) {
  const un = unlockedOf(a, t);
  return t.edges.filter(e => e.from === n.id && un.includes(e.to)).map(e => nodeById(t, e.to)).filter(c => {
    if (!c || c.synergy) return false;
    const others = parentsOf(t, c.id).filter(p => p !== n.id);
    return !(c.prereq === "any" && others.some(p => un.includes(p)));
  });
}

export async function doRefund(a, t, n, options = {}) {
  if (!game.user.isGM && (!t.refundPlayer || !canSee(t, a?.id))) throw new Error(loc("ARVORE.Regras.reembolsoNaoAutorizadoParaEsta"));
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
  if (dependents.length) { ui.notifications.warn(`${loc("ARVORE.Regras.reembolsePrimeiro")} ${dependents.map(d => d.node.name).join(", ")}`); return false; }
  if (entry.r === 1) {
    const blk = blockersOf(a, t, n);
    if (blk.length) { ui.notifications.warn(`${loc("ARVORE.Regras.reembolsePrimeiro")} ${blk.map(b => b.name).join(", ")}`); return false; }
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
  if (!quiet) await chat(a, `<b>${esc(a.name)}</b> ${entry.r > 0 ? `${loc("ARVORE.Regras.reduziu")} <b>${esc(n.name)}</b> ${loc("ARVORE.Comum.paraONivel")} ${entry.r}` : `${loc("ARVORE.Regras.reembolsou")} <b>${esc(n.name)}</b>`} <small>(+${[back ? `${back} ${(bx.myth ?? isMythic(n)) ? loc("ARVORE.Comum.pontosMiticos") : t.resLabel}` : "", backGp ? `${backGp} PO` : "", backPp ? `${backPp} PL` : ""].filter(Boolean).join(", ") || loc("ARVORE.Regras.nada")})</small>`);
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
    ?? a.items.find(i => stFlag(i)?.tree === tid && stFlag(i)?.node === nid)?.name ?? loc("ARVORE.Regras.habilidadeExcluida");
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
    for (const e of train.filter(x => gone(x.tree, x.node))) { back(e.tree, e.cost, { gp: e.gp, pp: e.pp, ex: e.ex, myth: e.myth }); r.nodes.push(`${nameOf(e.tree, e.node)} ${loc("ARVORE.Regras.treino")}`); }
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
    const parts = [r.skillBack ? `${r.skillBack} ${loc("ARVORE.Comum.pontosDeHabilidade")}` : "", r.myth ? `${r.myth} ${loc("ARVORE.Comum.pontosMiticos")}` : "",
      ...r.other.map(([d, v]) => `${v} ${d.k === "coins" ? loc("ARVORE.Regras.ouro") : d.label || loc("ARVORE.Comum.pontos")}`), r.gp ? `${r.gp} PO` : "", r.pp ? `${r.pp} PL` : "", Object.keys(r.ex).length ? loc("ARVORE.Regras.recursosExtras") : ""].filter(Boolean);
    upd[K_LOG] = addLog(a, { act: "orphan", nodeName: r.nodes.join(", "), cost: r.skillBack });
    if (r.items.length) await a.deleteEmbeddedDocuments("Item", r.items.filter(id => a.items.has(id)));
    if (r.effects.length) await a.deleteEmbeddedDocuments("ActiveEffect", r.effects.filter(id => a.effects.has(id)));
    await a.update(upd);
    report.push({ actor: a, back: parts, nodes: r.nodes });
    if (!quiet) whisperOwners(a, `↺ <b>${esc(a.name)}</b> ${loc("ARVORE.Regras.recebeuDeVoltaDeHabilidadesQue", { v: parts.length ? `<b>${esc(parts.join(", "))}</b>` : loc("ARVORE.Regras.oQueFoiPago") })}${r.nodes.length ? `<br><small>${esc([...new Set(r.nodes)].join(", "))}</small>` : ""}`);
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
  chat(a, `<b>${esc(a.name)}</b> ${loc("ARVORE.Regras.desistiuDoTreinoDe")} <b>${esc(n.name)}</b> ${loc("ARVORE.Regras.custosDevolvidos")}`);
}
