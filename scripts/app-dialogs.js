// ═══════════════════════════════════════════════════════════════════════════
//  Árvore da Mesa — janelas de configuração: seções, modelos, Skill Tree, configurações gerais, temas,
//  atribuir personagens e zerar árvores
//  Métodos da janela ArvoreHabilidades (copiados para a classe em app.js)
// ═══════════════════════════════════════════════════════════════════════════

import { loc } from "./idioma.js";
import {
  CFG, FP, LABEL_DEFAULTS, MOD, RES_KINDS, THEMES, applyTheme, catOf, clone, esc, getData,
  loadTemplates, nodeById, normalizeNode, opts, ownersOf, playerCharacters, presetOf, resFromPath,
  resPresets, saveCfg, saveTemplates, setData, syncPrimary, uid
} from "./core.js";
import { box } from "./chat.js";
import { fixOrphans } from "./compras.js";
import { featureSummary } from "./itens.js";
import { calApi, today } from "./regras.js";
import { DialogV2, charCard, datePicker, readDate, whoSub, whoTools, wireDate, wireWho } from "./ui-kit.js";

export class MixDialogs {
  // Exclui a seção atual. Árvores dentro dela são movidas para outra seção ou excluídas junto.
  async deleteSectionDialog() {
    if (!this.gm) return;
    const list = this.sections(), current = list.find(c => c.id === this.category);
    if (!current) return;
    if (list.length <= 1) return ui.notifications.warn(loc("ARVORE.Dialogos.estaEAUnicaSecaoCrieOutraAntes"));
    const inside = this.trees.filter(t => catOf(t) === current.id);
    const others = list.filter(c => c.id !== current.id);
    let what = "empty", target = others[0].id;
    if (inside.length) {
      const res = await DialogV2.prompt({
        window: { title: `${loc("ARVORE.Dialogos.excluirSecao")} ${current.name}` }, position: { width: 480 },
        content: `<p>${loc("ARVORE.Dialogos.aSecao")} <b>${esc(current.name)}</b> ${loc("ARVORE.Dialogos.tem")} <b>${inside.length}</b> ${loc("ARVORE.Dialogos.skillTreeS")}</p>
          <p style="font-size:12px">${esc(inside.map(t => t.name).join(", "))}</p>
          <div class="form-group"><label><input type="radio" name="what" value="move" checked> ${loc("ARVORE.Dialogos.moverAsArvoresPara")}</label>
            <div class="form-fields"><select name="target">${others.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}</select></div></div>
          <div class="form-group"><label><input type="radio" name="what" value="delete"> ${loc("ARVORE.Dialogos.excluirAsArvoresJuntoComASecao")}</label></div>`,
        ok: { label: loc("ARVORE.Dialogos.continuar"), callback: (e, b) => ({ what: b.form.elements.what.value, target: b.form.elements.target.value }) },
        rejectClose: false
      });
      if (!res) return;
      ({ what, target } = res);
    }
    const tName = others.find(c => c.id === target)?.name ?? "";
    const detail = what === "delete"
      ? `<p>${`${loc("ARVORE.Dialogos.as")} <b>${inside.length}</b> ${loc("ARVORE.Dialogos.skillTreeSDelaTambemSeraoExcluidas")}`}</p><p class="st-c-hint">${loc("ARVORE.Dialogos.agoraMesmoOsPersonagensRecebem")}</p>`
      : what === "move" ? `<p>${loc("ARVORE.Dialogos.as")} <b>${inside.length}</b> ${loc("ARVORE.Dialogos.skillTreeSDelaIraoPara")} <b>${esc(tName)}</b>${loc("ARVORE.Dialogos.semPerderProgressoNemAtribuicoes")}</p>` : "";
    if (!await DialogV2.confirm({ window: { title: loc("ARVORE.Dialogos.temCerteza") }, content: `<p>${loc("ARVORE.Dialogos.excluirASecao")} <b>${esc(current.name)}</b>?</p>${detail}`, rejectClose: false })) return;
    if (what === "move") for (const t of inside) t.section = target;
    else if (what === "delete") this.trees = this.trees.filter(t => catOf(t) !== current.id);
    (this._goneSections ??= {})[current.id] = current.name; // se o Ctrl+Z trouxer árvores de volta, a seção reaparece com o nome certo
    if (inside.length) { this.treeId = null; this.sel = null; this.multi.clear(); this.save(); }
    await setData("sections", { list: list.filter(c => c.id !== current.id) });
    this.category = what === "move" ? target : others[0].id;
    this.render();
    if (what === "delete" && inside.length) await this.cleanSheets();
    ui.notifications.info(loc("ARVORE.Dialogos.secaoExcluida", { name: current.name }));
  }

