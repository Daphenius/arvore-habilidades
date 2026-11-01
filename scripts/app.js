// ═══════════════════════════════════════════════════════════════════════════
//  Árvore da Mesa — janela (ApplicationV2)
//  Módulo Foundry VTT V14, sistema dnd5e 6
// ═══════════════════════════════════════════════════════════════════════════

import { L } from "./i18n.js?v=1.7.10";
import {
  ABILITIES, ACTIVATIONS, ApplicationV2, CFG, CHANGE_TYPES, DAMAGE_TYPES, DEFAULT_TYPE, DRAW_COLORS, DUR_UNITS,
  DialogV2 as DialogBase, FEAT_KINDS, FILTERS, FP, KEY_HINTS, K_FEATS, K_LOG, K_MILES, K_MYTH, K_RANKS, K_REQ,
  K_UNLOCK, MOD, RANK_FIELDS, RECOVERY, SHAPES, SIZES, SKILL_BONUS, SKILL_SPENT, ST, TE, 
  actorLevel, addCharge, addLog, advanceTraining, box, canSee, cancelTraining, catOf, changeLabel,
  chat, checkSynergies, clone, coin, countItem, doRefund, doUnlock, esc, featName, featsOf, featureDefaults,
  featureRules, featureSummary, fixOrphans, getData, getProp, gmIds, grant, handleRequest, invalidateTrees, isMythic,
  isSkill, isTyping, loadCatalog, loadTemplates, loadTrees, logOf, milestonesOf, mythicOf, newNode,
  newTree, nodeById, nodeState, normalizeNode, normalizeTree, opts, orphanScan, ownersOf, parentsOf, payLabel, payOf,
  pickRank, playerCharacters, rOf, rankEntry, rankOf, reqChecklist,
  refundDependents, reqsOf, resOf, featDefaults, findFeat, hasFeat, trimFeats, treeLock, treesOpenedBy, playerSees, resPresets, presetOf, resPathOf, THEMES, applyTheme, extraRes, resPath, resFromPath, syncPrimary, nodeExtras, extraName, LABEL_DEFAULTS, labelsOf, coinsOn, RES_KINDS, sumExtras, addExtras, addRes, addCoins, coinWorth, resUpdate, revoke, saveCfg, saveFile, saveTemplates, saveTrees, sendRequest,
  setData, skillAvail, skillEarned, stFlag, systemType, topoNodes, trainingOf, treeHasMythic, uid, unlockedOf,
  whisperOwners, withRank, wouldCycle,
  K_TEMP, tempsOf, tempOf, tempText, grantTemp, endTemp, today, dateText, calApi, syncShared, sharedCopies
} from "./core.js?v=1.7.10";
import { SaveQueue } from "./persistence.js?v=1.7.10";
import { validateTrees, remapTree } from "./validation.js?v=1.7.10";
import { actorOperation } from "./operations.js?v=1.7.10";
import { DialogV2, charCard, whoSub, whoTools, wireWho } from "./ui-kit.js?v=1.7.10";
import { MixCanvas } from "./app-canvas.js?v=1.7.10";
import { MixPanel } from "./app-panel.js?v=1.7.10";
import { MixEditor } from "./app-editor.js?v=1.7.10";
import { MixDialogs } from "./app-dialogs.js?v=1.7.10";
import { MixIo } from "./app-io.js?v=1.7.10";
import { MixActions } from "./app-actions.js?v=1.7.10";
import { MixUndo } from "./app-undo.js?v=1.7.10";
import { MixTools } from "./app-tools.js?v=1.7.10";
import { MixWelcome } from "./app-welcome.js?v=1.7.10";



// ───────────────────────── Aplicação ─────────────────────────
export const APP_VERSION = "1.7.10";

