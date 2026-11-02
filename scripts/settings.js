// ═══════════════════════════════════════════════════════════════════════════
//  Árvore da Mesa — configurações registradas no Foundry
// ═══════════════════════════════════════════════════════════════════════════

import { MOD, THEMES, applyTheme, settingsDefaults } from "./core.js";

// ───────────────────────── configurações registradas ─────────────────────────
export function registerSettings() {
  const reg = (k, o) => game.settings.register(MOD, k, { scope: "world", ...o });
  reg("sections", { config: false, type: Object, default: { list: [{ id: "fantasy", name: "Fantasia" }] } }); // o nome padrão segue o idioma (app.js)
  reg("trees", { config: false, type: Object, default: { list: [] } });
  reg("templates", { config: false, type: Object, default: { list: [] } });
  reg("session", { config: false, type: Object, default: {} });
  reg("migrated", { config: false, type: Boolean, default: false });
  reg("keysMigrated", { config: false, type: Boolean, default: false });
  reg("refundMigrated", { config: false, type: Boolean, default: false });
  reg("pendingCleanup", { config: false, type: Boolean, default: false });
  reg("gmUndo", { config: false, type: Object, default: { list: [] } });
  game.settings.register(MOD, "welcomeSeen", { scope: "client", config: false, type: Boolean, default: false });
  game.settings.register(MOD, "theme", {
    scope: "client", config: true, type: String, default: "dourado", name: "ARVORE.Settings.theme.Name", hint: "ARVORE.Settings.theme.Hint",
    choices: Object.fromEntries(THEMES.map(x => [x.id, `ARVORE.Theme.${x.id}`])), onChange: v => applyTheme(v)
  });
  const d = settingsDefaults();
  reg("ptsPerLevel", { config: true, type: Number, default: d.ptsPerLevel, name: "ARVORE.Settings.ptsPerLevel.Name", hint: "ARVORE.Settings.ptsPerLevel.Hint" });
  reg("maxLevel", { config: true, type: Number, default: d.maxLevel, name: "ARVORE.Settings.maxLevel.Name", hint: "ARVORE.Settings.maxLevel.Hint" });
  reg("availNotice", { config: true, type: Boolean, default: d.availNotice, name: "ARVORE.Settings.availNotice.Name", hint: "ARVORE.Settings.availNotice.Hint" });
  reg("levelNotice", { config: true, type: Boolean, default: d.levelNotice, name: "ARVORE.Settings.levelNotice.Name", hint: "ARVORE.Settings.levelNotice.Hint" });
  reg("sheetButton", { config: true, type: Boolean, default: d.sheetButton, name: "ARVORE.Settings.sheetButton.Name", hint: "ARVORE.Settings.sheetButton.Hint" });
  reg("sheetTab", { config: true, type: Boolean, default: d.sheetTab, name: "ARVORE.Settings.sheetTab.Name", hint: "ARVORE.Settings.sheetTab.Hint" });
  reg("defaultSound", { config: true, type: String, default: d.defaultSound, filePicker: "audio", name: "ARVORE.Settings.defaultSound.Name", hint: "ARVORE.Settings.defaultSound.Hint" });
}