  // Apaga todas as Skill Trees do mundo, devolve os pontos e limpa as fichas na hora.
  async resetAllDialog() {
    if (!this.gm) return;
    const n = this.trees.length;
    const res = await DialogV2.wait({
      window: { title: loc("ARVORE.Dialogos.zerarArvoresTemCerteza") }, position: { width: 480 },
      content: `<p><b>${loc("ARVORE.Dialogos.temCerteza")}</b> ${loc("ARVORE.Dialogos.istoExclui")} <b>${loc("ARVORE.Dialogos.todasAsSkillTreeS", { n })}</b> ${loc("ARVORE.Dialogos.doMundo")}</p>
        <p style="font-size:12px">${loc("ARVORE.Dialogos.osPersonagensRecebemDeVoltaOs")} <b>${loc("ARVORE.Dialogos.naoPodeSerDesfeito")}</b> ${loc("ARVORE.Dialogos.exporteAntesAsArvoresQueQuiser")}</p>
        <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="backup" ${n ? "checked" : "disabled"}> ${loc("ARVORE.Dialogos.baixarBackupDeTodasAntesDeApagar")}</label>
        <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="sections" checked> ${loc("ARVORE.Dialogos.tambemApagarAsSecoesCriadasFica")}</label>`,
      buttons: [
        { action: "yes", label: loc("ARVORE.Dialogos.simZerarTudo"), icon: "fas fa-trash", callback: (e, b) => ({ sections: b.form.elements.sections.checked, backup: b.form.elements.backup.checked }) },
        { action: "no", label: loc("ARVORE.Dialogos.cancelar"), default: true }
      ],
      rejectClose: false
    });
    if (!res || typeof res !== "object") return;
    if (res.backup && n) {
      try { await this.exportAll(); }
      catch (error) { console.error(loc("ARVORE.Dialogos.arvoreDaMesaBackup"), error); return ui.notifications.error(loc("ARVORE.Dialogos.naoFoiPossivelGerarOBackupNada"), { permanent: true }); }
    }
    this.trees = []; this.treeId = null; this.sel = null; this.multi.clear();
    this.planning = false; this.plan = []; this.refunding = false; this.refundSel.clear();
    this.linking = false; this.linkFrom = null;
    this.undoStack = []; this.redoStack = []; this._lastSnap = JSON.stringify(this.trees);
    this._writer.stage(this.trees);
    try { await this.flushSave(); } catch { return; } // o erro já é avisado pela fila de gravação
    if (res.sections) { await setData("sections", { list: [{ id: "fantasy", name: loc("ARVORE.Comum.fantasia") }] }); this._goneSections = {}; }
    this.category = "fantasy";
    try {
      const rep = await fixOrphans(null, { trees: [] });
      await setData("pendingCleanup", false);
      if (rep.length) ui.notifications.info(loc("ARVORE.Comum.pontosDevolvidosParaPersonagem", { length: rep.length }));
    } catch (error) {
      console.error(loc("ARVORE.Dialogos.arvoreDaMesaZerarArvores"), error);
      ui.notifications.error(loc("ARVORE.Dialogos.asArvoresForamApagadasMasHouve"), { permanent: true });
    }
    ui.notifications.info(loc("ARVORE.Dialogos.todasAsSkillTreesForamApagadas"));
    this.render();
  }

