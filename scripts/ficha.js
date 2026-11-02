// ═══════════════════════════════════════════════════════════════════════════
//  Árvore da Mesa — ficha do personagem: botão no cabeçalho e aba "Skill Tree" (dnd5e e Tidy 5e)
// ═══════════════════════════════════════════════════════════════════════════

import { loc } from "./idioma.js";
import {
  CFG, LOG_VERBS, SKILL_BONUS, SKILL_SPENT, ST, canSee, dateLang, esc, featName, getProp, getTrees,
  nodeById, playerSees
} from "./core.js";
import { featureSummary, withRank } from "./itens.js";
import {
  actorLevel, changeLabel, featsOf, isSkill, logOf, milestonesOf, mythicOf, nodeState, reqsOf, resOf,
  skillAvail, skillEarned, trainingOf, treeHasMythic, treeLock, unlockedOf
} from "./regras.js";

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
  if (!trees.length) return `<p class="sts-muted">${loc("ARVORE.Regras.nenhumaSkillTreeAtribuidaAOMestre", { name: esc(a.name) })}</p>`;
  const usesSkill = trees.some(isSkill);
  const reqs = reqsOf(a), train = trainingOf(a);
  const stars = (r, m) => m > 1 ? `<span class="sts-stars">${"★".repeat(r)}${"☆".repeat(Math.max(0, m - r))}</span>` : "";
  const top = `<div class="sts-top">
    ${usesSkill ? `<div class="sts-stat" data-tooltip="${CFG.ptsPerLevel} ${loc("ARVORE.Regras.porNivelAteONivelGanhosGastos", { maxLevel: CFG.maxLevel, a: skillEarned(a), v: Number(getProp(a, SKILL_SPENT)) || 0 })} ${Number(getProp(a, SKILL_BONUS)) || 0}"><b>${skillAvail(a)}</b><small>${loc("ARVORE.Comum.pontosDeHabilidade")}</small></div>` : ""}
    ${trees.some(treeHasMythic) || mythicOf(a) ? `<div class="sts-stat" style="border-color:#e000ff88" data-tooltip="${esc(featsOf(a).slice(-5).map(f => `${f.text} (+${f.pts})`).join(" · ") || loc("ARVORE.Regras.ganhosComGrandesFeitos"))}"><b style="color:#f5b8ff">✦ ${mythicOf(a)}</b><small>${loc("ARVORE.Comum.pontosMiticos")}</small></div>` : ""}
    <div class="sts-stat"><b>${actorLevel(a)}</b><small>${loc("ARVORE.Comum.nivel2")}</small></div>
    <div class="sts-stat"><b>${trees.reduce((s, t) => s + unlockedOf(a, t).length, 0)}</b><small>${loc("ARVORE.Comum.habilidades")}</small></div>
    ${reqs.length ? `<div class="sts-stat"><b>${reqs.length}</b><small>${loc("ARVORE.Regras.pedidoSAoMestre")}</small></div>` : ""}
    ${train.length ? `<div class="sts-stat"><b>${train.length}</b><small>${loc("ARVORE.Comum.emTreino")}</small></div>` : ""}
  </div>`;

  const cards = trees.map(t => {
    const un = unlockedOf(a, t);
    const states = t.nodes.map(n => ({ n, st: nodeState(a, t, n) }));
    const avail = states.filter(x => x.st.canBuy).length;
    const pct = t.nodes.length ? Math.round(un.length / t.nodes.length * 100) : 0;
    const owned = states.filter(x => x.st.rank > 0).map(({ n, st }) => {
      const nr = withRank(n, st.rank);
      const resumo = [...nr.features.map((f, i) => `${featName(n, f, i)}: ${featureSummary(f)}`), ...nr.changes.filter(c => c.key).map(changeLabel)].join(" · ");
      return `<div class="sts-skill" data-st-open="${t.id}" data-st-node="${n.id}" style="--c:${esc(n.color || "#c9a227")}" data-tooltip="${loc("ARVORE.Regras.abrirNaSkillTree")}">
        <img src="${esc(n.img)}"><div class="sts-txt"><b>${esc(n.name)} ${stars(st.rank, st.max)}</b>${resumo ? `<small>${esc(resumo)}</small>` : ""}</div>
        ${st.canBuy ? `<span class="sts-up">${loc("ARVORE.Regras.podeSubir")}</span>` : ""}</div>`;
    }).join("");
    const tr = train.filter(e => e.tree === t.id).map(e => `<div class="sts-line">${loc("ARVORE.Regras.faltamDescansoSLongoS", { esc: esc(nodeById(t, e.node)?.name ?? "?"), left: e.left })}</div>`).join("");
    let extra = "";
    if (!isSkill(t)) extra = `<div class="sts-line">${esc(t.resLabel)}: <b>${resOf(a, t)}</b></div>`;
    return `<div class="sts-card">
      <div class="sts-head"><h3>${esc(t.name)}</h3>
        ${avail ? `<span class="sts-pill green">${avail} ${loc("ARVORE.Regras.disponivelIs")}</span>` : ""}
        <span class="sts-pill">${un.length}/${t.nodes.length}</span>
        <button type="button" class="sts-open" data-st-open="${t.id}"><i class="fas fa-sitemap"></i> ${loc("ARVORE.Comum.abrir")}</button></div>
      <div class="sts-bar"><div style="width:${pct}%"></div></div>
      ${treeLock(a, t) ? `<div class="sts-line">${loc("ARVORE.Regras.bloqueadaLiberadaPor")} ${esc(treeLock(a, t))}</div>` : ""}
      ${extra}${tr}
      ${owned || `<p class="sts-muted">${loc("ARVORE.Regras.nenhumaHabilidadeDesbloqueada")}${avail ? ` ${loc("ARVORE.Comum.cliqueEm")} <b>${loc("ARVORE.Comum.abrir")}</b> ${loc("ARVORE.Regras.paraEscolher")}` : ""}</p>`}
    </div>`;
  }).join("");

  const miles = milestonesOf(a);
  const log = logOf(a).slice(-5).reverse();
  const verbo = LOG_VERBS();
  return `${top}${cards}
    ${miles.length ? `<div class="sts-card"><div class="sts-head"><h3>${loc("ARVORE.Regras.marcos")}</h3></div>${miles.map(m => `<span class="sts-pill blue" style="margin:2px;display:inline-block">${esc(m)}</span>`).join("")}</div>` : ""}
    ${log.length ? `<div class="sts-card"><div class="sts-head"><h3>${loc("ARVORE.Regras.historicoRecente")}</h3></div>${log.map(e => `<div class="sts-line">• ${new Date(e.at).toLocaleDateString(dateLang())} — ${verbo[e.act] ?? e.act} <b>${esc(e.nodeName ?? e.treeName ?? "")}</b>${e.rank > 1 ? ` ${loc("ARVORE.Comum.nivel", { rank: e.rank })}` : ""}</div>`).join("")}</div>` : ""}`;
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
  } catch (e) { console.warn(loc("ARVORE.Regras.skillTreeNaoConseguiRegistrar"), e); return false; }
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
  // a ficha é renderizada várias vezes: o ouvinte da barra de abas entra uma vez só e lê
  // as peças da renderização atual em nav._st (senão acumulava um ouvinte por renderização)
  nav._st = { app, item, body, group, activate };
  if (!nav.dataset.stListener) {
    nav.dataset.stListener = "1";
    nav.addEventListener("click", ev => {
      const cur = nav._st; if (!cur) return;
      const other = ev.target.closest?.("[data-tab]");
      if (!other || other === cur.item || !cur.app._stTab) return;
      cur.activate(false);
      const tab = other.dataset.tab;
      setTimeout(() => {
        if (cur.body.querySelector(":scope > .tab.active")) return;
        other.classList.add("active");
        cur.body.querySelector(`:scope > .tab[data-tab="${tab}"]`)?.classList.add("active");
        if (cur.app.tabGroups) cur.app.tabGroups[other.dataset.group ?? cur.group] = tab;
      }, 0);
    }, true);
  }
  bindSheetPanel(panel, a);
  if (app._stTab) activate(true);
}
