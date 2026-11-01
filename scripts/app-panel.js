// ═══════════════════════════════════════════════════════════════════════════
//  Árvore da Mesa — painel lateral no modo jogo: habilidade, reembolso em lote, planejamento, feitos, histórico
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
  K_TEMP, tempsOf, tempOf, tempText, grantTemp, endTemp, today, dateText, calApi
} from "./core.js?v=1.7.10";
import { LOG_VERBS, dateLang, sanitizarHTML } from "./core.js?v=1.7.10";
import { SaveQueue } from "./persistence.js?v=1.7.10";
import { validateTrees, remapTree } from "./validation.js?v=1.7.10";
import { actorOperation } from "./operations.js?v=1.7.10";
import { DialogV2, charCard, whoSub, whoTools, wireWho, datePicker, readDate, wireDate } from "./ui-kit.js?v=1.7.10";

export class MixPanel {
  // ── reembolso em lote ──
  toggleRefund(n) {
    const a = this.actorDoc, t = this.tree;
    if (!a || !t) return;
    if (n.synergy) return ui.notifications.info(L`"${n.name}" é uma sinergia: some sozinha quando os requisitos deixam de valer.`);
    if (!rankOf(a, t, n)) return ui.notifications.info(L`"${n.name}" não está desbloqueada.`);
    if (this.refundSel.has(n.id)) this.refundSel.delete(n.id); else this.refundSel.add(n.id);
    this.render();
  }

