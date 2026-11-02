// ═══════════════════════════════════════════════════════════════════════════
//  Árvore da Mesa — documentos na ficha: talentos, efeitos e itens que cada habilidade concede
// ═══════════════════════════════════════════════════════════════════════════

import { loc } from "./idioma.js";
import {
  ABILITIES, ACTIVATIONS, DAMAGE_TYPES, DUR_SECONDS, DUR_UNITS, RANK_FIELDS, RECOVERY, SCOPE, clone,
  esc, featName, migrateKey, systemType
} from "./core.js";
import { changeLabel } from "./regras.js";

// ───────────────────────── geração de documentos ─────────────────────────
export function effectData(base, changes) {
  const eff = { ...base };
  const list = changes.filter(c => c.key);
  eff.system = { ...eff.system, changes: list.map(c => ({ key: migrateKey(c.key), type: systemType(c.type), value: String(c.value) })) };
  return eff;
}
export const descToHTML = s => String(s ?? "").split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");

// Descrição do nível: usa a do nível atual; se estiver vazia, a do nível anterior mais próximo
export function descForRank(n, rank) {
  for (let r = rank; r >= 2; r--) { const d = n.rankDescs?.[r - 2]; if (d && String(d).trim()) return d; }
  return n.desc;
}
// valor do nível: o do nível atual; se vazio, o do nível anterior mais próximo; nível 1 = valor base
export const pickRank = (base, list, rank) => {
  for (let r = rank; r >= 2; r--) { const v = list?.[r - 2]; if (v !== undefined && v !== null && String(v).trim() !== "") return v; }
  return base;
};

export function withRank(n, rank) {
  const nn = clone(n);
  const sub = v => typeof v === "string" ? v.replace(/@rank/g, String(rank)) : v;
  const chg = c => ({ ...c, value: sub(pickRank(c.value, c.values, rank)) });
  nn.changes = nn.changes.map(chg);
  nn.features = nn.features.map(f => {
    const ff = { ...f, changes: f.changes.map(chg) };
    for (const { k } of RANK_FIELDS) ff[k] = pickRank(f[k], f.byRank?.[k], rank);
    for (const k of ["formula", "toHit", "desc", "saveDC", "durValue", "range"]) ff[k] = sub(ff[k]);
    if (typeof ff.uses === "string") ff.uses = Number(sub(ff.uses)) || 0;
    ff.tokenSize = Number(ff.tokenSize) || 0;
    return ff;
  });
  nn.desc = sub(descForRank(n, rank));
  return nn;
}

