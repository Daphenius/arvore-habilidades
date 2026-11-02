// ═══════════════════════════════════════════════════════════════════════════
//  Árvore da Mesa — painel lateral no modo jogo: habilidade, reembolso em lote, planejamento, feitos, histórico
//  Métodos da janela ArvoreHabilidades (copiados para a classe em app.js)
// ═══════════════════════════════════════════════════════════════════════════

import { loc } from "./idioma.js";
import {
  LOG_VERBS, RANK_FIELDS, ST, TE, coinsOn, dateLang, esc, extraName, extraRes, featName, nodeById,
  nodeExtras, parentsOf, sanitizarHTML, topoNodes
} from "./core.js";
import { chat } from "./chat.js";
import { doRefund, doUnlock } from "./compras.js";
import { stFlag } from "./hooks.js";
import { featureRules, withRank } from "./itens.js";
import {
  actorLevel, changeLabel, coin, coinWorth, hasFeat, isMythic, logOf, milestonesOf, mythicOf,
  nodeState, payLabel, payOf, rankEntry, rankOf, reqChecklist, reqsOf, resOf, trainingOf,
  treesOpenedBy, unlockedOf
} from "./regras.js";
import { tempOf, tempText, tempsOf } from "./temporarias.js";
import { DialogV2 } from "./ui-kit.js";

