// ═══════════════════════════════════════════════════════════════════════════
//  Árvore da Mesa — Validador e Estatísticas da Skill Tree
// ═══════════════════════════════════════════════════════════════════════════

import { L, isEnglish } from "./i18n.js?v=1.7.10";
import { CFG, esc, isMythic, isSkill, nodeById, parentsOf, rOf, topoNodes, treesOpenedBy, findFeat, extraRes, coinsOn, labelsOf, today, dateText, sharedCopies } from "./core.js?v=1.7.10";
import { DialogV2 } from "./ui-kit.js?v=1.7.10";

// ── problemas de uma árvore: { lvl: "error" | "warn" | "info", text, node? } ──
export function treeProblems(t, trees) {
  const P = [], add = (lvl, text, node = null) => P.push({ lvl, text, node: node?.id ?? null, name: node?.name ?? "" });
  if (!t.nodes.length) { add("info", L("A Skill Tree ainda não tem habilidades.")); return P; }
  const byGroup = new Map(); for (const n of t.nodes) if (n.group) byGroup.set(n.group, [...(byGroup.get(n.group) ?? []), n]);
  const names = new Map(); for (const n of t.nodes) { const k = n.name.trim().toLowerCase(); names.set(k, (names.get(k) ?? 0) + 1); }
  const resIds = new Set(extraRes(t).map(r => r.id));
  const featNames = new Set(trees.flatMap(x => x.feats ?? []).map(f => f.name));
  for (const n of t.nodes) {
    const parents = parentsOf(t, n.id).map(p => nodeById(t, p)).filter(Boolean);
    const children = t.edges.filter(e => e.from === n.id);
    if (t.nodes.length > 1 && !parents.length && !children.length) add("warn", L("Habilidade solta: não está ligada a nenhuma outra."), n);
    if (!n.synergy && !isMythic(n) && !(Number(n.cost) > 0) && !Object.values(n.extra ?? {}).some(v => v > 0) && !Number(n.costGp) && !Number(n.costPp))
      add("info", L("Custa 0: qualquer personagem pega de graça."), n);
    const otherReqs = Number(n.minLevel) || n.reqClasses.length || n.reqRace || n.reqItems.length || n.reqNodes.length || n.milestone || (n.reqAbility && Number(n.reqScore)) || n.reqDate !== null;
    if (n.synergy && !parents.length && !otherReqs) add("warn", L("Sinergia sem requisitos: libera sozinha na hora para todos."), n);
    for (const rn of n.reqNodes ?? []) {
      const rt = trees.find(x => x.id === rn.tree);
      if (!rt || !nodeById(rt, rn.node)) add("error", L("Combo com uma habilidade que não existe mais (árvore ou habilidade apagada)."), n);
    }
    if (Number(n.minLevel) > 20) add("warn", L`Pede nível ${n.minLevel}, acima do nível 20.`, n);
    if (n.reqAbility && Number(n.reqScore) > 30) add("error", L`Pede atributo ${n.reqScore}: impossível no D&D (máximo 30).`, n);
    if (n.prereq !== "any" && parents.length > 1) {
      const seen = new Map();
      for (const p of parents) if (p.group) seen.set(p.group, (seen.get(p.group) ?? 0) + 1);
      for (const [g, k] of seen) if (k > 1) add("error", L`Impossível: pede ${k} habilidades do grupo exclusivo "${g}", mas só dá para escolher uma.`, n);
    }
    if (n.group && parents.some(p => p.group === n.group) && (n.prereq !== "any" || parents.every(p => p.group === n.group)))
      add("error", L`Impossível: depende de outra habilidade do mesmo grupo exclusivo "${n.group}".`, n);
    if ((names.get(n.name.trim().toLowerCase()) ?? 0) > 1) add("warn", L("Nome repetido nesta Skill Tree."), n);
    for (const k of Object.keys(n.extra ?? {})) if (!resIds.has(k)) add("info", L("Tem custo num recurso extra que não existe mais (é ignorado)."), n);
    if (n.milestone && !featNames.has(n.milestone)) add("info", L`Pede o marco "${n.milestone}", que nenhum Grande Feito registra: só o mestre marca à mão.`, n);
    if (n.shared && !sharedCopies(trees, n.shared, n.id).length) add("info", L("Marcada como compartilhada, mas não tem cópia em outra árvore."), n);
    if (n.reqDate !== null && n.reqDate <= today()) add("info", L`A data pedida (${dateText(n.reqDate)}) já passou: o requisito sempre é cumprido.`, n);
  }
  // sobrepostas
  for (let i = 0; i < t.nodes.length; i++) for (let j = i + 1; j < t.nodes.length; j++) {
    const a = t.nodes[i], b = t.nodes[j];
    if (Math.hypot(a.x - b.x, a.y - b.y) < (rOf(a) + rOf(b)) * 0.8) add("warn", L`Por cima de "${b.name}" no mapa.`, a);
  }
  for (const [g, list] of byGroup) if (list.length === 1) add("info", L`Grupo exclusivo "${g}" com uma habilidade só (não exclui nada).`, list[0]);
  // bloqueio da árvore
  if (t.lockKind === "feat" && (!t.lockFeat || !findFeat(t.lockFeat, trees))) add("error", L("Bloqueada por um Grande Feito que não existe mais: nunca abre."));
  if (t.lockKind === "item" && !String(t.lockItem ?? "").trim()) add("warn", L("Bloqueio por item sem nome de item: fica sempre liberada."));
  if (t.lockKind === "class" && !String(t.lockClass ?? "").trim()) add("warn", L("Bloqueio por classe sem classe: fica sempre liberada."));
  if (t.lockKind === "date" && t.lockDate !== null && t.lockDate <= today()) add("info", L("A data de liberação já passou: a árvore já está aberta."));
  for (const f of t.feats ?? []) if (!treesOpenedBy(f.id, trees).length && !trees.some(x => x.nodes.some(n => n.milestone === f.name)))
    add("info", L`O Grande Feito "${f.name}" só dá Pontos Míticos: não libera árvore nem é pedido por habilidade.`);
  if (!t.assigned?.length) add("info", L("Nenhum personagem recebeu esta Skill Tree ainda (use Atribuir)."));
  const order = { error: 0, warn: 1, info: 2 };
  return P.sort((x, y) => order[x.lvl] - order[y.lvl]);
}

