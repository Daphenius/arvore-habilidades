// ═══════════════════════════════════════════════════════════════════════════
//  Árvore da Mesa — desfazer do mestre
//  Antes de uma concessão, recompensa, ± de pontos, Grande Feito, NPC ou
//  temporária, guarda como cada personagem estava. "Desfazer" na Mesa volta.
// ═══════════════════════════════════════════════════════════════════════════

import { loc } from "./idioma.js";
import { SCOPE, clone, esc, getData, getProp, invalidateTrees, setData, uid } from "./core.js";
import { stFlag } from "./hooks.js";
import { DialogV2 } from "./ui-kit.js";

// só as chaves deste módulo dentro de flags.world (outros módulos também usam "world")
const OUR_KEYS = ["skillTree", "skillRanks", "skillLog", "skillReq", "skillTraining", "milestones", "skillPoints", "mythic", "skillTemp", "skillAvail", "stRes"];
const MAX = 15;

function sysPaths(trees) {
  const set = new Set(["system.currency.gp", "system.currency.pp", "system.details.xp.value"]);
  for (const t of trees) {
    if (typeof t.resPath === "string" && t.resPath.startsWith("system.")) set.add(t.resPath);
    for (const r of t.resources ?? []) if (r.kind === "field" && r.path?.startsWith("system.")) set.add(r.path);
  }
  return [...set];
}
function snap(a, paths) {
  const fl = a.flags?.[SCOPE] ?? {};
  return {
    id: a.id, name: a.name,
    flags: Object.fromEntries(OUR_KEYS.filter(k => k in fl).map(k => [k, clone(fl[k])])),
    sys: Object.fromEntries(paths.map(p => [p, getProp(a, p) ?? null])),
    items: a.items.map(i => i.id), effects: a.effects.map(e => e.id),
    // cópia completa do que a árvore colocou na ficha: uma evolução apaga e recria esses documentos
    itemDocs: a.items.filter(i => stFlag(i)).map(i => i.toObject()),
    effectDocs: a.effects.filter(e => stFlag(e)).map(e => e.toObject())
  };
}

export class MixUndo {
  undoList() { return clone(getData("gmUndo", { list: [] })?.list ?? []); }

  // Roda fn() e guarda o "antes" dos personagens. Se fn devolver false, nada é guardado.
  async gmRecord(label, actors, fn) {
    if (!this.gm) return fn();
    const list = (actors ?? []).filter(Boolean);
    const antes = list.map(a => snap(a, sysPaths(this.trees)));
    const out = await fn();
    if (out === false || !antes.length) return out;
    const entry = { id: uid(), at: Date.now(), label: String(label ?? ""), actors: antes };
    await setData("gmUndo", { list: [entry, ...this.undoList()].slice(0, MAX) });
    return out;
  }

  async undoEntry(id) {
    const list = this.undoList(), e = list.find(x => x.id === id);
    if (!e) return;
    const names = e.actors.map(x => x.name).join(", ");
    if (!await DialogV2.confirm({ window: { title: loc("ARVORE.Comum.desfazer") }, rejectClose: false,
      content: `<p>${`${loc("ARVORE.Comum.desfazer")} <b>${esc(e.label)}</b>?`}</p><p class="st-c-hint">${loc("ARVORE.Desfazer.voltaAoEstadoDeAntesOQueFoiCriado", { names: esc(names) })}</p>` })) return;
    for (const s of e.actors) {
      const a = game.actors.get(s.id); if (!a) continue;
      const newItems = a.items.filter(i => !s.items.includes(i.id) && stFlag(i)).map(i => i.id);
      const newFx = a.effects.filter(x => !s.effects.includes(x.id) && stFlag(x)).map(x => x.id);
      if (newFx.length) await a.deleteEmbeddedDocuments("ActiveEffect", newFx);
      if (newItems.length) await a.deleteEmbeddedDocuments("Item", newItems);
      // recria o que a ação apagou (mesmo id, para efeitos ligados a itens continuarem certos)
      const lostItems = (s.itemDocs ?? []).filter(d => !a.items.has(d._id));
      if (lostItems.length) await a.createEmbeddedDocuments("Item", lostItems, { keepId: true });
      const lostFx = (s.effectDocs ?? []).filter(d => !a.effects.has(d._id));
      if (lostFx.length) await a.createEmbeddedDocuments("ActiveEffect", lostFx, { keepId: true });
      const cur = a.flags?.[SCOPE] ?? {};
      const del = {}; for (const k of OUR_KEYS) if (k in cur) del[`flags.${SCOPE}.-=${k}`] = null;
      if (Object.keys(del).length) await a.update(del);
      const set = { ...s.sys }; for (const [k, v] of Object.entries(s.flags)) set[`flags.${SCOPE}.${k}`] = v;
      for (const [k, v] of Object.entries(set)) if (v === null) delete set[k];
      if (Object.keys(set).length) await a.update(set);
    }
    await setData("gmUndo", { list: list.filter(x => x.id !== id) });
    invalidateTrees();
    ui.notifications.info(`${loc("ARVORE.Desfazer.desfeito")} ${e.label}`);
    this.render();
  }

  undoHTML() {
    const list = this.undoList();
    if (!list.length) return "";
    const when = at => { const m = Math.round((Date.now() - at) / 60000); return m < 1 ? loc("ARVORE.Desfazer.agora") : m < 60 ? loc("ARVORE.Desfazer.haMinutos", { m }) : new Date(at).toLocaleString(game.i18n?.lang || "pt-BR"); };
    return `<div class="st-c-box st-undo"><h4><i class="fas fa-rotate-left"></i> ${loc("ARVORE.Desfazer.desfazerAcoesDoMestre")}</h4>
      ${list.map(e => `<div class="st-undo-row"><span><b>${esc(e.label)}</b><small>${esc(e.actors.map(x => x.name).join(", "))} · ${when(e.at)}</small></span>
        <button type="button" class="st-c-btn" data-undo="${esc(e.id)}"><i class="fas fa-rotate-left"></i> ${loc("ARVORE.Comum.desfazer")}</button></div>`).join("")}</div>`;
  }
}