export function buildFeatureItem(n, f, fi, t, rank, max) {
  const rid = () => foundry.utils.randomID(16);
  const actId = rid(), effId = rid();
  const temp = f.changes.filter(c => c.key);
  const seconds = f.durValue ? (Number(f.durValue) || 0) * (DUR_SECONDS[f.durUnits] ?? 60) : 0;
  const name = featName(n, f, fi);
  const stFlags = {
    tree: t.id, node: n.id, fi, generated: true, name, kind: f.kind,
    transform: !!f.transform, autoApply: f.autoApply !== false, tokenImg: f.tokenImg || "",
    fxLight: f.fxLight || "", fxRadius: Number(f.fxRadius) || 6, fxSound: f.fxSound || "", fxArt: f.fxArt || "",
    charge: Number(f.chargeMax) > 0 ? { max: Number(f.chargeMax), hit: Number(f.chargeHit) || 0, crit: Number(f.chargeCrit) || 0, dmg: Number(f.chargeDamaged) || 0 } : null,
    tokenSize: Number(f.tokenSize) || 0, endIncap: f.endIncap !== false, seconds
  };
  const effects = temp.length ? [effectData({
    _id: effId, name, img: f.img || n.img || "icons/svg/aura.svg", transfer: false, disabled: false,
    description: loc("ARVORE.Regras.efeitoAoUsar", { name }), flags: { [SCOPE]: { skillTree: stFlags } }
  }, temp)] : [];
  const system = {
    description: { value: descToHTML([f.desc || (fi === 0 ? n.desc : ""), `${loc("ARVORE.Regras.emJogo")}
${featureRules(f)}`].filter(Boolean).join("\n\n")) },
    uses: Number(f.chargeMax) > 0 ? { max: String(f.chargeMax), spent: Number(f.chargeMax), recovery: [] }
      : f.uses ? { max: String(f.uses), spent: 0, recovery: f.recovery ? [{ period: f.recovery, type: "recoverAll" }] : [] }
      : { max: "", spent: 0, recovery: [] },
    activities: {}
  };
  if (f.kind !== "none") {
    const act = {
      _id: actId, type: f.kind,
      activation: { type: f.activation || "", value: ["action", "bonus", "reaction"].includes(f.activation) ? 1 : null, condition: "" },
      consumption: { targets: Number(f.chargeMax) > 0 ? [{ type: "itemUses", target: "", value: String(f.chargeMax) }] : f.uses ? [{ type: "itemUses", target: "", value: "1" }] : [], scaling: { allowed: false } },
      duration: f.durValue ? { value: String(f.durValue), units: f.durUnits, concentration: false } : { units: "inst" },
      range: f.range ? { value: String(f.range), units: f.rangeUnits || "ft" } : { units: f.kind === "utility" ? "self" : "" },
      target: { affects: (f.kind === "utility" || (f.kind === "heal" && f.range === "" && f.rangeUnits === "self")) ? { type: "self" } : { type: "creature", count: String(Number(f.targets) || 1) } },
      effects: temp.length ? [{ _id: effId }] : []
    };
    const parts = f.formula ? [{ custom: { enabled: true, formula: f.formula }, types: f.damageType ? [f.damageType] : [] }] : [];
    if (f.kind === "attack") {
      act.attack = { ability: f.ability || "", bonus: f.toHit || "", flat: false, type: { value: f.attackType, classification: f.classification } };
      act.damage = { includeBase: false, parts };
    } else if (f.kind === "heal") {
      act.healing = { custom: { enabled: true, formula: f.formula || "1d8" }, types: [f.healType || "healing"] };
    } else if (f.kind === "save") {
      act.save = { ability: [f.saveAbility || "con"], dc: { calculation: f.saveDC ? "" : "spellcasting", formula: f.saveDC || "" } };
      act.damage = { onSave: f.onSave || "half", parts };
    }
    system.activities[actId] = act;
  }
  return {
    name: max > 1 ? `${name} (${rank}/${max})` : name, type: "feat", img: f.img || n.img || "icons/svg/book.svg", system, effects,
    flags: { [SCOPE]: { skillTree: stFlags } }
  };
}

export function featureSummary(f) {
  if (!f) return "";
  const p = [];
  const act = ACTIVATIONS.find(x => x.value === f.activation)?.label;
  if (f.kind !== "none" && act && f.activation) p.push(act);
  if (f.kind === "none") p.push(loc("ARVORE.Regras.passiva"));
  if (Number(f.chargeMax) > 0) p.push(`${loc("ARVORE.Regras.carga")} ${f.chargeMax}`);
  else if (f.uses) p.push(`${f.uses}× ${f.recovery ? `${loc("ARVORE.Comum.por")} ` + RECOVERY.find(x => x.value === f.recovery)?.label : loc("ARVORE.Regras.naoRecupera2")}`);
  if (f.durValue) p.push(`${f.durValue} ${DUR_UNITS.find(x => x.value === f.durUnits)?.label ?? f.durUnits}`);
  if (f.kind === "attack") p.push(`${loc("ARVORE.Comum.ataque")} ${f.attackType === "ranged" ? loc("ARVORE.Regras.aDistancia") : loc("ARVORE.Regras.corpoACorpo")}${f.toHit ? ` (+${f.toHit})` : ""}`);
  if (f.kind === "save") p.push(`${loc("ARVORE.Regras.trDe")} ${ABILITIES.find(a => a.value === f.saveAbility)?.label ?? f.saveAbility}${f.saveDC ? ` CD ${f.saveDC}` : ` ${loc("ARVORE.Regras.cdDeMagia2")}`}`);
  if (f.kind === "heal") p.push(f.healType === "temphp" ? `${f.formula} ${loc("ARVORE.Comum.pvTemporarios")}` : `${loc("ARVORE.Comum.cura")} ${f.formula}`);
  else if (f.formula) p.push(`${f.formula} ${DAMAGE_TYPES.find(d => d.value === f.damageType)?.label ?? ""}`.trim());
  if (f.transform) p.push(loc("ARVORE.Regras.transformacao"));
  return p.join(" · ");
}

