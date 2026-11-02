// ═══════════════════════════════════════════════════════════════════════════
//  Árvore da Mesa — peças de interface compartilhadas pelas janelas
// ═══════════════════════════════════════════════════════════════════════════

import { loc } from "./idioma.js";
import { DialogV2 as DialogBase, esc, ownersOf } from "./core.js";
import { calApi as _calApi, dateText as _dateText, today as _today, actorLevel } from "./regras.js";

// ───────────────────────── Janelas do módulo ─────────────────────────
// Todas as janelas abertas pela Árvore usam o mesmo visual moderno e o tema escolhido.
export const dlgOpts = o => {
  const c = String(o.content ?? "");
  const content = c.includes('class="st-c') ? c : `<div class="st-c st-dlg-body">${c}</div>`;
  return { ...o, content, classes: [...new Set([...(o.classes ?? []), "st-cfg-dialog", "st-dlg"])], position: { width: 460, ...(o.position ?? {}) } };
};
export const DialogV2 = {
  prompt: o => DialogBase.prompt(dlgOpts(o)),
  confirm: o => DialogBase.confirm(dlgOpts(o)),
  wait: o => DialogBase.wait(dlgOpts(o))
};
// Cartões de personagem (escolher, atribuir, recompensas, feitos)
export const charCard = (a, { name = "", checked = false, disabled = false, note = "", sub = "", radio = false, value = "" } = {}) => `
  <label class="st-who ${disabled ? "off" : ""}" data-who="${esc(a.id)}" data-search="${esc(a.name.toLowerCase())}">
    <input type="${radio ? "radio" : "checkbox"}" name="${esc(name || `a-${a.id}`)}" ${radio ? `value="${esc(value || a.id)}"` : ""} ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}>
    <img src="${esc(a.img || "icons/svg/mystery-man.svg")}" alt="">
    <span class="st-who-t"><b>${esc(a.name)}</b><small>${sub}</small></span>
    <em>${note}</em><i class="fas fa-check st-who-ck"></i>
  </label>`;
export const whoSub = a => [`${loc("ARVORE.Comum.nivel2")} ${actorLevel(a)}`, esc(ownersOf(a).map(u => u.name).join(", ")) || loc("ARVORE.Interface.semJogador")].join(" · ");
export const whoTools = (search = true) => `<div class="st-who-tools">
    ${search ? `<input type="search" data-whofind placeholder="${loc("ARVORE.Comum.buscarPersonagem")}">` : ""}
    <button type="button" data-marcar="1" class="st-c-btn">${loc("ARVORE.Interface.selecionarTudo")}</button><button type="button" data-marcar="0" class="st-c-btn">${loc("ARVORE.Interface.desmarcarTudo")}</button></div>`;
export const wireWho = el => {
  el.querySelectorAll("[data-marcar]").forEach(btn => btn.addEventListener("click", e => {
    e.preventDefault();
    el.querySelectorAll('.st-who:not([hidden]) input[type="checkbox"]:not(:disabled)').forEach(cb => { cb.checked = btn.dataset.marcar === "1"; });
  }));
  el.querySelector("[data-whofind]")?.addEventListener("input", ev => {
    const q = ev.target.value.trim().toLowerCase();
    el.querySelectorAll(".st-who").forEach(w => { w.hidden = !!q && !w.dataset.search.includes(q); });
  });
};

// ── seletor de data: Calendário da Mesa (ano, mês, dia) ou dias a partir de hoje ──
export function datePicker(name, td = null) {
  const api = _calApi(), base = td ?? _today();
  if (api?.datas?.partes && api?.datas?.meses) {
    const p = api.datas.partes(base), meses = api.datas.meses(p.ano);
    return `<div class="st-date" data-date="${name}" data-cal="1">
      <input type="number" data-dp="ano" value="${p.ano}" title="${loc("ARVORE.Interface.ano")}">
      <select data-dp="mes">${meses.map(m => `<option value="${m.i}" ${m.i === p.mes ? "selected" : ""}>${esc(m.nome)}</option>`).join("")}</select>
      <input type="number" data-dp="dia" min="1" value="${p.dia}" title="${loc("ARVORE.Interface.dia")}">
      <small data-dp-text>${esc(_dateText(base))}</small></div>`;
  }
  const diff = base - _today();
  return `<div class="st-date" data-date="${name}"><input type="number" data-dp="dias" value="${diff}"><span>${loc("ARVORE.Interface.diaSAPartirDeHoje")}</span><small data-dp-text>${esc(_dateText(base))}</small></div>`;
}
export function readDate(root, name) {
  const box = root.querySelector(`[data-date="${name}"]`); if (!box) return null;
  const v = k => box.querySelector(`[data-dp="${k}"]`)?.value;
  if (box.dataset.cal) {
    const api = _calApi();
    const td = api?.datas?.tdDe?.(Number(v("ano")), Number(v("mes")), Number(v("dia")));
    return Number.isFinite(td) ? td : null;
  }
  return _today() + Math.trunc(Number(v("dias")) || 0);
}
// atualiza o texto da data enquanto o mestre mexe
export function wireDate(root) {
  root.querySelectorAll("[data-date]").forEach(box => box.addEventListener("input", () => {
    const td = readDate(root, box.dataset.date);
    const out = box.querySelector("[data-dp-text]"); if (out) out.textContent = td === null ? loc("ARVORE.Interface.dataInvalida") : _dateText(td);
  }));
}
