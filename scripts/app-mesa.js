// ═══════════════════════════════════════════════════════════════════════════
//  Árvore da Mesa — janelas da Mesa do mestre: visão geral, recompensas, NPCs, Grandes Feitos,
//  diário da sessão, corrigir pontos e reembolsos feitos pelo mestre
//  Métodos da janela ArvoreHabilidades (copiados para a classe em app.js)
// ═══════════════════════════════════════════════════════════════════════════

import { loc } from "./idioma.js";
import {
  K_FEATS, K_LOG, K_MILES, K_MYTH, K_RANKS, K_TEMP, K_UNLOCK, SKILL_BONUS, addExtras, canSee, catOf,
  coinsOn, dateLang, esc, extraName, extraRes, featDefaults, getProp, gmIds, nodeById, nodeExtras,
  opts, parentsOf, playerCharacters, resPath, setData, sumExtras, topoNodes, uid
} from "./core.js";
import { addLog, box, chat, handleRequest, sendRequest } from "./chat.js";
import { doUnlock, fixOrphans, orphanScan, refundDependents } from "./compras.js";
import { revoke } from "./itens.js";
import { actorOperation } from "./operations.js";
import {
  addCoins, addResDesc, checkSynergies, coin, featsOf, findFeat, hasFeat, isMythic, logOf,
  milestonesOf, mythicOf, nodeState, rankEntry, rankOf, reqsOf, resDesc, resOf, resPathOf, resUpdate,
  skillAvail, trainingOf, treesOpenedBy, trimFeats, unlockedOf
} from "./regras.js";
import { longRestAll, tempsOf } from "./temporarias.js";
import { DialogV2, charCard, whoSub, whoTools, wireWho } from "./ui-kit.js";

export class MixMesa {

