// ═══════════════════════════════════════════════════════════════════════════
//  Árvore da Mesa — inicialização
//  Módulo Foundry VTT V14, sistema dnd5e 6
// ═══════════════════════════════════════════════════════════════════════════

import * as CORE from "./core.js";
import { loc, localizeLists } from "./idioma.js";
import { MOD, ST, applyTheme, getData, getTrees, initCore, moduleVersion, setData } from "./core.js";
import { ArvoreHabilidades } from "./app.js";
import { fixOrphans } from "./compras.js";
import { registerTidyTab } from "./ficha.js";
import { installSessionHooks, isActiveGM } from "./hooks.js";
import { migrateEffectKeys, migrateFromMacro, migrateRefundPlayer } from "./migracoes.js";
import { registerSettings } from "./settings.js";
import { processAllRestQueues } from "./temporarias.js";

// Abre a janela ou traz para frente se já estiver aberta
function openApp() {
  if (ST.app?.rendered) { ST.app.bringToFront(); return ST.app; }
  ST.app = new ArvoreHabilidades();
  ST.app.render({ force: true });
  return ST.app;
}
ST.openApp = openApp;

Hooks.once("init", () => {
  registerSettings();
  try { applyTheme(game.settings.get(MOD, "theme")); } catch { applyTheme("dourado"); }
  game.keybindings.register(MOD, "open", {
    name: "ARVORE.Keybind.Open.Name",
    hint: "ARVORE.Keybind.Open.Hint",
    editable: [{ key: "KeyK", modifiers: ["Shift"] }],
    onDown: () => { openApp(); return true; }
  });
});

// listas de opções montadas na importação: traduz quando o idioma do Foundry é conhecido
Hooks.once("i18nInit", () => localizeLists(Object.values(CORE)));

Hooks.once("setup", () => initCore());

// Tidy 5e Sheets: registra a aba "Skill Tree" pela API dela
Hooks.once("tidy5e-sheet.ready", api => registerTidyTab(api));

Hooks.once("ready", async () => {
  try { await migrateFromMacro(); } catch (e) { console.error(loc("ARVORE.Inicio.arvoreDaMesaMigracaoDaMacro"), e); }
  try { await migrateEffectKeys(); } catch (e) { console.error(loc("ARVORE.Inicio.arvoreDaMesaMigracaoDosEfeitos"), e); }
  try { await migrateRefundPlayer(); } catch (e) { console.error(loc("ARVORE.Inicio.arvoreDaMesaReembolsoPeloJogador"), e); }
  installSessionHooks();
  // devolve pontos presos em habilidades/Skill Trees que foram excluídas
  try {
    // "pendingCleanup" marca que a última árvore foi excluída sem a devolução ter terminado (ex.: F5 com a janela aberta)
    const pending = getData("pendingCleanup", false) === true;
    if (isActiveGM() && ((getData("trees", { list: [] })?.list ?? []).length || pending)) {
      const rep = await fixOrphans();
      if (pending) await setData("pendingCleanup", false);
      if (rep.length) ui.notifications.info(loc("ARVORE.Inicio.arvoreDaMesaPontosDevolvidos", { length: rep.length }));
    }
  } catch (e) { console.error(loc("ARVORE.Inicio.arvoreDaMesaPontosPresos"), e); }
  // descansos longos que jogadores fizeram com o mestre fora
  try { if (isActiveGM()) await processAllRestQueues(); } catch (e) { console.error("Árvore da Mesa | descansos pendentes", e); }
  game.modules.get(MOD).api = {
    version: moduleVersion(),
    open: openApp,
    openFor: (actorId, treeId, nodeId) => ST.open(actorId, treeId, nodeId),
    trees: () => getTrees(),
    fixPoints: actors => fixOrphans(actors)
  };
});

// Botão nas ferramentas de token (barra da esquerda)
Hooks.on("getSceneControlButtons", controls => {
  const tools = controls.tokens?.tools;
  if (!tools) return;
  tools["arvore-habilidades"] = {
    name: "arvore-habilidades", title: loc("ARVORE.Inicio.arvoreDaMesa"), icon: "fas fa-sitemap",
    button: true, visible: true, order: Object.keys(tools).length,
    onChange: () => openApp()
  };
});
