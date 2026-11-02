// ═══════════════════════════════════════════════════════════════════════════
//  Árvore da Mesa — editor de habilidade (painel lateral no modo Editar)
//  Métodos da janela ArvoreHabilidades (copiados para a classe em app.js)
// ═══════════════════════════════════════════════════════════════════════════

import { loc } from "./idioma.js";
import {
  ABILITIES, ACTIVATIONS, CHANGE_TYPES, DAMAGE_TYPES, DUR_UNITS, FEAT_KINDS, KEY_HINTS, RANK_FIELDS,
  RECOVERY, SHAPES, SIZES, coinsOn, esc, extraRes, featName, labelsOf, nodeById, opts, parentsOf,
  systemType
} from "./core.js";
import { featureRules, pickRank } from "./itens.js";
import { changeLabel, dateText, payLabel, sharedCopies } from "./regras.js";

export class MixEditor {
  editPanelHTML(t, n) {
    const typeOpts = v => {
      const cur = systemType(v);
      return CHANGE_TYPES.map(c => `<option value="${esc(c.value)}" ${cur === c.value ? "selected" : ""}>${esc(c.label)}</option>`).join("");
    };
    const RK = Math.max(1, Number(n.ranks) || 1);
    const rows = (list, LST) => list.map((c, i) => {
      const lv = r => pickRank(c.value, c.values, r);
      return `
      <div class="st-chg">
        <div class="st-row"><input list="st-keys" data-chg="${i}" data-list="${LST}" data-k="key" value="${esc(c.key)}" placeholder="${loc("ARVORE.Editor.oQueMudaExBonusNaCa")}"><a class="x" data-delchg="${i}" data-list="${LST}" data-tooltip="${loc("ARVORE.Comum.remover")}">✕</a></div>
        <div class="st-row"><select data-chg="${i}" data-list="${LST}" data-k="type">${typeOpts(c.type)}</select>
          <input data-chg="${i}" data-list="${LST}" data-k="value" value="${esc(c.value)}" placeholder="${RK > 1 ? loc("ARVORE.Editor.nivel1") : loc("ARVORE.Editor.valorOuRank")}" ${RK > 1 ? loc("ARVORE.Editor.dataTooltipValorNoNivel1") : ""}></div>
        ${RK > 1 ? `<div class="st-lvls">${Array.from({ length: RK - 1 }, (_, j) => `<label>${loc("ARVORE.Editor.nv")} ${j + 2}<input data-chgr="${i}" data-list="${LST}" data-r="${j}" value="${esc(c.values?.[j] ?? "")}" placeholder="${esc(lv(j + 1))}"></label>`).join("")}</div>` : ""}
        ${c.key ? `<div class="st-preview">→ ${RK > 1
          ? Array.from({ length: RK }, (_, j) => `${loc("ARVORE.Editor.nv2", { v: j + 1 })} ${esc(changeLabel({ ...c, value: String(lv(j + 1)).replace(/@rank/g, j + 1) }))}`).join(" · ")
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
      ${qty ? `<input class="qty" type="number" min="1" data-qty="${key}:${i}" value="${Number(it.qty) || 1}" data-tooltip="${loc("ARVORE.Comum.quantidade")}">` : ""}<a class="x" data-dellist="${key}:${i}">✕</a></div>`).join("");

    // requisitos
    const classOpts = cur => {
      const list = [...cat.classes];
      if (cur?.id && !list.some(c => c.id === cur.id)) list.unshift({ id: cur.id, name: cur.name });
      return `<option value="">${loc("ARVORE.Editor.escolha")}</option>` + list.map(c => `<option value="${esc(c.id)}" ${cur?.id === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("");
    };
    const classRows = n.reqClasses.map((c, i) => `<div class="st-row">
      <select data-rc="${i}" data-k="id" style="flex:2">${classOpts(c)}</select>
      <input type="number" min="0" data-rc="${i}" data-k="level" value="${Number(c.level) || ""}" placeholder="${loc("ARVORE.Editor.nivel")}" style="flex:0 0 64px" data-tooltip="${loc("ARVORE.Editor.nivelMinimoNaClasseVazioQualquer")}">
      <a class="x" data-delrc="${i}">✕</a></div>`).join("");
    const races = [...cat.races];
    if (n.reqRace && !races.some(r => r.name === n.reqRace)) races.unshift({ name: n.reqRace });
    const groups = [...new Set(t.nodes.map(x => x.group).filter(Boolean))].sort();
    const groupMates = n.group ? t.nodes.filter(x => x.group === n.group && x.id !== n.id).map(x => x.name) : [];
    const parents = parentsOf(t, n.id).map(p => `<div class="st-row"><span>← ${esc(nodeById(t, p)?.name)}</span><a class="x" data-unlink="${p}">✕</a></div>`).join("");
    const miles = new Set(); for (const tr of this.trees) for (const x of tr.nodes) if (x.milestone) miles.add(x.milestone);
    const nReq = [parentsOf(t, n.id).length, Number(n.minLevel), n.reqAbility && Number(n.reqScore), n.reqClasses.length, n.reqRace, n.reqItems.length, n.group, n.milestone, n.reqDate !== null && n.reqDate !== undefined].filter(Boolean).length;

    const reqBody = `
      <div class="st-sub2"><i class="fas fa-link"></i> ${loc("ARVORE.Editor.habilidadesAnteriores")}</div>
      ${parents || `<div class="st-muted">${loc("ARVORE.Editor.nenhumaUse")} <b>${loc("ARVORE.Comum.ligar")}</b> ${loc("ARVORE.Editor.ouShiftCliqueNoMapa")}</div>`}
      ${parents ? F(loc("ARVORE.Editor.precisaDe"), sel("prereq", [{ value: "all", label: loc("ARVORE.Editor.todasAsAnteriores") }, { value: "any", label: loc("ARVORE.Editor.qualquerUmaDelas") }])) : ""}
      <div class="st-sub2"><i class="fas fa-user-shield"></i> ${loc("ARVORE.Editor.personagem")}</div>
      <div class="st-row">${F(loc("ARVORE.Editor.nivelMinimo"), inp("minLevel", "0", "number", 'min="0"'))}${F(loc("ARVORE.Editor.atributoMinimo"), sel("reqAbility", [{ value: "", label: "—" }, ...ABILITIES]))}${n.reqAbility ? F(loc("ARVORE.Editor.valor"), inp("reqScore", "13", "number", 'min="0"')) : ""}</div>
      ${F(loc("ARVORE.Editor.raca"), `<select data-field="reqRace"><option value="">${loc("ARVORE.Editor.qualquerRaca")}</option>${races.map(r => `<option value="${esc(r.name)}" ${n.reqRace === r.name ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select>`)}
      <div class="st-sub2"><i class="fas fa-graduation-cap"></i> ${loc("ARVORE.Comum.classe")} <small>${loc("ARVORE.Editor.bastaTerUma")}</small></div>
      ${classRows || `<div class="st-muted">${loc("ARVORE.Editor.qualquerClasse")}</div>`}
      <button type="button" data-act="addReqClass"><i class="fas fa-plus"></i> ${loc("ARVORE.Editor.adicionarClasse")}</button>
      ${!cat.classes.length ? `<div class="st-muted">${loc("ARVORE.Editor.carregandoClassesDoFoundry")}</div>` : ""}
      <div class="st-sub2"><i class="fas fa-box-open"></i> ${loc("ARVORE.Editor.itensETalentosExigidos")} <small>${loc("ARVORE.Editor.precisaTerTodos")}</small></div>
      ${itemList(n.reqItems, "reqItems")}
      <div class="st-drop" data-dropzone="reqItems"><i class="fas fa-hand-pointer"></i> ${loc("ARVORE.Editor.solteAquiUmItemOuTalentoQueO")}</div>
      <div class="st-sub2"><i class="fas fa-diagram-project"></i> ${loc("ARVORE.Editor.comboComOutrasArvores")} <small>${loc("ARVORE.Editor.precisaTerTodas")}</small></div>
      ${n.reqNodes.map((rn, i) => { const rt = this.trees.find(x => x.id === rn.tree), rnode = nodeById(rt, rn.node); return `<div class="st-row"><span style="flex:2">🔗 ${esc(rnode?.name ?? rn.name ?? "?")} <small style="opacity:.6">(${esc(rt?.name ?? loc("ARVORE.Editor.arvoreApagada"))})</small></span><input type="number" min="1" data-rnrank="${i}" value="${Number(rn.rank) || 1}" style="flex:0 0 50px" data-tooltip="${loc("ARVORE.Editor.nivelMinimo")}"><a class="x" data-delrn="${i}">✕</a></div>`; }).join("")}
      <select data-addrn><option value="">${loc("ARVORE.Editor.exigirHabilidadeDeOutraArvore")}</option>${this.trees.filter(x => x.id !== t.id).map(x => `<optgroup label="${esc(x.name)}">${x.nodes.map(y => `<option value="${esc(x.id)}:${y.id}">${esc(y.name)}</option>`).join("")}</optgroup>`).join("")}</select>
      <p class="st-help">${loc("ARVORE.Editor.useCom")} <b>${loc("ARVORE.Comum.sinergia")}</b> ${loc("ARVORE.Editor.emComportamentoParaCriarCombos")}</p>
      <div class="st-sub2"><i class="fas fa-trophy"></i> ${loc("ARVORE.Editor.marcoDaCampanha")}</div>
      <input data-field="milestone" list="st-miles" value="${esc(n.milestone)}" placeholder="${loc("ARVORE.Editor.exDerrotouUmInimigoLendarioVazio")}">
      <datalist id="st-miles">${[...miles].map(m => `<option value="${esc(m)}">`).join("")}</datalist>
      <div class="st-sub2"><i class="fas fa-calendar-day"></i> ${loc("ARVORE.Comum.dataDoCalendario")}</div>
      ${n.reqDate === null || n.reqDate === undefined
        ? `<button type="button" data-reqdate="on"><i class="fas fa-plus"></i> ${loc("ARVORE.Editor.soLiberarAPartirDeUmaData")}</button>`
        : `<div class="st-row"><span>${loc("ARVORE.Editor.aPartirDe")} <b>${esc(dateText(n.reqDate))}</b></span><a class="x" data-reqdate="off" data-tooltip="${loc("ARVORE.Comum.remover")}">✕</a></div>
           <button type="button" data-reqdate="on"><i class="fas fa-calendar-day"></i> ${loc("ARVORE.Editor.trocarAData")}</button>`}
      <p class="st-help">${loc("ARVORE.Editor.voceMarcaOsMarcosDeCadaPersonagem")}</p>
      <div class="st-sub2"><i class="fas fa-code-branch"></i> ${loc("ARVORE.Editor.escolhaExclusiva")}</div>
      <p class="st-help">${loc("ARVORE.Editor.habilidadesNoMesmoGrupoSao")} <b>${loc("ARVORE.Editor.caminhosAlternativos")}</b>${loc("ARVORE.Editor.aoEscolherUmaAsOutrasDoGrupo")}</p>
      <select data-group><option value="">${loc("ARVORE.Editor.naoEExclusiva")}</option>${groups.map(g => `<option value="${esc(g)}" ${n.group === g ? "selected" : ""}>${esc(g)}</option>`).join("")}<option value="@new">${loc("ARVORE.Editor.novoGrupo")}</option></select>
      ${groupMates.length ? `<div class="st-muted">${loc("ARVORE.Editor.concorreCom")} ${esc(groupMates.join(", "))}</div>` : n.group ? `<div class="st-muted">${loc("ARVORE.Editor.aindaSozinhaNesteGrupoColoque")}</div>` : ""}`;

    // várias habilidades na ficha
    const featCard = (f, i) => {
      const fi = i;
      const finp = (k, ph = "", type = "text") => `<input type="${type}" data-feat="${k}" data-fi="${fi}" value="${esc(f[k])}" placeholder="${esc(ph)}">`;
      const fsel = (k, list) => `<select data-feat="${k}" data-fi="${fi}">${opts(list, f[k])}</select>`;
      const fck = (k, label) => `<label class="ck"><input type="checkbox" data-feat="${k}" data-fi="${fi}" ${f[k] ? "checked" : ""}> ${label}</label>`;
      const body = `
        <div class="st-row">${F(loc("ARVORE.Editor.nomeNaFicha"), finp("name", featName(n, f, i)))}<button type="button" data-act="pickFeatImg" data-fi="${fi}" style="flex:0 0 34px;margin-top:16px;padding:0" data-tooltip="${loc("ARVORE.Editor.imagemPropria")}"><img src="${esc(f.img || n.img)}" style="width:24px;height:24px;border:none"></button></div>
        ${F(loc("ARVORE.Comum.tipo"), fsel("kind", FEAT_KINDS))}
        <div class="st-row">
          ${f.kind !== "none" ? F(loc("ARVORE.Editor.ativacao"), fsel("activation", ACTIVATIONS)) : ""}
          ${F(loc("ARVORE.Editor.usos0Ilimitado"), finp("uses", "0", "number"))}
        </div>
        ${f.uses ? F(loc("ARVORE.Editor.recuperaEm"), fsel("recovery", RECOVERY)) : ""}
        ${f.kind !== "none" ? `<div class="st-row">${F(loc("ARVORE.Comum.duracao"), finp("durValue", loc("ARVORE.Editor.vazioInstantanea")))}${F("&nbsp;", fsel("durUnits", DUR_UNITS))}</div>
          <div class="st-row">${F(loc("ARVORE.Comum.alcance"), finp("range", f.kind === "utility" ? loc("ARVORE.Editor.vazioPessoal") : "1,5"))}
            ${F("&nbsp;", fsel("rangeUnits", [{ value: "ft", label: loc("ARVORE.Editor.pesUnid") }, { value: "m", label: "metros" }, { value: "touch", label: "toque" }, { value: "self", label: "pessoal" }]))}</div>` : ""}
        ${f.kind === "attack" ? `
          <div class="st-row">${F(loc("ARVORE.Comum.ataque"), fsel("attackType", [{ value: "melee", label: loc("ARVORE.Editor.corpoACorpo") }, { value: "ranged", label: loc("ARVORE.Editor.aDistancia") }]))}
            ${F(loc("ARVORE.Editor.natureza"), fsel("classification", [{ value: "weapon", label: loc("ARVORE.Editor.arma") }, { value: "spell", label: loc("ARVORE.Editor.magia") }, { value: "unarmed", label: loc("ARVORE.Editor.desarmado") }]))}</div>
          <div class="st-row">${F(loc("ARVORE.Editor.atributo"), fsel("ability", [{ value: "", label: loc("ARVORE.Editor.padrao") }, ...ABILITIES, { value: "spellcasting", label: loc("ARVORE.Editor.conjuracao") }]))}
            ${F(loc("ARVORE.Comum.bonusDeAcerto"), finp("toHit", loc("ARVORE.Editor.ex2OuRank")))}</div>` : ""}
        ${f.kind === "save" ? `
          <div class="st-row">${F(loc("ARVORE.Editor.resistenciaDe"), fsel("saveAbility", ABILITIES))}${F(loc("ARVORE.Editor.cdFixa"), finp("saveDC", loc("ARVORE.Editor.vazioCdDeMagia")))}</div>
          ${F(loc("ARVORE.Editor.sePassar"), fsel("onSave", [{ value: "half", label: loc("ARVORE.Editor.metadeDoDano") }, { value: "none", label: loc("ARVORE.Editor.nenhumDano") }, { value: "full", label: loc("ARVORE.Editor.danoTotal") }]))}` : ""}
        ${["attack", "save"].includes(f.kind) ? `<div class="st-row">${F(loc("ARVORE.Editor.dano"), finp("formula", "2d8 + @mod"))}${F(loc("ARVORE.Comum.tipo"), fsel("damageType", [{ value: "", label: "—" }, ...DAMAGE_TYPES]))}</div>` : ""}
        ${f.kind === "heal" ? `<div class="st-row">${F(loc("ARVORE.Comum.cura"), finp("formula", "2d8 + @abilities.wis.mod"))}${F(loc("ARVORE.Comum.tipo"), fsel("healType", [{ value: "healing", label: loc("ARVORE.Editor.curaPv") }, { value: "temphp", label: loc("ARVORE.Comum.pvTemporarios") }]))}</div>` : ""}
        ${["save", "heal"].includes(f.kind) ? F(loc("ARVORE.Editor.numeroDeAlvos"), finp("targets", "1", "number")) : ""}
        ${F(loc("ARVORE.Editor.regraExtraApareceNaFichaClara"), `<textarea data-feat="note" data-fi="${fi}" style="min-height:40px" placeholder="${loc("ARVORE.Editor.exAliadosA3MTambemRecebemOBonus")}">${esc(f.note)}</textarea>`)}
        <div class="st-preview" style="white-space:pre-line">${esc(featureRules(f))}</div>
        ${F(i === 0 ? loc("ARVORE.Editor.descricaoNaFichaVazioDescricao") : loc("ARVORE.Editor.descricaoNaFicha"), `<textarea data-feat="desc" data-fi="${fi}" style="min-height:50px">${esc(f.desc)}</textarea>`)}
        ${RK > 1 ? (() => {
          const fields = RANK_FIELDS.filter(rf => rf.kinds.includes(f.kind) && (!rf.transform || f.transform));
          const blocks = Array.from({ length: RK - 1 }, (_, j) => {
            const r = j + 2;
            return `<div class="st-lvlbox"><div class="st-sub2" style="margin-top:4px"><i class="fas fa-layer-group"></i> ${loc("ARVORE.Comum.nivel2")} ${r} <small>${loc("ARVORE.Editor.vazioIgualAoNivel", { v: r - 1 })}</small></div>
              ${fields.map(rf => {
                const ph = esc(String(pickRank(f[rf.k], f.byRank?.[rf.k], r - 1) ?? ""));
                const val = esc(f.byRank?.[rf.k]?.[j] ?? "");
                return rf.area
                  ? `<label class="f">${rf.label}</label><textarea data-fr="${rf.k}" data-fi="${fi}" data-r="${j}" style="min-height:44px" placeholder="${ph ? loc("ARVORE.Editor.igualAoNivelAnterior") : ""}">${val}</textarea>`
                  : `<div class="st-row"><label class="f" style="flex:0 0 110px">${rf.label}</label><input data-fr="${rf.k}" data-fi="${fi}" data-r="${j}" value="${val}" placeholder="${ph}"></div>`;
              }).join("")}</div>`;
          }).join("");
          return sec(`featrk-${fi}`, "fas fa-layer-group", loc("ARVORE.Editor.porNivel"), loc("ARVORE.Editor.oQueMudaNestaHabilidadeDaFicha"), blocks);
        })() : ""}
        ${f.kind !== "none" ? `<div class="st-sub2"><i class="fas fa-bolt"></i> ${loc("ARVORE.Editor.efeitoAoUsarTemporario")}</div>
          ${rows(f.changes, `f${fi}`)}
          <button type="button" data-act="addFChg" data-fi="${fi}"><i class="fas fa-plus"></i> ${loc("ARVORE.Editor.mudancaAoUsar")}</button>
          ${fck("transform", loc("ARVORE.Editor.eUmaTransformacaoTrocaOToken"))}
          ${f.transform ? `<div class="st-card" style="margin-top:4px">
            ${fck("autoApply", loc("ARVORE.Editor.aplicarSozinhaAoUsarSemClicar"))}
            ${fck("endIncap", loc("ARVORE.Editor.terminaSeFicarIncapacitado"))}
            <div class="st-row">${F(loc("ARVORE.Editor.imagemDoToken"), finp("tokenImg", loc("ARVORE.Editor.vazioNaoTroca")))}<button type="button" data-act="pickTokenImg" data-fi="${fi}" style="flex:0 0 30px;margin-top:16px"><i class="fas fa-file-image"></i></button></div>
            ${F(loc("ARVORE.Editor.tamanhoDoTokenEmQuadrados0Nao"), finp("tokenSize", "0", "number"))}
            <div class="st-sub2"><i class="fas fa-wand-sparkles"></i> ${loc("ARVORE.Editor.visualDaTransformacao")}</div>
            <div class="st-row"><div style="flex:0 0 60px"><label class="f">${loc("ARVORE.Editor.brilho")}</label><input type="color" data-feat="fxLight" data-fi="${fi}" value="${esc(f.fxLight || "#e8c14a")}"></div>
              ${F(loc("ARVORE.Editor.raioDoBrilhoUnidDaCena"), finp("fxRadius", "6", "number"))}
              <button type="button" data-act="clearFxLight" data-fi="${fi}" style="flex:0 0 30px;margin-top:16px" data-tooltip="${loc("ARVORE.Editor.semBrilho")}"><i class="fas fa-ban"></i></button></div>
            ${!f.fxLight ? `<div class="st-muted">${loc("ARVORE.Editor.semBrilhoNoTokenEscolhaUmaCor")}</div>` : ""}
            <div class="st-row">${F(loc("ARVORE.Editor.somParaTodos"), finp("fxSound", loc("ARVORE.Editor.vazioSemSom")))}<button type="button" data-act="pickFx" data-k="fxSound" data-fi="${fi}" style="flex:0 0 30px;margin-top:16px"><i class="fas fa-music"></i></button></div>
            <div class="st-row">${F(loc("ARVORE.Editor.arteNoChat"), finp("fxArt", loc("ARVORE.Editor.vazioMensagemSimples")))}<button type="button" data-act="pickFx" data-k="fxArt" data-fi="${fi}" style="flex:0 0 30px;margin-top:16px"><i class="fas fa-image"></i></button></div></div>` : ""}` : ""}
        ${f.kind !== "none" ? `<div class="st-sub2"><i class="fas fa-battery-half"></i> ${loc("ARVORE.Editor.ultimateComBarraDeCarga")} <small>${loc("ARVORE.Editor.n0Desligado")}</small></div>
          <div class="st-row">${F(loc("ARVORE.Editor.cargaMaxima"), finp("chargeMax", "0", "number"))}${Number(f.chargeMax) > 0 ? F(loc("ARVORE.Editor.aoAcertar"), finp("chargeHit", "1", "number")) + F(loc("ARVORE.Editor.noCritico"), finp("chargeCrit", "0", "number")) + F(loc("ARVORE.Editor.aoSofrerDano"), finp("chargeDamaged", "0", "number")) : ""}</div>
          ${Number(f.chargeMax) > 0 ? `<div class="st-muted">${loc("ARVORE.Editor.comCargaOsUsosAcimaSaoIgnorados")}</div>` : ""}` : ""}
        <button type="button" class="st-danger" data-delfeat="${fi}" style="margin-top:8px"><i class="fas fa-trash"></i> ${loc("ARVORE.Editor.removerEstaHabilidadeDaFicha")}</button>`;
      return sec(`feat-${fi}`, f.kind === "attack" ? "fas fa-hand-fist" : f.kind === "save" ? "fas fa-shield-virus" : f.transform ? "fas fa-wand-magic-sparkles" : "fas fa-star",
        esc(featName(n, f, i)), "", body, FEAT_KINDS.find(k => k.value === f.kind)?.label.split(" ")[0] ?? "");
    };

    const grantItems = n.items.map((u, i) => {
      const it = fromUuidSync(u);
      return `<div class="st-item" data-open="${esc(u)}"><img src="${esc(it?.img ?? "icons/svg/hazard.svg")}"><span>${esc(it?.name ?? loc("ARVORE.Comum.naoEncontrado"))}</span><a class="x" data-delitem="${i}">✕</a></div>`;
    }).join("");

    const extras = extraRes(t);
    const coins = coinsOn(t);
    const costBody = `
        ${F(loc("ARVORE.Editor.pagoCom"), sel("costRes", [{ value: "", label: `${t.resLabel} ${loc("ARVORE.Editor.padraoDaSkillTree")}` }, { value: "mythic", label: loc("ARVORE.Editor.pontosMiticosGrandesFeitos") }]))}
        <div class="st-row">${F(`${esc(LB.cost)} (${esc(payLabel(t, n))})`, inp("cost", "", "number", 'min="0"'))}${F(esc(LB.ranks), inp("ranks", "1", "number", 'min="1"'))}</div>
        ${Number(n.ranks) > 1 ? F(esc(LB.rankStep), inp("rankStep", "0", "number", 'min="0"')) : ""}
        ${extras.length || coins ? `<div class="st-sub2"><i class="fas fa-coins"></i> ${esc(LB.extras)} <small>${loc("ARVORE.Editor.opcional")}</small></div>` : ""}
        ${extras.length ? `<div class="st-grid2">${extras.map(r => F(esc(r.name), `<input type="number" min="0" data-extra="${esc(r.id)}" value="${Number(n.extra?.[r.id]) || 0}">`)).join("")}</div>` : ""}
        ${coins ? `<div class="st-grid2">${F(esc(LB.gp), inp("costGp", "0", "number", 'min="0"'))}${F(esc(LB.pp), inp("costPp", "0", "number", 'min="0"'))}</div>` : ""}
        <div class="st-sub2"><i class="fas fa-box"></i> ${esc(LB.consume)}</div>
        ${itemList(n.consume, "consume", true)}
        <div class="st-drop" data-dropzone="consume"><i class="fas fa-hand-pointer"></i> ${loc("ARVORE.Editor.solteAquiItensGastosAoDesbloquear")}</div>`;

    return `
      <div class="st-head st-head-edit">
        <img src="${esc(n.img)}" data-act="pickImg" style="cursor:pointer;border-color:${esc(n.color || "#c9a227")}" data-tooltip="${loc("ARVORE.Editor.trocarImagem")}">
        <div style="flex:1"><label class="f">${loc("ARVORE.Editor.nomeDaHabilidade")}</label>${inp("name")}</div>
      </div>
      ${n.shared ? (() => { const cp = sharedCopies(this.trees, n.shared, n.id); return `<div class="st-card st-sharedcard"><div class="st-card-t"><i class="fas fa-link"></i> ${loc("ARVORE.Comum.compartilhada")}</div>
        <p class="st-help" style="margin:0 0 6px">${cp.length ? `${loc("ARVORE.Editor.oQueVoceMudarAquiMudaTambemEm")} <b>${esc(cp.map(c => c.t.name).join(", "))}</b>.` : loc("ARVORE.Editor.aindaNaoTemCopiaEmOutraArvore")}</p>
        <button type="button" data-unshare><i class="fas fa-link-slash"></i> ${loc("ARVORE.Editor.desvincularDestaArvore")}</button></div>`; })() : ""}
      ${sec("look", "fas fa-palette", loc("ARVORE.Editor.aparencia"), "", `
        <div class="st-row">${F(loc("ARVORE.Editor.formato"), sel("shape", SHAPES))}${F(loc("ARVORE.Comum.tamanho"), sel("size", SIZES, true))}<div style="flex:0 0 52px"><label class="f">${loc("ARVORE.Comum.cor")}</label><input type="color" data-field="color" value="${esc(n.color || "#c9a227")}"></div></div>
        ${ck("secret", loc("ARVORE.Editor.secretaJogadoresVeemAteCumprir"))}`)}
      ${sec("cost", "fas fa-coins", loc("ARVORE.Editor.custoENiveis"), `${loc("ARVORE.Editor.pagoEm")} <b>${esc(t.resLabel)}</b>${loc("ARVORE.Editor.comMaisDe1NivelAHabilidadePode")} <code>${loc("ARVORE.Comum.rank")}</code> ${loc("ARVORE.Editor.nosValoresParaCrescer")}`, costBody, Number(n.ranks) > 1 ? `${n.ranks} ${loc("ARVORE.Editor.niveis")}` : "")}
      ${sec("behav", "fas fa-sliders", loc("ARVORE.Editor.comportamento"), "", `
        ${ck("replaces", loc("ARVORE.Editor.evolucaoAoDesbloquearSubstitui"))}
        ${ck("synergy", loc("ARVORE.Editor.sinergiaLiberaSozinhaGratisQuando"))}
        ${F(loc("ARVORE.Editor.treinoDescansosLongosAteFicar"), inp("trainDays", "0", "number", 'min="0"'))}`,
        [n.replaces ? loc("ARVORE.Editor.evolucao") : "", n.synergy ? "sinergia" : "", Number(n.trainDays) ? `${n.trainDays}d treino` : ""].filter(Boolean).join(" · "))}
      ${sec("req", "fas fa-lock", loc("ARVORE.Comum.requisitos"), loc("ARVORE.Editor.oQueOPersonagemPrecisaTerOQue"), reqBody, nReq ? String(nReq) : "")}
      ${sec("desc", "fas fa-scroll", loc("ARVORE.Comum.descricao"), Number(n.ranks) > 1
        ? `${loc("ARVORE.Editor.umaDescricaoPorNivelAoSubirDe")} <b>${loc("ARVORE.Comum.substitui")}</b> ${loc("ARVORE.Editor.aAnteriorNoPainelENaFichaVazio")}`
        : loc("ARVORE.Editor.apareceParaOJogadorENaFichaAceita"),
        Number(n.ranks) > 1
          ? `<label class="f"><b>${loc("ARVORE.Editor.nivel12")}</b> ${loc("ARVORE.Editor.base")}</label><textarea data-field="desc">${esc(n.desc)}</textarea>`
            + Array.from({ length: Number(n.ranks) - 1 }, (_, i) => `<label class="f"><b>${loc("ARVORE.Comum.nivel2")} ${i + 2}</b></label><textarea data-rdesc="${i}" placeholder="${loc("ARVORE.Editor.vazioMantemADescricaoDoNivel")} ${i + 1}">${esc(n.rankDescs[i] ?? "")}</textarea>`).join("")
          : `<textarea data-field="desc">${esc(n.desc)}</textarea>`,
        Number(n.ranks) > 1 ? `${1 + n.rankDescs.slice(0, Number(n.ranks) - 1).filter(d => d?.trim()).length}/${n.ranks}` : "")}
      ${sec("feat", "fas fa-hand-fist", loc("ARVORE.Editor.habilidadesNaFicha"), loc("ARVORE.Editor.cadaUmaViraUmTalentoNaFichaCom"), `
        ${n.features.map((f, i) => featCard(f, i)).join("") || `<div class="st-muted">${loc("ARVORE.Editor.nenhumaAinda")}</div>`}
        <button type="button" data-act="addFeat"><i class="fas fa-plus"></i> ${loc("ARVORE.Editor.adicionarHabilidadeNaFicha")}</button>`, n.features.length ? String(n.features.length) : "")}
      ${sec("grant", "fas fa-gift", loc("ARVORE.Editor.itensConcedidos"), loc("ARVORE.Editor.itensCopiadosParaAFichaAoDesbloquear"), `
        ${grantItems}<div class="st-drop" data-dropzone="items"><i class="fas fa-hand-pointer"></i> ${loc("ARVORE.Editor.solteAquiItensTalentosOuMagias")}</div>`, n.items.length ? String(n.items.length) : "")}
      ${sec("passive", "fas fa-shield-halved", loc("ARVORE.Editor.efeitoPermanente"), loc("ARVORE.Editor.bonusQueFicamSempreAtivosDepois"), `
        ${rows(n.changes, "p")}<button type="button" data-act="addChg"><i class="fas fa-plus"></i> ${loc("ARVORE.Editor.mudanca")}</button>`, n.changes.length ? String(n.changes.length) : "")}
      <datalist id="st-keys">${KEY_HINTS.map(k => `<option value="${k}" label="${esc(changeLabel({ key: k, type: "", value: "" }).replace(/:\s*$/, ""))}">`).join("")}</datalist>
      <div class="st-btns">
        <div class="st-btn-row">
          <button type="button" data-act="dupNode"><i class="fas fa-clone"></i> ${loc("ARVORE.Editor.duplicar")}</button>
          <button type="button" data-act="saveTpl"><i class="fas fa-book-bookmark"></i> ${loc("ARVORE.Editor.salvarModelo")}</button>
        </div>
        <button type="button" class="st-danger" data-act="delNode"><i class="fas fa-trash"></i> ${loc("ARVORE.Comum.excluirHabilidade")}</button>
      </div>`;
  }
}