// ── estatísticas ──
export function treeStats(t) {
  const nodes = t.nodes, byId = new Map(nodes.map(n => [n.id, n]));
  // grupos exclusivos: conta só a mais barata de cada grupo para "pegar tudo"
  const skip = new Set();
  const groups = new Map(); for (const n of nodes) if (n.group) groups.set(n.group, [...(groups.get(n.group) ?? []), n]);
  for (const list of groups.values()) { const keep = [...list].sort((a, b) => (Number(a.cost) || 0) - (Number(b.cost) || 0))[0]; for (const n of list) if (n !== keep) skip.add(n.id); }
  let main = 0, myth = 0, gp = 0, pp = 0, ranks = 0, bought = 0, train = 0;
  const extras = {};
  for (const n of topoNodes(t)) {
    if (skip.has(n.id) || n.synergy) continue;
    const max = Math.max(1, Number(n.ranks) || 1);
    for (let r = 0; r < max; r++) {
      const c = (Number(n.cost) || 0) + (Number(n.rankStep) || 0) * r + (isMythic(n) ? 0 : (Number(t.costInc) || 0) * bought);
      if (isMythic(n)) myth += c; else main += c;
      gp += Number(n.costGp) || 0; pp += Number(n.costPp) || 0;
      for (const [k, v] of Object.entries(n.extra ?? {})) extras[k] = (extras[k] ?? 0) + (Number(v) || 0);
      bought++; ranks++;
    }
    train += Number(n.trainDays) || 0;
  }
  // caminho mais barato até cada habilidade (custo do 1º nível dela e das anteriores necessárias)
  const memo = new Map();
  const reach = id => {
    if (memo.has(id)) return memo.get(id);
    memo.set(id, new Set([id]));
    const n = byId.get(id), parents = parentsOf(t, id);
    let set = new Set([id]);
    if (parents.length) {
      if (n.prereq === "any") {
        let best = null, bestCost = Infinity;
        for (const p of parents) { const s = reach(p), c = costOf(s); if (c < bestCost) { best = s; bestCost = c; } }
        if (best) for (const x of best) set.add(x);
      } else for (const p of parents) for (const x of reach(p)) set.add(x);
    }
    memo.set(id, set);
    return set;
  };
  const costOf = set => [...set].reduce((s, id) => s + (isMythic(byId.get(id)) ? 0 : Number(byId.get(id)?.cost) || 0), 0);
  const paths = nodes.map(n => { const s = reach(n.id); return { n, cost: costOf(s), steps: s.size, minLevel: Math.max(0, ...[...s].map(id => Number(byId.get(id)?.minLevel) || 0)) }; })
    .sort((a, b) => b.cost - a.cost);
  const perLevel = Number(CFG.ptsPerLevel) || 0;
  const levelFor = pts => perLevel > 0 ? Math.ceil(pts / perLevel) : null;
  return { count: nodes.length, ranks, main, myth, gp, pp, extras, train, paths, skipped: skip.size, levelAll: isSkill(t) ? levelFor(main) : null, maxMinLevel: Math.max(0, ...nodes.map(n => Number(n.minLevel) || 0)) };
}

export class MixTools {
  focusNode(id) {
    const t = this.tree, n = nodeById(t, id); if (!n) return;
    this.sel = id; this.panelOpen = true;
    this.render();
    setTimeout(() => {
      if (!this.view$) return;
      const W = this.view$.clientWidth, H = this.view$.clientHeight, v = this.v;
      v.x = W / 2 - n.x * v.z; v.y = H / 2 - n.y * v.z; this.applyView();
    }, 60);
  }