  async sectionDialog(rename = false) {
    if (!this.gm) return;
    const list = this.sections(), current = list.find(c => c.id === this.category);
    const name = await DialogV2.prompt({
      window: { title: rename ? loc("ARVORE.Dialogos.renomearSecao") : loc("ARVORE.Dialogos.novaSecao") },
      content: `<label>${loc("ARVORE.Dialogos.nomeDaSecao")}<input name="sectionName" maxlength="80" value="${esc(rename ? current?.name : "")}" autofocus></label>`,
      ok: { label: loc("ARVORE.Comum.salvar"), callback: (e,b) => b.form.elements.sectionName.value.trim() }, rejectClose: false
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
    if (!tpls.length && !others.length) return ui.notifications.info(loc("ARVORE.Dialogos.nenhumModeloSalvoSelecioneUma"));
    const sum = nd => esc((normalizeNode(clone(nd)).features.map(featureSummary).join(" | ")) || (nd.changes?.length ? loc("ARVORE.Dialogos.efeitoPassivo") : ""));
    const rows = tpls.map((tp, i) => `<div class="st-who st-tpl" data-row="${i}" data-search="${esc(tp.name.toLowerCase())}">
      <img src="${esc(tp.img)}" alt=""><span class="st-who-t"><b>${esc(tp.name)}</b><small>${sum(tp)}</small></span>
      <button type="button" data-ins="${i}" class="st-c-btn" style="flex:0 0 auto;padding:0 12px">${loc("ARVORE.Dialogos.inserir")}</button>
      <button type="button" data-deltpl="${i}" class="st-c-ico" style="color:var(--st-bad)"><i class="fas fa-trash"></i></button></div>`).join("");
    const here = new Set(t.nodes.map(x => x.shared).filter(Boolean));
    const linkRows = others.map(x => `<div class="st-tpl-grp">${esc(x.name)}</div>` + x.nodes.map(nd => {
      const already = nd.shared && here.has(nd.shared);
      return `<div class="st-who st-tpl" data-search="${esc(nd.name.toLowerCase())}">
        <img src="${esc(nd.img)}" alt=""><span class="st-who-t"><b>${esc(nd.name)}${nd.shared ? ` <i class="fas fa-link" title="${loc("ARVORE.Comum.compartilhada")}"></i>` : ""}</b><small>${sum(nd)}</small></span>
        ${already ? `<span class="st-tag ok">${loc("ARVORE.Dialogos.jaEstaAqui")}</span>` : `<button type="button" data-link="${esc(x.id)}:${esc(nd.id)}" class="st-c-btn" style="flex:0 0 auto;padding:0 12px"><i class="fas fa-link"></i> ${loc("ARVORE.Dialogos.inserirVinculada")}</button>`}</div>`;
    }).join("")).join("");
    await DialogV2.prompt({
      window: { title: loc("ARVORE.Dialogos.modelosDeHabilidade"), icon: "fas fa-book-bookmark" }, position: { width: 560 },
      content: `<div class="st-c">
        <nav class="st-c-tabs"><button type="button" data-tab="tpl" class="on"><i class="fas fa-book-bookmark"></i> ${loc("ARVORE.Dialogos.modelosSalvos")}</button>
          <button type="button" data-tab="link"><i class="fas fa-link"></i> ${loc("ARVORE.Dialogos.deOutrasArvores")}</button></nav>
        <div class="st-who-tools"><input type="search" data-whofind placeholder="${loc("ARVORE.Comum.buscarHabilidade")}"></div>
        <section data-panel="tpl"><div class="st-who-grid" style="grid-template-columns:1fr">${rows || `<p class="st-c-hint">${loc("ARVORE.Dialogos.nenhumModeloSalvoSelecioneUma")}</p>`}</div></section>
        <section data-panel="link" hidden><p class="st-c-hint">${loc("ARVORE.Dialogos.umaHabilidadeVinculadaEAMesma")}</p>
          <div class="st-who-grid" style="grid-template-columns:1fr">${linkRows || `<p class="st-c-hint">${loc("ARVORE.Dialogos.nenhumaOutraSkillTreeComHabilidades")}</p>`}</div></section>
      </div>`,
      ok: { label: loc("ARVORE.Comum.fechar") },
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
          ui.notifications.info(loc("ARVORE.Dialogos.modeloInserido", { name: tp.name }));
        }));
        el.querySelectorAll("[data-link]").forEach(b => b.addEventListener("click", e => {
          e.preventDefault();
          const [tid, nid] = b.dataset.link.split(":"); const src = nodeById(this.trees.find(x => x.id === tid), nid); if (!src) return;
          src.shared ||= uid();
          const c = this.viewCenter();
          const n = normalizeNode({ ...clone(src), id: uid(), x: this.snapV(c.x), y: this.snapV(c.y), reqNodes: [], group: "", shared: src.shared });
          this.tree.nodes.push(n); this.sel = n.id; this.save(); this.render();
          b.replaceWith(Object.assign(document.createElement("span"), { className: "st-tag ok", textContent: loc("ARVORE.Dialogos.jaEstaAqui") }));
          ui.notifications.info(loc("ARVORE.Dialogos.inseridaEVinculada", { name: src.name }));
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

  // ── configurações ──
  // Janela da Skill Tree aberta: só o que vale para ela. As opções de todas as árvores ficam em generalConfig().
  async treeConfig() {
    const t = this.tree; if (!t || !this.gm) return;
    const pres = resPresets().filter(p => p.value !== "@custom");
    const isPre = !!presetOf(t.resPath);
    const rules = t.rules === "custom" ? "custom" : "dnd";
    const kindOpts = (cur, primary) => [["counter", loc("ARVORE.Dialogos.contadorProprioDaArvore")], ["field", loc("ARVORE.Dialogos.campoDaFicha")], ["xp", loc("ARVORE.Comum.xpDoPersonagem")], ...(primary ? [["skill", loc("ARVORE.Dialogos.pontosDeHabilidadeAutomatico")], ["coins", loc("ARVORE.Dialogos.ouroAceitaPlatina")]] : [])]
      .map(([v, l]) => `<option value="${v}" ${cur === v ? "selected" : ""}>${l}</option>`).join("");
    const resRow = (r, primary) => `<div class="st-c-res" data-resrow data-id="${esc(r.id)}">
      <span class="st-c-badge">${primary ? loc("ARVORE.Dialogos.principal") : "Extra"}</span>
      <input data-k="name" value="${esc(r.name)}" placeholder="${loc("ARVORE.Dialogos.nomeExPontosDeKi")}">
      <select data-k="kind">${kindOpts(r.kind, primary)}</select>
      <input data-k="path" value="${esc(r.path)}" placeholder="${loc("ARVORE.Dialogos.systemResourcesPrimaryValue")}" ${r.kind === "field" ? "" : "hidden"}>
      ${primary ? "" : `<button type="button" class="st-c-ico" data-delres data-tooltip="${loc("ARVORE.Comum.remover")}"><i class="fas fa-xmark"></i></button>`}</div>`;
    const resources = t.rules === "custom" && t.resources?.length ? t.resources : [resFromPath(isPre ? t.resPath : (t.resPath || "@tree"), t.resLabel)];
    const featOpts = this.trees.filter(x => x.feats.length).map(x => `<optgroup label="${esc(x.name)}">${x.feats.map(f => `<option value="${esc(f.id)}" ${t.lockFeat === f.id ? "selected" : ""}>${esc(f.name)}</option>`).join("")}</optgroup>`).join("");
    const row = (label, html, hint = "") => `<div class="st-c-row"><label>${label}</label><div class="st-c-f">${html}</div>${hint ? `<p class="st-c-hint">${hint}</p>` : ""}</div>`;
    const tog = (name, label, on, hint = "") => `<label class="st-c-tog"><input type="checkbox" name="${name}" ${on ? "checked" : ""}><span class="st-c-sw"></span><span><b>${label}</b>${hint ? `<small>${hint}</small>` : ""}</span></label>`;
    const resOpts = (cur, extra = "") => pres.map(p => `<option value="${esc(p.value)}" data-label="${esc(p.label)}" ${p.value === cur ? "selected" : ""}>${esc(p.name)}</option>`).join("") + extra;
    const data = await DialogV2.prompt({
      window: { title: `Skill Tree — ${t.name}`, icon: "fas fa-sitemap" }, position: { width: 560 },
      classes: ["st-cfg-dialog"],
      content: `<div class="st-c">
        <nav class="st-c-tabs">
          <button type="button" data-tab="geral" class="on"><i class="fas fa-sitemap"></i> ${loc("ARVORE.Dialogos.geral")}</button>
          <button type="button" data-tab="regras"><i class="fas fa-coins"></i> ${loc("ARVORE.Dialogos.custosERegras")}</button>
          <button type="button" data-tab="visual"><i class="fas fa-palette"></i> ${loc("ARVORE.Dialogos.visual")}</button>
        </nav>

        <section data-panel="geral">
          ${row(loc("ARVORE.Dialogos.nome"), `<input name="name" value="${esc(t.name)}">`)}
          ${row(loc("ARVORE.Dialogos.secao"), `<select name="section">${this.sections().map(c => `<option value="${esc(c.id)}" ${catOf(t) === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>`)}
          ${row(loc("ARVORE.Dialogos.descricaoCurta"), `<input name="desc" value="${esc(t.desc)}" placeholder="${loc("ARVORE.Dialogos.apareceNoPainelLateral")}">`)}
          <div class="st-c-box">
            ${tog("refundPlayer", loc("ARVORE.Dialogos.jogadorPodeReembolsar"), t.refundPlayer, loc("ARVORE.Dialogos.eleMesmoDevolveHabilidadesERecebe"))}
            ${tog("approval", loc("ARVORE.Dialogos.exigirAprovacaoDoMestre"), t.approval, loc("ARVORE.Dialogos.aCompraViraUmPedidoQueVoceAprova"))}
            ${row(loc("ARVORE.Dialogos.devolvidoNoReembolso"), `<input type="number" name="refundPct" min="0" max="100" value="${Number(t.refundPct ?? 100)}">`)}
          </div>
          <div class="st-c-box">
            <h4><i class="fas fa-lock"></i> ${loc("ARVORE.Comum.disponivel")}</h4>
            ${row(loc("ARVORE.Dialogos.liberada"), `<select name="lockKind">${opts([{ value: "", label: loc("ARVORE.Dialogos.sempre") }, { value: "feat", label: loc("ARVORE.Dialogos.depoisDeUmGrandeFeito") }, { value: "item", label: loc("ARVORE.Dialogos.quandoOPersonagemTiverUmItem") }, { value: "level", label: loc("ARVORE.Dialogos.quandoOPersonagemChegarAUmNivel") }, { value: "class", label: loc("ARVORE.Dialogos.quandoOPersonagemTiverUmaClasse") }, { value: "date", label: loc("ARVORE.Dialogos.numaDataDoCalendario") }], t.lockKind)}</select>`)}
            <div data-lock="feat">${row(loc("ARVORE.Comum.grandeFeito"), featOpts ? `<select name="lockFeat">${featOpts}</select>` : `<select name="lockFeat" disabled><option value="">${loc("ARVORE.Dialogos.nenhumCriadoAinda")}</option></select>`, featOpts ? loc("ARVORE.Dialogos.aoConcederEsteFeitoAArvoreSe") : loc("ARVORE.Dialogos.crieGrandesFeitosNoPainelDeQualquer"))}</div>
            <div data-lock="item">${row(loc("ARVORE.Dialogos.nomeDoItem"), `<input name="lockItem" value="${esc(t.lockItem)}" placeholder="${loc("ARVORE.Dialogos.exTomoDoArquimago")}">`, loc("ARVORE.Dialogos.bastaTerUmItemComEsteNomeNoInventario"))}</div>
            <div data-lock="level">${row(loc("ARVORE.Dialogos.nivelDoPersonagem"), `<input type="number" name="lockLevel" min="1" value="${Number(t.lockLevel) || 5}">`)}</div>
            <div data-lock="class"><div class="st-c-two">${row(loc("ARVORE.Comum.classe"), `<input name="lockClass" list="st-cls-list" value="${esc(t.lockClass)}" placeholder="${loc("ARVORE.Dialogos.exMago")}">`)}${row(loc("ARVORE.Dialogos.nivelMinimoNaClasse"), `<input type="number" name="lockClassLevel" min="0" value="${Number(t.lockClassLevel) || 0}">`, loc("ARVORE.Dialogos.n0Qualquer"))}</div>
              <datalist id="st-cls-list">${(this.catalog?.classes ?? []).map(c => `<option value="${esc(c.name)}">`).join("")}</datalist></div>
            <div data-lock="date">${row(loc("ARVORE.Dialogos.liberadaAPartirDe"), datePicker("lockDate", t.lockDate ?? today() + 7), calApi() ? loc("ARVORE.Dialogos.dataDoCalendarioDaMesa") : loc("ARVORE.Dialogos.semOCalendarioDaMesaContaEmDias"))}</div>
            <div data-lock="any">${tog("lockHide", loc("ARVORE.Dialogos.esconderDosJogadoresEnquanto"), t.lockHide, loc("ARVORE.Dialogos.desligadoOJogadorVeAArvoreCom"))}</div>
          </div>
        </section>

        <section data-panel="regras" hidden>
          <div class="st-c-cards">
            <label class="st-c-card"><input type="radio" name="rules" value="dnd" ${rules === "dnd" ? "checked" : ""}>
              <i class="fas fa-dice-d20"></i><b>${loc("ARVORE.Dialogos.dD5e")}</b><small>${loc("ARVORE.Dialogos.gastaPontosDeHabilidadeXpOuOuro")}</small></label>
            <label class="st-c-card"><input type="radio" name="rules" value="custom" ${rules === "custom" ? "checked" : ""}>
              <i class="fas fa-wand-magic-sparkles"></i><b>${loc("ARVORE.Dialogos.personalizado")}</b><small>${loc("ARVORE.Dialogos.voceCriaOsRecursosEDaNomeACada")}</small></label>
          </div>

          <div data-rules="dnd">
            ${row(loc("ARVORE.Dialogos.pontosGastos"), `<select name="resDnd">${resOpts(isPre && rules === "dnd" ? t.resPath : "@skill")}</select>`)}
            <p class="st-c-name" data-name></p>
          </div>

          <div data-rules="custom">
            <div class="st-c-box">
              <h4><i class="fas fa-coins"></i> ${loc("ARVORE.Dialogos.recursosGastos")}</h4>
              <p class="st-c-hint">${loc("ARVORE.Dialogos.oPrimeiroEO")} <b>${loc("ARVORE.Dialogos.principal2")}</b> ${loc("ARVORE.Dialogos.oCustoNormalDaHabilidadeOsOutros")}</p>
              <div data-reslist>${resources.map((r, i) => resRow(r, i === 0)).join("")}</div>
              <button type="button" class="st-c-btn" data-addres><i class="fas fa-plus"></i> ${loc("ARVORE.Dialogos.adicionarRecurso")}</button>
            </div>
            <div class="st-c-box">
              <h4><i class="fas fa-pen-to-square"></i> ${loc("ARVORE.Dialogos.nomesDosCamposDeCusto")}</h4>
              <p class="st-c-hint">${loc("ARVORE.Dialogos.comoCadaCampoApareceNoEditor")}</p>
              <div class="st-c-two">
                ${Object.entries(LABEL_DEFAULTS()).map(([k, d]) => row(esc(d), `<input name="lbl-${k}" value="${esc(t.labels?.[k] ?? "")}" placeholder="${esc(d)}">`)).join("")}
              </div>
              ${tog("useCoins", loc("ARVORE.Dialogos.usarCustosEmMoedasOuroEPlatina"), t.useCoins !== false, loc("ARVORE.Dialogos.desligadoOsCamposDeOuroEPlatina"))}
            </div>
          </div>

          <div data-costinc>${row(loc("ARVORE.Dialogos.custoCrescente"), `<input type="number" name="costInc" min="0" value="${Number(t.costInc) || 0}">`, loc("ARVORE.Dialogos.cadaHabilidadeJaCompradaSoma"))}</div>
        </section>

        <section data-panel="visual" hidden>
          ${row(loc("ARVORE.Dialogos.ligacoes"), `<select name="linkStyle">${opts([{ value: "curve", label: loc("ARVORE.Dialogos.curvasAnimadas") }, { value: "straight", label: loc("ARVORE.Dialogos.retas") }], t.linkStyle)}</select>`)}
          ${row(loc("ARVORE.Dialogos.gradeAoArrastarPx"), `<input type="number" name="snap" min="1" value="${Number(t.snap) || 10}">`)}
          ${row(loc("ARVORE.Dialogos.imagemDeFundo"), `<input name="bg" value="${esc(t.bg)}" placeholder="${loc("ARVORE.Dialogos.vazioSemFundo")}"><button type="button" data-fp="bg" class="st-c-ico"><i class="fas fa-file-image"></i></button>`)}
          ${row(loc("ARVORE.Dialogos.opacidadeDoFundo"), `<input type="range" name="bgOpacity" min="0.05" max="1" step="0.05" value="${Number(t.bgOpacity) || 0.35}">`)}
          ${row(loc("ARVORE.Dialogos.somAoDesbloquear"), `<input name="sound" value="${esc(t.sound)}" placeholder="${loc("ARVORE.Dialogos.vazioSomPadraoNoneSemSom")}"><button type="button" data-fp="sound" class="st-c-ico"><i class="fas fa-music"></i></button>`)}
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
          q("[data-name]").innerHTML = label ? `<i class="fas fa-tag"></i> ${loc("ARVORE.Dialogos.nomeDosPontos")} <b>${esc(label)}</b> <small>${loc("ARVORE.Dialogos.automatico")}</small>` : "";
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
        label: loc("ARVORE.Comum.salvar"), icon: "fas fa-check", callback: (e, btn) => {
          const f = btn.form.elements;
          const rules = f.rules.value === "custom" ? "custom" : "dnd";
          let resPath = t.resPath, resLabel = t.resLabel, resources = [], labels = {};
          if (rules === "dnd") { resPath = f.resDnd.value; resLabel = presetOf(resPath)?.label ?? loc("ARVORE.Comum.pontos"); }
          else {
            resources = [...btn.form.querySelectorAll("[data-resrow]")].map((el, i) => {
              const v = k => el.querySelector(`[data-k="${k}"]`)?.value?.trim() ?? "";
              const kind = RES_KINDS.includes(v("kind")) ? v("kind") : "counter";
              return { id: el.dataset.id || uid(), name: v("name") || (i ? `${loc("ARVORE.Dialogos.recurso")} ${i + 1}` : loc("ARVORE.Comum.pontos")), kind: kind === "field" && !v("path") ? "counter" : kind, path: kind === "field" ? v("path") : "" };
            });
            if (!resources.length) resources = [{ id: uid(), name: loc("ARVORE.Comum.pontos"), kind: "counter", path: "" }];
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
    let cur = "dourado"; try { cur = game.settings.get(MOD, "theme") || "dourado"; } catch (e) { console.warn("Árvore da Mesa | tema", e); }
    const anterior = cur;
    const res = await DialogV2.prompt({
      window: { title: loc("ARVORE.Dialogos.temaDeCores"), icon: "fas fa-palette" }, position: { width: 460 }, classes: ["st-cfg-dialog"],
      content: `<div class="st-c"><p class="st-c-lead">${loc("ARVORE.Dialogos.soMudaParaVoceOsOutrosJogadores")}</p>
        <div class="st-themes">${THEMES.map(x => `<label class="st-theme"><input type="radio" name="theme" value="${x.id}" ${x.id === cur ? "checked" : ""}>
          <span class="sw">${x.sw.map(c => `<i style="background:${c}"></i>`).join("")}</span><b>${esc(x.name)}</b></label>`).join("")}</div></div>`,
      render: (ev, dlg) => dlg.element?.querySelectorAll?.('[name="theme"]').forEach(r => r.addEventListener("change", () => applyTheme(r.value))),
      ok: { label: loc("ARVORE.Dialogos.usarEsteTema"), icon: "fas fa-check", callback: (e, b) => b.form.elements.theme.value },
      rejectClose: false
    });
    if (!res) return applyTheme(anterior);
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
      window: { title: loc("ARVORE.Dialogos.configuracoesGerais"), icon: "fas fa-sliders" }, position: { width: 520 },
      classes: ["st-cfg-dialog"],
      content: `<div class="st-c">
        <p class="st-c-lead"><i class="fas fa-globe"></i> ${loc("ARVORE.Dialogos.valemPara")} <b>${loc("ARVORE.Dialogos.todas")}</b> ${loc("ARVORE.Dialogos.asSkillTreesDoMundo")}</p>
        <div class="st-c-box">
          <h4><i class="fas fa-star"></i> ${loc("ARVORE.Comum.pontosDeHabilidade")}</h4>
          <div class="st-c-two">
            ${row(loc("ARVORE.Dialogos.pontosPorNivel"), `<input type="number" name="ptsPerLevel" min="0" value="${CFG.ptsPerLevel}">`)}
            ${row(loc("ARVORE.Dialogos.nivelMaximoQueDaPontos"), `<input type="number" name="maxLevel" min="1" value="${CFG.maxLevel}">`)}
          </div>
          ${tog("levelNotice", loc("ARVORE.Dialogos.avisoAoSubirDeNivel"), CFG.levelNotice, loc("ARVORE.Dialogos.mostraNoChatQuantosPontosOPersonagem"))}
          ${tog("availNotice", loc("ARVORE.Dialogos.avisoDeHabilidadeDisponivel"), CFG.availNotice, loc("ARVORE.Dialogos.quandoOPersonagemSobeDeNivel"))}
        </div>
        <div class="st-c-box">
          <h4><i class="fas fa-id-card"></i> ${loc("ARVORE.Dialogos.fichaDoPersonagem")}</h4>
          ${tog("sheetButton", loc("ARVORE.Dialogos.botaoSkillTreeNaFicha"), CFG.sheetButton)}
          ${tog("sheetTab", loc("ARVORE.Dialogos.abaSkillTreeDentroDaFicha"), CFG.sheetTab)}
          ${row(loc("ARVORE.Dialogos.somPadrao"), `<input name="defaultSound" value="${esc(CFG.defaultSound)}"><button type="button" data-fp="defaultSound" class="st-c-ico"><i class="fas fa-music"></i></button>`)}
        </div>
        <div class="st-c-box">
          <h4><i class="fas fa-box-archive"></i> ${loc("ARVORE.Dialogos.backup")}</h4>
          <button type="button" data-export class="st-c-btn" ${n ? "" : "disabled"}><i class="fas fa-download"></i> ${loc("ARVORE.Dialogos.exportarTodasAsSkillTrees", { n })}</button>
          <p class="st-c-hint">${loc("ARVORE.Dialogos.umArquivoJsonSoComAsArvoresE")}</p>
        </div>
        <div class="st-c-box st-c-danger">
          <h4><i class="fas fa-triangle-exclamation"></i> ${loc("ARVORE.Dialogos.zonaDePerigo")}</h4>
          <button type="button" data-reset class="st-c-btn st-c-btn-danger"><i class="fas fa-trash"></i> ${loc("ARVORE.Dialogos.zerarArvores")}</button>
          <p class="st-c-hint">${loc("ARVORE.Dialogos.excluiTodasAsSkillTreesEDevolve")}</p>
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
        label: loc("ARVORE.Comum.salvar"), icon: "fas fa-check", callback: (e, btn) => {
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
    ui.notifications.info(loc("ARVORE.Dialogos.configuracoesGeraisSalvas"));
  }

  async assign() {
    const t = this.tree; if (!t || !this.gm) return;
    const chars = playerCharacters();
    if (!chars.length) return ui.notifications.warn(loc("ARVORE.Dialogos.nenhumPersonagemEncontrado"));
    const result = await DialogV2.prompt({
      window: { title: loc("ARVORE.Dialogos.atribuir", { name: t.name }), icon: "fas fa-user-plus" }, position: { width: 560 },
      content: `<div class="st-c">
        <p class="st-c-lead">${loc("ARVORE.Dialogos.marqueQuemRecebeEstaSkillTree")}</p>
        ${whoTools(chars.length > 6)}
        <div class="st-who-grid">${chars.map(a => charCard(a, { checked: t.assigned.includes(a.id), sub: whoSub(a) })).join("")}</div>
        <label class="st-c-tog"><input type="checkbox" name="avisar" checked><span class="st-c-sw"></span><span><b>${loc("ARVORE.Dialogos.avisarOsJogadoresNoChat")}</b></span></label>
      </div>`,
      render: (ev, dlg) => { if (dlg.element?.querySelector) wireWho(dlg.element); },
      ok: { label: loc("ARVORE.Comum.salvar"), callback: (e, btn) => ({
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
        content: box(`<b>${esc(a.name)}</b> ${loc("ARVORE.Dialogos.recebeuASkillTree")} <b>${esc(t.name)}</b>${loc("ARVORE.Dialogos.abraAArvoreDaMesaPeloBotao")} <i class="fas fa-sitemap"></i> ${loc("ARVORE.Dialogos.naBarraLateralOuNaFicha")}`)
      });
    }
    ui.notifications.info(loc("ARVORE.Dialogos.atribuidaAPersonagemNs", { name: t.name, length: result.ids.length }));
  }

  // ── diário da sessão ──
  sessionInfo() { return { start: 0, n: 1, ...(getData("session", {}) ?? {}) }; }
}