  // selecionadas + as que dependem delas (precisam sair junto)
  refundCalc(a, t) {
    const un = unlockedOf(a, t);
    const direct = new Set([...this.refundSel].filter(id => un.includes(id)));
    const gone = new Set(direct), extra = new Set();
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of un) {
        if (gone.has(id)) continue;
        const n = nodeById(t, id);
        if (!n || n.synergy) continue;
        const parents = parentsOf(t, id);
        if (!parents.length) continue;
        const ok = n.prereq === "any" ? parents.some(p => un.includes(p) && !gone.has(p)) : parents.every(p => un.includes(p) && !gone.has(p));
        if (!ok) { gone.add(id); extra.add(id); changed = true; }
      }
    }
    const topo = topoNodes(t).map(n => n.id).filter(id => gone.has(id)).reverse();
    const pct = Math.max(0, Math.min(100, Number(t.refundPct ?? 100))) / 100;
    let res = 0, myth = 0, gp = 0, pp = 0;
    for (const id of gone) {
      const n = nodeById(t, id), e = rankEntry(a, t, n, un);
      (e.paid ?? []).forEach((v, i) => { const m = e.paidX?.[i]?.myth ?? isMythic(n); if (m) myth += Math.floor((Number(v) || 0) * pct); else res += Math.floor((Number(v) || 0) * pct); });
      for (const x of e.paidX ?? []) { gp += Math.floor((Number(x.gp) || 0) * pct); pp += Math.floor((Number(x.pp) || 0) * pct); }
    }
    return { direct, extra, order: topo, back: { res, myth, gp, pp } };
  }

  refundHTML(a, t) {
    const rc = this._refundCalc ?? this.refundCalc(a, t);
    const row = (id, dep) => {
      const n = nodeById(t, id), r = rankOf(a, t, n);
      return `<div class="st-step"><b style="background:${dep ? "#8a5a1f" : "#6b2a2a"}">↺</b><span>${esc(n.name)}${r > 1 ? L` (nível ${r})` : ""}${dep ? L` <small style="opacity:.7">— depende de outra</small>` : ""}</span></div>`;
    };
    const back = rc.back;
    const backTxt = [back.res ? `${back.res} ${esc(t.resLabel)}` : "", back.myth ? L`${back.myth} Pontos Míticos` : "", back.gp ? `${back.gp} PO` : "", back.pp ? `${back.pp} PL` : ""].filter(Boolean).join(" + ") || "nada";
    const total = rc.order.length;
    return L`<div class="st-status st-s-ref"><i class="fas fa-rotate-left"></i> Reembolso em lote — escolha no mapa</div>
      <div class="st-card"><div class="st-card-t"><i class="fas fa-list"></i> Serão reembolsadas (${total})</div>
        ${total ? [...rc.direct].map(id => row(id, false)).join("") + [...rc.extra].map(id => row(id, true)).join("")
          : L`<div class="st-muted">Clique nas habilidades desbloqueadas (com brilho dourado). As que dependem delas entram sozinhas, em laranja.</div>`}</div>
      ${total ? L`<div class="st-card"><div class="st-card-t"><i class="fas fa-coins"></i> Você recebe de volta</div>
        <div class="st-check ok"><i class="fas fa-circle-check"></i> ${backTxt}${Number(t.refundPct ?? 100) < 100 ? L` (${t.refundPct}% do que foi pago)` : ""}</div>
        <div class="st-muted">Todos os níveis de cada habilidade são devolvidos, e os itens e efeitos saem da ficha.</div></div>` : ""}
      <div class="st-btns">
        ${total ? L`<button type="button" class="st-danger" data-act="refundConfirm" style="height:36px;font-weight:bold"><i class="fas fa-rotate-left"></i> Reembolsar ${total} habilidade(s)</button>` : ""}
        <div class="st-btn-row">
          <button type="button" data-act="refundAllSel"><i class="fas fa-check-double"></i> Selecionar todas</button>
          <button type="button" data-act="refundClear"><i class="fas fa-eraser"></i> Limpar</button>
          <button type="button" data-act="refundMode"><i class="fas fa-xmark"></i> Sair</button>
        </div>
      </div>`;
  }

  async confirmRefunds() {
    const a = this.actorDoc, t = this.tree;
    if (!a || !t) return;
    const rc = this.refundCalc(a, t);
    if (!rc.order.length) return;
    const names = rc.order.map(id => nodeById(t, id)?.name).filter(Boolean);
    if (!await DialogV2.confirm({ window: { title: L("Reembolsar várias") }, content: L`<p>Reembolsar <b>${names.length}</b> habilidade(s) de ${esc(a.name)}?</p><p style="font-size:12px">${esc(names.join(", "))}</p>` })) return;
    const before = {res:resOf(a,t),myth:mythicOf(a),gp:coin(a,"gp"),pp:coin(a,"pp")};
    const feitos = [];
    for (const id of rc.order) {
      const n = nodeById(t, id);
      let guard = 20;
      while (rankOf(a, t, n) > 0 && guard-- > 0) { if (!await doRefund(a, t, n, { quiet: true })) break; }
      if (!rankOf(a, t, n)) feitos.push(n.name);
    }
    const b = {res:resOf(a,t)-before.res,myth:mythicOf(a)-before.myth,gp:coin(a,"gp")-before.gp,pp:coin(a,"pp")-before.pp};
    const backTxt = [b.res ? `${b.res} ${t.resLabel}` : "", b.myth ? L`${b.myth} Pontos Míticos` : "", b.gp ? `${b.gp} PO` : "", b.pp ? `${b.pp} PL` : ""].filter(Boolean).join(", ");
    chat(a, L`↺ <b>${esc(a.name)}</b> reembolsou ${feitos.length} habilidade(s) de <b>${esc(t.name)}</b>${backTxt ? ` <small>(+${esc(backTxt)})</small>` : ""}<br><small>${esc(feitos.join(", "))}</small>`);
    if (feitos.length < rc.order.length) ui.notifications.warn(L("Algumas habilidades não puderam ser reembolsadas."));
    this.refundSel.clear(); this.refunding = false; this.render();
  }

  // ── planejador ──
  simulatePlan(a, t, plan) {
    const un = new Set(unlockedOf(a, t));
    const rk = {};
    for (const n of t.nodes) rk[n.id] = rankOf(a, t, n, [...un]);
    let totalR = Object.values(rk).reduce((s, v) => s + v, 0), spent = 0, myth = 0, gp = 0, pp = 0, needLevel = 0;
    const steps = [], warn = new Set();
    for (const id of plan) {
      const n = nodeById(t, id);
      if (!n) return { steps, invalid: L("Uma habilidade do plano foi removida.") };
      const max = Math.max(1, Number(n.ranks) || 1), r = rk[id];
      if (r >= max) return { steps, invalid: L`"${n.name}" já está no nível máximo.` };
      if (n.synergy) return { steps, invalid: L`"${n.name}" é uma sinergia e libera sozinha.` };
      if (r === 0) {
        const parents = parentsOf(t, id);
        if (parents.length && !(n.prereq === "any" ? parents.some(p => un.has(p)) : parents.every(p => un.has(p)))) return { steps, invalid: L`"${n.name}": planeje antes a habilidade anterior.` };
        if (n.group && t.nodes.some(o => o.id !== id && o.group === n.group && un.has(o.id))) return { steps, invalid: L`"${n.name}": a escolha exclusiva do grupo já foi feita.` };
      }
      const cost = (Number(n.cost) || 0) + (Number(n.rankStep) || 0) * r + (isMythic(n) ? 0 : (Number(t.costInc) || 0) * totalR);
      if (isMythic(n)) myth += cost; else spent += cost;
      gp += Number(n.costGp) || 0; pp += Number(n.costPp) || 0;
      needLevel = Math.max(needLevel, Number(n.minLevel) || 0);
      for (const c of reqChecklist(a, t, n, [...un], 1)) if (c.ok === false && c.kind !== "cost" && !c.label.startsWith(L("Nível"))) warn.add(`${n.name}: ${c.label}`);
      steps.push({ n, rank: r + 1, max, cost, myth: isMythic(n) });
      un.add(id); rk[id] = r + 1; totalR++;
    }
    return { steps, spent, myth, gp, pp, needLevel, warn: [...warn], res: resOf(a, t), mythHave: mythicOf(a), invalid: null };
  }

  togglePlan(n) {
    const a = this.actorDoc, t = this.tree;
    if (this.plan.includes(n.id)) {
      const i = this.plan.lastIndexOf(n.id);
      const rest = [...this.plan.slice(0, i), ...this.plan.slice(i + 1)];
      const novo = [];
      for (const id of rest) if (!this.simulatePlan(a, t, [...novo, id]).invalid) novo.push(id);
      this.plan = novo;
    } else {
      const sim = this.simulatePlan(a, t, [...this.plan, n.id]);
      if (sim.invalid) return ui.notifications.warn(sim.invalid);
      this.plan.push(n.id);
    }
    this.render();
  }

  planHTML(a, t) {
    const sim = this.simulatePlan(a, t, this.plan);
    const sobra = (sim.res ?? 0) - (sim.spent ?? 0);
    return L`<div class="st-status st-s-plan"><i class="fas fa-route"></i> Planejando — nada é gasto ainda</div>
      <div class="st-card"><div class="st-card-t"><i class="fas fa-list-ol"></i> Ordem de compra</div>
        ${sim.steps.length ? sim.steps.map((s, i) => `<div class="st-step"><b>${i + 1}</b><span>${esc(s.n.name)}${s.max > 1 ? L` (nível ${s.rank})` : ""}</span><small>${s.cost} ${s.myth ? L("✦ Míticos") : esc(t.resLabel)}</small></div>`).join("")
          : L`<div class="st-muted">Clique nas habilidades no mapa, na ordem desejada. Para subir um nível, clique de novo na mesma.</div>`}</div>
      ${sim.steps.length ? L`<div class="st-card"><div class="st-card-t"><i class="fas fa-calculator"></i> Resumo</div>
        <div class="st-check ${sobra >= 0 ? "ok" : "no"}"><i class="fas ${sobra >= 0 ? "fa-circle-check" : "fa-circle-xmark"}"></i> Total: ${sim.spent} ${esc(t.resLabel)} · você tem ${sim.res} · ${sobra >= 0 ? `sobram ${sobra}` : `faltam ${-sobra}`}</div>
        ${sim.myth ? L`<div class="st-check ${sim.mythHave >= sim.myth ? "ok" : "no"}"><i class="fas fa-star"></i> + ${sim.myth} Pontos Míticos (você tem ${sim.mythHave})</div>` : ""}
        ${sim.gp ? `<div class="st-check ${coinWorth(a) - (t.resPath === "@coins" ? sim.spent : 0) >= sim.gp ? "ok" : "no"}"><i class="fas fa-coins"></i> + ${sim.gp} PO</div>` : ""}
        ${sim.pp ? `<div class="st-check ${coin(a, "pp") >= sim.pp ? "ok" : "no"}"><i class="fas fa-coins"></i> + ${sim.pp} PL</div>` : ""}
        ${sim.needLevel ? L`<div class="st-check ${actorLevel(a) >= sim.needLevel ? "ok" : "no"}"><i class="fas fa-arrow-up-wide-short"></i> Nível necessário: ${sim.needLevel} (atual ${actorLevel(a)})</div>` : ""}
        ${sim.warn.map(w => `<div class="st-check no"><i class="fas fa-triangle-exclamation"></i> ${esc(w)}</div>`).join("")}</div>` : ""}
      <div class="st-btns">
        ${sim.steps.length ? L`<button type="button" class="st-big" data-act="confirmPlan"><i class="fas fa-check"></i> Comprar tudo agora</button>` : ""}
        <div class="st-btn-row">
          <button type="button" data-act="clearPlan"><i class="fas fa-eraser"></i> Limpar</button>
          <button type="button" data-act="plan"><i class="fas fa-xmark"></i> Sair do planejamento</button>
        </div>
      </div>`;
  }

  async confirmPlan() {
    const a = this.actorDoc, t = this.tree;
    const sim = this.simulatePlan(a, t, this.plan);
    if (!sim.steps.length) return;
    if (t.approval && !this.gm) return ui.notifications.warn(L("Esta Skill Tree exige aprovação do mestre: peça uma habilidade por vez."));
    if (!await DialogV2.confirm({ window: { title: L("Comprar plano") }, content: L`<p>Comprar ${sim.steps.length} habilidade(s) por ${sim.spent} ${esc(t.resLabel)}?</p>` })) return;
    for (const s of sim.steps) {
      const ok = await doUnlock(a, t, nodeById(t, s.n.id));
      if (!ok) { ui.notifications.warn(L`Parei em "${s.n.name}".`); break; }
    }
    this.plan = []; this.planning = false; this.render();
  }

  // ── painel lateral ──
  historyHTML(a, t, limit = 8) {
    const log = logOf(a).filter(e => !t || e.tree === t.id).slice(-limit).reverse();
    if (!log.length) return L`<div class="st-log" style="opacity:.6">Nada ainda.</div>`;
    const verbo = LOG_VERBS();
    return log.map(e => `<div class="st-log">• ${new Date(e.at).toLocaleDateString(dateLang())} — ${verbo[e.act] ?? e.act} <b>${esc(e.nodeName ?? e.treeName)}</b>${e.rank > 1 ? L` (nível ${e.rank})` : ""}${e.cost ? ` · ${e.cost}` : ""}${!t ? ` <i>(${esc(e.treeName)})</i>` : ""}</div>`).join("");
  }

  reqListHTML(t) {
    const list = this.pendingReqs(t);
    if (!list.length) return "";
    return L`<h3>Pedidos pendentes</h3>` + list.map(({ a, r }) => {
      const tr = this.trees.find(x => x.id === r.tree), n = nodeById(tr, r.node);
      return L`<div class="st-req"><img src="${esc(n?.img ?? a.img)}"><span><b>${esc(a.name)}</b><br>${esc(n?.name ?? "?")}${!t ? ` <i>(${esc(tr?.name ?? "")})</i>` : ""}</span>
        <button type="button" data-reqact="approve" data-actor="${a.id}" data-req="${r.id}" data-tooltip="Aprovar">✔</button>
        <button type="button" data-reqact="deny" data-actor="${a.id}" data-req="${r.id}" data-tooltip="Recusar">✖</button></div>`;
    }).join("");
  }

  // Grandes Feitos e Marcos só desta Skill Tree
  featsHTML(a, t) {
    const miles = [...new Set(t.nodes.map(n => n.milestone).filter(Boolean))].sort();
    if (!t.feats.length && !miles.length && !this.gm) return "";
    const mine = a ? milestonesOf(a) : [];
    const feats = t.feats.map(f => {
      const got = a && hasFeat(a, f.id);
      const opens = treesOpenedBy(f.id, this.trees).map(x => x.name);
      const gmBtns = this.gm ? `<span class="st-feat-acts">
          ${a ? (got ? L`<button type="button" data-featrevoke="${esc(f.id)}" data-tooltip="Retirar de ${esc(a.name)}"><i class="fas fa-rotate-left"></i></button>`
                     : L`<button type="button" data-featgive="${esc(f.id)}" data-tooltip="Conceder a personagens"><i class="fas fa-star"></i></button>`) : ""}
          ${this.edit ? L`<button type="button" data-featedit="${esc(f.id)}" data-tooltip="Editar"><i class="fas fa-pen"></i></button><button type="button" data-featdel="${esc(f.id)}" class="st-trash" data-tooltip="Excluir"><i class="fas fa-trash"></i></button>` : ""}
        </span>` : "";
      return `<div class="st-feat-row ${got ? "got" : ""}">
        <i class="fas ${got ? "fa-circle-check" : "fa-star"}"></i>
        <div class="st-feat-txt"><b>${esc(f.name)}</b> <span class="st-feat-pts">+${f.pts} ✦</span>
          ${f.desc ? `<small>${esc(f.desc)}</small>` : ""}
          ${opens.length ? L`<small class="st-feat-opens"><i class="fas fa-lock-open"></i> Libera: ${esc(opens.join(", "))}</small>` : ""}</div>
        ${gmBtns}</div>`;
    }).join("");
    const mileRows = miles.map(m => this.gm && a
      ? `<label class="ck"><input type="checkbox" data-mile="${esc(m)}" ${mine.includes(m) ? "checked" : ""}> ${esc(m)}</label>`
      : `<div class="st-check ${mine.includes(m) ? "ok" : ""}"><i class="fas ${mine.includes(m) ? "fa-circle-check" : "fa-circle"}"></i> ${esc(m)}</div>`).join("");
    return L`<div class="st-card st-feats"><div class="st-card-t"><i class="fas fa-star"></i> Grandes Feitos</div>
      ${feats || `<div class="st-muted">${this.gm ? L("Nenhum Grande Feito nesta Skill Tree.") : L("Nenhum Grande Feito.")}</div>`}
      ${this.gm && this.edit ? L`<button type="button" data-act="featNew"><i class="fas fa-plus"></i> Novo Grande Feito</button>` : ""}
      ${mileRows ? L`<div class="st-sub2"><i class="fas fa-trophy"></i> Marcos desta Skill Tree</div>${mileRows}` : ""}</div>`;
  }

  trainingHTML(a) {
    const list = trainingOf(a), temps = tempsOf(a);
    if (!list.length && !temps.length) return "";
    const row = (tr, n, icon, txt, pct) => `<div class="st-trow" ${tr && n ? `data-goto="${esc(tr.id)}:${esc(n.id)}"` : ""}>
      <img src="${esc(n?.img ?? "icons/svg/book.svg")}"><div><b>${esc(n?.name ?? "?")}</b><small><i class="fas ${icon}"></i> ${txt}</small>
      ${pct === null ? "" : `<div class="st-mesa-bar"><i style="width:${pct}%"></i></div>`}</div></div>`;
    const trains = list.map(e => {
      const tr = this.trees.find(x => x.id === e.tree), n = nodeById(tr, e.node);
      const total = Math.max(Number(n?.trainDays) || 0, Number(e.left) || 0, 1), done = total - (Number(e.left) || 0);
      return row(tr, n, "fa-dumbbell", L`${done}/${total} descanso(s) longo(s) — faltam ${e.left}`, Math.round(done / total * 100));
    }).join("");
    const tmp = temps.map(e => { const tr = this.trees.find(x => x.id === e.tree), n = nodeById(tr, e.node); return row(tr, n, "fa-hourglass-end", esc(tempText(e)), null); }).join("");
    return `${trains ? `<div class="st-card"><div class="st-card-t"><i class="fas fa-dumbbell"></i> ${L("Em treino")}</div>${trains}
      <p class="st-help">${L("Conta a cada descanso longo: pela ficha, pelo botão Descanso longo do Calendário da Mesa ou por “Passar 1 descanso longo”.")}</p>
      </div>` : ""}
      ${tmp ? `<div class="st-card"><div class="st-card-t"><i class="fas fa-hourglass-end"></i> ${L("Temporárias")}</div>${tmp}</div>` : ""}
      ${this.gm && (trains || temps.some(e => e.kind === "rests")) ? `<div class="st-btns" style="margin-top:4px"><button type="button" data-act="trainDay" data-tooltip="${L("Conta 1 descanso longo no treino e nas temporárias deste personagem (como um descanso longo pela ficha)")}"><i class="fas fa-campground"></i> ${L("Passar 1 descanso longo")}</button></div>` : ""}`;
  }

  async panelHTML() {
    const t = this.tree, a = this.actorDoc, n = this.selNode;
    if (!t) return L`<p>Sem Skill Tree selecionada.</p>`;
    if (this.refunding && a) return this.refundHTML(a, t);
    if (this.planning && a) return this.planHTML(a, t);

    if (!n) {
      if (this.edit) {
        return L`
        <h2>${esc(t.name)}</h2>
        ${t.desc ? `<p class="st-help">${esc(t.desc)}</p>` : ""}
        <p>Pontos usados: <b>${esc(t.resLabel)}</b>${extraRes(t).length ? ` + ${esc(extraRes(t).map(r => r.name).join(", "))}` : ""}</p>
        <p>Atribuída a: <b>${esc(t.assigned.map(id => game.actors.get(id)?.name).filter(Boolean).join(", ") || L("ninguém"))}</b></p>
        ${this.multi.size ? L`<div class="st-card"><div class="st-card-t">${this.multi.size} selecionadas</div><div class="st-btn-row">
          <button type="button" data-act="copy"><i class="fas fa-copy"></i> Copiar</button>
          <button type="button" class="st-danger" data-act="delMulti"><i class="fas fa-trash"></i> Excluir</button></div></div>` : ""}
        ${this.featsHTML(a, t)}
        ${ST.clipboard ? L`<div class="st-btns"><button type="button" data-act="paste"><i class="fas fa-paste"></i> Colar ${ST.clipboard.nodes.length} habilidade(s) (Ctrl+V)</button></div>` : ""}
        <div class="st-card"><div class="st-card-t"><i class="fas fa-circle-question"></i> Como montar</div>
        <div class="st-help" style="opacity:.85">• <b>Nova</b> cria no centro; <b>Modelos</b> insere uma habilidade salva.<br>
        • Solte um <b>Item</b> no mapa para criar uma habilidade já com ele.<br>
        • <b>Shift+clique</b> na anterior e depois na seguinte para ligar.<br>
        • <b>Ctrl+clique</b> seleciona várias; <b>Ctrl+Z</b> desfaz.<br>
        • Use <code>@rank</code> nos valores para escalar com o nível.<br>
        • <b>Esta Skill Tree</b> define custos, regras e visual; <b>Gerais</b> vale para todas.</div></div>`;
      }
      const un = a ? unlockedOf(a, t) : [];
      const trans = a ? a.effects.filter(e => stFlag(e)?.generated) : [];
      return L`
        <h2>${esc(t.name)}</h2>
        ${t.desc ? `<p class="st-help">${esc(t.desc)}</p>` : ""}
        ${a ? `<p><b>${esc(a.name)}</b> — ${un.length}/${t.nodes.length} desbloqueadas</p>` : `<p>${this.gm ? L("Selecione um token ou abra a <b>Mesa</b> para escolher um personagem.") : L("Selecione o seu token.")}</p>`}
        ${trans.length ? L`<div class="st-card"><div class="st-card-t"><i class="fas fa-wand-magic-sparkles"></i> Ativo agora</div>${trans.map(e => L`<div class="st-row"><span>✨ ${esc(e.name)}</span><button type="button" data-endfx="${e.id}" style="flex:0 0 auto;width:auto">Encerrar</button></div>`).join("")}</div>` : ""}
        ${a ? this.trainingHTML(a) : ""}
        ${this.featsHTML(a, t)}
        <div class="st-card st-legend"><div class="st-card-t"><i class="fas fa-circle-info"></i> Legenda</div>
          <div><i style="border-color:var(--st-ok)"></i> Disponível</div>
          <div><i style="border-color:var(--st-accent);box-shadow:0 0 6px var(--st-accent)"></i> Desbloqueada</div>
          <div><i style="border-color:var(--st-bad)"></i> Falta pagamento</div>
          <div><i style="border-color:#555;opacity:.5"></i> Bloqueada</div>
          <div><i style="border-color:var(--st-warn)"></i> Em treino</div>
          <div><i style="border-color:var(--st-info);border-style:dashed"></i> Sinergia (libera sozinha)</div>
        </div>
        ${this.gm ? this.reqListHTML(t) : ""}
        ${a ? L`<div class="st-card"><div class="st-card-t"><i class="fas fa-clock-rotate-left"></i> Histórico</div>${this.historyHTML(a, t)}</div>` : ""}
        ${this.gm && a && un.length ? L`<div class="st-btns"><button type="button" class="st-danger" data-act="refundAll"><i class="fas fa-rotate-left"></i> Reembolsar tudo de ${esc(a.name)}</button></div>` : ""}`;
    }

    if (this.edit) return this.editPanelHTML(t, n);
    return this.playNodeHTML(t, n, a);
  }

  async playNodeHTML(t, n, a) {
    const st = nodeState(a, t, n);
    if (!this.gm && n.secret && st.rank === 0 && st.key === "locked") {
      return L`<div class="st-status st-s-locked"><i class="fas fa-lock"></i> Habilidade secreta</div>
        <div class="st-head"><img src="icons/svg/padlock.svg"><div><h2>???</h2></div></div>
        <div class="st-card"><p style="margin:0">Cumpra os requisitos para revelar esta habilidade.</p></div>`;
    }
    const nr = withRank(n, Math.max(1, st.rank));
    const desc = nr.desc ? sanitizarHTML(await TE.enrichHTML(nr.desc)) : "";
    const pending = a && reqsOf(a).find(r => r.tree === t.id && r.node === n.id);
    const trans = a?.effects.find(e => stFlag(e)?.generated && stFlag(e).node === n.id);
    const canRefund = st.rank > 0 && (this.gm || t.refundPlayer) && !n.synergy;
    const charges = a ? a.items.filter(i => stFlag(i)?.node === n.id && stFlag(i)?.tree === t.id && stFlag(i)?.charge) : [];
    const chargeHTML = charges.map(it => {
      const max = Number(it.system?.uses?.max) || 1, have = max - (Number(it.system?.uses?.spent) || 0);
      return L`<div class="st-card"><div class="st-card-t"><i class="fas fa-battery-half"></i> ${esc(it.name)} — carga ${have}/${max}</div>
        <div class="st-meter charge"><div style="width:${Math.round(have / max * 100)}%"></div></div>
        ${this.gm ? L`<div class="st-btn-row"><button type="button" data-charge="${it.id}">+1 carga</button><button type="button" data-charge="${it.id}" data-full="1">Encher</button></div>` : ""}</div>`;
    }).join("");

    let status;
    if (pending) status = ["pend", "fas fa-hourglass-half", L("Pedido enviado — aguardando o mestre")];
    else if (st.key === "training") status = ["train", "fas fa-dumbbell", L`Em treino — faltam ${st.training.left} descanso(s) longo(s)`];
    else if (st.key === "none") status = ["none", "fas fa-user", L("Escolha um personagem para ver o status")];
    else if (n.synergy && st.rank === 0) status = ["syn", "fas fa-bolt", L("Sinergia — libera sozinha ao cumprir os requisitos")];
    else if (st.maxed) status = ["done", "fas fa-check", st.max > 1 ? L("Nível máximo alcançado") : L("Desbloqueada")];
    else if (st.rank > 0) status = [st.canBuy ? "avail" : "done", st.canBuy ? "fas fa-arrow-up" : "fas fa-check", st.canBuy ? L`Pode subir para o nível ${st.rank + 1}` : L`Desbloqueada (nível ${st.rank}/${st.max})`];
    else if (st.key === "available") status = ["avail", "fas fa-unlock", L("Disponível para desbloquear")];
    else if (st.key === "poor") status = ["poor", "fas fa-coins", L("Falta pagamento")];
    else status = ["locked", "fas fa-lock", L("Bloqueada — veja os requisitos")];

    const stars = st.max > 1 ? `<span class="st-stars">${"★".repeat(st.rank)}${"☆".repeat(st.max - st.rank)}</span>` : "";
    const costTxt = [st.cost ? `${st.cost} ${esc(payLabel(t, n))}` : "", coinsOn(t) && Number(n.costGp) ? `${n.costGp} PO` : "", coinsOn(t) && Number(n.costPp) ? `${n.costPp} PL` : "",
      ...Object.entries(nodeExtras(t, n)).map(([p, v]) => `${v} ${esc(extraName(t, p))}`)].filter(Boolean).join(" + ");
    const sub = n.synergy ? L("Sinergia") : (st.rank < st.max ? (costTxt || L("Grátis")) : "");

    const checks = [...(st.checks ?? [])];
    if (a && st.rank < st.max && !n.synergy && st.cost) checks.push({ label: L`Custo: ${st.cost} ${payLabel(t, n)} (você tem ${payOf(a, t, n)})`, ok: payOf(a, t, n) >= st.cost });
    const checkHTML = checks.length
      ? checks.map(c => `<div class="st-check ${c.ok === null ? "" : c.ok ? "ok" : "no"}"><i class="fas ${c.ok === null ? "fa-circle-dot" : c.ok ? "fa-circle-check" : "fa-circle-xmark"}"></i> ${esc(c.label)}</div>`).join("")
      : L`<div class="st-check ok"><i class="fas fa-circle-check"></i> Nenhum requisito</div>`;

    const items = n.items.map(u => {
      const it = fromUuidSync(u);
      return `<div class="st-item" data-open="${esc(u)}"><img src="${esc(it?.img ?? "icons/svg/hazard.svg")}"><span>${esc(it?.name ?? L("(não encontrado)"))}</span><i class="fas fa-up-right-from-square" style="opacity:.5"></i></div>`;
    }).join("");
    const gains = [];
    nr.features.forEach((f, i) => {
      gains.push(L`<div class="st-gain"><i class="fas ${f.kind === "attack" ? "fa-hand-fist" : f.kind === "save" ? "fa-shield-virus" : f.kind === "heal" ? "fa-heart-pulse" : f.transform ? "fa-wand-magic-sparkles" : "fa-star"}"></i><div><b>${esc(featName(n, f, i))}</b> na ficha<br><small style="white-space:pre-line">${esc(featureRules(f))}</small></div></div>`);
    });
    const perm = nr.changes.filter(c => c.key);
    if (perm.length) gains.push(L`<div class="st-gain"><i class="fas fa-shield-halved"></i><div>Sempre ativo:<br>${perm.map(c => `<small>• ${esc(changeLabel(c))}</small>`).join("<br>")}</div></div>`);
    if (n.replaces) {
      const ps = parentsOf(t, n.id).map(p => nodeById(t, p)?.name).filter(Boolean);
      if (ps.length) gains.push(L`<div class="st-gain"><i class="fas fa-arrows-rotate"></i><div>Evolui e <b>substitui</b> na ficha: ${esc(ps.join(", "))}</div></div>`);
    }

    // comparação de níveis
    let cmp = "";
    if (st.rank > 0 && st.rank < st.max) {
      const cur = withRank(n, st.rank), nxt = withRank(n, st.rank + 1), lines = [];
      const diff = (x, y) => { if (x !== y) lines.push([x, y]); };
      n.changes.forEach((c, i) => { if (c.key) diff(changeLabel(cur.changes[i]), changeLabel(nxt.changes[i])); });
      n.features.forEach((f, fi) => {
        const a1 = cur.features[fi], a2 = nxt.features[fi], nm = featName(n, f, fi);
        f.changes.forEach((c, i) => { if (c.key) diff(L`${nm} (ao usar): ${changeLabel(a1.changes[i])}`, L`${nm} (ao usar): ${changeLabel(a2.changes[i])}`); });
        for (const rf of RANK_FIELDS) {
          if (rf.k === "desc" || !rf.kinds.includes(f.kind)) continue;
          const v1 = String(a1[rf.k] ?? ""), v2 = String(a2[rf.k] ?? "");
          if (v1 !== v2) lines.push([`${nm}: ${rf.label} ${v1 || "—"}`, `${rf.label} ${v2 || "—"}`]);
        }
        if (String(a1.desc ?? "") !== String(a2.desc ?? "") && a2.desc) lines.push([L`${nm}: descrição na ficha`, L("nova descrição")]);
      });
      const nextDesc = (n.rankDescs?.[st.rank - 1] ?? "").trim() ? sanitizarHTML(await TE.enrichHTML(nxt.desc)) : "";
      if (lines.length || nextDesc) cmp = L`<div class="st-card"><div class="st-card-t"><i class="fas fa-code-compare"></i> Nível ${st.rank} → ${st.rank + 1}</div>${lines.map(([x, y]) => `<div class="st-cmp">${esc(x)} → <b>${esc(y)}</b></div>`).join("")}
        ${nextDesc ? L`<div class="st-sub2" style="margin-top:6px">No nível ${st.rank + 1}:</div><div class="st-desc" style="opacity:.85">${nextDesc}</div>` : ""}</div>`;
    }

    // treino: explica como funciona e mostra o progresso
    let trainCard = "";
    const TD = Number(n.trainDays) || 0;
    if (st.key === "training") {
      const left = Number(st.training.left) || 0, total = Math.max(TD, left, 1), done = total - left;
      trainCard = `<div class="st-card st-traincard"><div class="st-card-t"><i class="fas fa-dumbbell"></i> ${L("Treino em andamento")}</div>
        <div class="st-trainbig"><b>${done}</b>/${total}<small>${L("descanso(s) longo(s)")}</small></div>
        <div class="st-mesa-bar"><i style="width:${Math.round(done / total * 100)}%"></i></div>
        <p class="st-help">${L("Já está pago. Cada descanso longo conta 1 (pela ficha, pelo Calendário da Mesa ou pelo mestre). Quando completar, a habilidade é liberada sozinha.")}</p></div>`;
    } else if (TD && st.rank < st.max) {
      trainCard = `<div class="st-card st-traincard"><div class="st-card-t"><i class="fas fa-dumbbell"></i> ${L("Precisa de treino")}</div>
        <ol class="st-steps"><li>${L("Clique em <b>Treinar</b>: o custo é pago agora.")}</li>
          <li>${L`Faça <b>${TD} descanso(s) longo(s)</b> pela ficha (cada um conta 1).`}</li>
          <li>${L("A habilidade é liberada sozinha no último descanso.")}</li></ol></div>`;
    }
    const temp = a ? tempOf(a, t, n) : null;
    const tempCard = temp ? `<div class="st-card st-tempcard"><div class="st-card-t"><i class="fas fa-hourglass-end"></i> ${L("Temporária")}</div>
      <p style="margin:0">${esc(tempText(temp))}.</p>
      ${this.gm ? `<div class="st-btn-row" style="margin-top:6px"><button type="button" data-tempkeep="${esc(temp.id)}"><i class="fas fa-infinity"></i> ${L("Tornar permanente")}</button>
        <button type="button" data-tempend="${esc(temp.id)}"><i class="fas fa-xmark"></i> ${L("Remover agora")}</button></div>` : ""}</div>` : "";

    // Botão principal: aparece sempre que ainda dá para comprar/treinar algum dia; cinza com o motivo quando não dá agora
    let buyLabel = "", buyOff = "";
    const canEver = a && !pending && st.key !== "training" && st.rank < st.max && !n.synergy && !(st.key === "locked" && n.secret && !this.gm && st.rank === 0);
    if (canEver) {
      const verb = TD ? (st.rank > 0 ? L`Treinar o nível ${st.rank + 1}` : L("Treinar")) : (st.rank > 0 ? L`Subir para ${st.rank + 1}/${st.max}` : L("Desbloquear"));
      const icon = TD ? "fa-dumbbell" : st.rank > 0 ? "fa-arrow-up" : "fa-unlock";
      const info = [TD ? L`${TD} descanso(s) longo(s)` : "", costTxt].filter(Boolean).join(" · ");
      buyLabel = `<i class="fas ${icon}"></i> ${verb}${info ? ` <small>— ${info}</small>` : ""}`;
      if (t.approval && !this.gm) buyLabel = `<i class="fas fa-hand"></i> ${TD ? L("Pedir ao mestre para treinar") : L("Pedir ao mestre")}${info ? ` <small>— ${info}</small>` : ""}`;
      if (!st.canBuy) buyOff = (st.reasons ?? [])[0] ?? L("Ainda não disponível");
    }

    return L`
      <div class="st-status st-s-${status[0]}"><i class="${status[1]}"></i> ${status[2]}</div>
      <div class="st-head"><img src="${esc(n.img)}" style="border-color:${esc(n.color || "#c9a227")}"><div><h2>${esc(n.name)}</h2><div class="st-sub">${sub} ${stars}</div></div></div>
      <div class="st-card"><div class="st-card-t"><i class="fas fa-list-check"></i> Requisitos</div>${checkHTML}</div>
      ${trainCard}${tempCard}
      ${chargeHTML}
      ${desc ? L`<div class="st-card"><div class="st-card-t"><i class="fas fa-scroll"></i> Descrição${st.max > 1 ? L` — nível ${Math.max(1, st.rank)}` : ""}</div><div class="st-desc">${desc}</div></div>` : ""}
      ${cmp}
      ${gains.length || items ? L`<div class="st-card"><div class="st-card-t"><i class="fas fa-gift"></i> O que você ganha</div>${gains.join("")}${items}</div>` : ""}
      <div class="st-btns">
        ${a && buyLabel && !pending ? (buyOff
          ? `<button type="button" class="st-big st-big-off" disabled>${buyLabel}</button><div class="st-why"><i class="fas fa-circle-info"></i> ${esc(buyOff)}</div>`
          : `<button type="button" class="st-big" data-act="unlock">${buyLabel}</button>`) : ""}
        ${pending && !this.gm ? L`<button type="button" data-act="cancelReq"><i class="fas fa-xmark"></i> Cancelar pedido</button>` : ""}
        ${pending && this.gm ? L`<button type="button" class="st-big" data-reqact="approve" data-actor="${a.id}" data-req="${pending.id}"><i class="fas fa-check"></i> Aprovar pedido</button>
          <button type="button" data-reqact="deny" data-actor="${a.id}" data-req="${pending.id}"><i class="fas fa-xmark"></i> Recusar pedido</button>` : ""}
        ${st.key === "training" && this.gm ? L`<button type="button" class="st-big" data-act="finishTrain"><i class="fas fa-forward-fast"></i> Concluir treino agora</button>` : ""}
        ${st.key === "training" ? L`<button type="button" data-act="cancelTrain"><i class="fas fa-ban"></i> Desistir do treino (devolve custos)</button>` : ""}
        ${trans ? L`<button type="button" data-endfx="${trans.id}"><i class="fas fa-wand-magic-sparkles"></i> Encerrar ${esc(trans.name)}</button>` : ""}
        ${this.gm && a && st.rank < st.max && st.key !== "training" ? L`<button type="button" data-act="grantFree"><i class="fas fa-crown"></i> Conceder grátis (mestre)</button>
          <button type="button" data-act="grantTemp"><i class="fas fa-hourglass-end"></i> Conceder temporária (mestre)</button>` : ""}
        ${canRefund ? `<button type="button" class="st-danger" data-act="refund"><i class="fas fa-rotate-left"></i> ${st.rank > 1 ? L("Reduzir um nível") : L("Reembolsar")}${Number(t.refundPct) < 100 ? ` (${t.refundPct}%)` : ""}</button>` : ""}
      </div>`;
  }
}