  // ── Mesa (visão geral) ──
  async mesaDialog() {
    const chars = playerCharacters().filter(a => this.trees.some(t => t.assigned.includes(a.id)) || reqsOf(a).length || trainingOf(a).length);
    const card = a => {
      const trees = this.trees.filter(t => t.assigned.includes(a.id)).map(t => {
        const pct = t.nodes.length ? Math.round(unlockedOf(a, t).length / t.nodes.length * 100) : 0;
        return `<div class="st-mesa-tree"><span>${esc(t.name)}</span><div class="st-mesa-bar"><i style="width:${pct}%"></i></div><small>${unlockedOf(a, t).length}/${t.nodes.length}</small></div>`;
      }).join("");
      const req = reqsOf(a).length, tr = trainingOf(a).length, last = logOf(a).at(-1);
      return `<div class="st-mesa-card">
        <div class="st-mesa-head"><img src="${esc(a.img)}"><div><b>${esc(a.name)}</b><small>${whoSub(a)}</small></div>
          <button type="button" data-pick="${a.id}" class="st-c-btn"><i class="fas fa-arrow-right"></i> ${loc("ARVORE.Comum.abrir")}</button></div>
        <div class="st-mesa-stats"><span><b>${skillAvail(a)}</b> ${loc("ARVORE.Dialogos.pontosDeHab")}</span>${mythicOf(a) ? `<span class="myth"><b>✦ ${mythicOf(a)}</b> ${loc("ARVORE.Dialogos.miticos")}</span>` : ""}
          ${req ? `<span class="warn"><i class="fas fa-bell"></i> ${req} ${loc("ARVORE.Dialogos.pedidoS")}</span>` : ""}${tr ? `<span><i class="fas fa-hourglass-half"></i> ${tr} ${loc("ARVORE.Dialogos.emTreino")}</span>` : ""}</div>
        ${trees || `<div class="st-c-hint">—</div>`}
        ${last ? `<div class="st-c-hint"><i class="fas fa-clock-rotate-left"></i> ${esc(last.nodeName ?? "")} · ${new Date(last.at).toLocaleDateString(game.i18n?.lang || "pt-BR")}</div>` : ""}
      </div>`;
    };
    const act = (k, icon, label, tip = "") => `<button type="button" data-mesa="${k}" class="st-mesa-act" ${tip ? `data-tooltip="${tip}"` : ""}><i class="fas ${icon}"></i><span>${label}</span></button>`;
    const reqs = this.reqListHTML(null);
    await DialogV2.prompt({
      window: { title: loc("ARVORE.Dialogos.mesaVisaoGeral"), icon: "fas fa-users" }, position: { width: 900 },
      content: `<div class="st-c">
        <div class="st-mesa-acts">
          ${act("reward", "fa-gift", loc("ARVORE.Dialogos.recompensaEmGrupo"))}${act("train", "fa-campground", loc("ARVORE.Dialogos.passar1DescansoLongoTodos"), loc("ARVORE.Dialogos.conta1DescansoLongoNoTreinoE"))}
          ${act("npc", "fa-skull", loc("ARVORE.Dialogos.aplicarSkillTreeEmNpc"))}${act("feat", "fa-star", loc("ARVORE.Comum.grandeFeito"))}
          ${act("journal", "fa-scroll", loc("ARVORE.Dialogos.diarioDaSessao"))}${act("fix", "fa-screwdriver-wrench", loc("ARVORE.Dialogos.corrigirPontos"), loc("ARVORE.Dialogos.devolveOsPontosDeHabilidades"))}
        </div>
        ${reqs ? `<div class="st-c-box st-mesa-reqs">${reqs}</div>` : ""}
        ${this.undoHTML()}
        ${chars.length ? `<div class="st-mesa-grid">${chars.map(card).join("")}</div>` : `<p class='st-c-hint'>${loc("ARVORE.Dialogos.nenhumPersonagemComSkillTree")}</p>`}
      </div>`,
      ok: { label: loc("ARVORE.Comum.fechar") },
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
            const list = await longRestAll();
            if (!list.length) return ui.notifications.info(loc("ARVORE.Dialogos.ninguemEstaTreinandoNemTemHabilidade"));
            ui.notifications.info(loc("ARVORE.Dialogos.descansoLongoContadoParaPersonagem", { length: list.length }));
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
      { value: "@skill", label: loc("ARVORE.Dialogos.pontosDeHabilidadeBonus") }, { value: "mythic", label: loc("ARVORE.Dialogos.pontosMiticos") }, { value: "xp", label: "XP" },
      { value: "gp", label: loc("ARVORE.Comum.pecasDeOuro") }, { value: "pp", label: loc("ARVORE.Comum.pecasDePlatina") },
      // recursos próprios da Skill Tree aberta (Personalizado)
      ...(t?.rules === "custom" ? t.resources.map((r, i) => ({ r, i })).filter(({ r }) => r.kind === "counter" || r.kind === "field").map(({ r, i }) => ({ value: `res:${r.id}`, label: `${r.name} (${t.name})`, path: i === 0 ? resPathOf(t) : resPath(t, r) })) : [])
    ];
    const res = await DialogV2.prompt({
      window: { title: loc("ARVORE.Dialogos.recompensaEmGrupo"), icon: "fas fa-gift" }, position: { width: 560 },
      content: `<div class="st-c">
        <div class="st-c-two">
          <div class="st-c-row"><label>${loc("ARVORE.Comum.quantidade")}</label><div class="st-c-f"><input type="number" name="qtd" value="5"></div></div>
          <div class="st-c-row"><label>${loc("ARVORE.Comum.tipo")}</label><div class="st-c-f"><select name="tipo">${opts(tipos, "@skill")}</select></div></div>
        </div>
        <div class="st-c-row"><label>${loc("ARVORE.Dialogos.motivoOpcional")}</label><div class="st-c-f"><input name="motivo" placeholder="${loc("ARVORE.Dialogos.exDerrotaramOHordak")}"></div></div>
        ${whoTools(chars.length > 6)}
        <div class="st-who-grid">${chars.map(a => charCard(a, { checked: onScene.has(a.id), sub: whoSub(a) })).join("")}</div>
      </div>`,
      render: (ev, dlg) => { if (dlg.element?.querySelector) wireWho(dlg.element); },
      ok: { label: loc("ARVORE.Dialogos.darRecompensa"), callback: (e, btn) => {
        const f = btn.form.elements;
        return { qtd: Number(f.qtd.value) || 0, tipo: f.tipo.value, motivo: f.motivo.value.trim(), ids: chars.filter(a => f[`a-${a.id}`]?.checked).map(a => a.id) };
      } }
    });
    if (!res?.qtd || !res.ids.length) return;
    const tipoNome = { "@skill": loc("ARVORE.Comum.pontosDeHabilidade"), mythic: loc("ARVORE.Comum.pontosMiticos"), xp: "XP", gp: "PO", pp: "PL" }[res.tipo] ?? tipos.find(x => x.value === res.tipo)?.label ?? res.tipo;
    const own = tipos.find(x => x.value === res.tipo && x.path);
    await this.gmRecord(`${loc("ARVORE.Dialogos.recompensa")} ${res.qtd} ${tipoNome}`, res.ids.map(id => game.actors.get(id)), async () => {
    for (const id of res.ids) {
      const a = game.actors.get(id);
      await a.update({ [K_LOG]: addLog(a, { act: "reward", nodeName: `${res.qtd} ${tipoNome}${res.motivo ? ` — ${res.motivo}` : ""}` }) });
      if (res.tipo === "@skill") await a.update({ [SKILL_BONUS]: (Number(getProp(a, SKILL_BONUS)) || 0) + res.qtd });
      else if (res.tipo === "mythic") await a.update({ [K_MYTH]: mythicOf(a) + res.qtd, [K_FEATS]: trimFeats([...featsOf(a), { at: Date.now(), text: res.motivo || loc("ARVORE.Dialogos.recompensa2"), pts: res.qtd }]) });
      else if (res.tipo === "xp") await a.update({ "system.details.xp.value": (Number(a.system?.details?.xp?.value) || 0) + res.qtd });
      else if (res.tipo === "gp" || res.tipo === "pp") await a.update({ [`system.currency.${res.tipo}`]: coin(a, res.tipo) + res.qtd });
      else if (own) await a.update({ [own.path]: Math.max(0, (Number(getProp(a, own.path)) || 0) + res.qtd) });
    }
    });
    const nomes = res.ids.map(id => game.actors.get(id)?.name).join(", ");
    const tipoTxt = tipos.find(x => x.value === res.tipo)?.label ?? res.tipo;
    ChatMessage.create({ speaker: { alias: loc("ARVORE.Dialogos.recompensa2") }, content: box(`🎁 <b>${esc(nomes)}</b> ${loc("ARVORE.Dialogos.receberam")} <b>${res.qtd} ${esc(tipoTxt)}</b>${res.motivo ? `<br><i>${esc(res.motivo)}</i>` : ""}`, "#5fbf6a") });
  }

  async npcDialog() {
    const t = this.tree;
    if (!t) return ui.notifications.warn(loc("ARVORE.Dialogos.escolhaUmaSkillTreePrimeiro"));
    const sel = (canvas?.tokens?.controlled ?? []).map(tk => tk.actor).filter(Boolean);
    const npcs = game.actors.filter(a => a.type === "npc").sort((x, y) => x.name.localeCompare(y.name));
    const res = await DialogV2.prompt({
      window: { title: loc("ARVORE.Dialogos.aplicarEmNpc", { name: t.name }), icon: "fas fa-skull" }, position: { width: 480 },
      content: `<div class="st-c">
        <p class="st-c-lead">${loc("ARVORE.Dialogos.concedeAsHabilidades")} <b>${loc("ARVORE.Dialogos.deGracaESemRequisitos")}</b>${loc("ARVORE.Dialogos.naOrdemDaArvore")}</p>
        <div class="st-c-row"><label>${loc("ARVORE.Dialogos.alvo")}</label><div class="st-c-f"><select name="alvo">
          ${sel.length ? `<option value="@sel">${loc("ARVORE.Dialogos.tokensSelecionados")}${sel.length}): ${esc(sel.map(a => a.name).join(", "))}</option>` : ""}
          ${npcs.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join("")}</select></div></div>
        <div class="st-c-row"><label>${loc("ARVORE.Dialogos.ateONivelMinimo")}</label><div class="st-c-f"><input type="number" name="lvl" placeholder="${loc("ARVORE.Dialogos.vazioTodas")}"></div></div>
        <label class="st-c-tog"><input type="checkbox" name="max" checked><span class="st-c-sw"></span><span><b>${loc("ARVORE.Dialogos.niveisRanksNoMaximo")}</b></span></label>
        ${[...new Set(t.nodes.map(n => n.group).filter(Boolean))].map((g, i) => `<div class="st-c-row"><label>${esc(g)}</label><div class="st-c-f"><select name="grp${i}" data-grp="${esc(g)}">
          ${t.nodes.filter(n => n.group === g).map(n => `<option value="${esc(n.id)}">${esc(n.name)}</option>`).join("")}<option value="">${loc("ARVORE.Dialogos.nenhum")}</option></select></div></div>`).join("")}
      </div>`,
      ok: { label: loc("ARVORE.Dialogos.aplicar"), callback: (e, btn) => {
        const f = btn.form.elements, pick = {};
        btn.form.querySelectorAll("[data-grp]").forEach(s2 => { pick[s2.dataset.grp] = s2.value; });
        return { alvo: f.alvo.value, lvl: Number(f.lvl.value) || 0, max: f.max.checked, pick };
      } }
    });
    if (!res?.alvo) return;
    const alvos = res.alvo === "@sel" ? sel : [game.actors.get(res.alvo)].filter(Boolean);
    await this.gmRecord(`${loc("ARVORE.Dialogos.npc")} ${t.name}`, alvos, async () => {
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
      ChatMessage.create({ whisper: gmIds(), speaker: { alias: "Skill Tree" }, content: box(`🧟 <b>${esc(a.name)}</b> ${loc("ARVORE.Dialogos.recebeuHabilidadeSNivelIsDe", { count })} <b>${esc(t.name)}</b>.`) });
    }
    });
  }

  async pickActor() {
    const list = this.gm ? playerCharacters() : game.actors.filter(a => a.isOwner);
    if (!this.gm && list.length <= 1) return ui.notifications.info(list.length ? loc("ARVORE.Dialogos.esteEOSeuPersonagem") : loc("ARVORE.Dialogos.voceNaoTemPersonagemPecaAoMestre"));
    if (!list.length) return ui.notifications.warn(loc("ARVORE.Dialogos.nenhumPersonagemEncontrado"));
    const t = this.tree;
    const card = a => {
      const trees = this.trees.filter(x => canSee(x, a.id)).length, req = reqsOf(a).length, tr = trainingOf(a).length;
      const note = [req ? `<span class="st-tag warn"><i class="fas fa-bell"></i> ${req}</span>` : "", tr ? `<span class="st-tag"><i class="fas fa-hourglass-half"></i> ${tr}</span>` : "",
        t && !canSee(t, a.id) && this.gm ? `<span class="st-tag mute">${loc("ARVORE.Dialogos.foraDestaArvore")}</span>` : ""].join("");
      return charCard(a, { radio: true, name: "who", checked: a.id === this.actorId, sub: `${whoSub(a)} · ${trees} Skill Tree(s)`, note });
    };
    let picked = null;
    await DialogV2.prompt({
      window: { title: loc("ARVORE.Comum.escolherPersonagem"), icon: "fas fa-user" }, position: { width: 560 },
      content: `<div class="st-c">
        ${list.length > 6 ? `<div class="st-who-tools">${`<input type="search" data-whofind placeholder="${loc("ARVORE.Comum.buscarPersonagem")}">`}</div>` : ""}
        <div class="st-who-grid">${list.map(card).join("")}</div>
        ${this.gm ? `<button type="button" class="st-c-btn" data-openmesa><i class="fas fa-users"></i> ${loc("ARVORE.Dialogos.abrirAMesaVisaoGeralRecompensas")}</button>` : ""}
      </div>`,
      render: (ev, dlg) => {
        const el = dlg.element; if (!el?.querySelector) return;
        wireWho(el);
        el.querySelectorAll('[name="who"]').forEach(r => r.addEventListener("change", () => { picked = r.value; dlg.close(); }));
        el.querySelector("[data-openmesa]")?.addEventListener("click", e => { e.preventDefault(); dlg.close(); this.mesaDialog(); });
      },
      ok: { label: loc("ARVORE.Dialogos.usar"), callback: (e, btn) => { picked ??= btn.form.querySelector('[name="who"]:checked')?.value ?? null; return picked; } },
      rejectClose: false
    });
    if (!picked || picked === this.actorId) return;
    this.actorId = picked; this.sel = null; this.plan = [];
    const first = this.trees.find(x => canSee(x, picked));
    if (first && !canSee(this.tree ?? {}, picked)) { this.treeId = first.id; this.category = catOf(first); }
    this.render();
  }

  journalText(since, format = "md") {
    const B = x => format === "md" ? `**${x}**` : `<b>${esc(x)}</b>`;
    const S = this.sessionInfo();
    const data = new Date(since || Date.now()).toLocaleDateString(dateLang());
    const verbo = { unlock: loc("ARVORE.Dialogos.desbloqueou"), temp: loc("ARVORE.Dialogos.recebeuTemporaria"), feat: loc("ARVORE.Dialogos.grandeFeito"), grant: loc("ARVORE.Dialogos.recebeuDoMestre"), refund: loc("ARVORE.Dialogos.reembolsou"), reset: loc("ARVORE.Dialogos.resetouAArvore"), train: loc("ARVORE.Dialogos.comecouATreinar"), orphan: loc("ARVORE.Dialogos.pontosDevolvidosDe"), deny: loc("ARVORE.Dialogos.pedidoRecusado"), mile: loc("ARVORE.Dialogos.marco"), reward: loc("ARVORE.Dialogos.recebeu"), level: loc("ARVORE.Dialogos.subiuParaONivel") };
    const out = [];
    for (const a of playerCharacters()) {
      const linhas = [];
      for (const e of logOf(a).filter(x => (x.at ?? 0) >= since)) {
        if (e.act === "level") { linhas.push(`${verbo.level} ${e.rank}${e.cost ? ` ${loc("ARVORE.Dialogos.pontosDeHabilidade", { cost: e.cost })}` : ""}`); continue; }
        if (e.act === "reward" || e.act === "mile") { linhas.push(`${verbo[e.act]} ${e.nodeName}`); continue; }
        linhas.push(`${verbo[e.act] ?? e.act} ${e.nodeName ?? ""}${e.rank > 1 ? ` ${loc("ARVORE.Comum.nivel", { rank: e.rank })}` : ""}${e.treeName ? ` — ${e.treeName}` : ""}`.trim());
      }
      for (const f of featsOf(a).filter(x => (x.at ?? 0) >= since)) linhas.push(loc("ARVORE.Dialogos.grandeFeitoPontoSMiticoS", { text: f.text, pts: f.pts }));
      if (!linhas.length) continue;
      out.push(`${B(a.name)}\n${linhas.map(l => `• ${l}`).join("\n")}`);
    }
    const head = `${B(`${loc("ARVORE.Dialogos.sessao", { n: S.n })} ${data}`)}`;
    return out.length ? `${head}\n\n${out.join("\n\n")}` : `${head}

${loc("ARVORE.Dialogos.nadaRegistradoNasSkillTreesDesde")}`;
  }

  async journalDialog() {
    const S = this.sessionInfo();
    const since = S.start || (Date.now() - 12 * 3600 * 1000);
    const md = this.journalText(since, "md");
    await DialogV2.prompt({
      window: { title: `${loc("ARVORE.Dialogos.diarioSessao")} ${S.n}` }, position: { width: 560 },
      content: `<p class="hint">${S.start ? loc("ARVORE.Dialogos.desde", { v: new Date(S.start).toLocaleString(dateLang()) }) : loc("ARVORE.Dialogos.nenhumaSessaoIniciadaMostrando")} ${loc("ARVORE.Dialogos.textoProntoParaColarNoDiscord")}</p>
        <textarea data-journal rows="16" style="width:100%;font-family:monospace;font-size:12px">${esc(md)}</textarea>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button type="button" data-j="copy" style="flex:1"><i class="fas fa-copy"></i> ${loc("ARVORE.Comum.copiar")}</button>
          <button type="button" data-j="chat" style="flex:1"><i class="fas fa-comment"></i> ${loc("ARVORE.Dialogos.postarNoChat")}</button>
          <button type="button" data-j="new" style="flex:1"><i class="fas fa-flag-checkered"></i> ${loc("ARVORE.Dialogos.iniciarNovaSessao")}</button>
        </div>`,
      ok: { label: loc("ARVORE.Comum.fechar") },
      render: (ev, dlg) => {
        const el = dlg.element;
        el.querySelectorAll("[data-j]").forEach(b => b.addEventListener("click", async e => {
          e.preventDefault();
          const txt = el.querySelector("[data-journal]")?.value ?? md;
          if (b.dataset.j === "copy") {
            try { await navigator.clipboard.writeText(txt); ui.notifications.info(loc("ARVORE.Dialogos.diarioCopiado")); }
            catch { el.querySelector("[data-journal]")?.select(); ui.notifications.info(loc("ARVORE.Dialogos.textoSelecionadoUseCtrlCPara")); }
          } else if (b.dataset.j === "chat") {
            ChatMessage.create({ speaker: { alias: loc("ARVORE.Dialogos.diarioDaSessao2") }, content: box(this.journalText(since, "html").replace(/\n/g, "<br>"), "#8a6a3f") });
          } else {
            if (!await DialogV2.confirm({ window: { title: loc("ARVORE.Dialogos.novaSessao") }, content: `<p>${loc("ARVORE.Dialogos.marcarAgoraComoInicioDa")} <b>${loc("ARVORE.Dialogos.sessao2")} ${S.n + (S.start ? 1 : 0)}</b>${loc("ARVORE.Dialogos.oDiarioPassaAContarAPartirDeste")}</p>` })) return;
            await setData("session", { start: Date.now(), n: S.n + (S.start ? 1 : 0) });
            ui.notifications.info(loc("ARVORE.Dialogos.novaSessaoIniciada"));
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
      window: { title: loc("ARVORE.Dialogos.grandeFeito2"), icon: "fas fa-star" }, position: { width: 480 }, classes: ["st-cfg-dialog"],
      content: `<div class="st-c">
        <div class="st-c-row"><label>${loc("ARVORE.Comum.grandeFeito")}${t ? ` — ${esc(t.name)}` : ""}</label><div class="st-c-f"><select name="which">
          ${list.map(f => `<option value="${esc(f.id)}" ${f.id === first ? "selected" : ""}>${esc(f.name)} (+${f.pts} ✦)</option>`).join("")}
          <option value="" ${first ? "" : "selected"}>${loc("ARVORE.Dialogos.feitoAvulsoSemArvore")}</option></select></div></div>
        <div data-info class="st-c-name"></div>
        <div data-loose class="st-c-two">
          <div class="st-c-row"><label>${loc("ARVORE.Dialogos.nome")}</label><div class="st-c-f"><input name="feito" placeholder="${loc("ARVORE.Dialogos.exDerrotouUmInimigoLendario")}"></div></div>
          <div class="st-c-row"><label>${loc("ARVORE.Comum.pontosMiticos")}</label><div class="st-c-f"><input type="number" name="pts" value="1" min="0"></div></div>
        </div>
        ${whoTools(chars.length > 6)}
        <div class="st-who-grid">${rows || `<p class='st-c-hint'>${loc("ARVORE.Dialogos.nenhumPersonagem")}</p>`}</div>
        <label class="st-c-tog"><input type="checkbox" name="marco" checked><span class="st-c-sw"></span><span><b>${loc("ARVORE.Dialogos.registrarTambemComoMarco")}</b><small>${loc("ARVORE.Dialogos.habilidadesQuePedemEsseMarco")}</small></span></label>
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
          info.innerHTML = f ? `<b>${loc("ARVORE.Dialogos.pontoSMiticoS", { pts: f.pts })}</b>${f.desc ? ` · ${esc(f.desc)}` : ""}${opens.length ? `<br><i class="fas fa-lock-open"></i> ${loc("ARVORE.Comum.libera")} <b>${esc(opens.join(", "))}</b>` : ""}` : "";
          el.querySelectorAll("[data-who]").forEach(row => {
            const x = game.actors.get(row.dataset.who), got = !!f && hasFeat(x, f.id), cb = row.querySelector("input");
            cb.disabled = got; if (got) cb.checked = false;
            row.classList.toggle("off", got);
            row.querySelector("em").innerHTML = got ? `<span class="st-tag ok">${loc("ARVORE.Dialogos.jaTem")}</span>` : "";
          });
        };
        sel.addEventListener("change", sync); sync();
      },
      ok: { label: loc("ARVORE.Comum.conceder"), icon: "fas fa-star", callback: (e, btn) => {
        const f = btn.form.elements;
        return { which: f.which.value, feito: f.feito.value.trim(), pts: Math.max(0, Number(f.pts.value) || 0), marco: f.marco.checked,
          ids: chars.filter(x => f[`a-${esc(x.id)}`]?.checked && !f[`a-${esc(x.id)}`]?.disabled).map(x => x.id) };
      } },
      rejectClose: false
    });
    if (!res?.ids?.length) return;
    const feat = res.which ? list.find(x => x.id === res.which) : null;
    return this.gmRecord(`${loc("ARVORE.Comum.grandeFeito2")} ${feat?.name ?? (res.feito || loc("ARVORE.Comum.grandeFeito"))}`, res.ids.map(id => game.actors.get(id)), async () => {
      const given = await this.grantFeat(res.ids, feat, res);
      return given?.length ? given : false;
    });
  }

  async grantFeat(ids, feat, { feito = "", pts = 1, marco = true } = {}) {
    const t = feat ? this.trees.find(x => x.feats.some(f => f.id === feat.id)) : null;
    const name = feat?.name ?? (feito || loc("ARVORE.Comum.grandeFeito")), value = feat ? Number(feat.pts) || 0 : pts;
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
    ChatMessage.create({ speaker: { alias: loc("ARVORE.Comum.grandeFeito") }, content: `<div style="border:2px solid #e000ff;border-radius:10px;padding:10px;background:radial-gradient(circle at 50% 20%,#e000ff44,#1d2029 70%);color:#eee;text-align:center">
      <div style="font-size:10px;letter-spacing:4px;color:#f5b8ff">${loc("ARVORE.Dialogos.grandeFeito3")}</div>
      <div style="font-size:17px;font-weight:bold;margin:6px 0;color:#f5b8ff">${esc(name)}</div>
      <div>${esc(given.map(x => x.name).join(", "))} ${given.length > 1 ? loc("ARVORE.Dialogos.recebem") : loc("ARVORE.Dialogos.recebe")} <b>${value} ${loc("ARVORE.Dialogos.pontoSMiticoS2")}</b></div>
      ${opens.length ? `<div style="margin-top:6px">${loc("ARVORE.Dialogos.liberaASkillTree")} <b>${esc(opens.join(", "))}</b></div>` : ""}</div>` });
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
    if (!await DialogV2.confirm({ window: { title: loc("ARVORE.Dialogos.retirarGrandeFeito") }, rejectClose: false,
      content: `<p>${loc("ARVORE.Dialogos.retirar")} <b>${esc(ref?.feat.name ?? entries[0].text)}</b> ${loc("ARVORE.Dialogos.deETirar", { name: esc(a.name) })} <b>${pts} ${loc("ARVORE.Dialogos.pontoSMiticoS2")}</b>${mythicOf(a) < pts ? ` ${loc("ARVORE.Dialogos.soTemFicaEm0", { a: mythicOf(a) })}` : ""}?</p>${opens.length ? `<p style="font-size:12px">${esc(opens.join(", "))} ${loc("ARVORE.Dialogos.voltaMAFicarBloqueadaSOQueJa")}</p>` : ""}` })) return;
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
      window: { title: f ? loc("ARVORE.Dialogos.editarGrandeFeito") : loc("ARVORE.Comum.novoGrandeFeito"), icon: "fas fa-star" }, position: { width: 440 }, classes: ["st-cfg-dialog"],
      content: `<div class="st-c">
        <div class="st-c-row"><label>${loc("ARVORE.Dialogos.nome")}</label><div class="st-c-f"><input name="name" value="${esc(f ? cur.name : "")}" placeholder="${loc("ARVORE.Dialogos.exDerrotouODragaoVermelho")}" autofocus></div></div>
        <div class="st-c-row"><label>${loc("ARVORE.Comum.pontosMiticos")}</label><div class="st-c-f"><input type="number" name="pts" min="0" value="${Number(cur.pts) || 0}"></div></div>
        <div class="st-c-row"><label>${loc("ARVORE.Comum.descricao")}</label><div class="st-c-f"><textarea name="desc" rows="2" placeholder="${loc("ARVORE.Dialogos.opcional")}">${esc(cur.desc)}</textarea></div></div>
        <p class="st-c-hint">${loc("ARVORE.Dialogos.paraUmaSkillTreeSoAbrirDepois")} <b>${loc("ARVORE.Dialogos.estaSkillTreeGeralDisponivel")}</b>.</p></div>`,
      ok: { label: loc("ARVORE.Comum.salvar"), icon: "fas fa-check", callback: (e, b) => {
        const el = b.form.elements;
        return { name: el.name.value.trim() || loc("ARVORE.Comum.grandeFeito"), pts: Math.max(0, Number(el.pts.value) || 0), desc: el.desc.value.trim() };
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
    if (!await DialogV2.confirm({ window: { title: loc("ARVORE.Dialogos.excluirGrandeFeito") }, rejectClose: false,
      content: `<p>${loc("ARVORE.Comum.excluir")} <b>${esc(f.name)}</b> ${loc("ARVORE.Dialogos.destaSkillTreeCtrlZDesfaz")}</p><p style="font-size:12px">${loc("ARVORE.Dialogos.quemJaGanhouContinuaComOsPontos")}${opens.length ? ` ${esc(opens.map(x => x.name).join(", "))} ${loc("ARVORE.Dialogos.deixaMDeEsperarPorEsteFeitoE")}` : ""}</p>` })) return;
    t.feats = t.feats.filter(x => x.id !== featId);
    for (const x of opens) { x.lockKind = ""; x.lockFeat = ""; }
    this.save(); this.render();
  }

  async givePts() {
    const t = this.tree, a = this.actorDoc; if (!t || !a) return;
    // principal + recursos extras do Personalizado
    const list = [{ id: "", name: t.resLabel, cur: resOf(a, t) }, ...extraRes(t).map(r => ({ id: r.id, name: r.name, path: resPath(t, r), cur: Number(getProp(a, resPath(t, r))) || 0 }))];
    const res = await DialogV2.prompt({
      window: { title: `${loc("ARVORE.Dialogos.darOuTirar")} ${a.name}` }, classes: ["st-cfg-dialog"],
      content: `<div class="st-c">
        ${list.length > 1 ? `<div class="st-c-row"><label>${loc("ARVORE.Dialogos.recurso")}</label><div class="st-c-f"><select name="which">${list.map(x => `<option value="${esc(x.id)}">${esc(x.name)} ${loc("ARVORE.Dialogos.tem2", { cur: x.cur })}</option>`).join("")}</select></div></div>` : `<p>${esc(t.resLabel)} atual: <b>${list[0].cur}</b></p>`}
        <div class="st-c-row"><label>${loc("ARVORE.Dialogos.somarUseNegativoParaTirar")}</label><div class="st-c-f"><input type="number" name="delta" value="1" autofocus></div></div></div>`,
      ok: { label: loc("ARVORE.Dialogos.aplicar"), callback: (e, btn) => ({ which: btn.form.elements.which?.value ?? "", val: Number(btn.form.elements.delta.value) || 0 }) },
      rejectClose: false
    });
    if (!res?.val) return;
    const x = list.find(y => y.id === res.which) ?? list[0], val = res.val;
    await this.gmRecord(`${val > 0 ? "+" : ""}${val} ${x.name} → ${a.name}`, [a], async () => {
      if (!x.id) await a.update(resUpdate(a, t, val, true));
      else await a.update({ [x.path]: Math.max(0, x.cur + val) });
    });
    const now = x.id ? Number(getProp(a, x.path)) || 0 : resOf(a, t);
    chat(a, `<b>${esc(a.name)}</b> ${val > 0 ? "recebeu" : "perdeu"} <b>${Math.abs(val)} ${esc(x.name)}</b> <small>(${esc(t.name)}: agora ${now})</small>`);
  }

  async unlock(a, t, n) {
    if (!a || !t || !n) return;
    const st = nodeState(a, t, n);
    if (!st.canBuy) return ui.notifications.warn(st.reasons.join(" · ") || loc("ARVORE.Comum.indisponivel"));
    if (t.approval && !this.gm) {
      if (!await DialogV2.confirm({ window: { title: loc("ARVORE.Comum.pedirAoMestre") }, content: `<p>${loc("ARVORE.Dialogos.pedirAoMestreParaDesbloquear")} <b>${esc(n.name)}</b>${st.cost ? ` (${st.cost} ${esc(t.resLabel)})` : ""}?</p>` })) return;
      return sendRequest(a, t, n, st.cost);
    }
    const extra = [coinsOn(t) && Number(n.costGp) ? `${n.costGp} PO` : "", coinsOn(t) && Number(n.costPp) ? `${n.costPp} PL` : "",
      ...Object.entries(nodeExtras(t, n)).map(([p, v]) => `${v} ${extraName(t, p)}`), ...n.consume.map(x => `${Number(x.qty) || 1}× ${x.name}`)].filter(Boolean);
    const ok = await DialogV2.confirm({
      window: { title: Number(n.trainDays) ? loc("ARVORE.Dialogos.treinarHabilidade") : st.rank ? loc("ARVORE.Dialogos.subirDeNivel") : loc("ARVORE.Dialogos.desbloquearHabilidade") },
      content: `<p>${st.rank ? `${loc("ARVORE.Dialogos.subir")} <b>${esc(n.name)}</b> ${loc("ARVORE.Dialogos.paraONivel", { v: st.rank + 1 })}${st.max}` : `${loc("ARVORE.Comum.desbloquear")} <b>${esc(n.name)}</b>`} ${loc("ARVORE.Comum.para")} <b>${esc(a.name)}</b>${st.cost ? ` ${loc("ARVORE.Comum.por")} <b>${st.cost} ${esc(t.resLabel)}</b>` : ""}${extra.length ? ` + ${esc(extra.join(", "))}` : ""}?</p>
          ${Number(n.trainDays) ? `<p>${loc("ARVORE.Dialogos.ficaProntaDepoisDeDescansoSLongo", { trainDays: n.trainDays })}</p>` : ""}`
    });
    if (!ok) return;
    return doUnlock(a, t, n);
  }

  // Mesa → Corrigir pontos
  async fixPoints() {
    await this.flushSave();
    const chars = game.actors.filter(a => a.type === "character");
    const scans = chars.map(a => [a, orphanScan(a, this.trees)]).filter(([, r]) => r.found);
    if (!scans.length) return ui.notifications.info(loc("ARVORE.Dialogos.nenhumPontoPresoTodosOsPersonagens"));
    const lista = scans.map(([a, r]) => `<li><b>${esc(a.name)}</b>: ${[r.skillBack ? loc("ARVORE.Dialogos.pontosDeHabilidade2", { skillBack: r.skillBack }) : "", r.myth ? loc("ARVORE.Dialogos.pontosMiticos2", { myth: r.myth }) : "", r.gp ? `+${r.gp} PO` : "", r.pp ? `+${r.pp} PL` : ""].filter(Boolean).join(", ") || loc("ARVORE.Dialogos.limpezaDaFicha")}${r.items.length + r.effects.length ? ` ${loc("ARVORE.Dialogos.removeItemNsEfeitoS", { v: r.items.length + r.effects.length })}` : ""}</li>`).join("");
    if (!await DialogV2.confirm({ window: { title: loc("ARVORE.Dialogos.corrigirPontos") }, position: { width: 480 }, content: `<p>${loc("ARVORE.Dialogos.habilidadesQueNaoExistemMais")}</p><ul style="font-size:12px">${lista}</ul><p>${loc("ARVORE.Dialogos.devolverELimparAsFichas")}</p>` })) return;
    const rep = await fixOrphans(scans.map(([a]) => a), { trees: this.trees });
    ui.notifications.info(loc("ARVORE.Dialogos.pontosCorrigidosParaPersonagem", { length: rep.length }));
    this.render();
  }

  async refundAll(a, t) {
    if (!a || !t) return;
    if (!this.gm && (!a.isOwner || !t.refundPlayer || !canSee(t,a.id))) throw new Error(loc("ARVORE.Dialogos.reembolsoNaoAutorizado"));
    const un = unlockedOf(a, t);
    if (!await DialogV2.confirm({ window: { title: loc("ARVORE.Dialogos.reembolsarTudo") }, content: `<p>${loc("ARVORE.Dialogos.removerTodasAsHabilidadesDe", { length: un.length })} <b>${esc(a.name)}</b> ${loc("ARVORE.Dialogos.nestaSkillTreeEDevolverOQueFoi")}</p>` })) return;
    return actorOperation(a, async a => {
    const un = unlockedOf(a,t);
    const external = t.nodes.flatMap(n => refundDependents(a,t,n,0)).filter(d => d.tree.id !== t.id);
    if (external.length) throw new Error(`${loc("ARVORE.Dialogos.reembolsePrimeiroAsHabilidades")} ${external.map(d => d.node.name).join(", ")}`);
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
    chat(a, `<b>${esc(a.name)}</b> ${loc("ARVORE.Dialogos.teveASkillTree")} <b>${esc(t.name)}</b> ${loc("ARVORE.Dialogos.resetada")} <small>(+${total} ${esc(t.resLabel)}${myth ? loc("ARVORE.Dialogos.pontosMiticos3", { myth }) : ""}${gp ? `, +${gp} PO` : ""}${pp ? `, +${pp} PL` : ""})</small>`);
    });
  }
}
