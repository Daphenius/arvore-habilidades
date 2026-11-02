// ═══════════════════════════════════════════════════════════════════════════
//  Árvore da Mesa — habilidades temporárias e descansos longos
// ═══════════════════════════════════════════════════════════════════════════

import { loc } from "./idioma.js";
import { INTERNAL, K_RANKS, K_RESTQ, K_TEMP, K_UNLOCK, clone, esc, getProp, getTrees, nodeById, uid } from "./core.js";
import { whisperOwners } from "./chat.js";
import { advanceTraining, doUnlock } from "./compras.js";
import { isActiveGM } from "./hooks.js";
import { grant, revoke } from "./itens.js";
import { actorOperation } from "./operations.js";
import { checkSynergies, dateText, nodeState, rankEntry, ranksOf, today, trainingOf, unlockedOf } from "./regras.js";

// ───────────────────────── habilidades temporárias ─────────────────────────
// Lista no ator: { id, tree, node, kind: "rests" | "date", left, until, at, by }
export const tempsOf = a => clone(getProp(a, K_TEMP) ?? []);
export const tempOf = (a, t, n) => tempsOf(a).find(e => e.tree === t.id && e.node === n.id) ?? null;
export function tempText(e) {
  if (!e) return "";
  if (e.kind === "rests") return loc("ARVORE.Regras.someDepoisDeDescansoSLongoS", { left: e.left });
  return `${loc("ARVORE.Regras.someEm")} ${dateText(e.until)}`;
}
// Concede de graça e marca para sumir sozinha. kind "rests" (left = descansos) ou "date" (until = dia do mundo).
export async function grantTemp(a, t, n, { kind = "rests", left = 1, until = null } = {}) {
  if (!game.user.isGM) throw new Error(loc("ARVORE.Comum.estaAcaoEExclusivaDoMestre"));
  const st = nodeState(a, t, n);
  if (st.rank >= st.max) { ui.notifications.warn(loc("ARVORE.Comum.jaEstaNoNivelMaximo", { name: n.name })); return false; }
  const e = { id: uid(), tree: t.id, node: n.id, kind, left: Math.max(1, Number(left) || 1), until: until === null ? null : Math.trunc(Number(until)), at: Date.now() };
  if (kind === "date" && (e.until === null || !Number.isFinite(e.until))) e.until = today() + 1;
  // a concessão e a marca de temporária entram numa única gravação, dentro da mesma operação
  const ok = await doUnlock(a, t, n, { free: true, quiet: true, temp: e }, INTERNAL);
  if (!ok) return false;
  whisperOwners(a, `⌛ <b>${esc(a.name)}</b> ${loc("ARVORE.Regras.recebeu2")} <b>${esc(n.name)}</b> ${loc("ARVORE.Regras.temporariamente", { e: tempText(e) })}`, "#d2a25e");
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
    if (!quiet) whisperOwners(a, `${loc("ARVORE.Regras.oEfeitoTemporarioDe")} <b>${esc(n.name)}</b> ${loc("ARVORE.Regras.acabouPara")} <b>${esc(a.name)}</b>.`, "#d2a25e");
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
  if (any) ui.notifications.info(loc("ARVORE.Regras.descansoLongoDeTreinoEHabilidades", { name: a.name }));
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
