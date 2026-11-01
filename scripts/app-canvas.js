// ═══════════════════════════════════════════════════════════════════════════
//  Árvore da Mesa — mapa: desenho, eventos, arrastar, zoom, ligações, copiar/colar
//  Métodos da janela ArvoreHabilidades (copiados para a classe em app.js)
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
  K_TEMP, tempsOf, tempOf, tempText, grantTemp, endTemp, today, dateText, calApi, syncShared, sharedCopies, SHARED_SKIP
} from "./core.js?v=1.7.10";
import { SaveQueue } from "./persistence.js?v=1.7.10";
import { validateTrees, remapTree } from "./validation.js?v=1.7.10";
import { actorOperation } from "./operations.js?v=1.7.10";
import { DialogV2, charCard, whoSub, whoTools, wireWho, datePicker, readDate, wireDate } from "./ui-kit.js?v=1.7.10";

export class MixCanvas {
  endPointerInteraction() { this._pointerEnd?.(); this._pointerEnd = null; }

  bindPointer(move, up) {
    this.endPointerInteraction();
    const finish = event => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("blur", finish);
      this._pointerEnd = null;
      up(event);
    };
    this._pointerEnd = finish;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("blur", finish);
  }

  // ── desenho ──
  toolboxHTML() {
    const tb = (tool, icon, tip) => `<button type="button" data-tool="${tool}" class="${this.tool === tool ? "on" : ""}" data-tooltip="${tip}"><i class="${icon}"></i></button>`;
    const sw = DRAW_COLORS.map(c => `<button type="button" class="st-sw ${c === this.drawColor ? "on" : ""}" data-color="${c}" style="--sw:${c}" aria-label="${c}"></button>`).join("");
    const widths = [2, 4, 8, 14].map(w => `<button type="button" data-drawwidth-btn="${w}" class="st-wbtn ${w === this.drawWidth ? "on" : ""}" data-tooltip="${w}px"><span style="--w:${Math.max(3, w)}px"></span></button>`).join("");
    const drawing = this.tool !== "select";
    return `<div class="st-tools ${this.toolsMin ? "min" : ""}">
      <div class="st-tgrp">
        ${tb("select", "fas fa-arrow-pointer", L("Selecionar / mover habilidades"))}
        ${tb("pencil", "fas fa-pencil", L("Lápis (desenho livre)"))}
        ${tb("ellipse", "far fa-circle", L("Elipse (arraste; Shift = círculo)"))}
        ${tb("text", "fas fa-font", L("Caixa de texto (clique no mapa)"))}
        ${tb("erase", "fas fa-eraser", L("Borracha (clique ou arraste sobre o desenho)"))}
      </div>
      <div class="st-tgrp ${drawing ? "" : "dim"}">
        <button type="button" class="st-curcolor ${this.paletteOpen ? "on" : ""}" data-palette data-tooltip="${L("Cor")}"><span style="--sw:${this.drawColor}"></span></button>
        <div class="st-wbtns">${widths}</div>
        <button type="button" data-drawfill class="${this.drawFill ? "on" : ""}" data-tooltip="${L("Preencher elipse")}"><i class="fas fa-fill-drip"></i></button>
      </div>
      <div class="st-tgrp">
        <button type="button" data-drawundo data-tooltip="${L("Desfazer último desenho")}"><i class="fas fa-rotate-left"></i></button>
        <button type="button" data-drawclear class="st-trash" data-tooltip="${L("Apagar todos os desenhos")}"><i class="fas fa-trash"></i></button>
      </div>
      ${this.paletteOpen ? `<div class="st-palpop"><div class="st-palette">${sw}</div>
        <label class="st-palcustom"><input type="color" data-drawcolor value="${this.drawColor}"> ${L("Outra cor")}</label></div>` : ""}
    </div>`;
  }


  drawingSVG(d) {
    const c = esc(d.color || "#e8c14a"), w = Number(d.width) || 4;
    if (d.type === "path" && d.points?.length) {
      const pts = d.points.length === 1 ? [d.points[0], [d.points[0][0] + 0.1, d.points[0][1]]] : d.points;
      return `<path data-draw="${esc(d.id)}" d="M${pts.map(p => p.map(v => Number(v) || 0).join(",")).join(" L")}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    if (d.type === "ellipse") return `<ellipse data-draw="${esc(d.id)}" cx="${(Number(d.x) || 0) + (Number(d.w) || 0) / 2}" cy="${(Number(d.y) || 0) + (Number(d.h) || 0) / 2}" rx="${d.w / 2}" ry="${d.h / 2}" fill="${d.fill ? c : "none"}" fill-opacity="${d.fill ? 0.25 : 0}" stroke="${c}" stroke-width="${w}"/>`;
    if (d.type === "text") {
      const size = Number(d.size) || 20;
      const lines = String(d.text ?? "").split("\n").map((l, i) => `<tspan x="${Number(d.x) || 0}" dy="${i ? size * 1.2 : 0}">${esc(l) || " "}</tspan>`).join("");
      return `<text data-draw="${esc(d.id)}" x="${Number(d.x) || 0}" y="${Number(d.y) || 0}" fill="${c}" font-size="${size}" font-weight="${d.bold ? "bold" : "normal"}" dominant-baseline="hanging" stroke="#000" stroke-width="${Math.max(2, size / 8)}" paint-order="stroke" style="font-family:var(--font-primary, serif)">${lines}</text>`;
    }
    return "";
  }

  drawingsSVG(t) { return (t.drawings ?? []).map(d => this.drawingSVG(d)).join(""); }

  redrawDrawings() {
    const svg = this.view$?.querySelector(".st-draw");
    if (svg && this.tree) svg.innerHTML = this.drawingsSVG(this.tree);
  }

  async addText(p) {
    const data = await DialogV2.prompt({
      window: { title: L("Caixa de texto") },
      content: L`<div class="form-group stacked"><label>Texto</label><textarea name="txt" rows="4" style="width:100%" autofocus></textarea></div>
        <div class="form-group"><label>Tamanho</label><input type="number" name="size" value="${this.textSize ?? 22}" min="8" max="200"></div>
        <div class="form-group"><label>Negrito</label><input type="checkbox" name="bold"></div>`,
      ok: { label: L("Adicionar"), callback: (e, btn) => ({ text: btn.form.elements.txt.value, size: Number(btn.form.elements.size.value) || 22, bold: btn.form.elements.bold.checked }) }
    });
    if (!data?.text?.trim()) return;
    this.textSize = data.size;
    this.tree.drawings.push({ id: uid(), type: "text", x: Math.round(p.x), y: Math.round(p.y), text: data.text, size: data.size, bold: data.bold, color: this.drawColor });
    this.save(); this.redrawDrawings();
  }

  onDrawPointer(ev) {
    const t = this.tree; if (!t) return;
    const svg = this.view$.querySelector(".st-draw");
    const NS = "http://www.w3.org/2000/svg";
    const p0 = this.toStage(ev);
    const r1 = v => Math.round(v * 10) / 10;
    if (this.tool === "text") return this.addText(p0);
    if (this.tool === "erase") {
      let erased = false;
      const apagar = e => {
        const el = document.elementsFromPoint(e.clientX, e.clientY).find(x => x.closest?.(".st-draw") && x.closest("[data-draw]"));
        const id = el?.closest("[data-draw]")?.dataset.draw;
        if (!id) return;
        t.drawings = t.drawings.filter(d => d.id !== id);
        el.closest("[data-draw]").remove();
        erased = true;
      };
      apagar(ev);
      const up = () => { window.removeEventListener("pointermove", apagar); window.removeEventListener("pointerup", up); if (erased) this.save(); };
      this.bindPointer(apagar, up);
      return;
    }
    let d;
    if (this.tool === "pencil") d = { id: uid(), type: "path", color: this.drawColor, width: this.drawWidth, points: [[r1(p0.x), r1(p0.y)]] };
    else if (this.tool === "ellipse") d = { id: uid(), type: "ellipse", color: this.drawColor, width: this.drawWidth, fill: this.drawFill, x: p0.x, y: p0.y, w: 0, h: 0 };
    else return;
    const tmp = document.createElementNS(NS, "g"); svg.appendChild(tmp);
    const move = e => {
      const p = this.toStage(e);
      if (d.type === "path") {
        const last = d.points.at(-1);
        if (Math.hypot(p.x - last[0], p.y - last[1]) < 2 / this.v.z) return;
        d.points.push([r1(p.x), r1(p.y)]);
      } else {
        let x = Math.min(p0.x, p.x), y = Math.min(p0.y, p.y), w = Math.abs(p.x - p0.x), h = Math.abs(p.y - p0.y);
        if (e.shiftKey) { const m = Math.max(w, h); w = h = m; x = p.x < p0.x ? p0.x - m : p0.x; y = p.y < p0.y ? p0.y - m : p0.y; }
        Object.assign(d, { x: r1(x), y: r1(y), w: r1(w), h: r1(h) });
      }
      tmp.innerHTML = this.drawingSVG(d);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      tmp.remove();
      if (d.type === "ellipse" && (d.w < 3 || d.h < 3)) return;
      t.drawings.push(d);
      this.save(); this.redrawDrawings();
    };
    tmp.innerHTML = this.drawingSVG(d);
    this.bindPointer(move, up);
  }

  // ── listeners ──
  activate(root) {
    this.view$ = root.querySelector(".st-view");
    this.stage$ = root.querySelector(".st-stage");
    this.svg$ = root.querySelector(".st-lines");
    if (this.v.fresh && (this.tree?.nodes.length || this.tree?.drawings?.length)) { requestAnimationFrame(() => this.fit()); this.v.fresh = false; }
    this.applyView();
    this.drawLines();
    this.applyFilter();

    root.querySelectorAll("[data-cat]").forEach(el => el.addEventListener("click", () => {
      if (el.dataset.cat === this.category) return;
      this.lastTree[this.category] = this.treeId;
      this.category = el.dataset.cat;
      this.treeId = this.lastTree[this.category] ?? null;
      this.sel = null; this.multi.clear(); this.linkFrom = null; this.plan = []; this.planning = false;
      this.render();
    }));
    root.querySelector('[data-sel="tree"]')?.addEventListener("change", ev => { this.treeId = ev.target.value; this.sel = null; this.multi.clear(); this.linkFrom = null; this.plan = []; this.render(); });
    root.querySelector('[data-sel="res"]')?.addEventListener("change", ev => this.setResource(ev.target.value));
    root.querySelector("[data-search]")?.addEventListener("input", ev => { this.search = ev.target.value; this.applyFilter(); });
    root.querySelector("[data-filter]")?.addEventListener("change", ev => { this.filter = ev.target.value; this.applyFilter(); });
    root.querySelectorAll("[data-act]").forEach(el => el.addEventListener("click", ev => { ev.preventDefault(); if (this._actionBusy) return; this._actionBusy = true; Promise.resolve(this.onAction(el.dataset.act, el)).catch(error => { console.error(error); ui.notifications.error(error.message); }).finally(() => { this._actionBusy = false; }); }));
    root.querySelectorAll("[data-field]").forEach(el => el.addEventListener("change", () => this.onField(el)));
    root.querySelectorAll("[data-extra]").forEach(el => el.addEventListener("change", () => {
      const n = this.selNode; if (!n) return;
      n.extra = { ...(n.extra ?? {}), [el.dataset.extra]: Math.max(0, Number(el.value) || 0) };
      if (!n.extra[el.dataset.extra]) delete n.extra[el.dataset.extra];
      this.save(); this.render();
    }));
    const listOf = el => {
      const LS = el.dataset.list, n = this.selNode;
      if (!n) return null;
      if (LS === "p") return n.changes;
      if (LS?.startsWith("f")) return n.features[Number(LS.slice(1))]?.changes;
      return null;
    };
    root.querySelectorAll("[data-chg]").forEach(el => el.addEventListener("change", () => {
      const c = listOf(el)?.[Number(el.dataset.chg)]; if (!c) return;
      c[el.dataset.k] = el.value; this.save(); this.render();
    }));
    root.querySelectorAll("[data-delchg]").forEach(el => el.addEventListener("click", () => { listOf(el)?.splice(Number(el.dataset.delchg), 1); this.save(); this.render(); }));
    root.querySelectorAll("[data-feat]").forEach(el => el.addEventListener("change", () => {
      const f = this.selNode?.features[Number(el.dataset.fi)]; if (!f) return;
      f[el.dataset.feat] = el.type === "checkbox" ? el.checked : el.type === "number" ? Math.max(0, Number(el.value) || 0) : el.value;
      this.save(); this.render();
    }));
    root.querySelectorAll("[data-chgr]").forEach(el => el.addEventListener("change", () => {
      const c = listOf(el)?.[Number(el.dataset.chgr)]; if (!c) return;
      c.values ??= [];
      c.values[Number(el.dataset.r)] = el.value;
      this.save(); this.render();
    }));
    root.querySelectorAll("[data-fr]").forEach(el => el.addEventListener("change", () => {
      const f = this.selNode?.features[Number(el.dataset.fi)]; if (!f) return;
      f.byRank ??= {}; f.byRank[el.dataset.fr] ??= [];
      f.byRank[el.dataset.fr][Number(el.dataset.r)] = el.value;
      this.save(); this.render();
    }));
    root.querySelectorAll("[data-rdesc]").forEach(el => el.addEventListener("change", () => {
      const n = this.selNode; if (!n) return;
      n.rankDescs[Number(el.dataset.rdesc)] = el.value; this.save(); this.render();
    }));
    root.querySelectorAll("[data-delfeat]").forEach(el => el.addEventListener("click", async () => {
      if (!await DialogV2.confirm({ window: { title: L("Remover habilidade da ficha") }, content: L("<p>Remover esta habilidade da ficha desta habilidade da árvore?</p>") })) return;
      this.selNode.features.splice(Number(el.dataset.delfeat), 1); this.save(); this.render();
    }));
    root.querySelectorAll("details[data-sec]").forEach(el => el.addEventListener("toggle", () => {
      if (el.open) this.secOpen.add(el.dataset.sec); else this.secOpen.delete(el.dataset.sec);
    }));
    root.querySelectorAll("[data-rc]").forEach(el => el.addEventListener("change", () => {
      const rc = this.selNode?.reqClasses[Number(el.dataset.rc)]; if (!rc) return;
      if (el.dataset.k === "id") { rc.id = el.value; rc.name = this.catalog?.classes.find(c => c.id === el.value)?.name ?? el.value; }
      else rc.level = Math.max(0, Number(el.value) || 0);
      this.save(); this.render();
    }));
    root.querySelector("[data-addrn]")?.addEventListener("change", ev => {
      const n = this.selNode; if (!n || !ev.target.value) return;
      const [tree, node] = ev.target.value.split(":");
      const nm = nodeById(this.trees.find(x => x.id === tree), node)?.name;
      if (!n.reqNodes.some(r => r.tree === tree && r.node === node)) n.reqNodes.push({ tree, node, name: nm, rank: 1 });
      this.save(); this.render();
    });
    root.querySelectorAll("[data-delrn]").forEach(el => el.addEventListener("click", () => { this.selNode.reqNodes.splice(Number(el.dataset.delrn), 1); this.save(); this.render(); }));
    root.querySelectorAll("[data-rnrank]").forEach(el => el.addEventListener("change", () => {
      const r = this.selNode?.reqNodes[Number(el.dataset.rnrank)]; if (!r) return;
      r.rank = Math.max(1, Number(el.value) || 1); this.save(); this.render();
    }));
    root.querySelectorAll("[data-charge]").forEach(el => el.addEventListener("click", async () => {
      const a = this.actorDoc, it = a?.items.get(el.dataset.charge); if (!it) return;
      if (el.dataset.full) await it.update({ "system.uses.spent": 0 }); else await addCharge(a, "manual", 1, it);
    }));
    root.querySelectorAll("[data-delrc]").forEach(el => el.addEventListener("click", () => { this.selNode.reqClasses.splice(Number(el.dataset.delrc), 1); this.save(); this.render(); }));
    root.querySelectorAll("[data-dellist]").forEach(el => el.addEventListener("click", ev => {
      ev.stopPropagation();
      const [k, i] = el.dataset.dellist.split(":");
      this.selNode?.[k]?.splice(Number(i), 1); this.save(); this.render();
    }));
    root.querySelectorAll("[data-qty]").forEach(el => {
      el.addEventListener("click", ev => ev.stopPropagation());
      el.addEventListener("change", () => {
        const [k, i] = el.dataset.qty.split(":");
        const it = this.selNode?.[k]?.[Number(i)]; if (!it) return;
        it.qty = Math.max(1, Number(el.value) || 1); this.save();
      });
    });
    root.querySelector("[data-group]")?.addEventListener("change", async ev => {
      const n = this.selNode; if (!n) return;
      let g = ev.target.value;
      if (g === "@new") {
        g = await DialogV2.prompt({
          window: { title: L("Novo grupo de escolha exclusiva") },
          content: L`<p>Dê um nome ao grupo. Depois coloque as outras habilidades alternativas nele.</p><input name="g" placeholder="ex.: Caminho final" autofocus style="width:100%">`,
          ok: { label: L("Criar"), callback: (e, btn) => btn.form.elements.g.value.trim() }
        });
        if (!g) return this.render();
      }
      n.group = g; this.save(); this.render();
    });
    root.querySelectorAll("[data-delitem]").forEach(el => el.addEventListener("click", ev => { ev.stopPropagation(); this.selNode.items.splice(Number(el.dataset.delitem), 1); this.save(); this.render(); }));
    root.querySelectorAll("[data-unlink]").forEach(el => el.addEventListener("click", () => {
      const t = this.tree; t.edges = t.edges.filter(e => !(e.from === el.dataset.unlink && e.to === this.sel)); this.save(); this.render();
    }));
    root.querySelectorAll("[data-open]").forEach(el => el.addEventListener("click", async () => (await fromUuid(el.dataset.open))?.sheet?.render(true)));
    root.querySelectorAll("[data-reqact]").forEach(el => el.addEventListener("click", () => { el.disabled = true; handleRequest(el.dataset.actor, el.dataset.req, el.dataset.reqact === "approve"); }));
    root.querySelectorAll("[data-endfx]").forEach(el => el.addEventListener("click", () => this.actorDoc?.effects.get(el.dataset.endfx)?.delete()));
    root.querySelector("[data-unshare]")?.addEventListener("click", e => {
      e.preventDefault(); const n = this.selNode; if (!n) return;
      const left = sharedCopies(this.trees, n.shared, n.id);
      n.shared = ""; if (left.length === 1) left[0].n.shared = "";
      this.save(); this.render();
      ui.notifications.info(L("Agora esta habilidade é independente."));
    });
    root.querySelectorAll("[data-reqdate]").forEach(el => el.addEventListener("click", async e => {
      e.preventDefault(); const n = this.selNode; if (!n) return;
      if (el.dataset.reqdate === "off") { n.reqDate = null; this.save(); return this.render(); }
      const td = await DialogV2.prompt({
        window: { title: L("Data do calendário"), icon: "fas fa-calendar-day" },
        content: `<div class="st-c"><p class="st-c-lead">${L`<b>${esc(n.name)}</b> só pode ser desbloqueada a partir desta data.`}</p>${datePicker("d", n.reqDate ?? today() + 7)}</div>`,
        render: (ev, dlg) => { if (dlg.element?.querySelector) wireDate(dlg.element); },
        ok: { label: L("Salvar"), callback: (ev, btn) => readDate(btn.form, "d") }, rejectClose: false
      });
      if (td === null || td === undefined) return;
      n.reqDate = td; this.save(); this.render();
    }));
    root.querySelectorAll("[data-tempkeep]").forEach(el => el.addEventListener("click", async e => { e.preventDefault(); const a = this.actorDoc; if (a) { await endTemp(a, el.dataset.tempkeep, { keep: true }); this.render(); } }));
    root.querySelectorAll("[data-tempend]").forEach(el => el.addEventListener("click", async e => {
      e.preventDefault(); const a = this.actorDoc; if (!a) return;
      if (!await DialogV2.confirm({ window: { title: L("Remover agora") }, content: `<p>${L("Tirar agora esta habilidade temporária do personagem?")}</p>`, rejectClose: false })) return;
      await endTemp(a, el.dataset.tempend); this.render();
    }));
    root.querySelectorAll("[data-goto]").forEach(el => el.addEventListener("click", () => {
      const [tid, nid] = el.dataset.goto.split(":"); const tr = this.trees.find(x => x.id === tid); if (!tr) return;
      this.treeId = tid; this.category = catOf(tr); this.sel = nid; this.panelOpen = true; this.render();
    }));
    root.querySelectorAll("[data-featgive]").forEach(el => el.addEventListener("click", e => { e.preventDefault(); this.featDialog(null, el.dataset.featgive); }));
    root.querySelectorAll("[data-featrevoke]").forEach(el => el.addEventListener("click", e => { e.preventDefault(); this.revokeFeat(this.actorDoc, el.dataset.featrevoke); }));
    root.querySelectorAll("[data-featedit]").forEach(el => el.addEventListener("click", e => { e.preventDefault(); this.editFeat(el.dataset.featedit); }));
    root.querySelectorAll("[data-featdel]").forEach(el => el.addEventListener("click", e => { e.preventDefault(); this.deleteFeat(el.dataset.featdel); }));
    root.querySelectorAll("[data-mile]").forEach(el => el.addEventListener("change", () => {
      const a = this.actorDoc; if (!a) return;
      const m = el.dataset.mile, list = milestonesOf(a).filter(x => x !== m);
      const upd = { [K_MILES]: list };
      if (el.checked) { list.push(m); upd[K_LOG] = addLog(a, { act: "mile", nodeName: m }); whisperOwners(a, L`🏆 <b>${esc(a.name)}</b> alcançou o marco <b>${esc(m)}</b>.`); }
      a.update(upd);
    }));

    const view = this.view$;
    view.addEventListener("contextmenu", ev => ev.preventDefault());
    view.addEventListener("pointerenter", () => { this._hover = true; });
    view.addEventListener("pointerleave", () => { this._hover = false; });
    root.querySelectorAll("[data-tool]").forEach(el => el.addEventListener("click", () => { this.tool = el.dataset.tool; this.linking = false; this.linkFrom = null; this.render(); }));
    root.querySelectorAll("[data-color]").forEach(el => el.addEventListener("click", () => { this.drawColor = el.dataset.color; this.paletteOpen = false; if (this.tool === "select" || this.tool === "erase") this.tool = "pencil"; this.render(); }));
    root.querySelector("[data-drawcolor]")?.addEventListener("change", ev => { this.drawColor = ev.target.value; this.paletteOpen = false; if (this.tool === "select" || this.tool === "erase") this.tool = "pencil"; this.render(); });
    root.querySelector("[data-palette]")?.addEventListener("click", () => { this.paletteOpen = !this.paletteOpen; this.render(); });
    root.querySelectorAll("[data-drawwidth-btn]").forEach(el => el.addEventListener("click", () => { this.drawWidth = Number(el.dataset.drawwidthBtn) || 4; if (this.tool === "select" || this.tool === "erase") this.tool = "pencil"; this.render(); }));
    root.querySelector("[data-drawfill]")?.addEventListener("click", () => { this.drawFill = !this.drawFill; this.render(); });
    root.querySelector("[data-drawundo]")?.addEventListener("click", () => { if (this.tree?.drawings.length) { this.tree.drawings.pop(); this.save(); this.redrawDrawings(); } });
    root.querySelector("[data-drawclear]")?.addEventListener("click", async () => {
      if (!this.tree?.drawings.length) return;
      if (!await DialogV2.confirm({ window: { title: L("Apagar desenhos") }, content: L("<p>Apagar todos os desenhos e textos desta Skill Tree?</p>") })) return;
      this.tree.drawings = []; this.save(); this.redrawDrawings();
    });
    if (!this._keyBound) {
      this._keyBound = ev => this.onKey(ev);
      document.addEventListener("keydown", this._keyBound);
    }
    view.addEventListener("pointerdown", ev => this.onPointerDown(ev));
    view.addEventListener("wheel", ev => this.onWheel(ev), { passive: false });
    view.addEventListener("dragover", ev => ev.preventDefault());
    view.addEventListener("drop", ev => this.onDropCanvas(ev));
    const panel = root.querySelector(".st-panel");
    panel.addEventListener("dragover", ev => ev.preventDefault());
    panel.addEventListener("drop", async ev => {
      ev.preventDefault();
      if (!this.edit || !this.selNode) return;
      const item = await this.dropItem(ev); if (!item) return;
      const zone = ev.target.closest("[data-dropzone]")?.dataset.dropzone ?? "items";
      const n = this.selNode;
      if (zone === "items") n.items.push(item.uuid);
      else if (!n[zone].some(x => x.name === item.name)) n[zone].push({ uuid: item.uuid, name: item.name, img: item.img, qty: 1 });
      this.save(); this.render();
    });
  }

  onKey(ev) {
    if (!this.rendered || isTyping(ev.target)) return;
    const ctrl = ev.ctrlKey || ev.metaKey;
    const k = ev.key.toLowerCase();
    if (ev.key === "Escape") {
      if (this.refunding) { this.refunding = false; this.refundSel.clear(); return this.render(); }
      if (this.planning) { this.planning = false; this.plan = []; return this.render(); }
      if (this.edit && (this.tool !== "select" || this.multi.size || this.linkFrom)) { this.tool = "select"; this.multi.clear(); this.linkFrom = null; this.render(); }
      return;
    }
    if (!this.edit) return;
    const focused = this._hover || this.element?.contains?.(document.activeElement);
    if (!focused) return;
    if (ctrl && k === "z" && !ev.shiftKey) { ev.preventDefault(); return this.undo(); }
    if (ctrl && (k === "y" || (k === "z" && ev.shiftKey))) { ev.preventDefault(); return this.redo(); }
    if (!this._hover) return;
    if (ctrl && k === "c") { ev.preventDefault(); this.onAction("copy"); }
    else if (ctrl && k === "v") { ev.preventDefault(); this.onAction("paste"); }
    else if (ctrl && k === "a") { ev.preventDefault(); this.multi = new Set(this.tree?.nodes.map(n => n.id)); this.render(); }
    else if (ev.key === "Delete" && (this.multi.size || this.sel)) { ev.preventDefault(); this.onAction(this.multi.size ? "delMulti" : "delNode"); }
  }

  applyView() {
    if (!this.stage$) return;
    const v = this.v;
    this.stage$.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.z})`;
    this.view$.style.backgroundPosition = `${v.x}px ${v.y}px`;
    this.view$.style.backgroundSize = `${20 * v.z}px ${20 * v.z}px`;
  }

  fit() {
    const t = this.tree;
    const xs = [], ys = [];
    for (const n of t?.nodes ?? []) { xs.push(n.x); ys.push(n.y); }
    for (const d of t?.drawings ?? []) {
      if (d.type === "path") d.points.forEach(p => { xs.push(p[0]); ys.push(p[1]); });
      else { xs.push(d.x, d.x + (d.w ?? 200)); ys.push(d.y, d.y + (d.h ?? (d.size ?? 20) * 1.5)); }
    }
    if (!xs.length || !this.view$) { Object.assign(this.v, { x: 0, y: 0, z: 1 }); return this.applyView(); }
    const minX = Math.min(...xs) - 90, maxX = Math.max(...xs) + 90, minY = Math.min(...ys) - 90, maxY = Math.max(...ys) + 110;
    const W = this.view$.clientWidth, H = this.view$.clientHeight;
    const z = Math.max(0.1, Math.min(1.5, W / (maxX - minX), H / (maxY - minY)));
    Object.assign(this.v, { z, x: (W - (maxX - minX) * z) / 2 - minX * z, y: (H - (maxY - minY) * z) / 2 - minY * z });
    this.applyView();
  }

  drawLines() {
    const t = this.tree; if (!t || !this.svg$) return;
    const a = this.actorDoc, un = a ? unlockedOf(a, t) : [];
    const planned = new Set(this.planning ? this.plan : []);
    // cores das ligações seguem o tema (suaves)
    const cs = getComputedStyle(this.element ?? document.documentElement), cv = (k, d) => cs.getPropertyValue(k).trim() || d;
    const colors = { off: cv("--st-line", "#3a3e48"), ready: cv("--st-ok", "#7fb48a"), on: cv("--st-accent2", "#d1b46e"), edit: cv("--st-muted", "#9a8858"), plan: cv("--st-info", "#7fa3cf") };
    let s = "<defs>" + Object.entries(colors).map(([k, c]) =>
      `<marker id="st-a-${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${c}"/></marker>`).join("") + "</defs>";
    const norm = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
    for (const e of t.edges) {
      const f = nodeById(t, e.from), to = nodeById(t, e.to);
      if (!f || !to) continue;
      const dx = to.x - f.x, dy = to.y - f.y;
      if (!dx && !dy) continue;
      const rf = rOf(f) + 2, rt = rOf(to) + 8;
      let d;
      if (t.linkStyle === "straight") {
        const [ux, uy] = norm(dx, dy);
        d = `M${f.x + ux * rf},${f.y + uy * rf} L${to.x - ux * rt},${to.y - uy * rt}`;
      } else {
        const vert = Math.abs(dy) >= Math.abs(dx);
        const c1 = vert ? [f.x, f.y + dy / 2] : [f.x + dx / 2, f.y];
        const c2 = vert ? [to.x, to.y - dy / 2] : [to.x - dx / 2, to.y];
        const [s1x, s1y] = norm(c1[0] - f.x, c1[1] - f.y);
        const [s2x, s2y] = norm(to.x - c2[0], to.y - c2[1]);
        d = `M${f.x + s1x * rf},${f.y + s1y * rf} C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${to.x - s2x * rt},${to.y - s2y * rt}`;
      }
      let k = "off";
      if (this.edit) k = "edit";
      else if (un.includes(e.from) && un.includes(e.to)) k = "on";
      else if (planned.has(e.to) && (un.includes(e.from) || planned.has(e.from))) k = "plan";
      else if (un.includes(e.from)) k = "ready";
      s += `<path class="st-l-${k}" d="${d}" marker-end="url(#st-a-${k})"/>`;
      if (k === "on") s += `<path class="st-l-glow" d="${d}"/>`;
    }
    this.svg$.innerHTML = s;
  }

  toStage(ev) {
    const r = this.view$.getBoundingClientRect(), v = this.v;
    return { x: (ev.clientX - r.left - v.x) / v.z, y: (ev.clientY - r.top - v.y) / v.z };
  }

  viewCenter() {
    if (!this.view$) return { x: 0, y: 0 };
    const r = this.view$.getBoundingClientRect();
    return this.toStage({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
  }

  snapV(v) { const g = Number(this.tree?.snap) || 1; return Math.round(v / g) * g; }

  onWheel(ev) {
    ev.preventDefault();
    const r = this.view$.getBoundingClientRect(), v = this.v;
    const mx = ev.clientX - r.left, my = ev.clientY - r.top, z0 = v.z;
    const z = Math.min(3, Math.max(0.1, z0 * (ev.deltaY < 0 ? 1.1 : 1 / 1.1)));
    v.x = mx - (mx - v.x) * z / z0; v.y = my - (my - v.y) * z / z0; v.z = z;
    this.applyView();
  }

  onPointerDown(ev) {
    if (ev.target.closest(".st-tools")) return;
    if (ev.button === 0 && this.edit && this.tool !== "select") { ev.preventDefault(); return this.onDrawPointer(ev); }
    if (ev.button !== 0 && ev.button !== 2) return;
    const start = { x: ev.clientX, y: ev.clientY };
    let moved = false;
    const nodeEl = ev.button === 0 ? ev.target.closest(".st-node") : null;
    const n = nodeEl ? nodeById(this.tree, nodeEl.dataset.id) : null;
    const canDrag = n && this.edit && !this.linking && !ev.shiftKey && !(ev.ctrlKey || ev.metaKey);
    const group = canDrag && this.multi.has(n.id) && this.multi.size > 1
      ? [...this.multi].map(id => nodeById(this.tree, id)).filter(Boolean) : (n ? [n] : []);
    const origs = group.map(g => ({ g, x: g.x, y: g.y, el: this.stage$.querySelector(`[data-id="${g.id}"]`) }));
    const origV = { x: this.v.x, y: this.v.y };
    const move = e => {
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      if (n) {
        if (!canDrag) return;
        for (const o of origs) {
          o.g.x = this.snapV(o.x + dx / this.v.z);
          o.g.y = this.snapV(o.y + dy / this.v.z);
          const r = rOf(o.g);
          if (o.el) { o.el.style.left = `${o.g.x - r}px`; o.el.style.top = `${o.g.y - r}px`; }
        }
        this.drawLines();
      } else {
        this.v.x = origV.x + dx; this.v.y = origV.y + dy; this.applyView();
      }
    };
    const up = e => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (n && moved && canDrag) return this.save();
      if (!moved && e?.type === "pointerup") {
        if (n) this.onNodeClick(n, e);
        else if (this.sel || this.linkFrom || this.multi.size) { this.sel = null; this.linkFrom = null; this.multi.clear(); this.render(); }
      }
    };
    this.bindPointer(move, up);
  }

  onNodeClick(n, ev) {
    if (this.refunding) return this.toggleRefund(n);
    if (this.planning) return this.togglePlan(n);
    if (this.edit && (ev.ctrlKey || ev.metaKey)) {
      if (this.multi.has(n.id)) this.multi.delete(n.id); else this.multi.add(n.id);
      if (this.sel && !this.multi.has(this.sel) && this.multi.size) this.multi.add(this.sel);
      this.sel = null;
      return this.render();
    }
    if (this.edit && (this.linking || ev.shiftKey)) {
      if (!this.linkFrom) {
        this.linkFrom = n.id;
        ui.notifications.info(L`Pré-requisito: "${n.name}". Agora clique na habilidade que depende dela.`);
        return this.render();
      }
      if (this.linkFrom === n.id) { this.linkFrom = null; return this.render(); }
      const t = this.tree, from = this.linkFrom, to = n.id;
      const i = t.edges.findIndex(e => e.from === from && e.to === to);
      if (i >= 0) t.edges.splice(i, 1);
      else {
        t.edges = t.edges.filter(e => !(e.from === to && e.to === from));
        if (wouldCycle(t, from, to)) { ui.notifications.warn(L("Essa ligação criaria um ciclo.")); this.linkFrom = null; return this.render(); }
        t.edges.push({ from, to });
      }
      this.linkFrom = null; this.save(); return this.render();
    }
    this.multi.clear();
    this.sel = n.id; this.panelOpen = true; this.render();
  }

  async dropItem(ev) {
    let data;
    try { data = TE.getDragEventData(ev); } catch { try { data = JSON.parse(ev.dataTransfer.getData("text/plain")); } catch { } }
    if (data?.type !== "Item" || !data.uuid) { ui.notifications.warn(L("Solte um Item (da barra lateral ou de um compêndio).")); return null; }
    return fromUuid(data.uuid);
  }

  async onDropCanvas(ev) {
    ev.preventDefault();
    if (!this.edit || !this.tree) return;
    const item = await this.dropItem(ev); if (!item) return;
    const nodeEl = ev.target.closest(".st-node");
    if (nodeEl) {
      const n = nodeById(this.tree, nodeEl.dataset.id);
      n.items.push(item.uuid); this.sel = n.id;
      ui.notifications.info(L`"${item.name}" adicionado a "${n.name}".`);
    } else {
      const p = this.toStage(ev);
      const n = newNode(this.snapV(p.x), this.snapV(p.y), {
        name: item.name, img: item.img, items: [item.uuid],
        desc: item.system?.description?.value ? `@UUID[${item.uuid}]{${item.name}}` : ""
      });
      this.tree.nodes.push(n); this.sel = n.id;
    }
    this.save(); this.render();
  }

  onField(el) {
    const n = this.selNode; if (!n) return;
    const f = el.dataset.field;
    if (el.type === "checkbox") n[f] = el.checked;
    else if (el.type === "number" || el.dataset.num !== undefined) n[f] = Math.max(0, Number(el.value) || 0);
    else n[f] = el.value;
    if (f === "ranks") n.ranks = Math.max(1, n.ranks);
    this.save(); this.render();
  }

  // ── copiar / colar / modelos ──
  copyNodes(ids) {
    const t = this.tree;
    const nodes = ids.map(id => nodeById(t, id)).filter(Boolean).map(n => clone(n));
    if (!nodes.length) return ui.notifications.warn(L("Selecione habilidades (clique ou Ctrl+clique) para copiar."));
    const set = new Set(nodes.map(n => n.id));
    const cx = nodes.reduce((s, n) => s + n.x, 0) / nodes.length, cy = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;
    ST.clipboard = {
      nodes: nodes.map(n => ({ ...n, x: n.x - cx, y: n.y - cy })),
      edges: t.edges.filter(e => set.has(e.from) && set.has(e.to)).map(e => ({ ...e }))
    };
    ui.notifications.info(L`${nodes.length} habilidade(s) copiada(s).`);
    this.render();
  }

  pasteNodes() {
    const clip = ST.clipboard, t = this.tree;
    if (!clip || !t) return;
    const c = this.viewCenter(), map = {};
    const novos = clip.nodes.map(n => {
      const id = uid(); map[n.id] = id;
      return normalizeNode({ ...clone(n), id, x: this.snapV(c.x + n.x + 40), y: this.snapV(c.y + n.y + 40) });
    });
    t.nodes.push(...novos);
    t.edges.push(...clip.edges.map(e => ({ from: map[e.from], to: map[e.to] })));
    this.multi = new Set(novos.map(n => n.id)); this.sel = null;
    this.save(); this.render();
  }
}
