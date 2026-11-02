// ═══════════════════════════════════════════════════════════════════════════
//  Árvore da Mesa — chat: cartões, efeitos visuais, histórico e pedidos ao mestre
// ═══════════════════════════════════════════════════════════════════════════

import { loc } from "./idioma.js";
import { AH, K_LOG, K_REQ, ST, esc, extraName, getTrees, gmIds, nodeById, ownersOf, treeSound, uid } from "./core.js";
import { doUnlock } from "./compras.js";
import { logOf, reqsOf } from "./regras.js";

// ───────────────────────── chat e efeitos visuais ─────────────────────────
export function box(html, c = "#c9a227") { return `<div style="border:1px solid ${esc(c)};border-radius:8px;padding:8px;background:#1d2029;color:#eee">${html}</div>`; }
export function chat(a, html, extra = {}) {
  return ChatMessage.create({ speaker: a ? ChatMessage.getSpeaker({ actor: a }) : { alias: "Skill Tree" }, content: box(html), ...extra });
}
export const whisperOwners = (a, html, c) => ChatMessage.create({ whisper: [...ownersOf(a).map(u => u.id), ...gmIds()], speaker: { alias: "Skill Tree" }, content: box(html, c) });

export function cinematicCard(a, t, n, { rank, max, cost, got, extra }) {
  const c = esc(n.color || "#e8c14a");
  const titulo = n.synergy ? loc("ARVORE.Regras.sinergiaAtivada") : rank > 1 ? loc("ARVORE.Regras.habilidadeAprimorada") : loc("ARVORE.Regras.novaHabilidade2");
  const pago = [cost ? `${cost} ${t.resLabel}` : "", extra?.gp ? `${extra.gp} PO` : "", extra?.pp ? `${extra.pp} PL` : "",
    ...Object.entries(extra?.ex ?? {}).map(([p, v]) => v ? `${v} ${extraName(t, p)}` : "")].filter(Boolean).join(" + ");
  return `<div style="position:relative;overflow:hidden;border-radius:10px;border:2px solid ${c};background:radial-gradient(circle at 50% 30%, ${c}44 0%, #1d2029 45%, #0d0e12 100%);color:#eee;text-align:center;padding:12px 8px;box-shadow:inset 0 0 18px ${c}66">
    <div style="font-size:10px;letter-spacing:4px;text-transform:uppercase;color:${c}">✦ ${titulo} ✦</div>
    <img src="${esc(n.img)}" style="width:76px;height:76px;border-radius:50%;border:3px solid ${c};box-shadow:0 0 20px ${c};margin:10px auto 6px;display:block;object-fit:cover">
    <div style="font-size:20px;font-weight:bold;color:${c};text-shadow:0 0 8px #000">${esc(n.name)}</div>
    ${max > 1 ? `<div style="font-size:13px;margin-top:2px">${"★".repeat(rank)}${"☆".repeat(Math.max(0, max - rank))} ${loc("ARVORE.Regras.nivel4", { rank })}${max}</div>` : ""}
    <div style="font-size:12px;opacity:.85;margin-top:4px">${esc(a.name)} · ${esc(t.name)}${pago ? ` · −${esc(pago)}` : ""}</div>
    ${got?.length ? `<div style="font-size:11px;opacity:.75;margin-top:4px">${loc("ARVORE.Regras.recebeu")} ${esc(got.join(", "))}</div>` : ""}
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
  } catch (e) { console.warn(loc("ARVORE.Regras.skillTreeAnimacao"), e); }
}

export const addLog = (a, e) => [...logOf(a), { at: Date.now(), by: game.user.name, ...e }].slice(-80);

// ───────────────────────── pedidos ao mestre ─────────────────────────
export async function sendRequest(a, t, n, cost) {
  const reqs = reqsOf(a);
  if (reqs.some(r => r.tree === t.id && r.node === n.id)) return ui.notifications.info(loc("ARVORE.Regras.voceJaPediuEssaHabilidadeAguarde"));
  const req = { id: uid(), tree: t.id, node: n.id, user: game.user.id, at: Date.now() };
  await a.update({ [K_REQ]: [...reqs, req] });
  await ChatMessage.create({
    whisper: gmIds(), speaker: ChatMessage.getSpeaker({ actor: a }),
    content: box(`<div style="display:flex;gap:8px;align-items:center"><img src="${esc(n.img)}" width="40" height="40" style="border:none;border-radius:50%">
      <div><b>${esc(a.name)}</b> ${loc("ARVORE.Regras.pedeParaDesbloquear")} <b>${esc(n.name)}</b><br><small>${esc(t.name)}${cost ? ` · ${cost} ${esc(t.resLabel)}` : ""}</small></div></div>
      <div style="display:flex;gap:6px;margin-top:6px">
        <button type="button" data-st-req="approve" data-actor="${a.id}" data-req="${req.id}">${loc("ARVORE.Regras.aprovar")}</button>
        <button type="button" data-st-req="deny" data-actor="${a.id}" data-req="${req.id}">${loc("ARVORE.Regras.recusar")}</button>
      </div>`)
  });
  ui.notifications.info(loc("ARVORE.Regras.pedidoEnviadoAoMestre"));
}

export async function handleRequest(actorId, reqId, approve) {
  if (!game.user.isGM) throw new Error(loc("ARVORE.Regras.somenteOMestrePodeAprovarPedidos"));
  const a = game.actors.get(actorId);
  const req = a && reqsOf(a).find(r => r.id === reqId);
  if (!req) return ui.notifications.info(loc("ARVORE.Regras.essePedidoJaFoiResolvido"));
  const t = getTrees().find(x => x.id === req.tree);
  const n = nodeById(t, req.node);
  if (!t || !n) {
    await a.update({ [K_REQ]: reqsOf(a).filter(r => r.id !== reqId) });
    return ui.notifications.warn(loc("ARVORE.Regras.aHabilidadeDessePedidoNaoExiste"));
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
    whisperOwners(a, `${loc("ARVORE.Regras.oMestreRecusouOPedidoDe")} <b>${esc(a.name)}</b> ${loc("ARVORE.Comum.para")} <b>${esc(n.name)}</b>.`, "#b55");
  }
  ST.app?.render();
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
