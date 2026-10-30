// ═══════════════════════════════════════════════════════════════════════════
//  Árvore da Mesa — janelas: seções, Mesa, recompensas, NPC, personagens, configurações, diário, Grandes Feitos
//  Métodos da janela ArvoreHabilidades (copiados para a classe em app.js)
// ═══════════════════════════════════════════════════════════════════════════

import { L } from "./i18n.js?v=1.7.3";
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
  K_TEMP, tempsOf, tempOf, tempText, grantTemp, endTemp, today, dateText, calApi, syncShared, sharedCopies, SHARED_SKIP, resDesc, addResDesc, payBack
} from "./core.js?v=1.7.3";
import { SaveQueue } from "./persistence.js?v=1.7.3";
import { validateTrees, remapTree } from "./validation.js?v=1.7.3";
import { actorOperation } from "./operations.js?v=1.7.3";
import { DialogV2, charCard, whoSub, whoTools, wireWho, datePicker, readDate, wireDate } from "./ui-kit.js?v=1.7.3";

export class MixDialogs {
  // Exclui a seção atual. Árvores dentro dela são movidas para outra seção ou excluídas junto.
  async deleteSectionDialog() {
    if (!this.gm) return;
    const list = this.sections(), current = list.find(c => c.id === this.category);
    if (!current) return;
    if (list.length <= 1) return ui.notifications.warn(L("Esta é a única seção. Crie outra antes de excluí-la."));
    const inside = this.trees.filter(t => catOf(t) === current.id);
    const others = list.filter(c => c.id !== current.id);
    let what = "empty", target = others[0].id;
    if (inside.length) {
      const res = await DialogV2.prompt({
        window: { title: L`Excluir seção — ${current.name}` }, position: { width: 480 },
        content: L`<p>A seção <b>${esc(current.name)}</b> tem <b>${inside.length}</b> Skill Tree(s):</p>
          <p style="font-size:12px">${esc(inside.map(t => t.name).join(", "))}</p>
          <div class="form-group"><label><input type="radio" name="what" value="move" checked> Mover as árvores para</label>
            <div class="form-fields"><select name="target">${others.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}</select></div></div>
          <div class="form-group"><label><input type="radio" name="what" value="delete"> Excluir as árvores junto com a seção</label></div>`,
        ok: { label: L("Continuar"), callback: (e, b) => ({ what: b.form.elements.what.value, target: b.form.elements.target.value }) },
        rejectClose: false
      });
      if (!res) return;
      ({ what, target } = res);
    }
    const tName = others.find(c => c.id === target)?.name ?? "";
    const detail = what === "delete"
      ? `<p>${L`As <b>${inside.length}</b> Skill Tree(s) dela também serão excluídas.`}</p><p class="st-c-hint">${L("Agora mesmo, os personagens recebem de volta o que gastaram nelas e tudo o que elas colocaram nas fichas é removido.")}</p>`
      : what === "move" ? L`<p>As <b>${inside.length}</b> Skill Tree(s) dela irão para <b>${esc(tName)}</b>, sem perder progresso nem atribuições.</p>` : "";
    if (!await DialogV2.confirm({ window: { title: L("Tem certeza?") }, content: L`<p>Excluir a seção <b>${esc(current.name)}</b>?</p>${detail}`, rejectClose: false })) return;
    if (what === "move") for (const t of inside) t.section = target;
    else if (what === "delete") this.trees = this.trees.filter(t => catOf(t) !== current.id);
    (this._goneSections ??= {})[current.id] = current.name; // se o Ctrl+Z trouxer árvores de volta, a seção reaparece com o nome certo
    if (inside.length) { this.treeId = null; this.sel = null; this.multi.clear(); this.save(); }
    await setData("sections", { list: list.filter(c => c.id !== current.id) });
    this.category = what === "move" ? target : others[0].id;
    this.render();
    if (what === "delete" && inside.length) await this.cleanSheets();
    ui.notifications.info(L`Seção "${current.name}" excluída.`);
  }

  // Apaga todas as Skill Trees do mundo, devolve os pontos e limpa as fichas na hora.
  async resetAllDialog() {
    if (!this.gm) return;
    const n = this.trees.length;
    const res = await DialogV2.wait({
      window: { title: L("Zerar Árvores — tem certeza?") }, position: { width: 480 },
      content: L`<p><b>Tem certeza?</b> Isto exclui <b>todas as ${n} Skill Tree(s)</b> do mundo.</p>
        <p style="font-size:12px">Os personagens recebem de volta os pontos gastos e as habilidades vindas das árvores saem das fichas. <b>Não pode ser desfeito</b> — exporte antes as árvores que quiser guardar.</p>
        <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="backup" ${n ? "checked" : "disabled"}> Baixar backup de todas antes de apagar</label>
        <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="sections" checked> Também apagar as seções criadas (fica só Fantasia)</label>`,
      buttons: [
        { action: "yes", label: L("Sim, zerar tudo"), icon: "fas fa-trash", callback: (e, b) => ({ sections: b.form.elements.sections.checked, backup: b.form.elements.backup.checked }) },
        { action: "no", label: L("Cancelar"), default: true }
      ],
      rejectClose: false
    });
    if (!res || typeof res !== "object") return;
    if (res.backup && n) {
      try { await this.exportAll(); }
      catch (error) { console.error(L("Árvore da Mesa | backup"), error); return ui.notifications.error(L("Não foi possível gerar o backup. Nada foi apagado."), { permanent: true }); }
    }
    this.trees = []; this.treeId = null; this.sel = null; this.multi.clear();
    this.planning = false; this.plan = []; this.refunding = false; this.refundSel.clear();
    this.linking = false; this.linkFrom = null;
    this.undoStack = []; this.redoStack = []; this._lastSnap = JSON.stringify(this.trees);
    this._writer.stage(this.trees);
    try { await this.flushSave(); } catch { return; } // o erro já é avisado pela fila de gravação
    if (res.sections) { await setData("sections", { list: [{ id: "fantasy", name: L("Fantasia") }] }); this._goneSections = {}; }
    this.category = "fantasy";
    try {
      const rep = await fixOrphans(null, { trees: [] });
      await setData("pendingCleanup", false);
      if (rep.length) ui.notifications.info(L`Pontos devolvidos para ${rep.length} personagem(ns).`);
    } catch (error) {
      console.error(L("Árvore da Mesa | zerar árvores"), error);
      ui.notifications.error(L("As árvores foram apagadas, mas houve falha ao devolver pontos. Use Mesa → Corrigir pontos."), { permanent: true });
    }
    ui.notifications.info(L("Todas as Skill Trees foram apagadas."));
    this.render();
  }

  async sectionDialog(rename = false) {
    if (!this.gm) return;
    const list = this.sections(), current = list.find(c => c.id === this.category);
    const name = await DialogV2.prompt({
      window: { title: rename ? L("Renomear seção") : L("Nova seção") },
      content: L`<label>Nome da seção<input name="sectionName" maxlength="80" value="${esc(rename ? current?.name : "")}" autofocus></label>`,
      ok: { label: L("Salvar"), callback: (e,b) => b.form.elements.sectionName.value.trim() }, rejectClose: false
    });
    if (!name) return;
    if (rename && current) current.name = name;
    else { const id = uid(); list.push({id,name}); this.category = id; this.treeId = null; }
    await setData("sections", {list});
    this.render();
  }

