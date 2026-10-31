// ═══════════════════════════════════════════════════════════════════════════
//  Árvore da Mesa — ações dos botões (data-act)
//  Métodos da janela ArvoreHabilidades (copiados para a classe em app.js)
// ═══════════════════════════════════════════════════════════════════════════

import { L } from "./i18n.js?v=1.7.5";
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
  K_TEMP, tempsOf, tempOf, tempText, grantTemp, endTemp, today, dateText, calApi, longRest, longRestAll, restingActors
} from "./core.js?v=1.7.5";
import { SaveQueue } from "./persistence.js?v=1.7.5";
import { validateTrees, remapTree } from "./validation.js?v=1.7.5";
import { actorOperation } from "./operations.js?v=1.7.5";
import { DialogV2, charCard, whoSub, whoTools, wireWho, datePicker, readDate, wireDate } from "./ui-kit.js?v=1.7.5";

export class MixActions {
  // ── ações ──
  async onAction(act, el) {
    const t = this.tree, a = this.actorDoc, n = this.selNode;
    const fi = Number(el?.dataset?.fi ?? 0);
    const playerActions = new Set(["help","theme","center","panel","pickActor","refundMode","refundClear","refundAllSel","refundConfirm","plan","clearPlan","confirmPlan","unlock","cancelReq","refund","refundAll","cancelTrain","export"]);
    if (!this.gm && !playerActions.has(act)) throw new Error(L("Esta ação é exclusiva do mestre."));
    if (!this.gm && a && !a.isOwner) throw new Error(L("Você não pode alterar este personagem."));
    switch (act) {
      case "addSection": return this.sectionDialog();
      case "renameSection": return this.sectionDialog(true);
      case "delSection": return this.deleteSectionDialog();
      case "resetAll": return this.resetAllDialog();
      case "mode": this.mode = this.mode === "edit" ? "play" : "edit"; this.linking = false; this.linkFrom = null; this.multi.clear(); this.tool = "select"; this.planning = false; this.plan = []; return this.render();
      case "center": return this.fit();
      case "theme": return this.themeDialog();
      case "help": return this.welcomeDialog();
      case "panel": this.panelOpen = !this.panelOpen; return this.render();
      case "link": this.linking = !this.linking; this.linkFrom = null; return this.render();
      case "mesa": return this.mesaDialog();
      case "pickActor": return this.pickActor();
      case "templates": return this.templatesDialog();
      case "undo": return this.undo();
      case "redo": return this.redo();
      case "refundMode": this.refunding = !this.refunding; this.refundSel.clear(); this.planning = false; this.plan = []; this.sel = null; this.panelOpen = true; return this.render();
      case "refundClear": this.refundSel.clear(); return this.render();
      case "refundAllSel": { const a2 = this.actorDoc, t2 = this.tree; if (a2 && t2) for (const id of unlockedOf(a2, t2)) { const nn = nodeById(t2, id); if (nn && !nn.synergy) this.refundSel.add(id); } return this.render(); }
      case "refundConfirm": return this.confirmRefunds();
      case "plan": this.refunding = false; this.refundSel.clear(); this.planning = !this.planning; this.plan = []; this.sel = null; this.panelOpen = true; return this.render();
      case "clearPlan": this.plan = []; return this.render();
      case "confirmPlan": return this.confirmPlan();

      case "addNode": {
        if (!t) return;
        const c = this.viewCenter();
        const node = newNode(this.snapV(c.x), this.snapV(c.y));
        t.nodes.push(node); this.sel = node.id; this.save(); return this.render();
      }
      case "dupNode": {
        if (!n) return;
        const copy = normalizeNode({ ...clone(n), id: uid(), name: L`${n.name} (cópia)`, x: n.x + 60, y: n.y + 60 });
        t.nodes.push(copy); this.sel = copy.id; this.save(); return this.render();
      }
      case "saveTpl": {
        if (!n) return;
        const tpl = clone(n); delete tpl.id; delete tpl.x; delete tpl.y;
        const list = loadTemplates().filter(x => x.name !== tpl.name);
        list.push(tpl);
        await saveTemplates(list);
        return ui.notifications.info(L`Modelo "${n.name}" salvo.`);
      }
      case "copy": return this.copyNodes(this.multi.size ? [...this.multi] : (this.sel ? [this.sel] : []));
      case "paste": return this.pasteNodes();
      case "delMulti": {
        if (!this.multi.size) return;
        if (!await DialogV2.confirm({ window: { title: L("Excluir habilidades") }, content: L`<p>Excluir ${this.multi.size} habilidade(s) selecionada(s)? (Ctrl+Z desfaz)</p><p style="font-size:12px">Quem já tinha recebe de volta o que pagou, e elas saem da ficha quando você fechar esta janela.</p>` })) return;
        t.nodes = t.nodes.filter(x => !this.multi.has(x.id));
        t.edges = t.edges.filter(e => !this.multi.has(e.from) && !this.multi.has(e.to));
        this.multi.clear(); this.sel = null; this.save(); return this.render();
      }
      case "delNode": {
        if (!n) return;
        if (!await DialogV2.confirm({ window: { title: L("Excluir habilidade") }, content: L`<p>Excluir <b>${esc(n.name)}</b>? (Ctrl+Z desfaz)</p><p style="font-size:12px">Quem já tinha recebe de volta o que pagou, e ela sai da ficha quando você fechar esta janela.</p>` })) return;
        t.nodes = t.nodes.filter(x => x.id !== n.id);
        t.edges = t.edges.filter(e => e.from !== n.id && e.to !== n.id);
        this.sel = null; this.save(); return this.render();
      }
      case "addFeat": {
        if (!n) return;
        n.features.push({ ...featureDefaults(), name: n.features.length ? `${n.name} ${n.features.length + 1}` : "" });
        this.secOpen.add("feat"); this.secOpen.add(`feat-${n.features.length - 1}`);
        this.save(); return this.render();
      }
      case "addReqClass": n?.reqClasses.push({ id: "", name: "", level: 0 }); this.secOpen.add("req"); this.save(); return this.render();
      case "addChg": n?.changes.push({ key: "", type: DEFAULT_TYPE, value: "1" }); this.save(); return this.render();
      case "addFChg": n?.features[fi]?.changes.push({ key: "", type: DEFAULT_TYPE, value: "1" }); this.save(); return this.render();
      case "pickImg":
        return new FP({ type: "image", current: n?.img, callback: path => { n.img = path; this.save(); this.render(); } }).browse();
      case "pickFeatImg":
        return new FP({ type: "image", current: n?.features[fi]?.img || n?.img, callback: path => { n.features[fi].img = path; this.save(); this.render(); } }).browse();
      case "clearFxLight": if (n?.features[fi]) { n.features[fi].fxLight = ""; this.save(); this.render(); } return;
      case "pickFx": {
        const k = el?.dataset?.k, f = n?.features[fi]; if (!f || !k) return;
        return new FP({ type: k === "fxSound" ? "audio" : "imagevideo", current: f[k], callback: path => { f[k] = path; this.save(); this.render(); } }).browse();
      }
      case "pickTokenImg":
        return new FP({ type: "imagevideo", current: n?.features[fi]?.tokenImg, callback: path => { n.features[fi].tokenImg = path; this.save(); this.render(); } }).browse();

      case "addTree": {
        const tr = newTree(`Skill Tree ${this.trees.length + 1}`);
        tr.section = this.category;
        this.trees.push(tr); this.treeId = tr.id; this.sel = null; this.save(); this.render();
        return this.treeConfig();
      }
      case "dupTree": {
        if (!t) return;
        const copy = clone(t), map = {};
        copy.id = uid(); copy.name = L`${t.name} (cópia)`; copy.assigned = [];
        copy.feats = (copy.feats ?? []).map(f => ({ ...f, id: uid() }));
        copy.nodes = copy.nodes.map(x => { const id = uid(); map[x.id] = id; return { ...x, id, shared: "" }; });
        copy.edges = copy.edges.map(e => ({ ...e, from: map[e.from], to: map[e.to] }));
        for (const node of copy.nodes) node.reqNodes = (node.reqNodes ?? []).map(r => r.tree === t.id ? { ...r, tree: copy.id, node: map[r.node] ?? r.node } : r);
        this.trees.push(copy); this.treeId = copy.id; this.sel = null; this.save(); this.render();
        return ui.notifications.info(L`"${copy.name}" criada.`);
      }
      case "treeCfg": return this.treeConfig();
      case "generalCfg": return this.generalConfig();
      case "validate": return this.validateDialog();
      case "stats": return this.statsDialog();
      case "exportAll": return this.exportAll();
      case "delTree": {
        if (!t) return;
        if (!await DialogV2.confirm({ window: { title: L("Excluir Skill Tree") }, content: `<p>${L`Excluir a Skill Tree <b>${esc(t.name)}</b> inteira?`}</p><p class="st-c-hint">${L("Agora mesmo, os personagens recebem de volta o que gastaram nela e tudo o que ela colocou nas fichas é removido. Ctrl+Z traz a árvore de volta, mas sem o progresso.")}</p>` })) return;
        this.trees = this.trees.filter(x => x.id !== t.id); this.treeId = null; this.sel = null; this.save(); this.render();
        return this.cleanSheets();
      }
      case "export": return t && this.exportPackage(t);
      case "import": return this.importFile();

      case "givePts": return this.givePts();
      case "feat": return this.featDialog();
      case "featNew": return this.editFeat(null);
      case "assign": return this.assign();
      case "unlock": return this.unlock(a, t, n);
      case "grantTemp": {
        if (!a || !n || !t) return;
        const res = await DialogV2.prompt({
          window: { title: L`Conceder temporária — ${n.name}`, icon: "fas fa-hourglass-end" }, position: { width: 460 },
          content: `<div class="st-c">
            <p class="st-c-lead">${L`Dá <b>${esc(n.name)}</b> de graça para <b>${esc(a.name)}</b> e tira sozinha depois. Bom para bênçãos, maldições e itens amaldiçoados.`}</p>
            <div class="st-c-cards">
              <label class="st-c-card"><input type="radio" name="kind" value="rests" checked><i class="fas fa-bed"></i><b>${L("Descansos longos")}</b><small>${L("Some depois de X descansos longos do personagem.")}</small></label>
              <label class="st-c-card"><input type="radio" name="kind" value="date"><i class="fas fa-calendar-day"></i><b>${L("Data")}</b><small>${calApi() ? L("Some na data escolhida do Calendário.") : L("Some depois de X dias do mundo.")}</small></label>
            </div>
            <div data-k="rests"><div class="st-c-row"><label>${L("Descansos longos")}</label><div class="st-c-f"><input type="number" name="left" min="1" value="1"></div></div></div>
            <div data-k="date" hidden><div class="st-c-row"><label>${L("Some em")}</label><div class="st-c-f">${datePicker("until", today() + 1)}</div></div></div>
          </div>`,
          render: (ev, dlg) => {
            const el = dlg.element; if (!el?.querySelector) return;
            wireDate(el);
            const sync = () => { const k = el.querySelector('[name="kind"]:checked')?.value; el.querySelectorAll("[data-k]").forEach(d => { d.hidden = d.dataset.k !== k; }); };
            el.querySelectorAll('[name="kind"]').forEach(r => r.addEventListener("change", sync)); sync();
          },
          ok: { label: L("Conceder"), icon: "fas fa-hourglass-end", callback: (e, btn) => {
            const f = btn.form; const kind = f.querySelector('[name="kind"]:checked')?.value ?? "rests";
            return { kind, left: Math.max(1, Number(f.elements.left.value) || 1), until: kind === "date" ? readDate(f, "until") : null };
          } },
          rejectClose: false
        });
        if (!res) return;
        if (res.kind === "date" && (res.until === null || res.until <= today())) return ui.notifications.warn(L("Escolha uma data depois de hoje."));
        return this.gmRecord(L`Temporária: ${n.name} → ${a.name}`, [a], () => grantTemp(a, t, n, res));
      }
      case "grantFree": {
        if (!await DialogV2.confirm({ window: { title: L("Conceder grátis") }, content: L`<p>Conceder <b>${esc(n.name)}</b> a ${esc(a.name)} sem custo, sem requisitos e sem treino?</p>` })) return;
        return this.gmRecord(L`Grátis: ${n.name} → ${a.name}`, [a], () => doUnlock(a, t, n, { free: true }));
      }
      case "cancelReq": return a?.update({ [K_REQ]: reqsOf(a).filter(r => !(r.tree === t.id && r.node === n.id)) });
      case "refund": {
        if (!a || !n) return;
        const st = nodeState(a, t, n);
        if (!await DialogV2.confirm({ window: { title: L("Reembolsar") }, content: L`<p>${st.rank > 1 ? L`Reduzir <b>${esc(n.name)}</b> para o nível ${st.rank - 1}` : L`Remover <b>${esc(n.name)}</b>`} de ${esc(a.name)} e devolver ${Number(t.refundPct) < 100 ? L`${t.refundPct}% do` : L("o")} que foi pago?</p>` })) return;
        return doRefund(a, t, n);
      }
      case "refundAll": return this.refundAll(a, t);
      case "finishTrain": {
        const e = trainingOf(a).find(x => x.tree === t.id && x.node === n.id);
        if (e) await advanceTraining(a, Number(e.left) || 1);
        return;
      }
      case "cancelTrain": return cancelTraining(a, t, n);
      case "trainDay": {
        if (!a) return;
        await longRest(a);
        ui.notifications.info(L`Descanso longo contado para ${a.name}.`);
        return this.render();
      }
      case "addMile": {
        if (!a) return;
        const m = await DialogV2.prompt({
          window: { title: L("Novo marco") },
          content: L`<p>Nome do marco (ex.: "Derrotou um inimigo lendário").</p><input name="m" style="width:100%" autofocus>`,
          ok: { label: L("Adicionar"), callback: (e, btn) => btn.form.elements.m.value.trim() }
        });
        if (!m) return;
        await a.update({ [K_MILES]: [...new Set([...milestonesOf(a), m])], [K_LOG]: addLog(a, { act: "mile", nodeName: m }) });
        return whisperOwners(a, L`🏆 <b>${esc(a.name)}</b> alcançou o marco <b>${esc(m)}</b>.`);
      }
    }
  }

  async setResource(value) {
    const t = this.tree; if (!t || !this.gm) return;
    if (value === "@custom") return this.treeConfig();
    t.resPath = value;
    t.resLabel = resPresets().find(x => x.value === value)?.label ?? L("Pontos");
    this.save(); this.render();
    ui.notifications.info(L`"${t.name}" agora usa ${t.resLabel}.`);
  }
}