export class ArvoreHabilidades extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "st-arvore",
    classes: ["st-app"],
    window: { title: "ARVORE.Title", icon: "fas fa-sitemap", resizable: true },
    position: {
      width: Math.min(1600, Math.max(900, window.innerWidth - 80)),
      height: Math.min(1000, Math.max(600, window.innerHeight - 80))
    }
  };

  constructor(options) {
    super(options);
    this.trees = loadTrees();
    this._persisted = JSON.stringify(getData("trees", { list: [] }));
    this._writer = new SaveQueue(async trees => {
      if (this._conflict || JSON.stringify(getData("trees", { list: [] })) !== this._persisted) {
        this._conflict = true;
        throw new Error(L("As árvores foram alteradas por outra janela. Exporte suas edições antes de recarregar."));
      }
      await saveTrees(trees);
      this._persisted = JSON.stringify(getData("trees", { list: [] }));
      // sem árvores, o "ready" só devolve pontos se souber que ficou limpeza pendente
      if (!trees.length && getData("pendingCleanup", false) !== true) await setData("pendingCleanup", true);
      invalidateTrees();
    }, error => {
      console.error(L("Árvore da Mesa | gravação"), error);
      ui.notifications.error(L`Não foi possível salvar: ${error.message}`, { permanent: true });
    });
    this.mode = "play";
    this.sel = null;
    this.multi = new Set();
    this.linking = false;
    this.linkFrom = null;
    this.views = {};
    this.tool = "select";
    this.drawColor = "#e8c14a";
    this.drawWidth = 4;
    this.drawFill = false;
    this.panelOpen = true;
    this.secOpen = new Set(["look", "cost", "req", "feat-0"]);
    this.planning = false;
    this.plan = [];
    this.refunding = false;
    this.refundSel = new Set();
    this.search = "";
    this.category = "fantasy";
    this.lastTree = {};
    this.filter = "";
    this.undoStack = [];
    this.redoStack = [];
    this._lastSnap = JSON.stringify(this.trees);
    this.catalog = ST.catalog ?? null;
    if (game.user.isGM && !this.catalog) loadCatalog().then(c => { ST.catalog = c; this.catalog = c; if (this.rendered && this.edit) this.render(); });
    this.actorId = this.defaultActor()?.id ?? null;

    const watch = d => { if (d?.id === this.actorId || d?.parent?.id === this.actorId) this.render(); };
    this._hooks = [
      ["updateActor", Hooks.on("updateActor", watch)],
      ["createItem", Hooks.on("createItem", watch)],
      ["deleteItem", Hooks.on("deleteItem", watch)],
      ["createActiveEffect", Hooks.on("createActiveEffect", watch)],
      ["deleteActiveEffect", Hooks.on("deleteActiveEffect", watch)],
      ["updateSetting", Hooks.on("updateSetting", (s, c, o, u) => {
        if (s?.key === `${MOD}.sections`) { this.render(); return; }
        if (s?.key !== `${MOD}.trees`) return;
        // A gravação desta janela atualiza a referência após a confirmação.
        if (u === game.user.id && this._writer.running) return;
        if (this._writer.dirty) {
          this._conflict = true;
          ui.notifications.warn(L("Outra janela alterou as árvores. Suas edições foram preservadas para exportação."));
          return;
        }
        this._persisted = JSON.stringify(getData("trees", { list: [] }));
        this.trees = loadTrees(); this._lastSnap = JSON.stringify(this.trees);
        this.undoStack = []; this.redoStack = []; this.render();
      })],
      ["controlToken", Hooks.on("controlToken", (tok, on) => {
        const a = tok?.actor;
        if (!on || !a || a.id === this.actorId) return;
        if (!this.gm && !a.isOwner) return;
        this.actorId = a.id; this.sel = null; this.plan = []; this.render();
      })]
    ];
  }

  sections() {
    const saved = getData("sections", { list: [{ id: "fantasy", name: L("Fantasia") }] }).list;
    const list = Array.isArray(saved) ? clone(saved) : [{ id: "fantasy", name: L("Fantasia") }];
    // nome padrão da primeira seção segue o idioma (se o mestre não o renomeou)
    for (const c of list) if (c?.id === "fantasy" && ["Fantasia", "Fantasy"].includes(c.name)) c.name = L("Fantasia");
    for (const t of this.trees) {
      const id = catOf(t);
      if (!list.some(c => c.id === id)) list.push({ id, name: this._goneSections?.[id] ?? (id === "sequences" ? L("Sequências") : id === "fantasy" ? L("Fantasia") : L("Seção importada")) });
    }
    return list;
  }


  // ── getters ──
  // escolher uma árvore também escolhe a seção dela
  get treeId() { return this._treeId ?? null; }
  set treeId(v) {
    this._treeId = v ?? null;
    const t = v && this.trees?.find(x => x.id === v);
    if (t) this.category = catOf(t);
  }
  get gm() { return game.user.isGM; }
  get edit() { return this.gm && this.mode === "edit"; }
  visibleTrees() { return this.gm ? this.trees : this.trees.filter(t => playerSees(t, this.actorDoc)); }
  get tree() { return this.visibleTrees().find(t => t.id === this.treeId) ?? null; }
  get actorDoc() { return game.actors.get(this.actorId) ?? canvas?.tokens?.controlled?.find(tk => tk.actor?.id === this.actorId)?.actor ?? null; }
  get selNode() { return this.tree ? nodeById(this.tree, this.sel) : null; }
  get v() {
    const id = this.treeId ?? "_";
    return (this.views[id] ??= { x: 0, y: 0, z: 1, fresh: true });
  }
  defaultActor() {
    const tok = canvas?.tokens?.controlled?.[0]?.actor;
    if (this.gm) return tok ?? null;
    const owned = game.actors.filter(a => a.isOwner);
    return (tok?.isOwner ? tok : null) ?? game.user.character
      ?? owned.find(a => this.trees.some(t => canSee(t, a.id))) ?? owned[0] ?? null;
  }

  // ── salvar / desfazer ──
  save({ undoable = true } = {}) {
    if (!this.gm) return;
    // habilidade compartilhada: o que mudou nela vai para as cópias das outras árvores
    const sn = this.selNode; if (sn?.shared) syncShared(this.trees, sn);
    const snap = JSON.stringify(this.trees);
    if (undoable && this._lastSnap && this._lastSnap !== snap) {
      this.undoStack.push(this._lastSnap);
      if (this.undoStack.length > 60) this.undoStack.shift();
      this.redoStack = [];
    }
    this._lastSnap = snap;
    clearTimeout(this._saveT);
    this._writer.stage(this.trees);
    this._saveT = setTimeout(() => { this._writer.flush().catch(() => {}); }, 300);
  }
  restoreSnap(snap) {
    this.trees = JSON.parse(snap).map(normalizeTree);
    this._lastSnap = snap;
    if (this.sel && !this.selNode) this.sel = null;
    this.multi.clear();
    clearTimeout(this._saveT);
    this._writer.stage(this.trees);
    this._writer.flush().catch(() => {});
    this.render();
  }
  undo() {
    if (!this.undoStack.length) return ui.notifications.info(L("Nada para desfazer."));
    this.redoStack.push(this._lastSnap);
    this.restoreSnap(this.undoStack.pop());
  }
  redo() {
    if (!this.redoStack.length) return ui.notifications.info(L("Nada para refazer."));
    this.undoStack.push(this._lastSnap);
    this.restoreSnap(this.redoStack.pop());
  }

  pendingReqs(t) {
    const out = [];
    for (const a of game.actors) for (const r of reqsOf(a)) if (!t || r.tree === t.id) out.push({ a, r });
    return out;
  }

  // ── habilidade no mapa ──
  nodeHTML(t, n, a) {
    const st = this.edit ? { key: "edit", reasons: [], rank: 0, max: Math.max(1, Number(n.ranks) || 1), cost: Number(n.cost) || 0 } : nodeState(a, t, n);
    const hidden = !this.edit && !this.gm && n.secret && st.rank === 0 && st.key === "locked";
    const r = rOf(n);
    const cls = ["st-node", `shape-${esc(n.shape || "circle")}`, hidden ? "st-hidden" : `st-${st.key}`]; if (n.shared && this.edit) cls.push("st-shared");
    if (n.synergy) cls.push("st-synergy");
    if (n.id === this.sel) cls.push("st-sel");
    if (this.multi.has(n.id)) cls.push("st-multi");
    if (n.id === this.linkFrom) cls.push("st-linkfrom");
    const planIdx = this.planning ? this.plan.indexOf(n.id) : -1;
    if (planIdx >= 0) cls.push("st-planned");
    const rf = this.refunding ? this._refundCalc : null;
    if (rf?.direct.has(n.id)) cls.push("st-refsel");
    else if (rf?.extra.has(n.id)) cls.push("st-refdep");
    const tags = [st.key, ...n.features.map(f => f.kind), n.features.some(f => f.transform) ? "transform" : "", n.synergy ? "synergy" : ""].filter(Boolean).join(" ");
    const tip = hidden ? L("??? — habilidade secreta") : [
      n.name, st.max > 1 ? L`Nível ${st.rank}/${st.max}` : "",
      st.rank < st.max && !n.synergy ? (st.cost ? `${st.cost} ${t.resLabel}` : L("Grátis")) : "",
      ...st.reasons
    ].filter(Boolean).join("<br>");
    const badge = (c, txt, extra = "") => `<span class="st-badge-n ${c}" ${extra}>${txt}</span>`;
    const showCost = !hidden && !n.synergy && st.rank < st.max && st.cost && st.key !== "training";
    const times = planIdx >= 0 ? this.plan.filter(x => x === n.id).length : 0;
    return `<div class="${cls.join(" ")}" data-id="${esc(n.id)}" data-name="${esc(hidden ? "???" : n.name.toLowerCase())}" data-tags="${esc(tags)}" style="left:${n.x - r}px;top:${n.y - r}px;width:${2 * r}px;height:${2 * r}px;--c:${esc(n.color || "#c9a227")}" data-tooltip="${esc(tip)}">
      <div class="st-shape"><img src="${esc(hidden ? "icons/svg/padlock.svg" : (n.img || "icons/svg/book.svg"))}" draggable="false"></div>
      ${showCost ? badge(isMythic(n) ? "st-cost st-myth-b" : "st-cost", isMythic(n) ? `✦${st.cost}` : st.cost) : ""}
      ${!hidden && st.max > 1 ? badge("st-rank", `${st.rank}/${st.max}`) : ""}
      ${!hidden && n.synergy ? badge("st-syn-b", "⚡") : ""}
      ${st.key === "training" ? badge("st-train-b", `⏳${st.training.left}`) : !hidden && Number(n.trainDays) && st.rank < st.max && !(st.canBuy && st.rank > 0) ? badge("st-traind-b", `<i class="fas fa-dumbbell"></i>${n.trainDays}`) : ""}
      ${a && tempOf(a, t, n) ? badge("st-temp-b", `<i class="fas fa-hourglass-end"></i>`) : ""}
      ${!this.edit && st.rank > 0 && st.canBuy && !this.planning ? badge("st-up", "+") : ""}
      ${this.gm && n.secret ? badge("st-eye", "👁", L('data-tooltip="Secreta para os jogadores"')) : ""}
      ${rf && (rf.direct.has(n.id) || rf.extra.has(n.id)) ? badge("st-plan-b st-ref-b", rf.direct.has(n.id) ? "↺" : "↺ dep.") : ""}
      ${planIdx >= 0 ? badge("st-plan-b", `${planIdx + 1}${times > 1 ? ` ×${times}` : ""}`) : ""}
      <label style="top:${2 * r + 4}px">${esc(hidden ? "???" : n.name)}</label></div>`;
  }

  async _renderHTML() {
    const allTrees = this.visibleTrees();
    const sections = this.sections().filter(c => this.gm || allTrees.some(t => catOf(t) === c.id));
    const nCat = c => allTrees.filter(t => catOf(t) === c).length;
    if (!sections.some(c => c.id === this.category)) this.category = sections[0]?.id ?? "fantasy";
    const trees = allTrees.filter(t => catOf(t) === this.category);
    if (!trees.find(t => t.id === this.treeId)) this.treeId = this.lastTree[this.category] && trees.some(t => t.id === this.lastTree[this.category]) ? this.lastTree[this.category] : (trees[0]?.id ?? null);
    const t = this.tree, a = this.actorDoc;
    if (this.planning && (!a || !t || this.edit)) { this.planning = false; this.plan = []; }
    if (this.refunding && (!a || !t || this.edit || !(this.gm || t.refundPlayer))) { this.refunding = false; this.refundSel.clear(); }
    this._refundCalc = this.refunding ? this.refundCalc(a, t) : null;

    const treeOpts = trees.map(x => `<option value="${esc(x.id)}" ${x.id === this.treeId ? "selected" : ""}>${treeLock(a, x, this.trees) ? "🔒 " : ""}${esc(x.name)}${this.gm ? (a ? (canSee(x, a.id) ? " ✔" : L(" (não atribuída)")) : L` (${x.assigned?.length ?? 0} pers.)`) : ""}</option>`).join("");
    const nodesHTML = t ? t.nodes.map(n => this.nodeHTML(t, n, a)).join("") : "";
    const b = (act, label, extra = "") => `<button type="button" data-act="${act}" ${extra}>${label}</button>`;
    const grp = (label, html) => html.trim() ? `<span class="st-grp">${label ? `<em>${label}</em>` : ""}${html}</span>` : "";
    const pend = this.gm ? this.pendingReqs().length : 0;

    const resSel = t && this.gm && t.rules !== "custom" ? L`<select data-sel="res" data-tooltip="O que é gasto para desbloquear nesta Skill Tree">${(() => {
      const pres = resPresets().filter(p => p.value !== "@custom"), known = !!presetOf(t.resPath);
      return pres.map(p => {
        if (p.value === "@custom") return `<option value="@custom" ${known ? "" : "selected"}>${known ? L("Campo próprio…") : L`Próprio: ${esc(t.resLabel)}`}</option>`;
        return L`<option value="${esc(p.value)}" ${p.value === t.resPath ? "selected" : ""}>Pontos: ${esc(p.label)}</option>`;
      }).join("");
    })()}</select>` : "";

    let pill = "";
    if (t && a) {
      {
        const tip = isSkill(t) ? L`data-tooltip="${CFG.ptsPerLevel} por nível (até o nível ${CFG.maxLevel}): ${skillEarned(a)} ganhos · ${Number(getProp(a, SKILL_SPENT)) || 0} gastos · ajuste do mestre ${Number(getProp(a, SKILL_BONUS)) || 0}"` : "";
        pill = L`<span class="st-res" ${tip}>${esc(t.resLabel)}: <b>${resOf(a, t)}</b> · Nível ${actorLevel(a)}</span>`
          + (treeHasMythic(t) ? L`<span class="st-res st-myth" data-tooltip="Pontos Míticos: ganhos com Grandes Feitos">✦ Míticos: <b>${mythicOf(a)}</b></span>` : "");
      }
    }
    const chip = `<button type="button" class="st-chip" data-act="pickActor" data-tooltip="${this.gm ? L("Escolher o personagem (ou selecione um token)") : L("Seu personagem")}">
      ${a ? `<img src="${esc(a.img)}" width="22" height="22" style="width:22px;height:22px;object-fit:cover;border-radius:50%;border:none">${esc(a.name)}` : `<i class="fas fa-user"></i> ${this.gm ? L("Escolher personagem") : L("Sem personagem")}`}</button>`;

    const bar = `
      <header class="st-bar">
        ${grp("", `<div class="st-catwrap">
            <div class="st-cats">
              ${sections.map(c => `<button type="button" data-cat="${esc(c.id)}" class="${this.category === c.id ? "on" : ""}">${esc(c.name)} <span>${nCat(c.id)}</span></button>`).join("")}
              ${this.gm ? b("addSection", "+", L('class="st-icon" data-tooltip="Criar seção"')) + b("renameSection", '<i class="fas fa-pen"></i>', L('class="st-icon" data-tooltip="Renomear seção atual"')) + (sections.length > 1 ? b("delSection", '<i class="fas fa-trash"></i>', L('class="st-icon st-trash" data-tooltip="Excluir seção atual"')) : "") : ""}
            </div>
            <select data-sel="tree" data-tooltip="Skill Tree">${treeOpts || L('<option>— nenhuma Skill Tree —</option>')}</select>
          </div>${chip}`)}
        ${grp("", `${resSel}${pill}${t && a && this.gm ? b("givePts", `±`, L`class="st-icon" data-tooltip="Dar ou tirar ${esc(t.resLabel)} de ${esc(a.name)}"`) : ""}`)}
        ${t && a && !this.edit && (this.gm || t.refundPlayer) && unlockedOf(a, t).length ? b("refundMode", L`<i class="fas fa-rotate-left"></i> Reembolsar várias`, L`class="st-refbtn ${this.refunding ? "on" : ""}" data-tooltip="Escolha várias habilidades e reembolse todas de uma vez"`) : ""}
        ${t && a && !this.edit ? b("plan", L`<i class="fas fa-route"></i> Planejar`, L`class="st-plan ${this.planning ? "on" : ""}" data-tooltip="Monte um caminho e veja o custo antes de gastar"`) : ""}
        ${t && a && this.gm && (treeHasMythic(t) || t.feats.length) ? b("feat", L('<i class="fas fa-star"></i> Grande Feito'), L('class="st-feat" data-tooltip="Conceder Pontos Míticos por um Grande Feito"')) : ""}
        ${this.gm && pend ? b("mesa", L`<i class="fas fa-bell"></i> Pedidos<span class="st-badge">${pend}</span>`, L('class="st-alert" data-tooltip="Pedidos de desbloqueio esperando você"')) : ""}
        <span class="st-spacer"></span>
        ${grp("", L`<input type="search" data-search placeholder="Buscar habilidade…" value="${esc(this.search)}"><select data-filter style="min-width:110px">${opts(FILTERS, this.filter)}</select>`)}
        ${this.gm && ST.session ? L`<span class="st-auto" data-tooltip="Automações ativas nesta sessão"><i class="fas fa-bolt"></i></span>` : ""}
        ${grp("", `${b("help", '<i class="fas fa-circle-question"></i>', L('class="st-icon" data-tooltip="Guia rápido"'))}${b("theme", '<i class="fas fa-palette"></i>', L('class="st-icon" data-tooltip="Tema de cores"'))}${b("center", '<i class="fas fa-expand"></i>', L('class="st-icon" data-tooltip="Centralizar a árvore"'))}${b("panel", `<i class="fas fa-table-columns"></i>`, `class="st-icon ${this.panelOpen ? "" : "on"}" data-tooltip="${this.panelOpen ? L("Esconder painel lateral (mais espaço)") : L("Mostrar painel lateral")}"`)}`)}
      </header>
      ${this.gm ? `<header class="st-bar st-bar2">
        ${grp("Skill Tree", [
          t ? b("treeCfg", L('<i class="fas fa-gear"></i> Esta Skill Tree'), L('data-tooltip="Nome, seção, custos, regras e visual desta Skill Tree"')) : "",
          b("generalCfg", L('<i class="fas fa-sliders"></i> Gerais'), L('data-tooltip="Configurações de todas as Skill Trees, backup e Zerar Árvores"')),
          b("addTree", '<i class="fas fa-plus"></i> Skill Tree', L('data-tooltip="Criar árvore nesta seção"')),
          t ? b("validate", '<i class="fas fa-stethoscope"></i>', L('class="st-icon" data-tooltip="Verificar problemas nesta Skill Tree"')) : "",
          t ? b("stats", '<i class="fas fa-chart-simple"></i>', L('class="st-icon" data-tooltip="Estatísticas: custo total, caminhos e nível necessário"')) : "",
          t ? b("dupTree", '<i class="fas fa-clone"></i>', L('class="st-icon" data-tooltip="Duplicar esta Skill Tree"')) : "",
          t ? b("export", '<i class="fas fa-download"></i>', L('class="st-icon" data-tooltip="Exportar pacote (árvore + itens usados)"')) : "",
          b("import", '<i class="fas fa-upload"></i>', L('class="st-icon" data-tooltip="Importar (JSON ou pacote)"')),
          t ? b("delTree", '<i class="fas fa-trash"></i>', L('class="st-icon st-trash" data-tooltip="Excluir esta Skill Tree"')) : ""
        ].join(""))}
        ${this.edit ? `<span class="st-sep"></span>${grp(L("Habilidades"), [
          b("addNode", L('<i class="fas fa-plus"></i> Nova'), L('data-tooltip="Criar uma habilidade no centro"')),
          b("link", L('<i class="fas fa-link"></i> Ligar'), L`${this.linking ? 'class="on"' : ""} data-tooltip="Clique na anterior e depois na seguinte (ou Shift+clique)"`),
          b("templates", L('<i class="fas fa-book-bookmark"></i> Modelos'), L('data-tooltip="Inserir um modelo salvo"'))
        ].join(""))}
        ${grp("", [
          b("undo", '<i class="fas fa-rotate-left"></i>', L`class="st-icon" data-tooltip="Desfazer (Ctrl+Z)" ${this.undoStack.length ? "" : "disabled"}`),
          b("redo", '<i class="fas fa-rotate-right"></i>', L`class="st-icon" data-tooltip="Refazer (Ctrl+Y)" ${this.redoStack.length ? "" : "disabled"}`)
        ].join(""))}` : ""}
        <span class="st-spacer"></span>
        ${this.gm ? grp("", `${b("mesa", L('<i class="fas fa-users"></i> Mesa'), L('data-tooltip="Visão geral, recompensas, treino e NPCs"'))}${t ? b("assign", L('<i class="fas fa-user-plus"></i> Atribuir'), L('data-tooltip="Escolher quais personagens recebem esta Skill Tree"')) : ""}`) : ""}
        ${this.gm ? b("mode", this.mode === "edit" ? L('<i class="fas fa-play"></i> Modo Jogo') : L('<i class="fas fa-pen"></i> Editar'), `class="st-mode ${this.mode === "edit" ? "on" : ""}" data-tooltip="${this.mode === "edit" ? L("Voltar a jogar") : L("Editar as habilidades no mapa")}"`) : ""}
      </header>` : ""}`;

    const hint = this.refunding ? L("Modo reembolso: clique nas habilidades desbloqueadas que quer devolver · clique de novo para tirar · Esc sai")
      : this.planning ? L("Modo planejamento: clique nas habilidades na ordem em que quer comprar · clique de novo para tirar")
      : this.edit
        ? (this.tool !== "select" ? L("Botão direito arrasta o mapa · roda do mouse = zoom · Esc volta para a seta")
          : L("Arraste habilidades · Shift+clique liga · Ctrl+clique seleciona várias · Ctrl+C/V copia e cola · Ctrl+Z desfaz · Del exclui"))
        : L("Arraste o fundo para mover · roda do mouse = zoom · clique numa habilidade para detalhes");
    const catName = "Skill Tree";
    const empty = !t ? `<div class="st-empty">${this.gm
      ? L("Crie uma Skill Tree em Editar → + Skill Tree ou importe um JSON.")
      : (a ? L`Nenhum ${catName} atribuído a este personagem ainda.` : L("Selecione o seu token ou peça ao mestre para vincular um personagem a você."))}</div>`
      : (!t.nodes.length ? `<div class="st-empty">${this.edit ? L("Clique em “Nova”, use um modelo ou solte um Item aqui.") : L("Skill Tree vazia.")}</div>` : "");
    const bg = t?.bg ? `<div class="st-bgimg" style="background-image:url('${esc(t.bg)}');opacity:${Number(t.bgOpacity) || 0.35}"></div>` : "";

    return `<div class="st-root ${this.mode} ${this.edit ? `tool-${this.tool}` : ""} ${this.planning ? "planning" : ""} ${this.refunding ? "refunding" : ""}">
        ${bar}
        <div class="st-body ${this.panelOpen ? "" : "nopanel"}">
          <div class="st-view">
            ${bg}
            <div class="st-stage"><svg class="st-draw">${t ? this.drawingsSVG(t) : ""}</svg><svg class="st-lines"></svg>${nodesHTML}</div>
            ${this.edit && t ? this.toolboxHTML() : ""}
            ${t && treeLock(a, t, this.trees) ? L`<div class="st-lockban"><i class="fas fa-lock"></i> ${a ? L("Skill Tree bloqueada") : L("Bloqueada até")} — liberada por <b>${esc(treeLock(a, t, this.trees))}</b></div>` : ""}
            ${empty}<div class="st-hint">${hint}</div>
          </div>
          <aside class="st-panel">${await this.panelHTML()}</aside>
        </div>
      </div>`;
  }

  // mantém o scroll do painel ao editar
  _replaceHTML(result, content) {
    const oldPanel = content.querySelector(".st-panel");
    const top = oldPanel?.scrollTop ?? 0;
    this.endPointerInteraction();
    content.innerHTML = result;
    const key = `${this.mode}|${this.treeId}|${this.sel}|${this.planning}`;
    const panel = content.querySelector(".st-panel");
    if (panel && key === this._panelKey) panel.scrollTop = top;
    this._panelKey = key;
    this.activate(content);
    this.maybeWelcome?.();
  }

  applyFilter() {
    const q = this.search.trim().toLowerCase(), f = this.filter;
    this.stage$?.querySelectorAll(".st-node").forEach(el => {
      const ok = (!q || el.dataset.name.includes(q)) && (!f || el.dataset.tags.split(" ").includes(f));
      el.classList.toggle("st-dim", !ok);
    });
  }


  // Grava e já devolve pontos e limpa as fichas do que veio de árvores/habilidades excluídas
  async cleanSheets() {
    if (!this.gm) return [];
    try { await this.flushSave(); } catch { return []; }
    try {
      const rep = await fixOrphans(null, { trees: this.trees });
      if (rep.length) ui.notifications.info(L`Pontos devolvidos e fichas limpas para ${rep.length} personagem(ns).`);
      return rep;
    } catch (error) {
      console.error("Árvore da Mesa | limpeza", error);
      ui.notifications.error(L("Falha ao corrigir pontos. A janela foi mantida aberta para conferir a ficha."));
      return [];
    }
  }

  async flushSave() {
    clearTimeout(this._saveT);
    await this._writer.flush();
  }

  async close(options = {}) {
    this.endPointerInteraction();
    if (this.gm) {
      try { await this.flushSave(); }
      catch { return this; } // Permite exportar e tentar novamente sem descartar a edição.
      try {
        const rep = await fixOrphans(null, { trees: loadTrees() });
        if (getData("pendingCleanup", false) === true) await setData("pendingCleanup", false);
        if (rep.length) ui.notifications.info(L`Pontos devolvidos para ${rep.length} personagem(ns).`);
      } catch (error) {
        console.error(L("Árvore da Mesa | limpeza de órfãos"), error);
        ui.notifications.error(L("Falha ao corrigir pontos. A janela foi mantida aberta para conferir a ficha."));
        return this;
      }
    }
    return super.close(options);
  }

  _onClose(options) {
    super._onClose(options);
    this.endPointerInteraction();
    clearTimeout(this._saveT);
    for (const [h, id] of this._hooks) Hooks.off(h, id);
    if (this._keyBound) document.removeEventListener("keydown", this._keyBound);
    if (ST.app === this) ST.app = null;
  }
}

// métodos de cada parte da janela (arquivos app-*.js)
for (const Mix of [MixUndo, MixTools, MixWelcome, MixCanvas, MixPanel, MixEditor, MixDialogs, MixIo, MixActions]) {
  for (const k of Object.getOwnPropertyNames(Mix.prototype)) {
    if (k === "constructor") continue;
    Object.defineProperty(ArvoreHabilidades.prototype, k, Object.getOwnPropertyDescriptor(Mix.prototype, k));
  }
}
