// ═══════════════════════════════════════════════════════════════════════════
//  Árvore da Mesa — automações de fundo: nível, uso, ataques, PV, efeitos, aviso de habilidade disponível e ganchos da sessão
// ═══════════════════════════════════════════════════════════════════════════

import { loc } from "./idioma.js";
import {
  AH, CFG, CFG_KEYS, INCAP, K_AVAIL, K_LASTLVL, K_LOG, K_RESTQ, MOD, SCOPE, ST, canSee, catOf, esc,
  getProp, getTrees, invalidateTrees, nodeById, playerCharacters, playerSees, reloadCfg
} from "./core.js";
import { addLog, bindRequestButtons, chat, whisperOwners } from "./chat.js";
import { addSheetButton, addSheetTab, registerTidyTab } from "./ficha.js";
import { actorLevel, isSkill, nodeState, skillAvail, today } from "./regras.js";
import { longRestAll, processRestQueue, restCounted, tickAllTemps } from "./temporarias.js";

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
  try { AH?.play({ src: CFG.defaultSound, volume: 0.8, autoplay: true, loop: false }, true); } catch (e) { console.warn("Árvore da Mesa | som de nível", e); }
  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: a }),
    content: `<div style="border:2px solid #5fbf6a;border-radius:10px;padding:10px;background:radial-gradient(circle,#5fbf6a33,#1d2029 70%);color:#eee;text-align:center">
      <div style="font-size:10px;letter-spacing:4px;color:#5fbf6a">${loc("ARVORE.Regras.subiuDeNivel")}</div>
      <div style="font-size:18px;font-weight:bold;margin:4px 0">${esc(a.name)} ${loc("ARVORE.Regras.nivel5")} ${lvl}</div>
      <div>${loc("ARVORE.Regras.ganhou")} <b style="color:#7d7">${ganho} ${loc("ARVORE.Comum.pontosDeHabilidade")}</b> ${loc("ARVORE.Regras.totalDisponivel", { a: skillAvail(a) })}</div></div>`
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
    if (novo === 0) chat(a, `⚡ <b>${esc(a.name)}</b>: <b>${esc(it.name)}</b> ${loc("ARVORE.Regras.esta")} <b>${loc("ARVORE.Regras.carregada")}</b>!`);
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
  } catch (e) { console.warn("Árvore da Mesa | animação da transformação", e); }
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
  const antes = getProp(a, K_AVAIL);
  const novas = Array.isArray(antes) ? now.filter(k => !antes.includes(k)) : [];
  if (!Array.isArray(antes) || antes.length !== now.length || novas.length) await a.update({ [K_AVAIL]: now });
  if (quiet || !novas.length || !CFG.availNotice) return [];
  const byTree = new Map();
  for (const k of novas) {
    const [tid, nid, r] = k.split(":"); const t = trees.find(x => x.id === tid), n = nodeById(t, nid);
    if (!t || !n) continue;
    const label = `${n.secret && Number(r) === 0 ? loc("ARVORE.Regras.habilidadeSecreta") : n.name}${Number(r) > 0 ? ` ${loc("ARVORE.Regras.nivel6")} ${Number(r) + 1}` : ""}`;
    if (!byTree.has(t)) byTree.set(t, []);
    byTree.get(t).push(label);
  }
  if (!byTree.size) return [];
  const lines = [...byTree].map(([t, list]) => `<b>${esc(t.name)}</b>: ${esc(list.join(", "))}`).join("<br>");
  whisperOwners(a, `✨ <b>${esc(a.name)}</b> ${loc("ARVORE.Regras.jaPodeDesbloquear")}<br>${lines}`, "#7fb48a");
  return novas;
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
    if (list.length) ui.notifications.info(loc("ARVORE.Regras.descansoLongoTreinoEHabilidades", { length: list.length }));
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