// Texto de regras sem ambiguidade, gerado a partir da habilidade
export const abLabel = k => ABILITIES.find(a => a.value === k)?.label ?? k;
export const unitLabel = u => ({ ft: loc("ARVORE.Regras.pes"), m: "m", touch: loc("ARVORE.Regras.toque"), self: loc("ARVORE.Regras.pessoal") })[u] ?? u;
export function dcText(f) {
  const m = String(f.saveDC ?? "").match(/@abilities\.(\w+)\.mod/);
  if (m) return `${loc("ARVORE.Regras.cd8ProficienciaModDe")} ${abLabel(m[1])}`;
  return f.saveDC ? `CD ${f.saveDC}` : loc("ARVORE.Regras.cdDeMagia");
}
export function featureRules(f, extra = "") {
  const OUT = [];
  const act = f.kind === "none" ? loc("ARVORE.Regras.passiva") : (ACTIVATIONS.find(x => x.value === f.activation)?.label || loc("ARVORE.Regras.semAcao"));
  const usos = f.kind === "none" ? "" : f.uses ? `${f.uses} ${loc("ARVORE.Regras.usoSPor")} ${RECOVERY.find(x => x.value === f.recovery)?.label ?? loc("ARVORE.Regras.descanso")}` : loc("ARVORE.Regras.aVontade");
  const alc = f.range ? `${loc("ARVORE.Regras.alcance")} ${f.range} ${unitLabel(f.rangeUnits)}` : (f.rangeUnits === "touch" ? loc("ARVORE.Regras.toque") : "");
  const dur = f.durValue ? `${loc("ARVORE.Regras.dura")} ${f.durValue} ${DUR_UNITS.find(x => x.value === f.durUnits)?.label ?? ""}` : "";
  OUT.push([act, usos, alc, dur].filter(Boolean).join(" · ") + ".");
  const dano = (fm, tp) => `${fm} ${loc("ARVORE.Regras.deDano")} ${(DAMAGE_TYPES.find(d => d.value === tp)?.label ?? tp ?? "").toLowerCase()}`.trim();
  if (f.kind === "attack") OUT.push(loc("ARVORE.Regras.facaUmAtaqueSeAcertar", { v: f.attackType === "ranged" ? loc("ARVORE.Regras.aDistancia") : loc("ARVORE.Regras.corpoACorpo"), v2: f.classification === "spell" ? loc("ARVORE.Regras.magico") : f.classification === "unarmed" ? loc("ARVORE.Regras.desarmado") : loc("ARVORE.Regras.comArma"), v3: f.ability ? ` ${loc("ARVORE.Regras.usando")} ${f.ability === "spellcasting" ? loc("ARVORE.Regras.oAtributoDeConjuracao") : abLabel(f.ability)}` : "", v4: f.toHit ? ` ${loc("ARVORE.Regras.noAcerto", { toHit: f.toHit })}` : "", formula: dano(f.formula, f.damageType) }));
  if (f.kind === "save") OUT.push(`${Number(f.targets) > 1 ? loc("ARVORE.Regras.ateAlvosFazem", { targets: f.targets }) : loc("ARVORE.Regras.oAlvoFaz")} ${loc("ARVORE.Regras.umTrDeFalha", { saveAbility: abLabel(f.saveAbility), f: dcText(f), v: f.formula ? dano(f.formula, f.damageType) : loc("ARVORE.Regras.sofreOEfeito"), v2: f.onSave === "half" ? loc("ARVORE.Regras.sucessoMetadeDoDano") : f.onSave === "none" ? loc("ARVORE.Regras.sucessoNadaAcontece") : loc("ARVORE.Regras.sucessoDanoTotal") })}`);
  if (f.kind === "heal") OUT.push(`${Number(f.targets) > 1 ? loc("ARVORE.Regras.ateCriaturasRecebem", { targets: f.targets }) : loc("ARVORE.Regras.umaCriaturaRecebe")} ${f.healType === "temphp" ? `${f.formula} ${loc("ARVORE.Comum.pvTemporarios")}` : `${f.formula} ${loc("ARVORE.Regras.pvDeCura")}`}.`);
  const ch = (f.changes ?? []).filter(c => c.key);
  if (ch.length) OUT.push(`${loc("ARVORE.Regras.enquantoAtivo", { v: ch.map(changeLabel).join("; ") })}${f.kind === "utility" && f.autoApply !== false ? ` ${loc("ARVORE.Regras.oEfeitoEntraSozinhoAoUsarESai")}` : ` ${loc("ARVORE.Regras.apliqueOEfeitoPeloBotaoDoCartao")}`}`);
  if (Number(f.chargeMax) > 0) OUT.push(loc("ARVORE.Regras.ultimateComCargaComecaVazia0", { chargeMax: f.chargeMax, v: [Number(f.chargeHit) ? loc("ARVORE.Regras.aCadaAtaqueQueAcerta", { chargeHit: f.chargeHit }) : "", Number(f.chargeCrit) ? loc("ARVORE.Regras.aCadaAcertoCritico", { chargeCrit: f.chargeCrit }) : "", Number(f.chargeDamaged) ? loc("ARVORE.Regras.quandoVoceSofreDano", { chargeDamaged: f.chargeDamaged }) : ""].filter(Boolean).join(", ") || loc("ARVORE.Regras.quandoOMestreConceder") }));
  if (f.transform) OUT.push(loc("ARVORE.Regras.eUmaTransformacao", { v: f.endIncap !== false ? loc("ARVORE.Regras.terminaAntesSeVoceFicarIncapacitado") : "", v2: f.tokenSize ? loc("ARVORE.Regras.oTokenFicaComQuadrados", { tokenSize: f.tokenSize, tokenSize2: f.tokenSize }) : "" }));
  if (f.note) OUT.push(f.note);
  if (extra) OUT.push(extra);
  return OUT.join("\n");
}