  async validateDialog() {
    const t = this.tree; if (!t) return;
    const P = treeProblems(t, this.trees);
    const icon = { error: "fa-circle-xmark", warn: "fa-triangle-exclamation", info: "fa-circle-info" };
    const label = { error: L("Erro"), warn: L("Atenção"), info: L("Dica") };
    const counts = ["error", "warn", "info"].map(k => [k, P.filter(p => p.lvl === k).length]);
    await DialogV2.prompt({
      window: { title: L`Verificar — ${t.name}`, icon: "fas fa-stethoscope" }, position: { width: 560 },
      content: `<div class="st-c">
        <div class="st-val-sum">${counts.map(([k, c]) => `<span class="st-val-${k}"><i class="fas ${icon[k]}"></i> <b>${c}</b> ${label[k]}</span>`).join("")}</div>
        ${P.length ? `<div class="st-val-list">${P.map(p => `<div class="st-val st-val-${p.lvl}" ${p.node ? `data-focus="${esc(p.node)}"` : ""}>
          <i class="fas ${icon[p.lvl]}"></i><span>${p.name ? `<b>${esc(p.name)}</b> — ` : ""}${esc(p.text)}</span>${p.node ? `<i class="fas fa-crosshairs st-val-go"></i>` : ""}</div>`).join("")}</div>`
          : `<p class="st-c-lead"><i class="fas fa-circle-check" style="color:var(--st-ok)"></i> ${L("Nenhum problema encontrado.")}</p>`}
        <p class="st-c-hint">${L("Clique num item para ir até a habilidade no mapa.")}</p></div>`,
      ok: { label: L("Fechar") },
      render: (ev, dlg) => dlg.element?.querySelectorAll?.("[data-focus]").forEach(el => el.addEventListener("click", () => { dlg.close(); this.focusNode(el.dataset.focus); })),
      rejectClose: false
    });
  }

  async statsDialog() {
    const t = this.tree; if (!t) return;
    const S = treeStats(t), LB = labelsOf(t);
    const box = (v, label, cls = "") => `<div class="st-stat ${cls}"><b>${v}</b><small>${label}</small></div>`;
    const ex = extraRes(t).filter(r => S.extras[r.id]).map(r => box(S.extras[r.id], esc(r.name)));
    const lvl = S.levelAll === null ? "" : S.levelAll > CFG.maxLevel
      ? `<p class="st-c-hint"><i class="fas fa-triangle-exclamation" style="color:var(--st-warn)"></i> ${(isEnglish() ? `Taking everything costs more than the Skill Points given up to level ${CFG.maxLevel} (${CFG.ptsPerLevel * CFG.maxLevel} points).` : `Pegar tudo custa mais do que os Pontos de Habilidade dão até o nível ${CFG.maxLevel} (${CFG.ptsPerLevel * CFG.maxLevel} pontos).`)}</p>`
      : `<p class="st-c-hint">${(isEnglish() ? `With ${CFG.ptsPerLevel} points per level, everything can be taken from level ${Math.max(S.levelAll, S.maxMinLevel)}.` : `Com ${CFG.ptsPerLevel} pontos por nível, dá para pegar tudo a partir do nível ${Math.max(S.levelAll, S.maxMinLevel)}.`)}</p>`;
    await DialogV2.prompt({
      window: { title: L`Estatísticas — ${t.name}`, icon: "fas fa-chart-simple" }, position: { width: 600 },
      content: `<div class="st-c">
        <div class="st-stats">
          ${box(S.count, L("habilidades"))}${box(S.ranks, L("níveis para comprar"))}
          ${box(S.main, L`${esc(t.resLabel)} para pegar tudo`, "main")}
          ${S.myth ? box(S.myth, L("Pontos Míticos"), "myth") : ""}
          ${coinsOn(t) && S.gp ? box(S.gp, esc(LB.gp)) : ""}${coinsOn(t) && S.pp ? box(S.pp, esc(LB.pp)) : ""}
          ${ex.join("")}
          ${S.train ? box(S.train, L("descansos longos de treino")) : ""}
          ${S.maxMinLevel ? box(S.maxMinLevel, L("maior nível mínimo")) : ""}
        </div>
        ${lvl}
        ${S.skipped ? `<p class="st-c-hint">${L`Escolhas exclusivas: ${S.skipped} habilidade(s) ficam de fora de "pegar tudo" (conta só a mais barata de cada grupo).`}</p>` : ""}
        ${Number(t.costInc) ? `<p class="st-c-hint">${L("Com custo crescente, o total depende da ordem; a conta usa a ordem da árvore.")}</p>` : ""}
        <h4 class="st-stats-h">${L("Caminho mais barato até cada habilidade")}</h4>
        <div class="st-val-list">${S.paths.map(p => `<div class="st-val st-path" data-focus="${esc(p.n.id)}">
          <img src="${esc(p.n.img)}"><span><b>${esc(p.n.name)}</b><small>${L`${p.steps} habilidade(s) no caminho`}${p.minLevel ? L` · nível ${p.minLevel}+` : ""}</small></span>
          <b class="st-path-c">${p.cost}</b></div>`).join("")}</div>
      </div>`,
      ok: { label: L("Fechar") },
      render: (ev, dlg) => dlg.element?.querySelectorAll?.("[data-focus]").forEach(el => el.addEventListener("click", () => { dlg.close(); this.focusNode(el.dataset.focus); })),
      rejectClose: false
    });
  }
}