  async templatesDialog() {
    const t = this.tree; if (!t) return;
    const tpls = loadTemplates();
    const others = this.trees.filter(x => x.id !== t.id && x.nodes.length);
    if (!tpls.length && !others.length) return ui.notifications.info(L("Nenhum modelo salvo. Selecione uma habilidade e clique em “Salvar modelo”."));
    const sum = nd => esc((normalizeNode(clone(nd)).features.map(featureSummary).join(" | ")) || (nd.changes?.length ? L("Efeito passivo") : ""));
    const rows = tpls.map((tp, i) => `<div class="st-who st-tpl" data-row="${i}" data-search="${esc(tp.name.toLowerCase())}">
      <img src="${esc(tp.img)}" alt=""><span class="st-who-t"><b>${esc(tp.name)}</b><small>${sum(tp)}</small></span>
      <button type="button" data-ins="${i}" class="st-c-btn" style="flex:0 0 auto;padding:0 12px">${L("Inserir")}</button>
      <button type="button" data-deltpl="${i}" class="st-c-ico" style="color:var(--st-bad)"><i class="fas fa-trash"></i></button></div>`).join("");
    const here = new Set(t.nodes.map(x => x.shared).filter(Boolean));
    const linkRows = others.map(x => `<div class="st-tpl-grp">${esc(x.name)}</div>` + x.nodes.map(nd => {
      const already = nd.shared && here.has(nd.shared);
      return `<div class="st-who st-tpl" data-search="${esc(nd.name.toLowerCase())}">
        <img src="${esc(nd.img)}" alt=""><span class="st-who-t"><b>${esc(nd.name)}${nd.shared ? ` <i class="fas fa-link" title="${L("Compartilhada")}"></i>` : ""}</b><small>${sum(nd)}</small></span>
        ${already ? `<span class="st-tag ok">${L("já está aqui")}</span>` : `<button type="button" data-link="${esc(x.id)}:${esc(nd.id)}" class="st-c-btn" style="flex:0 0 auto;padding:0 12px"><i class="fas fa-link"></i> ${L("Inserir vinculada")}</button>`}</div>`;
    }).join("")).join("");
    await DialogV2.prompt({
      window: { title: L("Modelos de habilidade"), icon: "fas fa-book-bookmark" }, position: { width: 560 },
      content: `<div class="st-c">
        <nav class="st-c-tabs"><button type="button" data-tab="tpl" class="on"><i class="fas fa-book-bookmark"></i> ${L("Modelos salvos")}</button>
          <button type="button" data-tab="link"><i class="fas fa-link"></i> ${L("De outras árvores")}</button></nav>
        <div class="st-who-tools"><input type="search" data-whofind placeholder="${L("Buscar habilidade…")}"></div>
        <section data-panel="tpl"><div class="st-who-grid" style="grid-template-columns:1fr">${rows || `<p class="st-c-hint">${L("Nenhum modelo salvo. Selecione uma habilidade e clique em “Salvar modelo”.")}</p>`}</div></section>
        <section data-panel="link" hidden><p class="st-c-hint">${L("Uma habilidade vinculada é a mesma em todas as árvores: editar uma muda todas. A posição no mapa, as ligações e o progresso de cada árvore continuam separados.")}</p>
          <div class="st-who-grid" style="grid-template-columns:1fr">${linkRows || `<p class="st-c-hint">${L("Nenhuma outra Skill Tree com habilidades.")}</p>`}</div></section>
      </div>`,
      ok: { label: L("Fechar") },
      render: (ev, dlg) => {
        const el = dlg.element; if (!el?.querySelector) return;
        wireWho(el);
        el.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", e => {
          e.preventDefault();
          el.querySelectorAll("[data-tab]").forEach(x => x.classList.toggle("on", x === b));
          el.querySelectorAll("[data-panel]").forEach(p => { p.hidden = p.dataset.panel !== b.dataset.tab; });
        }));
        el.querySelectorAll("[data-ins]").forEach(b => b.addEventListener("click", e => {
          e.preventDefault();
          const tp = tpls[Number(b.dataset.ins)], c = this.viewCenter();
          const n = normalizeNode({ ...clone(tp), id: uid(), x: this.snapV(c.x), y: this.snapV(c.y), shared: "" });
          this.tree.nodes.push(n); this.sel = n.id; this.save(); this.render();
          ui.notifications.info(L`Modelo "${tp.name}" inserido.`);
        }));
        el.querySelectorAll("[data-link]").forEach(b => b.addEventListener("click", e => {
          e.preventDefault();
          const [tid, nid] = b.dataset.link.split(":"); const src = nodeById(this.trees.find(x => x.id === tid), nid); if (!src) return;
          src.shared ||= uid();
          const c = this.viewCenter();
          const n = normalizeNode({ ...clone(src), id: uid(), x: this.snapV(c.x), y: this.snapV(c.y), reqNodes: [], group: "", shared: src.shared });
          this.tree.nodes.push(n); this.sel = n.id; this.save(); this.render();
          b.replaceWith(Object.assign(document.createElement("span"), { className: "st-tag ok", textContent: L("já está aqui") }));
          ui.notifications.info(L`"${src.name}" inserida e vinculada.`);
        }));
        el.querySelectorAll("[data-deltpl]").forEach(b => b.addEventListener("click", async e => {
          e.preventDefault();
          const atual = loadTemplates(); atual.splice(Number(b.dataset.deltpl), 1);
          await saveTemplates(atual);
          b.closest("[data-row]")?.remove();
        }));
      },
      rejectClose: false
    });
  }

  // ── Mesa (visão geral) ──
  async mesaDialog() {
    const chars = playerCharacters().filter(a => this.trees.some(t => t.assigned.includes(a.id)) || reqsOf(a).length || trainingOf(a).length);
    const card = a => {
      const trees = this.trees.filter(t => t.assigned.includes(a.id)).map(t => {
        const pct = t.nodes.length ? Math.round(unlockedOf(a, t).length / t.nodes.length * 100) : 0;
        return `<div class="st-mesa-tree"><span>${esc(t.name)}</span><div class="st-mesa-bar"><i style="width:${pct}%"></i></div><small>${unlockedOf(a, t).length}/${t.nodes.length}</small></div>`;
      }).join("");
      const req = reqsOf(a).length, tr = trainingOf(a).length, last = logOf(a).at(-1);
      return L`<div class="st-mesa-card">
        <div class="st-mesa-head"><img src="${esc(a.img)}"><div><b>${esc(a.name)}</b><small>${whoSub(a)}</small></div>
          <button type="button" data-pick="${a.id}" class="st-c-btn"><i class="fas fa-arrow-right"></i> Abrir</button></div>
        <div class="st-mesa-stats"><span><b>${skillAvail(a)}</b> Pontos de Hab.</span>${mythicOf(a) ? L`<span class="myth"><b>✦ ${mythicOf(a)}</b> míticos</span>` : ""}
          ${req ? L`<span class="warn"><i class="fas fa-bell"></i> ${req} pedido(s)</span>` : ""}${tr ? L`<span><i class="fas fa-hourglass-half"></i> ${tr} em treino</span>` : ""}</div>
        ${trees || `<div class="st-c-hint">—</div>`}
        ${last ? `<div class="st-c-hint"><i class="fas fa-clock-rotate-left"></i> ${esc(last.nodeName ?? "")} · ${new Date(last.at).toLocaleDateString(game.i18n?.lang || "pt-BR")}</div>` : ""}
      </div>`;
    };
    const act = (k, icon, label, tip = "") => `<button type="button" data-mesa="${k}" class="st-mesa-act" ${tip ? `data-tooltip="${tip}"` : ""}><i class="fas ${icon}"></i><span>${label}</span></button>`;
    const reqs = this.reqListHTML(null);
    await DialogV2.prompt({
      window: { title: L("Mesa — visão geral"), icon: "fas fa-users" }, position: { width: 900 },
      content: `<div class="st-c">
        <div class="st-mesa-acts">
          ${act("reward", "fa-gift", L("Recompensa em grupo"))}${act("train", "fa-forward", L("Passar 1 dia de treino (todos)"))}
          ${act("npc", "fa-skull", L("Aplicar Skill Tree em NPC"))}${act("feat", "fa-star", L("Grande Feito"))}
          ${act("journal", "fa-scroll", L("Diário da sessão"))}${act("fix", "fa-screwdriver-wrench", L("Corrigir pontos"), L("Devolve os pontos de habilidades e Skill Trees que foram excluídas e tira da ficha o que veio delas"))}
        </div>
        ${reqs ? `<div class="st-c-box st-mesa-reqs">${reqs}</div>` : ""}
        ${this.undoHTML()}
        ${chars.length ? `<div class="st-mesa-grid">${chars.map(card).join("")}</div>` : L("<p class='st-c-hint'>Nenhum personagem com Skill Tree atribuída ainda. Use “Atribuir”.</p>")}
      </div>`,
      ok: { label: L("Fechar") },
      render: (ev, dlg) => {
        const el = dlg.element;
        el.querySelectorAll("[data-pick]").forEach(b => b.addEventListener("click", e => {
          e.preventDefault();
          this.actorId = b.dataset.pick; this.sel = null; this.plan = [];
          const first = this.trees.find(t => t.assigned.includes(this.actorId));
          if (first && !canSee(this.tree ?? {}, this.actorId)) { this.treeId = first.id; this.category = catOf(first); }
          this.render();
          dlg.close();
        }));
        el.querySelectorAll("[data-undo]").forEach(b => b.addEventListener("click", async e => { e.preventDefault(); dlg.close(); await this.undoEntry(b.dataset.undo); }));
        el.querySelectorAll("[data-reqact]").forEach(b => b.addEventListener("click", e => {
          e.preventDefault(); b.disabled = true;
          handleRequest(b.dataset.actor, b.dataset.req, b.dataset.reqact === "approve").then(() => b.closest(".st-req")?.remove());
        }));
        el.querySelectorAll("[data-mesa]").forEach(b => b.addEventListener("click", async e => {
          e.preventDefault();
          dlg.close();
          if (b.dataset.mesa === "reward") this.rewardDialog();
          else if (b.dataset.mesa === "npc") this.npcDialog();
          else if (b.dataset.mesa === "feat") this.featDialog([]);
          else if (b.dataset.mesa === "journal") this.journalDialog();
          else if (b.dataset.mesa === "fix") this.fixPoints();
          else {
            const list = game.actors.filter(a => trainingOf(a).length);
            if (!list.length) return ui.notifications.info(L("Ninguém está treinando."));
            for (const a of list) await advanceTraining(a, 1);
            ui.notifications.info(L`Treino avançado para ${list.length} personagem(ns).`);
          }
        }));
      }
    });
  }

  async rewardDialog() {
    const chars = playerCharacters();
    const onScene = new Set(canvas?.scene?.tokens?.map?.(tk => tk.actorId) ?? []);
    const t = this.tree;
    const tipos = [
      { value: "@skill", label: L`Pontos de Habilidade (bônus)` }, { value: "mythic", label: L("✦ Pontos Míticos") }, { value: "xp", label: "XP" },
      { value: "gp", label: L("Peças de Ouro") }, { value: "pp", label: L("Peças de Platina") },
      // recursos próprios da Skill Tree aberta (Personalizado)
      ...(t?.rules === "custom" ? t.resources.map((r, i) => ({ r, i })).filter(({ r }) => r.kind === "counter" || r.kind === "field").map(({ r, i }) => ({ value: `res:${r.id}`, label: `${r.name} (${t.name})`, path: i === 0 ? resPathOf(t) : resPath(t, r) })) : [])
    ];
    const res = await DialogV2.prompt({
      window: { title: L("Recompensa em grupo"), icon: "fas fa-gift" }, position: { width: 560 },
      content: `<div class="st-c">
        <div class="st-c-two">
          <div class="st-c-row"><label>${L("Quantidade")}</label><div class="st-c-f"><input type="number" name="qtd" value="5"></div></div>
          <div class="st-c-row"><label>${L("Tipo")}</label><div class="st-c-f"><select name="tipo">${opts(tipos, "@skill")}</select></div></div>
        </div>
        <div class="st-c-row"><label>${L("Motivo (opcional)")}</label><div class="st-c-f"><input name="motivo" placeholder="${L("ex.: Derrotaram o Hordak")}"></div></div>
        ${whoTools(chars.length > 6)}
        <div class="st-who-grid">${chars.map(a => charCard(a, { checked: onScene.has(a.id), sub: whoSub(a) })).join("")}</div>
      </div>`,
      render: (ev, dlg) => { if (dlg.element?.querySelector) wireWho(dlg.element); },
      ok: { label: L("Dar recompensa"), callback: (e, btn) => {
        const f = btn.form.elements;
        return { qtd: Number(f.qtd.value) || 0, tipo: f.tipo.value, motivo: f.motivo.value.trim(), ids: chars.filter(a => f[`a-${a.id}`]?.checked).map(a => a.id) };
      } }
    });
    if (!res?.qtd || !res.ids.length) return;
    const tipoNome = { "@skill": L("Pontos de Habilidade"), mythic: L("Pontos Míticos"), xp: "XP", gp: "PO", pp: "PL" }[res.tipo] ?? tipos.find(x => x.value === res.tipo)?.label ?? res.tipo;
    const own = tipos.find(x => x.value === res.tipo && x.path);
    await this.gmRecord(L`Recompensa: ${res.qtd} ${tipoNome}`, res.ids.map(id => game.actors.get(id)), async () => {
    for (const id of res.ids) {
      const a = game.actors.get(id);
      await a.update({ [K_LOG]: addLog(a, { act: "reward", nodeName: `${res.qtd} ${tipoNome}${res.motivo ? ` — ${res.motivo}` : ""}` }) });
      if (res.tipo === "@skill") await a.update({ [SKILL_BONUS]: (Number(getProp(a, SKILL_BONUS)) || 0) + res.qtd });
      else if (res.tipo === "mythic") await a.update({ [K_MYTH]: mythicOf(a) + res.qtd, [K_FEATS]: trimFeats([...featsOf(a), { at: Date.now(), text: res.motivo || L("Recompensa"), pts: res.qtd }]) });
      else if (res.tipo === "xp") await a.update({ "system.details.xp.value": (Number(a.system?.details?.xp?.value) || 0) + res.qtd });
      else if (res.tipo === "gp" || res.tipo === "pp") await a.update({ [`system.currency.${res.tipo}`]: coin(a, res.tipo) + res.qtd });
      else if (own) await a.update({ [own.path]: Math.max(0, (Number(getProp(a, own.path)) || 0) + res.qtd) });
    }
    });
    const nomes = res.ids.map(id => game.actors.get(id)?.name).join(", ");
    const tipoTxt = tipos.find(x => x.value === res.tipo)?.label ?? res.tipo;
    ChatMessage.create({ speaker: { alias: L("Recompensa") }, content: box(L`🎁 <b>${esc(nomes)}</b> receberam <b>${res.qtd} ${esc(tipoTxt)}</b>${res.motivo ? `<br><i>${esc(res.motivo)}</i>` : ""}`, "#5fbf6a") });
  }

  async npcDialog() {
    const t = this.tree;
    if (!t) return ui.notifications.warn(L("Escolha uma Skill Tree primeiro."));
    const sel = (canvas?.tokens?.controlled ?? []).map(tk => tk.actor).filter(Boolean);
    const npcs = game.actors.filter(a => a.type === "npc").sort((x, y) => x.name.localeCompare(y.name));
    const res = await DialogV2.prompt({
      window: { title: L`Aplicar "${t.name}" em NPC`, icon: "fas fa-skull" }, position: { width: 480 },
      content: `<div class="st-c">
        <p class="st-c-lead">${L("Concede as habilidades")} <b>${L("de graça e sem requisitos")}</b>${L(", na ordem da árvore.")}</p>
        <div class="st-c-row"><label>${L("Alvo")}</label><div class="st-c-f"><select name="alvo">
          ${sel.length ? `<option value="@sel">${L("Tokens selecionados (")}${sel.length}): ${esc(sel.map(a => a.name).join(", "))}</option>` : ""}
          ${npcs.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join("")}</select></div></div>
        <div class="st-c-row"><label>${L("Até o nível mínimo")}</label><div class="st-c-f"><input type="number" name="lvl" placeholder="${L("vazio = todas")}"></div></div>
        <label class="st-c-tog"><input type="checkbox" name="max" checked><span class="st-c-sw"></span><span><b>${L("Níveis (ranks) no máximo")}</b></span></label>
        ${[...new Set(t.nodes.map(n => n.group).filter(Boolean))].map((g, i) => `<div class="st-c-row"><label>${esc(g)}</label><div class="st-c-f"><select name="grp${i}" data-grp="${esc(g)}">
          ${t.nodes.filter(n => n.group === g).map(n => `<option value="${esc(n.id)}">${esc(n.name)}</option>`).join("")}<option value="">${L("— nenhum —")}</option></select></div></div>`).join("")}
      </div>`,
      ok: { label: L("Aplicar"), callback: (e, btn) => {
        const f = btn.form.elements, pick = {};
        btn.form.querySelectorAll("[data-grp]").forEach(s2 => { pick[s2.dataset.grp] = s2.value; });
        return { alvo: f.alvo.value, lvl: Number(f.lvl.value) || 0, max: f.max.checked, pick };
      } }
    });
    if (!res?.alvo) return;
    const alvos = res.alvo === "@sel" ? sel : [game.actors.get(res.alvo)].filter(Boolean);
    await this.gmRecord(L`NPC: ${t.name}`, alvos, async () => {
    for (const a of alvos) {
      let count = 0;
      for (const n of topoNodes(t)) {
        if (n.synergy) continue;
        if (res.lvl && Number(n.minLevel) > res.lvl) continue;
        const un = unlockedOf(a, t);
        if (n.group && t.nodes.some(o => o.id !== n.id && o.group === n.group && un.includes(o.id))) continue;
        if (n.group && res.pick && n.group in res.pick && res.pick[n.group] !== n.id) continue;
        const parents = parentsOf(t, n.id);
        if (parents.length && !(n.prereq === "any" ? parents.some(p => unlockedOf(a, t).includes(p)) : parents.every(p => unlockedOf(a, t).includes(p)))) continue;
        const max = res.max ? Math.max(1, Number(n.ranks) || 1) : 1;
        while (rankOf(a, t, n) < max) { if (!await doUnlock(a, t, n, { free: true, quiet: true })) break; count++; }
      }
      await checkSynergies(a, t, true);
      ChatMessage.create({ whisper: gmIds(), speaker: { alias: "Skill Tree" }, content: box(L`🧟 <b>${esc(a.name)}</b> recebeu ${count} habilidade(s)/nível(is) de <b>${esc(t.name)}</b>.`) });
    }
    });
  }

  async pickActor() {
    const list = this.gm ? playerCharacters() : game.actors.filter(a => a.isOwner);
    if (!this.gm && list.length <= 1) return ui.notifications.info(list.length ? L("Este é o seu personagem.") : L("Você não tem personagem. Peça ao mestre."));
    if (!list.length) return ui.notifications.warn(L("Nenhum personagem encontrado."));
    const t = this.tree;
    const card = a => {
      const trees = this.trees.filter(x => canSee(x, a.id)).length, req = reqsOf(a).length, tr = trainingOf(a).length;
      const note = [req ? L`<span class="st-tag warn"><i class="fas fa-bell"></i> ${req}</span>` : "", tr ? L`<span class="st-tag"><i class="fas fa-hourglass-half"></i> ${tr}</span>` : "",
        t && !canSee(t, a.id) && this.gm ? L`<span class="st-tag mute">fora desta árvore</span>` : ""].join("");
      return charCard(a, { radio: true, name: "who", checked: a.id === this.actorId, sub: `${whoSub(a)} · ${trees} Skill Tree(s)`, note });
    };
    let picked = null;
    await DialogV2.prompt({
      window: { title: L("Escolher personagem"), icon: "fas fa-user" }, position: { width: 560 },
      content: `<div class="st-c">
        ${list.length > 6 ? `<div class="st-who-tools">${L`<input type="search" data-whofind placeholder="Buscar personagem…">`}</div>` : ""}
        <div class="st-who-grid">${list.map(card).join("")}</div>
        ${this.gm ? L`<button type="button" class="st-c-btn" data-openmesa><i class="fas fa-users"></i> Abrir a Mesa (visão geral, recompensas, NPCs)</button>` : ""}
      </div>`,
      render: (ev, dlg) => {
        const el = dlg.element; if (!el?.querySelector) return;
        wireWho(el);
        el.querySelectorAll('[name="who"]').forEach(r => r.addEventListener("change", () => { picked = r.value; dlg.close(); }));
        el.querySelector("[data-openmesa]")?.addEventListener("click", e => { e.preventDefault(); dlg.close(); this.mesaDialog(); });
      },
      ok: { label: L("Usar"), callback: (e, btn) => { picked ??= btn.form.querySelector('[name="who"]:checked')?.value ?? null; return picked; } },
      rejectClose: false
    });
    if (!picked || picked === this.actorId) return;
    this.actorId = picked; this.sel = null; this.plan = [];
    const first = this.trees.find(x => canSee(x, picked));
    if (first && !canSee(this.tree ?? {}, picked)) { this.treeId = first.id; this.category = catOf(first); }
    this.render();
  }

  // ── configurações ──
  // Janela da Skill Tree aberta: só o que vale para ela. As opções de todas as árvores ficam em generalConfig().
  async treeConfig() {
    const t = this.tree; if (!t || !this.gm) return;
    const pres = resPresets().filter(p => p.value !== "@custom");
    const isPre = !!presetOf(t.resPath);
    const rules = t.rules === "custom" ? "custom" : "dnd";
    const kindOpts = (cur, primary) => [["counter", L("Contador próprio da árvore")], ["field", L("Campo da ficha")], ["xp", L("XP do personagem")], ...(primary ? [["skill", L("Pontos de Habilidade (automático)")], ["coins", L("Ouro (aceita Platina)")]] : [])]
      .map(([v, l]) => `<option value="${v}" ${cur === v ? "selected" : ""}>${l}</option>`).join("");
    const resRow = (r, primary) => L`<div class="st-c-res" data-resrow data-id="${esc(r.id)}">
      <span class="st-c-badge">${primary ? L("Principal") : "Extra"}</span>
      <input data-k="name" value="${esc(r.name)}" placeholder="Nome (ex.: Pontos de Ki)">
      <select data-k="kind">${kindOpts(r.kind, primary)}</select>
      <input data-k="path" value="${esc(r.path)}" placeholder="system.resources.primary.value" ${r.kind === "field" ? "" : "hidden"}>
      ${primary ? "" : L`<button type="button" class="st-c-ico" data-delres data-tooltip="Remover"><i class="fas fa-xmark"></i></button>`}</div>`;
    const resources = t.rules === "custom" && t.resources?.length ? t.resources : [resFromPath(isPre ? t.resPath : (t.resPath || "@tree"), t.resLabel)];
    const featOpts = this.trees.filter(x => x.feats.length).map(x => `<optgroup label="${esc(x.name)}">${x.feats.map(f => `<option value="${esc(f.id)}" ${t.lockFeat === f.id ? "selected" : ""}>${esc(f.name)}</option>`).join("")}</optgroup>`).join("");
    const row = (label, html, hint = "") => `<div class="st-c-row"><label>${label}</label><div class="st-c-f">${html}</div>${hint ? `<p class="st-c-hint">${hint}</p>` : ""}</div>`;
    const tog = (name, label, on, hint = "") => `<label class="st-c-tog"><input type="checkbox" name="${name}" ${on ? "checked" : ""}><span class="st-c-sw"></span><span><b>${label}</b>${hint ? `<small>${hint}</small>` : ""}</span></label>`;
    const resOpts = (cur, extra = "") => pres.map(p => `<option value="${esc(p.value)}" data-label="${esc(p.label)}" ${p.value === cur ? "selected" : ""}>${esc(p.name)}</option>`).join("") + extra;
    const data = await DialogV2.prompt({
      window: { title: `Skill Tree — ${t.name}`, icon: "fas fa-sitemap" }, position: { width: 560 },
      classes: ["st-cfg-dialog"],
      content: L`<div class="st-c">
        <nav class="st-c-tabs">
          <button type="button" data-tab="geral" class="on"><i class="fas fa-sitemap"></i> Geral</button>
          <button type="button" data-tab="regras"><i class="fas fa-coins"></i> Custos e regras</button>
          <button type="button" data-tab="visual"><i class="fas fa-palette"></i> Visual</button>
        </nav>

        <section data-panel="geral">
          ${row(L("Nome"), `<input name="name" value="${esc(t.name)}">`)}
          ${row(L("Seção"), `<select name="section">${this.sections().map(c => `<option value="${esc(c.id)}" ${catOf(t) === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>`)}
          ${row(L("Descrição curta"), L`<input name="desc" value="${esc(t.desc)}" placeholder="Aparece no painel lateral">`)}
          <div class="st-c-box">
            ${tog("refundPlayer", L("Jogador pode reembolsar"), t.refundPlayer, L("Ele mesmo devolve habilidades e recebe os pontos."))}
            ${tog("approval", L("Exigir aprovação do mestre"), t.approval, L("A compra vira um pedido que você aprova."))}
            ${row(L("% devolvido no reembolso"), `<input type="number" name="refundPct" min="0" max="100" value="${Number(t.refundPct ?? 100)}">`)}
          </div>
          <div class="st-c-box">
            <h4><i class="fas fa-lock"></i> Disponível</h4>
            ${row(L("Liberada"), `<select name="lockKind">${opts([{ value: "", label: L("Sempre") }, { value: "feat", label: L("Depois de um Grande Feito") }, { value: "item", label: L("Quando o personagem tiver um item") }, { value: "level", label: L("Quando o personagem chegar a um nível") }, { value: "class", label: L("Quando o personagem tiver uma classe") }, { value: "date", label: L("Numa data do calendário") }], t.lockKind)}</select>`)}
            <div data-lock="feat">${row(L("Grande Feito"), featOpts ? `<select name="lockFeat">${featOpts}</select>` : L`<select name="lockFeat" disabled><option value="">— nenhum criado ainda —</option></select>`, featOpts ? L("Ao conceder este feito, a árvore se abre para o personagem.") : L("Crie Grandes Feitos no painel de qualquer Skill Tree (modo Editar)."))}</div>
            <div data-lock="item">${row(L("Nome do item"), L`<input name="lockItem" value="${esc(t.lockItem)}" placeholder="ex.: Tomo do Arquimago">`, L("Basta ter um item com este nome no inventário."))}</div>
            <div data-lock="level">${row(L("Nível do personagem"), `<input type="number" name="lockLevel" min="1" value="${Number(t.lockLevel) || 5}">`)}</div>
            <div data-lock="class"><div class="st-c-two">${row(L("Classe"), `<input name="lockClass" list="st-cls-list" value="${esc(t.lockClass)}" placeholder="${L("ex.: Mago")}">`)}${row(L("Nível mínimo na classe"), `<input type="number" name="lockClassLevel" min="0" value="${Number(t.lockClassLevel) || 0}">`, L("0 = qualquer"))}</div>
              <datalist id="st-cls-list">${(this.catalog?.classes ?? []).map(c => `<option value="${esc(c.name)}">`).join("")}</datalist></div>
            <div data-lock="date">${row(L("Liberada a partir de"), datePicker("lockDate", t.lockDate ?? today() + 7), calApi() ? L("Data do Calendário da Mesa.") : L("Sem o Calendário da Mesa, conta em dias do mundo do Foundry."))}</div>
            <div data-lock="any">${tog("lockHide", L("Esconder dos jogadores enquanto bloqueada"), t.lockHide, L("Desligado: o jogador vê a árvore com um cadeado."))}</div>
          </div>
        </section>

        <section data-panel="regras" hidden>
          <div class="st-c-cards">
            <label class="st-c-card"><input type="radio" name="rules" value="dnd" ${rules === "dnd" ? "checked" : ""}>
              <i class="fas fa-dice-d20"></i><b>D&amp;D 5e</b><small>Gasta Pontos de Habilidade, XP ou Ouro.</small></label>
            <label class="st-c-card"><input type="radio" name="rules" value="custom" ${rules === "custom" ? "checked" : ""}>
              <i class="fas fa-wand-magic-sparkles"></i><b>Personalizado</b><small>Você cria os recursos e dá nome a cada campo de custo.</small></label>
          </div>

          <div data-rules="dnd">
            ${row(L("Pontos gastos"), `<select name="resDnd">${resOpts(isPre && rules === "dnd" ? t.resPath : "@skill")}</select>`)}
            <p class="st-c-name" data-name></p>
          </div>

          <div data-rules="custom">
            <div class="st-c-box">
              <h4><i class="fas fa-coins"></i> Recursos gastos</h4>
              <p class="st-c-hint">O primeiro é o <b>principal</b> (o custo normal da habilidade). Os outros viram campos extras de custo no editor de cada habilidade.</p>
              <div data-reslist>${resources.map((r, i) => resRow(r, i === 0)).join("")}</div>
              <button type="button" class="st-c-btn" data-addres><i class="fas fa-plus"></i> Adicionar recurso</button>
            </div>
            <div class="st-c-box">
              <h4><i class="fas fa-pen-to-square"></i> Nomes dos campos de custo</h4>
              <p class="st-c-hint">Como cada campo aparece no editor da habilidade. Vazio = nome padrão.</p>
              <div class="st-c-two">
                ${Object.entries(LABEL_DEFAULTS()).map(([k, d]) => row(esc(d), `<input name="lbl-${k}" value="${esc(t.labels?.[k] ?? "")}" placeholder="${esc(d)}">`)).join("")}
              </div>
              ${tog("useCoins", L("Usar custos em moedas (ouro e platina)"), t.useCoins !== false, L("Desligado: os campos de ouro e platina somem do editor."))}
            </div>
          </div>

          <div data-costinc>${row(L("Custo crescente"), `<input type="number" name="costInc" min="0" value="${Number(t.costInc) || 0}">`, L("Cada habilidade já comprada soma este valor ao custo das próximas."))}</div>
        </section>

        <section data-panel="visual" hidden>
          ${row(L("Ligações"), `<select name="linkStyle">${opts([{ value: "curve", label: L("Curvas animadas") }, { value: "straight", label: L("Retas") }], t.linkStyle)}</select>`)}
          ${row(L("Grade ao arrastar (px)"), `<input type="number" name="snap" min="1" value="${Number(t.snap) || 10}">`)}
          ${row(L("Imagem de fundo"), L`<input name="bg" value="${esc(t.bg)}" placeholder="vazio = sem fundo"><button type="button" data-fp="bg" class="st-c-ico"><i class="fas fa-file-image"></i></button>`)}
          ${row(L("Opacidade do fundo"), `<input type="range" name="bgOpacity" min="0.05" max="1" step="0.05" value="${Number(t.bgOpacity) || 0.35}">`)}
          ${row(L("Som ao desbloquear"), L`<input name="sound" value="${esc(t.sound)}" placeholder="vazio = som padrão · none = sem som"><button type="button" data-fp="sound" class="st-c-ico"><i class="fas fa-music"></i></button>`)}
        </section>
      </div>`,
      render: (ev, dlg) => {
        const el = dlg.element;
        if (!el?.querySelector) return;
        const q = s => el.querySelector(s), all = s => el.querySelectorAll(s);
        wireDate(el);
        all("[data-tab]").forEach(b => b.addEventListener("click", e => {
          e.preventDefault();
          all("[data-tab]").forEach(x => x.classList.toggle("on", x === b));
          all("[data-panel]").forEach(p => { p.hidden = p.dataset.panel !== b.dataset.tab; });
        }));
        const sync = () => {
          const rules = q('[name="rules"]:checked')?.value ?? "dnd";
          all("[data-rules]").forEach(d => { d.hidden = d.dataset.rules !== rules; });
          const label = q('[name="resDnd"]').selectedOptions[0]?.dataset.label;
          q("[data-name]").innerHTML = label ? L`<i class="fas fa-tag"></i> Nome dos pontos: <b>${esc(label)}</b> <small>(automático)</small>` : "";
          const lk = q('[name="lockKind"]').value;
          all("[data-lock]").forEach(d => { d.hidden = d.dataset.lock === "any" ? !lk : d.dataset.lock !== lk; });
        };
        all('[name="rules"], [name="resDnd"], [name="lockKind"]').forEach(x => x.addEventListener("change", sync));
        sync();
        // lista de recursos: tipo "Campo da ficha" mostra o campo; remover e adicionar linhas
        const list = q("[data-reslist]");
        const wire = rowEl => {
          const kind = rowEl.querySelector('[data-k="kind"]'), path = rowEl.querySelector('[data-k="path"]');
          kind.addEventListener("change", () => { path.hidden = kind.value !== "field"; });
          rowEl.querySelector("[data-delres]")?.addEventListener("click", e => { e.preventDefault(); rowEl.remove(); });
        };
        list.querySelectorAll("[data-resrow]").forEach(wire);
        q("[data-addres]").addEventListener("click", e => {
          e.preventDefault();
          const tmp = document.createElement("div");
          tmp.innerHTML = resRow({ id: uid(), name: "", kind: "counter", path: "" }, false);
          const rowEl = tmp.firstElementChild; list.appendChild(rowEl); wire(rowEl);
          rowEl.querySelector('[data-k="name"]').focus();
        });
        all("[data-fp]").forEach(b => b.addEventListener("click", e => {
          e.preventDefault();
          const input = q(`[name="${b.dataset.fp}"]`);
          new FP({ type: b.dataset.fp === "bg" ? "image" : "audio", current: input.value, callback: p => { input.value = p; } }).browse();
        }));
      },
      ok: {
        label: L("Salvar"), icon: "fas fa-check", callback: (e, btn) => {
          const f = btn.form.elements;
          const rules = f.rules.value === "custom" ? "custom" : "dnd";
          let resPath = t.resPath, resLabel = t.resLabel, resources = [], labels = {};
          if (rules === "dnd") { resPath = f.resDnd.value; resLabel = presetOf(resPath)?.label ?? L("Pontos"); }
          else {
            resources = [...btn.form.querySelectorAll("[data-resrow]")].map((el, i) => {
              const v = k => el.querySelector(`[data-k="${k}"]`)?.value?.trim() ?? "";
              const kind = RES_KINDS.includes(v("kind")) ? v("kind") : "counter";
              return { id: el.dataset.id || uid(), name: v("name") || (i ? L`Recurso ${i + 1}` : L("Pontos")), kind: kind === "field" && !v("path") ? "counter" : kind, path: kind === "field" ? v("path") : "" };
            });
            if (!resources.length) resources = [{ id: uid(), name: L("Pontos"), kind: "counter", path: "" }];
            for (const k of Object.keys(LABEL_DEFAULTS())) { const v = f[`lbl-${k}`]?.value.trim(); if (v) labels[k] = v; }
          }
          return {
            name: f.name.value.trim() || t.name, section: f.section.value, desc: f.desc.value.trim(),
            rules, mode: "skill", resPath, resLabel, resources, labels, useCoins: rules === "dnd" ? true : f.useCoins.checked,
            lockKind: f.lockKind.value === "feat" && !f.lockFeat.value ? "" : f.lockKind.value, lockFeat: f.lockFeat.value, lockItem: f.lockItem.value.trim(), lockHide: f.lockHide.checked,
            lockLevel: Math.max(0, Number(f.lockLevel?.value) || 0), lockClass: f.lockClass?.value.trim() ?? "", lockClassLevel: Math.max(0, Number(f.lockClassLevel?.value) || 0),
            lockDate: f.lockKind.value === "date" ? readDate(btn.form, "lockDate") : t.lockDate,
            refundPlayer: f.refundPlayer.checked, refundPct: Math.max(0, Math.min(100, Number(f.refundPct.value) || 0)), approval: f.approval.checked,
            costInc: Math.max(0, Number(f.costInc.value) || 0),
            linkStyle: f.linkStyle.value, snap: Math.max(1, Number(f.snap.value) || 10), bg: f.bg.value.trim(),
            bgOpacity: Number(f.bgOpacity.value) || 0.35, sound: f.sound.value.trim()
          };
        }
      },
      rejectClose: false
    });
    if (!data) return;
    Object.assign(t, data);
    if (t.rules === "custom") syncPrimary(t);
    this.category = catOf(t);
    this.save(); this.render();
  }

  // Tema de cores de quem está usando (configuração do cliente)
  async themeDialog() {
    let cur = "dourado"; try { cur = game.settings.get(MOD, "theme") || "dourado"; } catch { }
    const before = cur;
    const res = await DialogV2.prompt({
      window: { title: L("Tema de cores"), icon: "fas fa-palette" }, position: { width: 460 }, classes: ["st-cfg-dialog"],
      content: L`<div class="st-c"><p class="st-c-lead">Só muda para você. Os outros jogadores escolhem o deles.</p>
        <div class="st-themes">${THEMES.map(x => `<label class="st-theme"><input type="radio" name="theme" value="${x.id}" ${x.id === cur ? "checked" : ""}>
          <span class="sw">${x.sw.map(c => `<i style="background:${c}"></i>`).join("")}</span><b>${esc(x.name)}</b></label>`).join("")}</div></div>`,
      render: (ev, dlg) => dlg.element?.querySelectorAll?.('[name="theme"]').forEach(r => r.addEventListener("change", () => applyTheme(r.value))),
      ok: { label: L("Usar este tema"), icon: "fas fa-check", callback: (e, b) => b.form.elements.theme.value },
      rejectClose: false
    });
    if (!res) return applyTheme(before);
    await game.settings.set(MOD, "theme", res);
    applyTheme(res);
  }

  // Configurações que valem para todas as Skill Trees. Abre mesmo sem nenhuma árvore.
  async generalConfig() {
    if (!this.gm) return;
    const row = (label, html, hint = "") => `<div class="st-c-row"><label>${label}</label><div class="st-c-f">${html}</div>${hint ? `<p class="st-c-hint">${hint}</p>` : ""}</div>`;
    const tog = (name, label, on, hint = "") => `<label class="st-c-tog"><input type="checkbox" name="${name}" ${on ? "checked" : ""}><span class="st-c-sw"></span><span><b>${label}</b>${hint ? `<small>${hint}</small>` : ""}</span></label>`;
    const n = this.trees.length;
    const data = await DialogV2.prompt({
      window: { title: L("Configurações gerais"), icon: "fas fa-sliders" }, position: { width: 520 },
      classes: ["st-cfg-dialog"],
      content: L`<div class="st-c">
        <p class="st-c-lead"><i class="fas fa-globe"></i> Valem para <b>todas</b> as Skill Trees do mundo.</p>
        <div class="st-c-box">
          <h4><i class="fas fa-star"></i> Pontos de Habilidade</h4>
          <div class="st-c-two">
            ${row(L("Pontos por nível"), `<input type="number" name="ptsPerLevel" min="0" value="${CFG.ptsPerLevel}">`)}
            ${row(L("Nível máximo que dá pontos"), `<input type="number" name="maxLevel" min="1" value="${CFG.maxLevel}">`)}
          </div>
          ${tog("levelNotice", L("Aviso ao subir de nível"), CFG.levelNotice, L("Mostra no chat quantos pontos o personagem ganhou."))}
          ${tog("availNotice", L("Aviso de habilidade disponível"), CFG.availNotice, L("Quando o personagem sobe de nível, ganha pontos ou um Grande Feito e uma habilidade nova pode ser comprada, o jogador recebe um aviso no chat."))}
        </div>
        <div class="st-c-box">
          <h4><i class="fas fa-id-card"></i> Ficha do personagem</h4>
          ${tog("sheetButton", L("Botão “Skill Tree” na ficha"), CFG.sheetButton)}
          ${tog("sheetTab", L("Aba “Skill Tree” dentro da ficha"), CFG.sheetTab)}
          ${row(L("Som padrão"), `<input name="defaultSound" value="${esc(CFG.defaultSound)}"><button type="button" data-fp="defaultSound" class="st-c-ico"><i class="fas fa-music"></i></button>`)}
        </div>
        <div class="st-c-box">
          <h4><i class="fas fa-box-archive"></i> Backup</h4>
          <button type="button" data-export class="st-c-btn" ${n ? "" : "disabled"}><i class="fas fa-download"></i> Exportar todas as Skill Trees (${n})</button>
          <p class="st-c-hint">Um arquivo JSON só, com as árvores e os itens usados. Volta pelo Importar.</p>
        </div>
        <div class="st-c-box st-c-danger">
          <h4><i class="fas fa-triangle-exclamation"></i> Zona de perigo</h4>
          <button type="button" data-reset class="st-c-btn st-c-btn-danger"><i class="fas fa-trash"></i> Zerar Árvores</button>
          <p class="st-c-hint">Exclui todas as Skill Trees e devolve os pontos dos personagens. Pede confirmação antes.</p>
        </div>
      </div>`,
      render: (ev, dlg) => {
        const el = dlg.element;
        if (!el?.querySelector) return;
        el.querySelector("[data-fp]")?.addEventListener("click", e => {
          e.preventDefault();
          const input = el.querySelector('[name="defaultSound"]');
          new FP({ type: "audio", current: input.value, callback: p => { input.value = p; } }).browse();
        });
        el.querySelector("[data-export]")?.addEventListener("click", e => { e.preventDefault(); this.exportAll(); });
        el.querySelector("[data-reset]")?.addEventListener("click", e => { e.preventDefault(); dlg.close(); this.resetAllDialog(); });
      },
      ok: {
        label: L("Salvar"), icon: "fas fa-check", callback: (e, btn) => {
          const f = btn.form.elements;
          return {
            ptsPerLevel: Math.max(0, Number(f.ptsPerLevel.value) || 0), maxLevel: Math.max(1, Number(f.maxLevel.value) || 30),
            levelNotice: f.levelNotice.checked, availNotice: f.availNotice.checked, sheetButton: f.sheetButton.checked, sheetTab: f.sheetTab.checked, defaultSound: f.defaultSound.value.trim()
          };
        }
      },
      rejectClose: false
    });
    if (!data) return;
    await saveCfg(data);
    this.render();
    ui.notifications.info(L("Configurações gerais salvas."));
  }

  async assign() {
    const t = this.tree; if (!t || !this.gm) return;
    const chars = playerCharacters();
    if (!chars.length) return ui.notifications.warn(L("Nenhum personagem encontrado."));
    const result = await DialogV2.prompt({
      window: { title: L`Atribuir "${t.name}"`, icon: "fas fa-user-plus" }, position: { width: 560 },
      content: `<div class="st-c">
        <p class="st-c-lead">${L("Marque quem recebe esta Skill Tree. Só eles a verão quando abrirem a macro.")}</p>
        ${whoTools(chars.length > 6)}
        <div class="st-who-grid">${chars.map(a => charCard(a, { checked: t.assigned.includes(a.id), sub: whoSub(a) })).join("")}</div>
        <label class="st-c-tog"><input type="checkbox" name="avisar" checked><span class="st-c-sw"></span><span><b>${L("Avisar os jogadores no chat")}</b></span></label>
      </div>`,
      render: (ev, dlg) => { if (dlg.element?.querySelector) wireWho(dlg.element); },
      ok: { label: L("Salvar"), callback: (e, btn) => ({
        ids: chars.filter(a => btn.form.elements[`a-${a.id}`]?.checked).map(a => a.id),
        avisar: btn.form.elements.avisar.checked
      }) }
    });
    if (!result) return;
    const novos = result.ids.filter(id => !t.assigned.includes(id));
    t.assigned = result.ids;
    this.save(); this.render();
    if (result.avisar) for (const id of novos) {
      const a = game.actors.get(id), users = ownersOf(a);
      if (!users.length) continue;
      ChatMessage.create({
        whisper: users.map(u => u.id), speaker: { alias: "Skill Tree" },
        content: box(L`<b>${esc(a.name)}</b> recebeu a Skill Tree <b>${esc(t.name)}</b>! Abra a Árvore da Mesa pelo botão <i class="fas fa-sitemap"></i> na barra lateral ou na ficha.`)
      });
    }
    ui.notifications.info(L`"${t.name}" atribuída a ${result.ids.length} personagem(ns).`);
  }

  // ── diário da sessão ──
  sessionInfo() { return { start: 0, n: 1, ...(getData("session", {}) ?? {}) }; }

  journalText(since, format = "md") {
    const B = x => format === "md" ? `**${x}**` : `<b>${esc(x)}</b>`;
    const S = this.sessionInfo();
    const data = new Date(since || Date.now()).toLocaleDateString("pt-BR");
    const verbo = { unlock: L("Desbloqueou"), temp: L("Recebeu temporária"), feat: L("✦ Grande Feito:"), grant: L("Recebeu do mestre"), refund: L("Reembolsou"), reset: L("Resetou a árvore"), train: L("Começou a treinar"), orphan: L("↺ Pontos devolvidos de"), deny: L("Pedido recusado:"), mile: L("🏆 Marco:"), feat: L("✦ Grande Feito:"), reward: L("🎁 Recebeu"), level: L("⬆ Subiu para o nível") };
    const out = [];
    for (const a of playerCharacters()) {
      const linhas = [];
      for (const e of logOf(a).filter(x => (x.at ?? 0) >= since)) {
        if (e.act === "level") { linhas.push(`${verbo.level} ${e.rank}${e.cost ? L` (+${e.cost} Pontos de Habilidade)` : ""}`); continue; }
        if (e.act === "reward" || e.act === "mile") { linhas.push(`${verbo[e.act]} ${e.nodeName}`); continue; }
        linhas.push(`${verbo[e.act] ?? e.act} ${e.nodeName ?? ""}${e.rank > 1 ? L` (nível ${e.rank})` : ""}${e.treeName ? ` — ${e.treeName}` : ""}`.trim());
      }
      for (const f of featsOf(a).filter(x => (x.at ?? 0) >= since)) linhas.push(L`✦ Grande Feito: ${f.text} (+${f.pts} Ponto(s) Mítico(s))`);
      if (!linhas.length) continue;
      out.push(`${B(a.name)}\n${linhas.map(l => `• ${l}`).join("\n")}`);
    }
    const head = `${B(L`Sessão ${S.n} — ${data}`)}`;
    return out.length ? `${head}\n\n${out.join("\n\n")}` : L`${head}\n\nNada registrado nas Skill Trees desde o início da sessão.`;
  }

  async journalDialog() {
    const S = this.sessionInfo();
    const since = S.start || (Date.now() - 12 * 3600 * 1000);
    const md = this.journalText(since, "md");
    await DialogV2.prompt({
      window: { title: L`📜 Diário — Sessão ${S.n}` }, position: { width: 560 },
      content: L`<p class="hint">${S.start ? L`Desde ${new Date(S.start).toLocaleString("pt-BR")}.` : L("Nenhuma sessão iniciada: mostrando as últimas 12 horas.")} Texto pronto para colar no Discord.</p>
        <textarea data-journal rows="16" style="width:100%;font-family:monospace;font-size:12px">${esc(md)}</textarea>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button type="button" data-j="copy" style="flex:1"><i class="fas fa-copy"></i> Copiar</button>
          <button type="button" data-j="chat" style="flex:1"><i class="fas fa-comment"></i> Postar no chat</button>
          <button type="button" data-j="new" style="flex:1"><i class="fas fa-flag-checkered"></i> Iniciar nova sessão</button>
        </div>`,
      ok: { label: L("Fechar") },
      render: (ev, dlg) => {
        const el = dlg.element;
        el.querySelectorAll("[data-j]").forEach(b => b.addEventListener("click", async e => {
          e.preventDefault();
          const txt = el.querySelector("[data-journal]")?.value ?? md;
          if (b.dataset.j === "copy") {
            try { await navigator.clipboard.writeText(txt); ui.notifications.info(L("Diário copiado.")); }
            catch { el.querySelector("[data-journal]")?.select(); ui.notifications.info(L("Texto selecionado — use Ctrl+C para copiar.")); }
          } else if (b.dataset.j === "chat") {
            ChatMessage.create({ speaker: { alias: L("Diário da Sessão") }, content: box(this.journalText(since, "html").replace(/\n/g, "<br>"), "#8a6a3f") });
          } else {
            if (!await DialogV2.confirm({ window: { title: L("Nova sessão") }, content: L`<p>Marcar agora como início da <b>Sessão ${S.n + (S.start ? 1 : 0)}</b>? O diário passa a contar a partir deste momento.</p>` })) return;
            await setData("session", { start: Date.now(), n: S.n + (S.start ? 1 : 0) });
            ui.notifications.info(L("Nova sessão iniciada."));
            dlg.close();
          }
        }));
      }
    });
  }

  // Conceder um Grande Feito. featId = um feito desta árvore; sem ele, dá para escolher ou lançar um avulso.
  async featDialog(preIds = null, featId = null) {
    if (!this.gm) return;
    const chars = playerCharacters();
    const a = this.actorDoc, t = this.tree;
    const pre = new Set(preIds ?? (a ? [a.id] : []));
    const list = t?.feats ?? [];
    const first = featId ?? list[0]?.id ?? "";
    const rows = chars.map(x => charCard(x, { checked: pre.has(x.id), sub: `${whoSub(x)} · ✦ ${mythicOf(x)}` })).join("");
    const res = await DialogV2.prompt({
      window: { title: L("✦ Grande Feito"), icon: "fas fa-star" }, position: { width: 480 }, classes: ["st-cfg-dialog"],
      content: L`<div class="st-c">
        <div class="st-c-row"><label>Grande Feito${t ? ` — ${esc(t.name)}` : ""}</label><div class="st-c-f"><select name="which">
          ${list.map(f => `<option value="${esc(f.id)}" ${f.id === first ? "selected" : ""}>${esc(f.name)} (+${f.pts} ✦)</option>`).join("")}
          <option value="" ${first ? "" : "selected"}>— Feito avulso (sem árvore) —</option></select></div></div>
        <div data-info class="st-c-name"></div>
        <div data-loose class="st-c-two">
          <div class="st-c-row"><label>Nome</label><div class="st-c-f"><input name="feito" placeholder="ex.: Derrotou um inimigo lendário"></div></div>
          <div class="st-c-row"><label>Pontos Míticos</label><div class="st-c-f"><input type="number" name="pts" value="1" min="0"></div></div>
        </div>
        ${whoTools(chars.length > 6)}
        <div class="st-who-grid">${rows || L("<p class='st-c-hint'>Nenhum personagem.</p>")}</div>
        <label class="st-c-tog"><input type="checkbox" name="marco" checked><span class="st-c-sw"></span><span><b>Registrar também como Marco</b><small>Habilidades que pedem esse marco passam a aceitar.</small></span></label>
      </div>`,
      render: (ev, dlg) => {
        const el = dlg.element;
        if (!el?.querySelector) return;
        wireWho(el);
        const sel = el.querySelector('[name="which"]');
        const sync = () => {
          const f = list.find(x => x.id === sel.value);
          el.querySelector("[data-loose]").hidden = !!f;
          const info = el.querySelector("[data-info]");
          const opens = f ? treesOpenedBy(f.id, this.trees).map(x => x.name) : [];
          info.hidden = !f;
          info.innerHTML = f ? L`<b>+${f.pts} Ponto(s) Mítico(s)</b>${f.desc ? ` · ${esc(f.desc)}` : ""}${opens.length ? L`<br><i class="fas fa-lock-open"></i> Libera: <b>${esc(opens.join(", "))}</b>` : ""}` : "";
          el.querySelectorAll("[data-who]").forEach(row => {
            const x = game.actors.get(row.dataset.who), got = !!f && hasFeat(x, f.id), cb = row.querySelector("input");
            cb.disabled = got; if (got) cb.checked = false;
            row.classList.toggle("off", got);
            row.querySelector("em").innerHTML = got ? `<span class="st-tag ok">${L("já tem")}</span>` : "";
          });
        };
        sel.addEventListener("change", sync); sync();
      },
      ok: { label: L("Conceder"), icon: "fas fa-star", callback: (e, btn) => {
        const f = btn.form.elements;
        return { which: f.which.value, feito: f.feito.value.trim(), pts: Math.max(0, Number(f.pts.value) || 0), marco: f.marco.checked,
          ids: chars.filter(x => f[`a-${esc(x.id)}`]?.checked && !f[`a-${esc(x.id)}`]?.disabled).map(x => x.id) };
      } },
      rejectClose: false
    });
    if (!res?.ids?.length) return;
    const feat = res.which ? list.find(x => x.id === res.which) : null;
    return this.gmRecord(L`Grande Feito: ${feat?.name ?? (res.feito || L("Grande Feito"))}`, res.ids.map(id => game.actors.get(id)), async () => {
      const given = await this.grantFeat(res.ids, feat, res);
      return given?.length ? given : false;
    });
  }

  async grantFeat(ids, feat, { feito = "", pts = 1, marco = true } = {}) {
    const t = feat ? this.trees.find(x => x.feats.some(f => f.id === feat.id)) : null;
    const name = feat?.name ?? (feito || L("Grande Feito")), value = feat ? Number(feat.pts) || 0 : pts;
    const given = [];
    for (const id of ids) {
      const x = game.actors.get(id);
      if (!x || (feat && hasFeat(x, feat.id))) continue;
      const entry = { at: Date.now(), text: name, pts: value, ...(feat ? { feat: feat.id, tree: t?.id } : {}) };
      const upd = { [K_MYTH]: mythicOf(x) + value, [K_FEATS]: trimFeats([...featsOf(x), entry]) };
      if (marco) upd[K_MILES] = [...new Set([...milestonesOf(x), name])];
      upd[K_LOG] = addLog(x, { act: "feat", tree: t?.id, treeName: t?.name, nodeName: name, cost: value });
      await x.update(upd);
      given.push(x);
    }
    if (!given.length) return [];
    const opens = feat ? treesOpenedBy(feat.id, this.trees).map(x => x.name) : [];
    ChatMessage.create({ speaker: { alias: L("Grande Feito") }, content: L`<div style="border:2px solid #e000ff;border-radius:10px;padding:10px;background:radial-gradient(circle at 50% 20%,#e000ff44,#1d2029 70%);color:#eee;text-align:center">
      <div style="font-size:10px;letter-spacing:4px;color:#f5b8ff">✦ GRANDE FEITO ✦</div>
      <div style="font-size:17px;font-weight:bold;margin:6px 0;color:#f5b8ff">${esc(name)}</div>
      <div>${esc(given.map(x => x.name).join(", "))} ${given.length > 1 ? "recebem" : "recebe"} <b>${value} Ponto(s) Mítico(s)</b></div>
      ${opens.length ? L`<div style="margin-top:6px">🔓 Libera a Skill Tree <b>${esc(opens.join(", "))}</b></div>` : ""}</div>` });
    this.render();
    return given;
  }

  async revokeFeat(a, featId) {
    if (!this.gm || !a) return;
    const ref = findFeat(featId, this.trees);
    const entries = featsOf(a).filter(f => f.feat === featId);
    if (!entries.length) return;
    const pts = entries.reduce((s, f) => s + (Number(f.pts) || 0), 0);
    const opens = treesOpenedBy(featId, this.trees).map(x => x.name);
    if (!await DialogV2.confirm({ window: { title: L("Retirar Grande Feito") }, rejectClose: false,
      content: L`<p>Retirar <b>${esc(ref?.feat.name ?? entries[0].text)}</b> de ${esc(a.name)} e tirar <b>${pts} Ponto(s) Mítico(s)</b>${mythicOf(a) < pts ? L` (só tem ${mythicOf(a)}; fica em 0)` : ""}?</p>${opens.length ? L`<p style="font-size:12px">${esc(opens.join(", "))} volta(m) a ficar bloqueada(s). O que já foi comprado nela(s) continua na ficha.</p>` : ""}` })) return;
    const name = ref?.feat.name ?? entries[0].text;
    const still = featsOf(a).filter(f => f.feat !== featId);
    const upd = { [K_FEATS]: still, [K_MYTH]: Math.max(0, mythicOf(a) - pts) };
    if (!still.some(f => f.text === name)) upd[K_MILES] = milestonesOf(a).filter(m => m !== name);
    await a.update(upd);
    this.render();
  }

  async editFeat(featId) {
    const t = this.tree; if (!t || !this.gm) return;
    const f = featId ? t.feats.find(x => x.id === featId) : null;
    if (featId && !f) return;
    const cur = f ?? featDefaults();
    const res = await DialogV2.prompt({
      window: { title: f ? L("Editar Grande Feito") : L("Novo Grande Feito"), icon: "fas fa-star" }, position: { width: 440 }, classes: ["st-cfg-dialog"],
      content: L`<div class="st-c">
        <div class="st-c-row"><label>Nome</label><div class="st-c-f"><input name="name" value="${esc(f ? cur.name : "")}" placeholder="ex.: Derrotou o Dragão Vermelho" autofocus></div></div>
        <div class="st-c-row"><label>Pontos Míticos</label><div class="st-c-f"><input type="number" name="pts" min="0" value="${Number(cur.pts) || 0}"></div></div>
        <div class="st-c-row"><label>Descrição</label><div class="st-c-f"><textarea name="desc" rows="2" placeholder="opcional">${esc(cur.desc)}</textarea></div></div>
        <p class="st-c-hint">Para uma Skill Tree só abrir depois deste feito, vá nela em <b>Esta Skill Tree → Geral → Disponível</b>.</p></div>`,
      ok: { label: L("Salvar"), icon: "fas fa-check", callback: (e, b) => {
        const el = b.form.elements;
        return { name: el.name.value.trim() || L("Grande Feito"), pts: Math.max(0, Number(el.pts.value) || 0), desc: el.desc.value.trim() };
      } },
      rejectClose: false
    });
    if (!res) return;
    if (f) Object.assign(f, res); else t.feats.push({ id: uid(), ...res });
    this.save(); this.render();
  }

  async deleteFeat(featId) {
    const t = this.tree; if (!t || !this.gm) return;
    const f = t.feats.find(x => x.id === featId); if (!f) return;
    const opens = treesOpenedBy(featId, this.trees);
    if (!await DialogV2.confirm({ window: { title: L("Excluir Grande Feito") }, rejectClose: false,
      content: L`<p>Excluir <b>${esc(f.name)}</b> desta Skill Tree? (Ctrl+Z desfaz)</p><p style="font-size:12px">Quem já ganhou continua com os Pontos Míticos.${opens.length ? L` ${esc(opens.map(x => x.name).join(", "))} deixa(m) de esperar por este feito e fica(m) liberada(s).` : ""}</p>` })) return;
    t.feats = t.feats.filter(x => x.id !== featId);
    for (const x of opens) { x.lockKind = ""; x.lockFeat = ""; }
    this.save(); this.render();
  }

  async givePts() {
    const t = this.tree, a = this.actorDoc; if (!t || !a) return;
    // principal + recursos extras do Personalizado
    const list = [{ id: "", name: t.resLabel, cur: resOf(a, t) }, ...extraRes(t).map(r => ({ id: r.id, name: r.name, path: resPath(t, r), cur: Number(getProp(a, resPath(t, r))) || 0 }))];
    const res = await DialogV2.prompt({
      window: { title: L`Dar ou tirar — ${a.name}` }, classes: ["st-cfg-dialog"],
      content: L`<div class="st-c">
        ${list.length > 1 ? L`<div class="st-c-row"><label>Recurso</label><div class="st-c-f"><select name="which">${list.map(x => L`<option value="${esc(x.id)}">${esc(x.name)} (tem ${x.cur})</option>`).join("")}</select></div></div>` : `<p>${esc(t.resLabel)} atual: <b>${list[0].cur}</b></p>`}
        <div class="st-c-row"><label>Somar (use negativo para tirar)</label><div class="st-c-f"><input type="number" name="delta" value="1" autofocus></div></div></div>`,
      ok: { label: L("Aplicar"), callback: (e, btn) => ({ which: btn.form.elements.which?.value ?? "", val: Number(btn.form.elements.delta.value) || 0 }) },
      rejectClose: false
    });
    if (!res?.val) return;
    const x = list.find(y => y.id === res.which) ?? list[0], val = res.val;
    await this.gmRecord(L`${val > 0 ? "+" : ""}${val} ${x.name} → ${a.name}`, [a], async () => {
      if (!x.id) await a.update(resUpdate(a, t, val, true));
      else await a.update({ [x.path]: Math.max(0, x.cur + val) });
    });
    const now = x.id ? Number(getProp(a, x.path)) || 0 : resOf(a, t);
    chat(a, `<b>${esc(a.name)}</b> ${val > 0 ? "recebeu" : "perdeu"} <b>${Math.abs(val)} ${esc(x.name)}</b> <small>(${esc(t.name)}: agora ${now})</small>`);
  }

  async unlock(a, t, n) {
    if (!a || !t || !n) return;
    const st = nodeState(a, t, n);
    if (!st.canBuy) return ui.notifications.warn(st.reasons.join(" · ") || L("Indisponível."));
    if (t.approval && !this.gm) {
      if (!await DialogV2.confirm({ window: { title: L("Pedir ao mestre") }, content: L`<p>Pedir ao mestre para desbloquear <b>${esc(n.name)}</b>${st.cost ? ` (${st.cost} ${esc(t.resLabel)})` : ""}?</p>` })) return;
      return sendRequest(a, t, n, st.cost);
    }
    const extra = [coinsOn(t) && Number(n.costGp) ? `${n.costGp} PO` : "", coinsOn(t) && Number(n.costPp) ? `${n.costPp} PL` : "",
      ...Object.entries(nodeExtras(t, n)).map(([p, v]) => `${v} ${extraName(t, p)}`), ...n.consume.map(x => `${Number(x.qty) || 1}× ${x.name}`)].filter(Boolean);
    const ok = await DialogV2.confirm({
      window: { title: st.rank ? L("Subir de nível") : L("Desbloquear habilidade") },
      content: L`<p>${st.rank ? L`Subir <b>${esc(n.name)}</b> para o nível ${st.rank + 1}/${st.max}` : L`Desbloquear <b>${esc(n.name)}</b>`} para <b>${esc(a.name)}</b>${st.cost ? L` por <b>${st.cost} ${esc(t.resLabel)}</b>` : ""}${extra.length ? ` + ${esc(extra.join(", "))}` : ""}?</p>
          ${Number(n.trainDays) ? L`<p>⏳ Fica pronta depois de ${n.trainDays} descanso(s) longo(s) de treino.</p>` : ""}`
    });
    if (!ok) return;
    return doUnlock(a, t, n);
  }

  // Mesa → Corrigir pontos
  async fixPoints() {
    await this.flushSave();
    const chars = game.actors.filter(a => a.type === "character");
    const scans = chars.map(a => [a, orphanScan(a, this.trees)]).filter(([, r]) => r.found);
    if (!scans.length) return ui.notifications.info(L("Nenhum ponto preso: todos os personagens estão certos."));
    const lista = scans.map(([a, r]) => `<li><b>${esc(a.name)}</b>: ${[r.skillBack ? L`+${r.skillBack} Pontos de Habilidade` : "", r.myth ? L`+${r.myth} Pontos Míticos` : "", r.gp ? `+${r.gp} PO` : "", r.pp ? `+${r.pp} PL` : ""].filter(Boolean).join(", ") || L("limpeza da ficha")}${r.items.length + r.effects.length ? L` · remove ${r.items.length + r.effects.length} item(ns)/efeito(s)` : ""}</li>`).join("");
    if (!await DialogV2.confirm({ window: { title: L("Corrigir pontos") }, position: { width: 480 }, content: L`<p>Habilidades que não existem mais nas Skill Trees:</p><ul style="font-size:12px">${lista}</ul><p>Devolver e limpar as fichas?</p>` })) return;
    const rep = await fixOrphans(scans.map(([a]) => a), { trees: this.trees });
    ui.notifications.info(L`Pontos corrigidos para ${rep.length} personagem(ns).`);
    this.render();
  }

  async refundAll(a, t) {
    if (!a || !t) return;
    if (!this.gm && (!a.isOwner || !t.refundPlayer || !canSee(t,a.id))) throw new Error(L("Reembolso não autorizado."));
    const un = unlockedOf(a, t);
    if (!await DialogV2.confirm({ window: { title: L("Reembolsar tudo") }, content: L`<p>Remover todas as ${un.length} habilidades de <b>${esc(a.name)}</b> nesta Skill Tree e devolver o que foi pago?</p>` })) return;
    return actorOperation(a, async a => {
    const un = unlockedOf(a,t);
    const external = t.nodes.flatMap(n => refundDependents(a,t,n,0)).filter(d => d.tree.id !== t.id);
    if (external.length) throw new Error(L`Reembolse primeiro as habilidades dependentes: ${external.map(d => d.node.name).join(", ")}`);
    const pct = Math.max(0, Math.min(100, Number(t.refundPct ?? 100))) / 100;
    let total = 0, gp = 0, pp = 0, myth = 0, ex = {};
    const byRes = new Map(); // devolve cada pagamento para o recurso de onde saiu
    for (const id of un) {
      const n = nodeById(t, id);
      if (!n) continue;
      const e = rankEntry(a, t, n, un);
      (e.paid ?? []).forEach((v, i) => {
        const x = e.paidX?.[i] ?? {};
        if (x.myth ?? isMythic(n)) { myth += Number(v) || 0; return; }
        total += Number(v) || 0;
        const d = x.res ?? resDesc(t), k = JSON.stringify(d);
        byRes.set(k, { d, v: (byRes.get(k)?.v ?? 0) + (Number(v) || 0) });
      });
      for (const x of e.paidX ?? []) { gp += Number(x.gp) || 0; pp += Number(x.pp) || 0; ex = sumExtras(ex, x.ex); }
      await revoke(a, t, n);
    }
    total = Math.floor(total * pct); gp = Math.floor(gp * pct); pp = Math.floor(pp * pct); myth = Math.floor(myth * pct);
    const upd = {
      [K_UNLOCK(t.id)]: [], [K_RANKS(t.id)]: [],
      [K_LOG]: addLog(a, { tree: t.id, treeName: t.name, act: "reset", cost: total })
    };
    for (const { d, v } of byRes.values()) addResDesc(upd, a, d, Math.floor(v * pct));
    const temps = tempsOf(a).filter(x => x.tree !== t.id); if (temps.length !== tempsOf(a).length) upd[K_TEMP] = temps;
    addExtras(upd, a, ex, 1, pct);
    if (myth) upd[K_MYTH] = mythicOf(a) + myth;
    addCoins(upd, a, gp, pp);
    await a.update(upd);
    chat(a, L`<b>${esc(a.name)}</b> teve a Skill Tree <b>${esc(t.name)}</b> resetada <small>(+${total} ${esc(t.resLabel)}${myth ? L`, +${myth} Pontos Míticos` : ""}${gp ? `, +${gp} PO` : ""}${pp ? `, +${pp} PL` : ""})</small>`);
    });
  }
}