export const isMine = (doc, t, n) => {
  const f = doc.flags?.[SCOPE]?.skillTree;
  return f?.tree === t.id && f?.node === n.id;
};

export async function grant(a, t, node, rank = 1) {
  const max = Math.max(1, Number(node.ranks) || 1);
  const n = withRank(node, rank);
  const criados = [];
  const itemsData = [];
  for (const uuid of n.items) {
    const src = await fromUuid(uuid);
    if (!src) throw new Error(loc("ARVORE.Regras.itemNaoEncontradoACompraNaoFoi", { uuid }));
    const d = src.toObject();
    delete d._id;
    foundry.utils.setProperty(d, `flags.${SCOPE}.skillTree`, { tree: t.id, node: n.id });
    foundry.utils.setProperty(d, "_stats.compendiumSource", uuid);
    itemsData.push(d);
  }
  if (itemsData.length) criados.push(...(await a.createEmbeddedDocuments("Item", itemsData)).map(i => i.name));
  for (const [fi, f] of n.features.entries()) {
    const data = buildFeatureItem(n, f, fi, t, rank, max);
    try {
      const [it] = await a.createEmbeddedDocuments("Item", [data]);
      criados.push(it.name);
    } catch (err) {
      console.error(loc("ARVORE.Regras.arvoreDaMesaFalhaAoCriarHabilidade"), err, data);
      ui.notifications.warn(loc("ARVORE.Regras.naoConseguiCriarOBotaoDeUsoDe", { name: data.name }));
      const [it] = await a.createEmbeddedDocuments("Item", [{ ...data, system: { description: data.system.description, uses: data.system.uses }, effects: [] }]);
      criados.push(it.name);
    }
  }
  const changes = n.changes.filter(c => c.key);
  if (changes.length) {
    await a.createEmbeddedDocuments("ActiveEffect", [effectData({
      name: max > 1 ? `${n.name} (${rank}/${max})` : n.name, img: n.img || "icons/svg/aura.svg", origin: a.uuid, disabled: false,
      description: loc("ARVORE.Regras.concedidoPelaSkillTree", { name: t.name }),
      flags: { [SCOPE]: { skillTree: { tree: t.id, node: n.id } } }
    }, changes)]);
    criados.push(loc("ARVORE.Regras.efeito", { name: n.name }));
  }
  return criados;
}

export async function revoke(a, t, n) {
  const items = a.items.filter(i => isMine(i, t, n)).map(i => i.id);
  const effects = a.effects.filter(e => isMine(e, t, n)).map(e => e.id);
  if (items.length) await a.deleteEmbeddedDocuments("Item", items);
  if (effects.length) await a.deleteEmbeddedDocuments("ActiveEffect", effects);
}