export class MixPanel {
  // ── reembolso em lote ──
  toggleRefund(n) {
    const a = this.actorDoc, t = this.tree;
    if (!a || !t) return;
    if (n.synergy) return ui.notifications.info(loc("ARVORE.Painel.eUmaSinergiaSomeSozinhaQuando", { name: n.name }));
    if (!rankOf(a, t, n)) return ui.notifications.info(loc("ARVORE.Painel.naoEstaDesbloqueada", { name: n.name }));
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
      return `<div class="st-step"><b style="background:${dep ? "#8a5a1f" : "#6b2a2a"}">↺</b><span>${esc(n.name)}${r > 1 ? ` ${loc("ARVORE.Painel.nivel", { r })}` : ""}${dep ? ` <small style="opacity:.7">${loc("ARVORE.Painel.dependeDeOutra")}</small>` : ""}</span></div>`;
    };
    const back = rc.back;
    const backTxt = [back.res ? `${back.res} ${esc(t.resLabel)}` : "", back.myth ? `${back.myth} ${loc("ARVORE.Comum.pontosMiticos")}` : "", back.gp ? `${back.gp} PO` : "", back.pp ? `${back.pp} PL` : ""].filter(Boolean).join(" + ") || "nada";
    const total = rc.order.length;
    return `<div class="st-status st-s-ref"><i class="fas fa-rotate-left"></i> ${loc("ARVORE.Painel.reembolsoEmLoteEscolhaNoMapa")}</div>
      <div class="st-card"><div class="st-card-t"><i class="fas fa-list"></i> ${loc("ARVORE.Painel.seraoReembolsadas", { total })}</div>
        ${total ? [...rc.direct].map(id => row(id, false)).join("") + [...rc.extra].map(id => row(id, true)).join("")
          : `<div class="st-muted">${loc("ARVORE.Painel.cliqueNasHabilidadesDesbloqueadas")}</div>`}</div>
      ${total ? `<div class="st-card"><div class="st-card-t"><i class="fas fa-coins"></i> ${loc("ARVORE.Painel.voceRecebeDeVolta")}</div>
        <div class="st-check ok"><i class="fas fa-circle-check"></i> ${backTxt}${Number(t.refundPct ?? 100) < 100 ? ` ${loc("ARVORE.Painel.doQueFoiPago", { refundPct: t.refundPct })}` : ""}</div>
        <div class="st-muted">${loc("ARVORE.Painel.todosOsNiveisDeCadaHabilidade")}</div></div>` : ""}
      <div class="st-btns">
        ${total ? `<button type="button" class="st-danger" data-act="refundConfirm" style="height:36px;font-weight:bold"><i class="fas fa-rotate-left"></i> ${loc("ARVORE.Painel.reembolsarHabilidadeS", { total })}</button>` : ""}
        <div class="st-btn-row">
          <button type="button" data-act="refundAllSel"><i class="fas fa-check-double"></i> ${loc("ARVORE.Painel.selecionarTodas")}</button>
          <button type="button" data-act="refundClear"><i class="fas fa-eraser"></i> ${loc("ARVORE.Painel.limpar")}</button>
          <button type="button" data-act="refundMode"><i class="fas fa-xmark"></i> ${loc("ARVORE.Painel.sair")}</button>
        </div>
      </div>`;
  }

  async confirmRefunds() {
    const a = this.actorDoc, t = this.tree;
    if (!a || !t) return;
    const rc = this.refundCalc(a, t);
    if (!rc.order.length) return;
    const names = rc.order.map(id => nodeById(t, id)?.name).filter(Boolean);
    if (!await DialogV2.confirm({ window: { title: loc("ARVORE.Comum.reembolsarVarias") }, content: `<p>${loc("ARVORE.Comum.reembolsar")} <b>${names.length}</b> ${loc("ARVORE.Painel.habilidadeSDe", { name: esc(a.name) })}</p><p style="font-size:12px">${esc(names.join(", "))}</p>` })) return;
    const antes = {res:resOf(a,t),myth:mythicOf(a),gp:coin(a,"gp"),pp:coin(a,"pp")};
    const feitos = [];
    for (const id of rc.order) {
      const n = nodeById(t, id);
      let guard = 20;
      while (rankOf(a, t, n) > 0 && guard-- > 0) { if (!await doRefund(a, t, n, { quiet: true })) break; }
      if (!rankOf(a, t, n)) feitos.push(n.name);
    }
    const b = {res:resOf(a,t)-antes.res,myth:mythicOf(a)-antes.myth,gp:coin(a,"gp")-antes.gp,pp:coin(a,"pp")-antes.pp};
    const backTxt = [b.res ? `${b.res} ${t.resLabel}` : "", b.myth ? `${b.myth} ${loc("ARVORE.Comum.pontosMiticos")}` : "", b.gp ? `${b.gp} PO` : "", b.pp ? `${b.pp} PL` : ""].filter(Boolean).join(", ");
    chat(a, `↺ <b>${esc(a.name)}</b> ${loc("ARVORE.Painel.reembolsouHabilidadeSDe", { length: feitos.length })} <b>${esc(t.name)}</b>${backTxt ? ` <small>(+${esc(backTxt)})</small>` : ""}<br><small>${esc(feitos.join(", "))}</small>`);
    if (feitos.length < rc.order.length) ui.notifications.warn(loc("ARVORE.Painel.algumasHabilidadesNaoPuderam"));
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
      if (!n) return { steps, invalid: loc("ARVORE.Painel.umaHabilidadeDoPlanoFoiRemovida") };
      const max = Math.max(1, Number(n.ranks) || 1), r = rk[id];
      if (r >= max) return { steps, invalid: loc("ARVORE.Comum.jaEstaNoNivelMaximo", { name: n.name }) };
      if (n.synergy) return { steps, invalid: loc("ARVORE.Painel.eUmaSinergiaELiberaSozinha", { name: n.name }) };
      if (r === 0) {
        const parents = parentsOf(t, id);
        if (parents.length && !(n.prereq === "any" ? parents.some(p => un.has(p)) : parents.every(p => un.has(p)))) return { steps, invalid: loc("ARVORE.Painel.planejeAntesAHabilidadeAnterior", { name: n.name }) };
        if (n.group && t.nodes.some(o => o.id !== id && o.group === n.group && un.has(o.id))) return { steps, invalid: loc("ARVORE.Painel.aEscolhaExclusivaDoGrupoJaFoi", { name: n.name }) };
      }
      const cost = (Number(n.cost) || 0) + (Number(n.rankStep) || 0) * r + (isMythic(n) ? 0 : (Number(t.costInc) || 0) * totalR);
      if (isMythic(n)) myth += cost; else spent += cost;
      gp += Number(n.costGp) || 0; pp += Number(n.costPp) || 0;
      needLevel = Math.max(needLevel, Number(n.minLevel) || 0);
      for (const c of reqChecklist(a, t, n, [...un], 1)) if (c.ok === false && c.kind !== "cost" && !c.label.startsWith(loc("ARVORE.Comum.nivel2"))) warn.add(`${n.name}: ${c.label}`);
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
    return `<div class="st-status st-s-plan"><i class="fas fa-route"></i> ${loc("ARVORE.Painel.planejandoNadaEGastoAinda")}</div>
      <div class="st-card"><div class="st-card-t"><i class="fas fa-list-ol"></i> ${loc("ARVORE.Painel.ordemDeCompra")}</div>
        ${sim.steps.length ? sim.steps.map((s, i) => `<div class="st-step"><b>${i + 1}</b><span>${esc(s.n.name)}${s.max > 1 ? ` ${loc("ARVORE.Comum.nivel", { rank: s.rank })}` : ""}</span><small>${s.cost} ${s.myth ? loc("ARVORE.Painel.miticos") : esc(t.resLabel)}</small></div>`).join("")
          : `<div class="st-muted">${loc("ARVORE.Painel.cliqueNasHabilidadesNoMapaNa")}</div>`}</div>
      ${sim.steps.length ? `<div class="st-card"><div class="st-card-t"><i class="fas fa-calculator"></i> ${loc("ARVORE.Painel.resumo")}</div>
        <div class="st-check ${sobra >= 0 ? "ok" : "no"}"><i class="fas ${sobra >= 0 ? "fa-circle-check" : "fa-circle-xmark"}"></i> ${loc("ARVORE.Painel.totalVoceTem", { spent: sim.spent, resLabel: esc(t.resLabel), res: sim.res })} ${sobra >= 0 ? `sobram ${sobra}` : `faltam ${-sobra}`}</div>
        ${sim.myth ? `<div class="st-check ${sim.mythHave >= sim.myth ? "ok" : "no"}"><i class="fas fa-star"></i> ${loc("ARVORE.Painel.pontosMiticosVoceTem", { myth: sim.myth, mythHave: sim.mythHave })}</div>` : ""}
        ${sim.gp ? `<div class="st-check ${coinWorth(a) - (t.resPath === "@coins" ? sim.spent : 0) >= sim.gp ? "ok" : "no"}"><i class="fas fa-coins"></i> + ${sim.gp} PO</div>` : ""}
        ${sim.pp ? `<div class="st-check ${coin(a, "pp") >= sim.pp ? "ok" : "no"}"><i class="fas fa-coins"></i> + ${sim.pp} PL</div>` : ""}
        ${sim.needLevel ? `<div class="st-check ${actorLevel(a) >= sim.needLevel ? "ok" : "no"}"><i class="fas fa-arrow-up-wide-short"></i> ${loc("ARVORE.Painel.nivelNecessarioAtual", { needLevel: sim.needLevel, a: actorLevel(a) })}</div>` : ""}
        ${sim.warn.map(w => `<div class="st-check no"><i class="fas fa-triangle-exclamation"></i> ${esc(w)}</div>`).join("")}</div>` : ""}
      <div class="st-btns">
        ${sim.steps.length ? `<button type="button" class="st-big" data-act="confirmPlan"><i class="fas fa-check"></i> ${loc("ARVORE.Painel.comprarTudoAgora")}</button>` : ""}
        <div class="st-btn-row">
          <button type="button" data-act="clearPlan"><i class="fas fa-eraser"></i> ${loc("ARVORE.Painel.limpar")}</button>
          <button type="button" data-act="plan"><i class="fas fa-xmark"></i> ${loc("ARVORE.Painel.sairDoPlanejamento")}</button>
        </div>
      </div>`;
  }

  async confirmPlan() {
    const a = this.actorDoc, t = this.tree;
    const sim = this.simulatePlan(a, t, this.plan);
    if (!sim.steps.length) return;
    if (t.approval && !this.gm) return ui.notifications.warn(loc("ARVORE.Painel.estaSkillTreeExigeAprovacaoDo"));
    if (!await DialogV2.confirm({ window: { title: loc("ARVORE.Painel.comprarPlano") }, content: `<p>${loc("ARVORE.Painel.comprarHabilidadeSPor", { length: sim.steps.length, spent: sim.spent, resLabel: esc(t.resLabel) })}</p>` })) return;
    for (const s of sim.steps) {
      const ok = await doUnlock(a, t, nodeById(t, s.n.id));
      if (!ok) { ui.notifications.warn(loc("ARVORE.Painel.pareiEm", { name: s.n.name })); break; }
    }
    this.plan = []; this.planning = false; this.render();
  }

  // ── painel lateral ──
  historyHTML(a, t, limit = 8) {
    const log = logOf(a).filter(e => !t || e.tree === t.id).slice(-limit).reverse();
    if (!log.length) return `<div class="st-log" style="opacity:.6">${loc("ARVORE.Painel.nadaAinda")}</div>`;
    const verbo = LOG_VERBS();
    return log.map(e => `<div class="st-log">• ${new Date(e.at).toLocaleDateString(dateLang())} — ${verbo[e.act] ?? e.act} <b>${esc(e.nodeName ?? e.treeName)}</b>${e.rank > 1 ? ` ${loc("ARVORE.Comum.nivel", { rank: e.rank })}` : ""}${e.cost ? ` · ${e.cost}` : ""}${!t ? ` <i>(${esc(e.treeName)})</i>` : ""}</div>`).join("");
  }

  reqListHTML(t) {
    const list = this.pendingReqs(t);
    if (!list.length) return "";
    return `<h3>${loc("ARVORE.Painel.pedidosPendentes")}</h3>` + list.map(({ a, r }) => {
      const tr = this.trees.find(x => x.id === r.tree), n = nodeById(tr, r.node);
      return `<div class="st-req"><img src="${esc(n?.img ?? a.img)}"><span><b>${esc(a.name)}</b><br>${esc(n?.name ?? "?")}${!t ? ` <i>(${esc(tr?.name ?? "")})</i>` : ""}</span>
        <button type="button" data-reqact="approve" data-actor="${a.id}" data-req="${r.id}" data-tooltip="${loc("ARVORE.Painel.aprovar")}">✔</button>
        <button type="button" data-reqact="deny" data-actor="${a.id}" data-req="${r.id}" data-tooltip="${loc("ARVORE.Painel.recusar")}">✖</button></div>`;
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
          ${a ? (got ? `<button type="button" data-featrevoke="${esc(f.id)}" data-tooltip="${loc("ARVORE.Painel.retirarDe")} ${esc(a.name)}"><i class="fas fa-rotate-left"></i></button>`
                     : `<button type="button" data-featgive="${esc(f.id)}" data-tooltip="${loc("ARVORE.Painel.concederAPersonagens")}"><i class="fas fa-star"></i></button>`) : ""}
          ${this.edit ? `<button type="button" data-featedit="${esc(f.id)}" data-tooltip="${loc("ARVORE.Comum.editar")}"><i class="fas fa-pen"></i></button><button type="button" data-featdel="${esc(f.id)}" class="st-trash" data-tooltip="${loc("ARVORE.Comum.excluir")}"><i class="fas fa-trash"></i></button>` : ""}
        </span>` : "";
      return `<div class="st-feat-row ${got ? "got" : ""}">
        <i class="fas ${got ? "fa-circle-check" : "fa-star"}"></i>
        <div class="st-feat-txt"><b>${esc(f.name)}</b> <span class="st-feat-pts">+${f.pts} ✦</span>
          ${f.desc ? `<small>${esc(f.desc)}</small>` : ""}
          ${opens.length ? `<small class="st-feat-opens"><i class="fas fa-lock-open"></i> ${loc("ARVORE.Comum.libera")} ${esc(opens.join(", "))}</small>` : ""}</div>
        ${gmBtns}</div>`;
    }).join("");
    const mileRows = miles.map(m => this.gm && a
      ? `<label class="ck"><input type="checkbox" data-mile="${esc(m)}" ${mine.includes(m) ? "checked" : ""}> ${esc(m)}</label>`
      : `<div class="st-check ${mine.includes(m) ? "ok" : ""}"><i class="fas ${mine.includes(m) ? "fa-circle-check" : "fa-circle"}"></i> ${esc(m)}</div>`).join("");
    return `<div class="st-card st-feats"><div class="st-card-t"><i class="fas fa-star"></i> ${loc("ARVORE.Painel.grandesFeitos")}</div>
      ${feats || `<div class="st-muted">${this.gm ? loc("ARVORE.Painel.nenhumGrandeFeitoNestaSkillTree") : loc("ARVORE.Painel.nenhumGrandeFeito")}</div>`}
      ${this.gm && this.edit ? `<button type="button" data-act="featNew"><i class="fas fa-plus"></i> ${loc("ARVORE.Comum.novoGrandeFeito")}</button>` : ""}
      ${mileRows ? `<div class="st-sub2"><i class="fas fa-trophy"></i> ${loc("ARVORE.Painel.marcosDestaSkillTree")}</div>${mileRows}` : ""}</div>`;
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
      return row(tr, n, "fa-dumbbell", `${done}${loc("ARVORE.Painel.descansoSLongoSFaltam", { total })} ${e.left}`, Math.round(done / total * 100));
    }).join("");
    const tmp = temps.map(e => { const tr = this.trees.find(x => x.id === e.tree), n = nodeById(tr, e.node); return row(tr, n, "fa-hourglass-end", esc(tempText(e)), null); }).join("");
    return `${trains ? `<div class="st-card"><div class="st-card-t"><i class="fas fa-dumbbell"></i> ${loc("ARVORE.Comum.emTreino")}</div>${trains}
      <p class="st-help">${loc("ARVORE.Painel.contaACadaDescansoLongoPelaFicha")}</p>
      </div>` : ""}
      ${tmp ? `<div class="st-card"><div class="st-card-t"><i class="fas fa-hourglass-end"></i> ${loc("ARVORE.Painel.temporarias")}</div>${tmp}</div>` : ""}
      ${this.gm && (trains || temps.some(e => e.kind === "rests")) ? `<div class="st-btns" style="margin-top:4px"><button type="button" data-act="trainDay" data-tooltip="${loc("ARVORE.Painel.conta1DescansoLongoNoTreinoE")}"><i class="fas fa-campground"></i> ${loc("ARVORE.Painel.passar1DescansoLongo")}</button></div>` : ""}`;
  }

  async panelHTML() {
    const t = this.tree, a = this.actorDoc, n = this.selNode;
    if (!t) return `<p>${loc("ARVORE.Painel.semSkillTreeSelecionada")}</p>`;
    if (this.refunding && a) return this.refundHTML(a, t);
    if (this.planning && a) return this.planHTML(a, t);

    if (!n) {
      if (this.edit) {
        return `
        <h2>${esc(t.name)}</h2>
        ${t.desc ? `<p class="st-help">${esc(t.desc)}</p>` : ""}
        <p>${loc("ARVORE.Painel.pontosUsados")} <b>${esc(t.resLabel)}</b>${extraRes(t).length ? ` + ${esc(extraRes(t).map(r => r.name).join(", "))}` : ""}</p>
        <p>${loc("ARVORE.Painel.atribuidaA")} <b>${esc(t.assigned.map(id => game.actors.get(id)?.name).filter(Boolean).join(", ") || loc("ARVORE.Painel.ninguem"))}</b></p>
        ${this.multi.size ? `<div class="st-card"><div class="st-card-t">${this.multi.size} ${loc("ARVORE.Painel.selecionadas")}</div><div class="st-btn-row">
          <button type="button" data-act="copy"><i class="fas fa-copy"></i> ${loc("ARVORE.Comum.copiar")}</button>
          <button type="button" class="st-danger" data-act="delMulti"><i class="fas fa-trash"></i> ${loc("ARVORE.Comum.excluir")}</button></div></div>` : ""}
        ${this.featsHTML(a, t)}
        ${ST.clipboard ? `<div class="st-btns"><button type="button" data-act="paste"><i class="fas fa-paste"></i> ${loc("ARVORE.Painel.colarHabilidadeSCtrlV", { length: ST.clipboard.nodes.length })}</button></div>` : ""}
        <div class="st-card"><div class="st-card-t"><i class="fas fa-circle-question"></i> ${loc("ARVORE.Painel.comoMontar")}</div>
        <div class="st-help" style="opacity:.85">• <b>${loc("ARVORE.Comum.nova")}</b> ${loc("ARVORE.Painel.criaNoCentro")} <b>${loc("ARVORE.Comum.modelos")}</b> ${loc("ARVORE.Painel.insereUmaHabilidadeSalva")}<br>
        ${loc("ARVORE.Painel.solteUm")} <b>${loc("ARVORE.Painel.item")}</b> ${loc("ARVORE.Painel.noMapaParaCriarUmaHabilidade")}<br>
        • <b>${loc("ARVORE.Comum.shiftClique")}</b> ${loc("ARVORE.Painel.naAnteriorEDepoisNaSeguintePara")}<br>
        • <b>${loc("ARVORE.Painel.ctrlClique")}</b> ${loc("ARVORE.Painel.selecionaVarias")} <b>${loc("ARVORE.Painel.ctrlZ")}</b> ${loc("ARVORE.Painel.desfaz")}<br>
        ${loc("ARVORE.Painel.use")} <code>${loc("ARVORE.Comum.rank")}</code> ${loc("ARVORE.Painel.nosValoresParaEscalarComONivel")}<br>
        • <b>${loc("ARVORE.Comum.estaSkillTree")}</b> ${loc("ARVORE.Painel.defineCustosRegrasEVisual")} <b>${loc("ARVORE.Comum.gerais")}</b> ${loc("ARVORE.Painel.valeParaTodas")}</div></div>`;
      }
      const un = a ? unlockedOf(a, t) : [];
      const trans = a ? a.effects.filter(e => stFlag(e)?.generated) : [];
      return `
        <h2>${esc(t.name)}</h2>
        ${t.desc ? `<p class="st-help">${esc(t.desc)}</p>` : ""}
        ${a ? `<p><b>${esc(a.name)}</b> — ${un.length}/${t.nodes.length} desbloqueadas</p>` : `<p>${this.gm ? `${loc("ARVORE.Painel.selecioneUmTokenOuAbraA")} <b>${loc("ARVORE.Comum.mesa")}</b> ${loc("ARVORE.Painel.paraEscolherUmPersonagem")}` : loc("ARVORE.Painel.selecioneOSeuToken")}</p>`}
        ${trans.length ? `<div class="st-card"><div class="st-card-t"><i class="fas fa-wand-magic-sparkles"></i> ${loc("ARVORE.Painel.ativoAgora")}</div>${trans.map(e => `<div class="st-row"><span>✨ ${esc(e.name)}</span><button type="button" data-endfx="${e.id}" style="flex:0 0 auto;width:auto">${loc("ARVORE.Painel.encerrar")}</button></div>`).join("")}</div>` : ""}
        ${a ? this.trainingHTML(a) : ""}
        ${this.featsHTML(a, t)}
        <div class="st-card st-legend"><div class="st-card-t"><i class="fas fa-circle-info"></i> ${loc("ARVORE.Painel.legenda")}</div>
          <div><i style="border-color:var(--st-ok)"></i> ${loc("ARVORE.Comum.disponivel")}</div>
          <div><i style="border-color:var(--st-accent);box-shadow:0 0 6px var(--st-accent)"></i> ${loc("ARVORE.Painel.desbloqueada")}</div>
          <div><i style="border-color:var(--st-bad)"></i> ${loc("ARVORE.Painel.faltaPagamento")}</div>
          <div><i style="border-color:#555;opacity:.5"></i> ${loc("ARVORE.Painel.bloqueada")}</div>
          <div><i style="border-color:var(--st-warn)"></i> ${loc("ARVORE.Comum.emTreino")}</div>
          <div><i style="border-color:var(--st-info);border-style:dashed"></i> ${loc("ARVORE.Painel.sinergiaLiberaSozinha")}</div>
        </div>
        ${this.gm ? this.reqListHTML(t) : ""}
        ${a ? `<div class="st-card"><div class="st-card-t"><i class="fas fa-clock-rotate-left"></i> ${loc("ARVORE.Painel.historico")}</div>${this.historyHTML(a, t)}</div>` : ""}
        ${this.gm && a && un.length ? `<div class="st-btns"><button type="button" class="st-danger" data-act="refundAll"><i class="fas fa-rotate-left"></i> ${loc("ARVORE.Painel.reembolsarTudoDe")} ${esc(a.name)}</button></div>` : ""}`;
    }

    if (this.edit) return this.editPanelHTML(t, n);
    return this.playNodeHTML(t, n, a);
  }

  async playNodeHTML(t, n, a) {
    const st = nodeState(a, t, n);
    if (!this.gm && n.secret && st.rank === 0 && st.key === "locked") {
      return `<div class="st-status st-s-locked"><i class="fas fa-lock"></i> ${loc("ARVORE.Painel.habilidadeSecreta")}</div>
        <div class="st-head"><img src="icons/svg/padlock.svg"><div><h2>???</h2></div></div>
        <div class="st-card"><p style="margin:0">${loc("ARVORE.Painel.cumpraOsRequisitosParaRevelar")}</p></div>`;
    }
    const nr = withRank(n, Math.max(1, st.rank));
    const desc = nr.desc ? sanitizarHTML(await TE.enrichHTML(nr.desc)) : "";
    const pending = a && reqsOf(a).find(r => r.tree === t.id && r.node === n.id);
    const trans = a?.effects.find(e => stFlag(e)?.generated && stFlag(e).node === n.id);
    const canRefund = st.rank > 0 && (this.gm || t.refundPlayer) && !n.synergy;
    const charges = a ? a.items.filter(i => stFlag(i)?.node === n.id && stFlag(i)?.tree === t.id && stFlag(i)?.charge) : [];
    const chargeHTML = charges.map(it => {
      const max = Number(it.system?.uses?.max) || 1, have = max - (Number(it.system?.uses?.spent) || 0);
      return `<div class="st-card"><div class="st-card-t"><i class="fas fa-battery-half"></i> ${esc(it.name)} ${loc("ARVORE.Painel.carga", { have })}${max}</div>
        <div class="st-meter charge"><div style="width:${Math.round(have / max * 100)}%"></div></div>
        ${this.gm ? `<div class="st-btn-row"><button type="button" data-charge="${it.id}">${loc("ARVORE.Painel.n1Carga")}</button><button type="button" data-charge="${it.id}" data-full="1">${loc("ARVORE.Painel.encher")}</button></div>` : ""}</div>`;
    }).join("");

    let status;
    if (pending) status = ["pend", "fas fa-hourglass-half", loc("ARVORE.Painel.pedidoEnviadoAguardandoOMestre")];
    else if (st.key === "training") status = ["train", "fas fa-dumbbell", loc("ARVORE.Painel.emTreinoFaltamDescansoSLongo", { left: st.training.left })];
    else if (st.key === "none") status = ["none", "fas fa-user", loc("ARVORE.Painel.escolhaUmPersonagemParaVerOStatus")];
    else if (n.synergy && st.rank === 0) status = ["syn", "fas fa-bolt", loc("ARVORE.Painel.sinergiaLiberaSozinhaAoCumprir")];
    else if (st.maxed) status = ["done", "fas fa-check", st.max > 1 ? loc("ARVORE.Painel.nivelMaximoAlcancado") : loc("ARVORE.Painel.desbloqueada")];
    else if (st.rank > 0) status = [st.canBuy ? "avail" : "done", st.canBuy ? "fas fa-arrow-up" : "fas fa-check", st.canBuy ? `${loc("ARVORE.Painel.podeSubirParaONivel")} ${st.rank + 1}` : loc("ARVORE.Painel.desbloqueadaNivel", { rank: st.rank, max: st.max })];
    else if (st.key === "available") status = ["avail", "fas fa-unlock", loc("ARVORE.Painel.disponivelParaDesbloquear")];
    else if (st.key === "poor") status = ["poor", "fas fa-coins", loc("ARVORE.Painel.faltaPagamento")];
    else status = ["locked", "fas fa-lock", loc("ARVORE.Painel.bloqueadaVejaOsRequisitos")];

    const stars = st.max > 1 ? `<span class="st-stars">${"★".repeat(st.rank)}${"☆".repeat(st.max - st.rank)}</span>` : "";
    const costTxt = [st.cost ? `${st.cost} ${esc(payLabel(t, n))}` : "", coinsOn(t) && Number(n.costGp) ? `${n.costGp} PO` : "", coinsOn(t) && Number(n.costPp) ? `${n.costPp} PL` : "",
      ...Object.entries(nodeExtras(t, n)).map(([p, v]) => `${v} ${esc(extraName(t, p))}`)].filter(Boolean).join(" + ");
    const sub = n.synergy ? loc("ARVORE.Comum.sinergia") : (st.rank < st.max ? (costTxt || loc("ARVORE.Comum.gratis")) : "");

    const checks = [...(st.checks ?? [])];
    if (a && st.rank < st.max && !n.synergy && st.cost) checks.push({ label: loc("ARVORE.Painel.custoVoceTem", { cost: st.cost, t: payLabel(t, n), a: payOf(a, t, n) }), ok: payOf(a, t, n) >= st.cost });
    const checkHTML = checks.length
      ? checks.map(c => `<div class="st-check ${c.ok === null ? "" : c.ok ? "ok" : "no"}"><i class="fas ${c.ok === null ? "fa-circle-dot" : c.ok ? "fa-circle-check" : "fa-circle-xmark"}"></i> ${esc(c.label)}</div>`).join("")
      : `<div class="st-check ok"><i class="fas fa-circle-check"></i> ${loc("ARVORE.Painel.nenhumRequisito")}</div>`;

    const items = n.items.map(u => {
      const it = fromUuidSync(u);
      return `<div class="st-item" data-open="${esc(u)}"><img src="${esc(it?.img ?? "icons/svg/hazard.svg")}"><span>${esc(it?.name ?? loc("ARVORE.Comum.naoEncontrado"))}</span><i class="fas fa-up-right-from-square" style="opacity:.5"></i></div>`;
    }).join("");
    const gains = [];
    nr.features.forEach((f, i) => {
      gains.push(`<div class="st-gain"><i class="fas ${f.kind === "attack" ? "fa-hand-fist" : f.kind === "save" ? "fa-shield-virus" : f.kind === "heal" ? "fa-heart-pulse" : f.transform ? "fa-wand-magic-sparkles" : "fa-star"}"></i><div><b>${esc(featName(n, f, i))}</b> ${loc("ARVORE.Painel.naFicha")}<br><small style="white-space:pre-line">${esc(featureRules(f))}</small></div></div>`);
    });
    const perm = nr.changes.filter(c => c.key);
    if (perm.length) gains.push(`<div class="st-gain"><i class="fas fa-shield-halved"></i><div>${loc("ARVORE.Painel.sempreAtivo")}<br>${perm.map(c => `<small>• ${esc(changeLabel(c))}</small>`).join("<br>")}</div></div>`);
    if (n.replaces) {
      const ps = parentsOf(t, n.id).map(p => nodeById(t, p)?.name).filter(Boolean);
      if (ps.length) gains.push(`<div class="st-gain"><i class="fas fa-arrows-rotate"></i><div>${loc("ARVORE.Painel.evoluiE")} <b>${loc("ARVORE.Comum.substitui")}</b> ${loc("ARVORE.Painel.naFicha2")} ${esc(ps.join(", "))}</div></div>`);
    }

    // comparação de níveis
    let cmp = "";
    if (st.rank > 0 && st.rank < st.max) {
      const cur = withRank(n, st.rank), nxt = withRank(n, st.rank + 1), lines = [];
      const diff = (x, y) => { if (x !== y) lines.push([x, y]); };
      n.changes.forEach((c, i) => { if (c.key) diff(changeLabel(cur.changes[i]), changeLabel(nxt.changes[i])); });
      n.features.forEach((f, fi) => {
        const a1 = cur.features[fi], a2 = nxt.features[fi], nm = featName(n, f, fi);
        f.changes.forEach((c, i) => { if (c.key) diff(`${nm} ${loc("ARVORE.Painel.aoUsar")} ${changeLabel(a1.changes[i])}`, `${nm} ${loc("ARVORE.Painel.aoUsar")} ${changeLabel(a2.changes[i])}`); });
        for (const rf of RANK_FIELDS) {
          if (rf.k === "desc" || !rf.kinds.includes(f.kind)) continue;
          const v1 = String(a1[rf.k] ?? ""), v2 = String(a2[rf.k] ?? "");
          if (v1 !== v2) lines.push([`${nm}: ${rf.label} ${v1 || "—"}`, `${rf.label} ${v2 || "—"}`]);
        }
        if (String(a1.desc ?? "") !== String(a2.desc ?? "") && a2.desc) lines.push([`${nm}${loc("ARVORE.Painel.descricaoNaFicha")}`, loc("ARVORE.Painel.novaDescricao")]);
      });
      const nextDesc = (n.rankDescs?.[st.rank - 1] ?? "").trim() ? sanitizarHTML(await TE.enrichHTML(nxt.desc)) : "";
      if (lines.length || nextDesc) cmp = `<div class="st-card"><div class="st-card-t"><i class="fas fa-code-compare"></i> ${loc("ARVORE.Painel.nivel2", { rank: st.rank })} ${st.rank + 1}</div>${lines.map(([x, y]) => `<div class="st-cmp">${esc(x)} → <b>${esc(y)}</b></div>`).join("")}
        ${nextDesc ? `<div class="st-sub2" style="margin-top:6px">${loc("ARVORE.Painel.noNivel", { v: st.rank + 1 })}</div><div class="st-desc" style="opacity:.85">${nextDesc}</div>` : ""}</div>`;
    }

    // treino: explica como funciona e mostra o progresso
    let trainCard = "";
    const TD = Number(n.trainDays) || 0;
    if (st.key === "training") {
      const left = Number(st.training.left) || 0, total = Math.max(TD, left, 1), done = total - left;
      trainCard = `<div class="st-card st-traincard"><div class="st-card-t"><i class="fas fa-dumbbell"></i> ${loc("ARVORE.Painel.treinoEmAndamento")}</div>
        <div class="st-trainbig"><b>${done}</b>/${total}<small>${loc("ARVORE.Painel.descansoSLongoS")}</small></div>
        <div class="st-mesa-bar"><i style="width:${Math.round(done / total * 100)}%"></i></div>
        <p class="st-help">${loc("ARVORE.Painel.jaEstaPagoCadaDescansoLongoConta")}</p></div>`;
    } else if (TD && st.rank < st.max) {
      trainCard = `<div class="st-card st-traincard"><div class="st-card-t"><i class="fas fa-dumbbell"></i> ${loc("ARVORE.Painel.precisaDeTreino")}</div>
        <ol class="st-steps"><li>${`${loc("ARVORE.Comum.cliqueEm")} <b>${loc("ARVORE.Painel.treinar")}</b>${loc("ARVORE.Painel.oCustoEPagoAgora")}`}</li>
          <li>${`${loc("ARVORE.Painel.faca")} <b>${TD} ${loc("ARVORE.Painel.descansoSLongoS")}</b> ${loc("ARVORE.Painel.pelaFichaCadaUmConta1")}`}</li>
          <li>${loc("ARVORE.Painel.aHabilidadeELiberadaSozinhaNo")}</li></ol></div>`;
    }
    const temp = a ? tempOf(a, t, n) : null;
    const tempCard = temp ? `<div class="st-card st-tempcard"><div class="st-card-t"><i class="fas fa-hourglass-end"></i> ${loc("ARVORE.Painel.temporaria")}</div>
      <p style="margin:0">${esc(tempText(temp))}.</p>
      ${this.gm ? `<div class="st-btn-row" style="margin-top:6px"><button type="button" data-tempkeep="${esc(temp.id)}"><i class="fas fa-infinity"></i> ${loc("ARVORE.Painel.tornarPermanente")}</button>
        <button type="button" data-tempend="${esc(temp.id)}"><i class="fas fa-xmark"></i> ${loc("ARVORE.Comum.removerAgora")}</button></div>` : ""}</div>` : "";

    // Botão principal: aparece sempre que ainda dá para comprar/treinar algum dia; cinza com o motivo quando não dá agora
    let buyLabel = "", buyOff = "";
    const canEver = a && !pending && st.key !== "training" && st.rank < st.max && !n.synergy && !(st.key === "locked" && n.secret && !this.gm && st.rank === 0);
    if (canEver) {
      const verb = TD ? (st.rank > 0 ? `${loc("ARVORE.Painel.treinarONivel")} ${st.rank + 1}` : loc("ARVORE.Painel.treinar")) : (st.rank > 0 ? `${loc("ARVORE.Painel.subirPara", { v: st.rank + 1 })}${st.max}` : loc("ARVORE.Comum.desbloquear"));
      const icon = TD ? "fa-dumbbell" : st.rank > 0 ? "fa-arrow-up" : "fa-unlock";
      const info = [TD ? `${TD} ${loc("ARVORE.Painel.descansoSLongoS")}` : "", costTxt].filter(Boolean).join(" · ");
      buyLabel = `<i class="fas ${icon}"></i> ${verb}${info ? ` <small>— ${info}</small>` : ""}`;
      if (t.approval && !this.gm) buyLabel = `<i class="fas fa-hand"></i> ${TD ? loc("ARVORE.Painel.pedirAoMestreParaTreinar") : loc("ARVORE.Comum.pedirAoMestre")}${info ? ` <small>— ${info}</small>` : ""}`;
      if (!st.canBuy) buyOff = (st.reasons ?? [])[0] ?? loc("ARVORE.Painel.aindaNaoDisponivel");
    }

    return `
      <div class="st-status st-s-${status[0]}"><i class="${status[1]}"></i> ${status[2]}</div>
      <div class="st-head"><img src="${esc(n.img)}" style="border-color:${esc(n.color || "#c9a227")}"><div><h2>${esc(n.name)}</h2><div class="st-sub">${sub} ${stars}</div></div></div>
      <div class="st-card"><div class="st-card-t"><i class="fas fa-list-check"></i> ${loc("ARVORE.Comum.requisitos")}</div>${checkHTML}</div>
      ${trainCard}${tempCard}
      ${chargeHTML}
      ${desc ? `<div class="st-card"><div class="st-card-t"><i class="fas fa-scroll"></i> ${loc("ARVORE.Comum.descricao")}${st.max > 1 ? ` ${loc("ARVORE.Painel.nivel3")} ${Math.max(1, st.rank)}` : ""}</div><div class="st-desc">${desc}</div></div>` : ""}
      ${cmp}
      ${gains.length || items ? `<div class="st-card"><div class="st-card-t"><i class="fas fa-gift"></i> ${loc("ARVORE.Painel.oQueVoceGanha")}</div>${gains.join("")}${items}</div>` : ""}
      <div class="st-btns">
        ${a && buyLabel && !pending ? (buyOff
          ? `<button type="button" class="st-big st-big-off" disabled>${buyLabel}</button><div class="st-why"><i class="fas fa-circle-info"></i> ${esc(buyOff)}</div>`
          : `<button type="button" class="st-big" data-act="unlock">${buyLabel}</button>`) : ""}
        ${pending && !this.gm ? `<button type="button" data-act="cancelReq"><i class="fas fa-xmark"></i> ${loc("ARVORE.Painel.cancelarPedido")}</button>` : ""}
        ${pending && this.gm ? `<button type="button" class="st-big" data-reqact="approve" data-actor="${a.id}" data-req="${pending.id}"><i class="fas fa-check"></i> ${loc("ARVORE.Painel.aprovarPedido")}</button>
          <button type="button" data-reqact="deny" data-actor="${a.id}" data-req="${pending.id}"><i class="fas fa-xmark"></i> ${loc("ARVORE.Painel.recusarPedido")}</button>` : ""}
        ${st.key === "training" && this.gm ? `<button type="button" class="st-big" data-act="finishTrain"><i class="fas fa-forward-fast"></i> ${loc("ARVORE.Painel.concluirTreinoAgora")}</button>` : ""}
        ${st.key === "training" ? `<button type="button" data-act="cancelTrain"><i class="fas fa-ban"></i> ${loc("ARVORE.Painel.desistirDoTreinoDevolveCustos")}</button>` : ""}
        ${trans ? `<button type="button" data-endfx="${trans.id}"><i class="fas fa-wand-magic-sparkles"></i> ${loc("ARVORE.Painel.encerrar")} ${esc(trans.name)}</button>` : ""}
        ${this.gm && a && st.rank < st.max && st.key !== "training" ? `<button type="button" data-act="grantFree"><i class="fas fa-crown"></i> ${loc("ARVORE.Painel.concederGratisMestre")}</button>
          <button type="button" data-act="grantTemp"><i class="fas fa-hourglass-end"></i> ${loc("ARVORE.Painel.concederTemporariaMestre")}</button>` : ""}
        ${canRefund ? `<button type="button" class="st-danger" data-act="refund"><i class="fas fa-rotate-left"></i> ${st.rank > 1 ? loc("ARVORE.Painel.reduzirUmNivel") : loc("ARVORE.Comum.reembolsar")}${Number(t.refundPct) < 100 ? ` (${t.refundPct}%)` : ""}</button>` : ""}
      </div>`;
  }
}
