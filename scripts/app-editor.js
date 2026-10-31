// ═══════════════════════════════════════════════════════════════════════════
//  Árvore da Mesa — editor de habilidade (painel lateral no modo Editar)
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
  K_TEMP, tempsOf, tempOf, tempText, grantTemp, endTemp, today, dateText, calApi, syncShared, sharedCopies, SHARED_SKIP
} from "./core.js?v=1.7.5";
import { SaveQueue } from "./persistence.js?v=1.7.5";
import { validateTrees, remapTree } from "./validation.js?v=1.7.5";
import { actorOperation } from "./operations.js?v=1.7.5";
import { DialogV2, charCard, whoSub, whoTools, wireWho, datePicker, readDate, wireDate } from "./ui-kit.js?v=1.7.5";

export class MixEditor {
  editPanelHTML(t, n) {
    const typeOpts = v => {
      const cur = systemType(v);
      return CHANGE_TYPES.map(c => `<option value="${esc(c.value)}" ${cur === c.value ? "selected" : ""}>${esc(c.label)}</option>`).join("");
    };
    const RK = Math.max(1, Number(n.ranks) || 1);
    const rows = (list, LST) => list.map((c, i) => {
      const lv = r => pickRank(c.value, c.values, r);
      return L`
      <div class="st-chg">
        <div class="st-row"><input list="st-keys" data-chg="${i}" data-list="${LST}" data-k="key" value="${esc(c.key)}" placeholder="o que muda (ex.: Bônus na CA)"><a class="x" data-delchg="${i}" data-list="${LST}" data-tooltip="Remover">✕</a></div>
        <div class="st-row"><select data-chg="${i}" data-list="${LST}" data-k="type">${typeOpts(c.type)}</select>
          <input data-chg="${i}" data-list="${LST}" data-k="value" value="${esc(c.value)}" placeholder="${RK > 1 ? L("nível 1") : L("valor ou @rank")}" ${RK > 1 ? L('data-tooltip="Valor no nível 1"') : ""}></div>
        ${RK > 1 ? `<div class="st-lvls">${Array.from({ length: RK - 1 }, (_, j) => L`<label>Nv ${j + 2}<input data-chgr="${i}" data-list="${LST}" data-r="${j}" value="${esc(c.values?.[j] ?? "")}" placeholder="${esc(lv(j + 1))}"></label>`).join("")}</div>` : ""}
        ${c.key ? `<div class="st-preview">→ ${RK > 1
          ? Array.from({ length: RK }, (_, j) => L`Nv ${j + 1}: ${esc(changeLabel({ ...c, value: String(lv(j + 1)).replace(/@rank/g, j + 1) }))}`).join(" · ")
          : esc(changeLabel(c))}</div>` : ""}
      </div>`;
    }).join("");
    const F = (label, html) => `<div><label class="f">${label}</label>${html}</div>`;
    const inp = (k, ph = "", type = "text", extra = "") => `<input type="${type}" data-field="${k}" value="${esc(n[k])}" placeholder="${esc(ph)}" ${extra}>`;
    const sel = (k, list, num = false) => `<select data-field="${k}" ${num ? "data-num" : ""}>${opts(list, n[k])}</select>`;
    const ck = (k, label) => `<label class="ck"><input type="checkbox" data-field="${k}" ${n[k] ? "checked" : ""}> ${label}</label>`;
    const sec = (id, icon, title, help, body, badge = "") => `<details class="st-sec" data-sec="${id}" ${this.secOpen.has(id) ? "open" : ""}>
      <summary><i class="${icon}"></i> ${title}${badge ? `<span class="st-pill">${badge}</span>` : ""}</summary>
      <div class="st-sec-b">${help ? `<p class="st-help">${help}</p>` : ""}${body}</div></details>`;
    const cat = this.catalog ?? { classes: [], races: [] };
    const LB = labelsOf(t);
    const itemList = (list, key, qty = false) => list.map((it, i) => `<div class="st-item"${it.uuid ? ` data-open="${esc(it.uuid)}"` : ""}><img src="${esc(it.img || "icons/svg/item-bag.svg")}"><span>${esc(it.name)}</span>
      ${qty ? L`<input class="qty" type="number" min="1" data-qty="${key}:${i}" value="${Number(it.qty) || 1}" data-tooltip="Quantidade">` : ""}<a class="x" data-dellist="${key}:${i}">✕</a></div>`).join("");

    // requisitos
    const classOpts = cur => {
      const list = [...cat.classes];
      if (cur?.id && !list.some(c => c.id === cur.id)) list.unshift({ id: cur.id, name: cur.name });
      return L`<option value="">— escolha —</option>` + list.map(c => `<option value="${esc(c.id)}" ${cur?.id === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("");
    };
    const classRows = n.reqClasses.map((c, i) => L`<div class="st-row">
      <select data-rc="${i}" data-k="id" style="flex:2">${classOpts(c)}</select>
      <input type="number" min="0" data-rc="${i}" data-k="level" value="${Number(c.level) || ""}" placeholder="nível" style="flex:0 0 64px" data-tooltip="Nível mínimo na classe (vazio = qualquer)">
      <a class="x" data-delrc="${i}">✕</a></div>`).join("");
    const races = [...cat.races];
    if (n.reqRace && !races.some(r => r.name === n.reqRace)) races.unshift({ name: n.reqRace });
    const groups = [...new Set(t.nodes.map(x => x.group).filter(Boolean))].sort();
    const groupMates = n.group ? t.nodes.filter(x => x.group === n.group && x.id !== n.id).map(x => x.name) : [];
    const parents = parentsOf(t, n.id).map(p => `<div class="st-row"><span>← ${esc(nodeById(t, p)?.name)}</span><a class="x" data-unlink="${p}">✕</a></div>`).join("");
    const miles = new Set(); for (const tr of this.trees) for (const x of tr.nodes) if (x.milestone) miles.add(x.milestone);
    const nReq = [parentsOf(t, n.id).length, Number(n.minLevel), n.reqAbility && Number(n.reqScore), n.reqClasses.length, n.reqRace, n.reqItems.length, n.group, n.milestone, n.reqDate !== null && n.reqDate !== undefined].filter(Boolean).length;

    const reqBody = L`
      <div class="st-sub2"><i class="fas fa-link"></i> Habilidades anteriores</div>
      ${parents || L`<div class="st-muted">Nenhuma. Use <b>Ligar</b> (ou Shift+clique) no mapa.</div>`}
      ${parents ? F(L("Precisa de"), sel("prereq", [{ value: "all", label: L("Todas as anteriores") }, { value: "any", label: L("Qualquer uma delas") }])) : ""}
      <div class="st-sub2"><i class="fas fa-user-shield"></i> Personagem</div>
      <div class="st-row">${F(L("Nível mínimo"), inp("minLevel", "0", "number", 'min="0"'))}${F(L("Atributo mínimo"), sel("reqAbility", [{ value: "", label: "—" }, ...ABILITIES]))}${n.reqAbility ? F(L("Valor"), inp("reqScore", "13", "number", 'min="0"')) : ""}</div>
      ${F(L("Raça"), L`<select data-field="reqRace"><option value="">— qualquer raça —</option>${races.map(r => `<option value="${esc(r.name)}" ${n.reqRace === r.name ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select>`)}
      <div class="st-sub2"><i class="fas fa-graduation-cap"></i> Classe <small>(basta ter uma)</small></div>
      ${classRows || L`<div class="st-muted">Qualquer classe.</div>`}
      <button type="button" data-act="addReqClass"><i class="fas fa-plus"></i> Adicionar classe</button>
      ${!cat.classes.length ? L`<div class="st-muted">Carregando classes do Foundry…</div>` : ""}
      <div class="st-sub2"><i class="fas fa-box-open"></i> Itens e talentos exigidos <small>(precisa ter todos)</small></div>
      ${itemList(n.reqItems, "reqItems")}
      <div class="st-drop" data-dropzone="reqItems"><i class="fas fa-hand-pointer"></i> Solte aqui um item ou talento que o personagem precisa ter</div>
      <div class="st-sub2"><i class="fas fa-diagram-project"></i> Combo com outras árvores <small>(precisa ter todas)</small></div>
      ${n.reqNodes.map((rn, i) => { const rt = this.trees.find(x => x.id === rn.tree), rnode = nodeById(rt, rn.node); return L`<div class="st-row"><span style="flex:2">🔗 ${esc(rnode?.name ?? rn.name ?? "?")} <small style="opacity:.6">(${esc(rt?.name ?? L("árvore apagada"))})</small></span><input type="number" min="1" data-rnrank="${i}" value="${Number(rn.rank) || 1}" style="flex:0 0 50px" data-tooltip="Nível mínimo"><a class="x" data-delrn="${i}">✕</a></div>`; }).join("")}
      <select data-addrn><option value="">+ exigir habilidade de outra árvore…</option>${this.trees.filter(x => x.id !== t.id).map(x => `<optgroup label="${esc(x.name)}">${x.nodes.map(y => `<option value="${esc(x.id)}:${y.id}">${esc(y.name)}</option>`).join("")}</optgroup>`).join("")}</select>
      <p class="st-help">Use com <b>Sinergia</b> (em Comportamento) para criar combos que liberam sozinhos — ex.: ter “Escudo de Luz” e “Mestra da Lâmina” libera “Contra-ataque”.</p>
      <div class="st-sub2"><i class="fas fa-trophy"></i> Marco da campanha</div>
      <input data-field="milestone" list="st-miles" value="${esc(n.milestone)}" placeholder="ex.: Derrotou um inimigo lendário (vazio = nenhum)">
      <datalist id="st-miles">${[...miles].map(m => `<option value="${esc(m)}">`).join("")}</datalist>
      <div class="st-sub2"><i class="fas fa-calendar-day"></i> ${L("Data do calendário")}</div>
      ${n.reqDate === null || n.reqDate === undefined
        ? `<button type="button" data-reqdate="on"><i class="fas fa-plus"></i> ${L("Só liberar a partir de uma data")}</button>`
        : `<div class="st-row"><span>${L("A partir de")} <b>${esc(dateText(n.reqDate))}</b></span><a class="x" data-reqdate="off" data-tooltip="${L("Remover")}">✕</a></div>
           <button type="button" data-reqdate="on"><i class="fas fa-calendar-day"></i> ${L("Trocar a data")}</button>`}
      <p class="st-help">Você marca os marcos de cada personagem no painel (modo Jogo).</p>
      <div class="st-sub2"><i class="fas fa-code-branch"></i> Escolha exclusiva</div>
      <p class="st-help">Habilidades no mesmo grupo são <b>caminhos alternativos</b>: ao escolher uma, as outras do grupo ficam bloqueadas.</p>
      <select data-group><option value="">— não é exclusiva —</option>${groups.map(g => `<option value="${esc(g)}" ${n.group === g ? "selected" : ""}>${esc(g)}</option>`).join("")}<option value="@new">+ Novo grupo…</option></select>
      ${groupMates.length ? L`<div class="st-muted">Concorre com: ${esc(groupMates.join(", "))}</div>` : n.group ? L`<div class="st-muted">Ainda sozinha neste grupo — coloque outras habilidades nele.</div>` : ""}`;

    // várias habilidades na ficha
    const featCard = (f, i) => {
      const fi = i;
      const finp = (k, ph = "", type = "text") => `<input type="${type}" data-feat="${k}" data-fi="${fi}" value="${esc(f[k])}" placeholder="${esc(ph)}">`;
      const fsel = (k, list) => `<select data-feat="${k}" data-fi="${fi}">${opts(list, f[k])}</select>`;
      const fck = (k, label) => `<label class="ck"><input type="checkbox" data-feat="${k}" data-fi="${fi}" ${f[k] ? "checked" : ""}> ${label}</label>`;
      const body = L`
        <div class="st-row">${F(L("Nome na ficha"), finp("name", featName(n, f, i)))}<button type="button" data-act="pickFeatImg" data-fi="${fi}" style="flex:0 0 34px;margin-top:16px;padding:0" data-tooltip="Imagem própria"><img src="${esc(f.img || n.img)}" style="width:24px;height:24px;border:none"></button></div>
        ${F(L("Tipo"), fsel("kind", FEAT_KINDS))}
        <div class="st-row">
          ${f.kind !== "none" ? F(L("Ativação"), fsel("activation", ACTIVATIONS)) : ""}
          ${F(L("Usos (0 = ilimitado)"), finp("uses", "0", "number"))}
        </div>
        ${f.uses ? F(L("Recupera em"), fsel("recovery", RECOVERY)) : ""}
        ${f.kind !== "none" ? `<div class="st-row">${F(L("Duração"), finp("durValue", L("vazio = instantânea")))}${F("&nbsp;", fsel("durUnits", DUR_UNITS))}</div>
          <div class="st-row">${F(L("Alcance"), finp("range", f.kind === "utility" ? L("vazio = pessoal") : "1,5"))}
            ${F("&nbsp;", fsel("rangeUnits", [{ value: "ft", label: L("pés/unid.") }, { value: "m", label: "metros" }, { value: "touch", label: "toque" }, { value: "self", label: "pessoal" }]))}</div>` : ""}
        ${f.kind === "attack" ? `
          <div class="st-row">${F(L("Ataque"), fsel("attackType", [{ value: "melee", label: L("Corpo a corpo") }, { value: "ranged", label: L("À distância") }]))}
            ${F(L("Natureza"), fsel("classification", [{ value: "weapon", label: L("Arma") }, { value: "spell", label: L("Magia") }, { value: "unarmed", label: L("Desarmado") }]))}</div>
          <div class="st-row">${F(L("Atributo"), fsel("ability", [{ value: "", label: L("Padrão") }, ...ABILITIES, { value: "spellcasting", label: L("Conjuração") }]))}
            ${F(L("Bônus de acerto"), finp("toHit", L("ex.: 2 ou @rank")))}</div>` : ""}
        ${f.kind === "save" ? `
          <div class="st-row">${F(L("Resistência de"), fsel("saveAbility", ABILITIES))}${F(L("CD fixa"), finp("saveDC", L("vazio = CD de magia")))}</div>
          ${F(L("Se passar"), fsel("onSave", [{ value: "half", label: L("Metade do dano") }, { value: "none", label: L("Nenhum dano") }, { value: "full", label: L("Dano total") }]))}` : ""}
        ${["attack", "save"].includes(f.kind) ? `<div class="st-row">${F(L("Dano"), finp("formula", "2d8 + @mod"))}${F(L("Tipo"), fsel("damageType", [{ value: "", label: "—" }, ...DAMAGE_TYPES]))}</div>` : ""}
        ${f.kind === "heal" ? `<div class="st-row">${F(L("Cura"), finp("formula", "2d8 + @abilities.wis.mod"))}${F(L("Tipo"), fsel("healType", [{ value: "healing", label: L("Cura (PV)") }, { value: "temphp", label: L("PV temporários") }]))}</div>` : ""}
        ${["save", "heal"].includes(f.kind) ? F(L("Número de alvos"), finp("targets", "1", "number")) : ""}
        ${F(L("Regra extra (aparece na ficha, clara e objetiva)"), L`<textarea data-feat="note" data-fi="${fi}" style="min-height:40px" placeholder="ex.: Aliados a 3 m também recebem o bônus (aplicar manualmente).">${esc(f.note)}</textarea>`)}
        <div class="st-preview" style="white-space:pre-line">${esc(featureRules(f))}</div>
        ${F(i === 0 ? L("Descrição na ficha (vazio = descrição da habilidade)") : L("Descrição na ficha"), `<textarea data-feat="desc" data-fi="${fi}" style="min-height:50px">${esc(f.desc)}</textarea>`)}
        ${RK > 1 ? (() => {
          const fields = RANK_FIELDS.filter(rf => rf.kinds.includes(f.kind) && (!rf.transform || f.transform));
          const blocks = Array.from({ length: RK - 1 }, (_, j) => {
            const r = j + 2;
            return L`<div class="st-lvlbox"><div class="st-sub2" style="margin-top:4px"><i class="fas fa-layer-group"></i> Nível ${r} <small>(vazio = igual ao nível ${r - 1})</small></div>
              ${fields.map(rf => {
                const ph = esc(String(pickRank(f[rf.k], f.byRank?.[rf.k], r - 1) ?? ""));
                const val = esc(f.byRank?.[rf.k]?.[j] ?? "");
                return rf.area
                  ? `<label class="f">${rf.label}</label><textarea data-fr="${rf.k}" data-fi="${fi}" data-r="${j}" style="min-height:44px" placeholder="${ph ? L("igual ao nível anterior") : ""}">${val}</textarea>`
                  : `<div class="st-row"><label class="f" style="flex:0 0 110px">${rf.label}</label><input data-fr="${rf.k}" data-fi="${fi}" data-r="${j}" value="${val}" placeholder="${ph}"></div>`;
              }).join("")}</div>`;
          }).join("");
          return sec(`featrk-${fi}`, "fas fa-layer-group", L("Por nível"), L("O que muda nesta habilidade da ficha a cada nível. Os efeitos ao usar têm valores por nível logo acima de cada mudança."), blocks);
        })() : ""}
        ${f.kind !== "none" ? L`<div class="st-sub2"><i class="fas fa-bolt"></i> Efeito ao usar (temporário)</div>
          ${rows(f.changes, `f${fi}`)}
          <button type="button" data-act="addFChg" data-fi="${fi}"><i class="fas fa-plus"></i> Mudança ao usar</button>
          ${fck("transform", L("É uma transformação (troca o token e encerra sozinha)"))}
          ${f.transform ? L`<div class="st-card" style="margin-top:4px">
            ${fck("autoApply", L("Aplicar sozinha ao usar (sem clicar no chat)"))}
            ${fck("endIncap", L("Termina se ficar Incapacitado"))}
            <div class="st-row">${F(L("Imagem do token"), finp("tokenImg", L("vazio = não troca")))}<button type="button" data-act="pickTokenImg" data-fi="${fi}" style="flex:0 0 30px;margin-top:16px"><i class="fas fa-file-image"></i></button></div>
            ${F(L("Tamanho do token em quadrados (0 = não muda)"), finp("tokenSize", "0", "number"))}
            <div class="st-sub2"><i class="fas fa-wand-sparkles"></i> Visual da transformação</div>
            <div class="st-row"><div style="flex:0 0 60px"><label class="f">Brilho</label><input type="color" data-feat="fxLight" data-fi="${fi}" value="${esc(f.fxLight || "#e8c14a")}"></div>
              ${F(L("Raio do brilho (unid. da cena)"), finp("fxRadius", "6", "number"))}
              <button type="button" data-act="clearFxLight" data-fi="${fi}" style="flex:0 0 30px;margin-top:16px" data-tooltip="Sem brilho"><i class="fas fa-ban"></i></button></div>
            ${!f.fxLight ? L`<div class="st-muted">Sem brilho no token (escolha uma cor para ligar).</div>` : ""}
            <div class="st-row">${F(L("Som para todos"), finp("fxSound", L("vazio = sem som")))}<button type="button" data-act="pickFx" data-k="fxSound" data-fi="${fi}" style="flex:0 0 30px;margin-top:16px"><i class="fas fa-music"></i></button></div>
            <div class="st-row">${F(L("Arte no chat"), finp("fxArt", L("vazio = mensagem simples")))}<button type="button" data-act="pickFx" data-k="fxArt" data-fi="${fi}" style="flex:0 0 30px;margin-top:16px"><i class="fas fa-image"></i></button></div></div>` : ""}` : ""}
        ${f.kind !== "none" ? L`<div class="st-sub2"><i class="fas fa-battery-half"></i> Ultimate com barra de carga <small>(0 = desligado)</small></div>
          <div class="st-row">${F(L("Carga máxima"), finp("chargeMax", "0", "number"))}${Number(f.chargeMax) > 0 ? F(L("+ ao acertar"), finp("chargeHit", "1", "number")) + F(L("+ no crítico"), finp("chargeCrit", "0", "number")) + F(L("+ ao sofrer dano"), finp("chargeDamaged", "0", "number")) : ""}</div>
          ${Number(f.chargeMax) > 0 ? L`<div class="st-muted">Com carga, os “usos” acima são ignorados: a habilidade começa vazia e só é usada cheia.</div>` : ""}` : ""}
        <button type="button" class="st-danger" data-delfeat="${fi}" style="margin-top:8px"><i class="fas fa-trash"></i> Remover esta habilidade da ficha</button>`;
      return sec(`feat-${fi}`, f.kind === "attack" ? "fas fa-hand-fist" : f.kind === "save" ? "fas fa-shield-virus" : f.transform ? "fas fa-wand-magic-sparkles" : "fas fa-star",
        esc(featName(n, f, i)), "", body, FEAT_KINDS.find(k => k.value === f.kind)?.label.split(" ")[0] ?? "");
    };

    const grantItems = n.items.map((u, i) => {
      const it = fromUuidSync(u);
      return `<div class="st-item" data-open="${esc(u)}"><img src="${esc(it?.img ?? "icons/svg/hazard.svg")}"><span>${esc(it?.name ?? L("(não encontrado)"))}</span><a class="x" data-delitem="${i}">✕</a></div>`;
    }).join("");

    const extras = extraRes(t);
    const coins = coinsOn(t);
    const costBody = L`
        ${F(L("Pago com"), sel("costRes", [{ value: "", label: L`${t.resLabel} (padrão da Skill Tree)` }, { value: "mythic", label: L("✦ Pontos Míticos (Grandes Feitos)") }]))}
        <div class="st-row">${F(`${esc(LB.cost)} (${esc(payLabel(t, n))})`, inp("cost", "", "number", 'min="0"'))}${F(esc(LB.ranks), inp("ranks", "1", "number", 'min="1"'))}</div>
        ${Number(n.ranks) > 1 ? F(esc(LB.rankStep), inp("rankStep", "0", "number", 'min="0"')) : ""}
        ${extras.length || coins ? L`<div class="st-sub2"><i class="fas fa-coins"></i> ${esc(LB.extras)} <small>(opcional)</small></div>` : ""}
        ${extras.length ? `<div class="st-grid2">${extras.map(r => F(esc(r.name), `<input type="number" min="0" data-extra="${esc(r.id)}" value="${Number(n.extra?.[r.id]) || 0}">`)).join("")}</div>` : ""}
        ${coins ? `<div class="st-grid2">${F(esc(LB.gp), inp("costGp", "0", "number", 'min="0"'))}${F(esc(LB.pp), inp("costPp", "0", "number", 'min="0"'))}</div>` : ""}
        <div class="st-sub2"><i class="fas fa-box"></i> ${esc(LB.consume)}</div>
        ${itemList(n.consume, "consume", true)}
        <div class="st-drop" data-dropzone="consume"><i class="fas fa-hand-pointer"></i> Solte aqui itens gastos ao desbloquear (cristal, poção…)</div>`;

    return L`
      <div class="st-head st-head-edit">
        <img src="${esc(n.img)}" data-act="pickImg" style="cursor:pointer;border-color:${esc(n.color || "#c9a227")}" data-tooltip="Trocar imagem">
        <div style="flex:1"><label class="f">Nome da habilidade</label>${inp("name")}</div>
      </div>
      ${n.shared ? (() => { const cp = sharedCopies(this.trees, n.shared, n.id); return `<div class="st-card st-sharedcard"><div class="st-card-t"><i class="fas fa-link"></i> ${L("Compartilhada")}</div>
        <p class="st-help" style="margin:0 0 6px">${cp.length ? L`O que você mudar aqui muda também em: <b>${esc(cp.map(c => c.t.name).join(", "))}</b>.` : L("Ainda não tem cópia em outra árvore. Use Modelos → De outras árvores.")}</p>
        <button type="button" data-unshare><i class="fas fa-link-slash"></i> ${L("Desvincular desta árvore")}</button></div>`; })() : ""}
      ${sec("look", "fas fa-palette", L("Aparência"), "", L`
        <div class="st-row">${F(L("Formato"), sel("shape", SHAPES))}${F(L("Tamanho"), sel("size", SIZES, true))}<div style="flex:0 0 52px"><label class="f">Cor</label><input type="color" data-field="color" value="${esc(n.color || "#c9a227")}"></div></div>
        ${ck("secret", L("Secreta — jogadores veem ??? até cumprir os requisitos"))}`)}
      ${sec("cost", "fas fa-coins", L("Custo e níveis"), L`Pago em <b>${esc(t.resLabel)}</b>. Com mais de 1 nível, a habilidade pode ser comprada várias vezes — use <code>@rank</code> nos valores para crescer.`, costBody, Number(n.ranks) > 1 ? L`${n.ranks} níveis` : "")}
      ${sec("behav", "fas fa-sliders", L("Comportamento"), "", `
        ${ck("replaces", L("Evolução — ao desbloquear, substitui na ficha a habilidade anterior (volta se reembolsar)"))}
        ${ck("synergy", L("Sinergia — libera sozinha (grátis) quando todos os requisitos forem cumpridos"))}
        ${F(L("Treino: descansos longos até ficar pronta (0 = imediato)"), inp("trainDays", "0", "number", 'min="0"'))}`,
        [n.replaces ? L("evolução") : "", n.synergy ? "sinergia" : "", Number(n.trainDays) ? `${n.trainDays}d treino` : ""].filter(Boolean).join(" · "))}
      ${sec("req", "fas fa-lock", L("Requisitos"), L("O que o personagem precisa ter. O que ficar vazio não é exigido."), reqBody, nReq ? String(nReq) : "")}
      ${sec("desc", "fas fa-scroll", L("Descrição"), Number(n.ranks) > 1
        ? L("Uma descrição por nível. Ao subir de nível, a nova descrição <b>substitui</b> a anterior no painel e na ficha. Vazio = mantém a do nível anterior. Aceita @UUID[...] e @rank.")
        : L("Aparece para o jogador e na ficha. Aceita @UUID[...] e @rank."),
        Number(n.ranks) > 1
          ? L`<label class="f"><b>Nível 1</b> (base)</label><textarea data-field="desc">${esc(n.desc)}</textarea>`
            + Array.from({ length: Number(n.ranks) - 1 }, (_, i) => L`<label class="f"><b>Nível ${i + 2}</b></label><textarea data-rdesc="${i}" placeholder="vazio = mantém a descrição do nível ${i + 1}">${esc(n.rankDescs[i] ?? "")}</textarea>`).join("")
          : `<textarea data-field="desc">${esc(n.desc)}</textarea>`,
        Number(n.ranks) > 1 ? `${1 + n.rankDescs.slice(0, Number(n.ranks) - 1).filter(d => d?.trim()).length}/${n.ranks}` : "")}
      ${sec("feat", "fas fa-hand-fist", L("Habilidades na ficha"), L("Cada uma vira um talento na ficha com botão de uso: ataque, teste de resistência, transformação ou passiva."), L`
        ${n.features.map((f, i) => featCard(f, i)).join("") || L`<div class="st-muted">Nenhuma ainda.</div>`}
        <button type="button" data-act="addFeat"><i class="fas fa-plus"></i> Adicionar habilidade na ficha</button>`, n.features.length ? String(n.features.length) : "")}
      ${sec("grant", "fas fa-gift", L("Itens concedidos"), L("Itens copiados para a ficha ao desbloquear (e removidos ao reembolsar)."), L`
        ${grantItems}<div class="st-drop" data-dropzone="items"><i class="fas fa-hand-pointer"></i> Solte aqui itens, talentos ou magias</div>`, n.items.length ? String(n.items.length) : "")}
      ${sec("passive", "fas fa-shield-halved", L("Efeito permanente"), L("Bônus que ficam sempre ativos depois de desbloquear."), L`
        ${rows(n.changes, "p")}<button type="button" data-act="addChg"><i class="fas fa-plus"></i> Mudança</button>`, n.changes.length ? String(n.changes.length) : "")}
      <datalist id="st-keys">${KEY_HINTS.map(k => `<option value="${k}" label="${esc(changeLabel({ key: k, type: "", value: "" }).replace(/:\s*$/, ""))}">`).join("")}</datalist>
      <div class="st-btns">
        <div class="st-btn-row">
          <button type="button" data-act="dupNode"><i class="fas fa-clone"></i> Duplicar</button>
          <button type="button" data-act="saveTpl"><i class="fas fa-book-bookmark"></i> Salvar modelo</button>
        </div>
        <button type="button" class="st-danger" data-act="delNode"><i class="fas fa-trash"></i> Excluir habilidade</button>
      </div>`;
  }
}
