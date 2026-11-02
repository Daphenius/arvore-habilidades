// ═══════════════════════════════════════════════════════════════════════════
//  Árvore da Mesa — migrações de versões antigas e da macro
// ═══════════════════════════════════════════════════════════════════════════

import { loc } from "./idioma.js";
import {
  CFG, SCOPE, clone, getData, invalidateTrees, migrateKey, saveCfg, saveTemplates, saveTrees, setData
} from "./core.js";
import { isActiveGM, stFlag } from "./hooks.js";

// ───────────────────────── migração da macro antiga ─────────────────────────
// Na primeira vez, copia árvores, modelos e configurações que estavam nos flags da macro.
export async function migrateFromMacro() {
  if (!isActiveGM() || getData("migrated", false)) return;
  const macro = game.macros.find(m => m.flags?.[SCOPE]?.trees?.length) ?? game.macros.getName("Árvore de Habilidades");
  const f = macro?.flags?.[SCOPE] ?? {};
  let n = 0;
  if (Array.isArray(f.trees) && f.trees.length && !(getData("trees", { list: [] })?.list ?? []).length) { await saveTrees(f.trees); n = f.trees.length; }
  if (Array.isArray(f.templates) && f.templates.length) await saveTemplates(f.templates);
  if (f.session) await setData("session", f.session);
  if (f.settings) await saveCfg({ ...CFG, ...f.settings });
  await setData("migrated", true);
  invalidateTrees();
  if (n) ui.notifications.info(loc("ARVORE.Regras.arvoreDaMesaSkillTreeSTrazidas", { n, name: macro.name }));
}

// Efeitos já criados nas fichas com caminhos antigos (antes do dnd5e 6). Roda uma vez por mundo.
export async function migrateEffectKeys() {
  if (!isActiveGM() || getData("keysMigrated", false)) return;
  const fix = async eff => {
    if (!stFlag(eff)) return 0;
    const src = eff._source.system?.changes ?? [];
    if (!src.some(c => migrateKey(c.key) !== c.key)) return 0;
    await eff.update({ "system.changes": src.map(c => ({ ...c, key: migrateKey(c.key) })) });
    return 1;
  };
  let n = 0;
  for (const a of game.actors) {
    for (const e of a.effects) n += await fix(e);
    for (const i of a.items) if (stFlag(i)) for (const e of i.effects) n += await fix(e);
  }
  await setData("keysMigrated", true);
  if (n) console.log(loc("ARVORE.Regras.arvoreDaMesaEfeitoSAtualizados", { n }));
}

// 1.1.1: jogadores passam a poder reembolsar em todas as Skill Trees já existentes. Roda uma vez por mundo.
export async function migrateRefundPlayer() {
  if (!isActiveGM() || getData("refundMigrated", false)) return;
  const list = clone(getData("trees", { list: [] })?.list ?? []);
  let n = 0;
  for (const t of list) if (t && t.refundPlayer !== true) { t.refundPlayer = true; n++; }
  if (n) { await saveTrees(list); invalidateTrees(); }
  await setData("refundMigrated", true);
  if (n) console.log(loc("ARVORE.Regras.arvoreDaMesaReembolsoPeloJogador", { n }));
}
