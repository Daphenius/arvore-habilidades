// ═══════════════════════════════════════════════════════════════════════════
//  Árvore da Mesa — inicialização
//  Módulo Foundry VTT V14, sistema dnd5e 6
// ═══════════════════════════════════════════════════════════════════════════

import { L, relabel, i18nReady } from "./i18n.js?v=1.7.10";
import * as CORE from "./core.js?v=1.7.10";
import { MOD, VERSION, ST, initCore, registerSettings, installSessionHooks, migrateFromMacro, migrateEffectKeys, getTrees, getData, setData, registerTidyTab, fixOrphans, isActiveGM, processAllRestQueues, migrateRefundPlayer, applyTheme } from "./core.js?v=1.7.10";
import { ArvoreHabilidades, APP_VERSION } from "./app.js?v=1.7.10";

// Abre a janela ou traz para frente se já estiver aberta
function openApp() {
  if (ST.app?.rendered) { ST.app.bringToFront(); return ST.app; }
  ST.app = new ArvoreHabilidades();
  ST.app.render({ force: true });
  return ST.app;
}
ST.openApp = openApp;

// Arquivos velhos em cache (navegador ou Cloudflare) misturam versões e quebram a janela.
// O CSS errado é trocado sozinho. A versão certa é lida do module.json no disco (sem cache):
// o Foundry só relê o module.json ao reiniciar, então a versão que ele guarda na memória
// pode ser a antiga logo depois de uma atualização — isso não é erro e não exige reiniciar.
function routeOf(path) {
  try { return foundry.utils.getRoute(path); } catch { return path; }
}

async function diskVersion() {
  try {
    const r = await fetch(routeOf(`modules/${MOD}/module.json?t=${Date.now()}`), { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json())?.version ?? null;
  } catch { return null; }
}

async function checkCache() {
  const css = getComputedStyle(document.documentElement).getPropertyValue("--st-css-version").replace(/["'\s]/g, "");
  if (css !== VERSION) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = routeOf(`modules/${MOD}/styles/arvore-habilidades.css?v=${VERSION}`);
    document.head.appendChild(link);
    console.warn(L`Árvore da Mesa | CSS em cache (${css || L("nenhum")}), carregando ${VERSION}`);
  }
  const disk = await diskVersion();
  const loaded = game.modules.get(MOD)?.version;
  const want = disk || loaded;
  const KEY = `${MOD}.cacheReload`;
  const newer = (a, b) => { try { return foundry.utils.isNewerVersion(a, b); } catch { return a !== b; } };
  // velho = arquivos misturados, ou código mais antigo que o module.json.
  // Código mais NOVO que a versão na memória do Foundry é a atualização recém-instalada: está certo.
  const stale = VERSION !== APP_VERSION || (want && (disk ? VERSION !== disk : newer(want, VERSION)));
  if (stale) {
    console.error(L`Árvore da Mesa | arquivos em cache: módulo ${want}, core ${VERSION}, janela ${APP_VERSION}`);
    // tenta uma vez recarregar sozinho; se o navegador insistir no arquivo velho, avisa
    let tried = null, canStore = false;
    try { tried = sessionStorage.getItem(KEY); canStore = true; } catch {}
    if (canStore && tried !== String(want)) {
      try { sessionStorage.setItem(KEY, String(want)); } catch {}
      window.location.reload();
      return "reload";
    }
    ui.notifications.error(L("Árvore da Mesa: seu navegador está usando arquivos antigos do módulo. Aperte Ctrl+F5 para recarregar."), { permanent: true });
    return;
  }
  try { sessionStorage.removeItem(KEY); } catch {}
  if (loaded && disk && loaded !== disk) {
    console.info(L`Árvore da Mesa | versão ${disk} carregada. A lista de módulos do Foundry mostra ${loaded} até o próximo reinício, mas não é preciso reiniciar.`);
  }
}

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
Hooks.once("i18nInit", () => { i18nReady(); relabel(Object.values(CORE)); });

Hooks.once("setup", () => initCore());

// Tidy 5e Sheets: registra a aba "Skill Tree" pela API dela
Hooks.once("tidy5e-sheet.ready", api => registerTidyTab(api));

Hooks.once("ready", async () => {
  try { if (await checkCache() === "reload") return; } catch (e) { console.error(L("Árvore da Mesa | verificação de cache"), e); }
  try { await migrateFromMacro(); } catch (e) { console.error(L("Árvore da Mesa | migração da macro"), e); }
  try { await migrateEffectKeys(); } catch (e) { console.error(L("Árvore da Mesa | migração dos efeitos"), e); }
  try { await migrateRefundPlayer(); } catch (e) { console.error(L("Árvore da Mesa | reembolso pelo jogador"), e); }
  installSessionHooks();
  // devolve pontos presos em habilidades/Skill Trees que foram excluídas
  try {
    // "pendingCleanup" marca que a última árvore foi excluída sem a devolução ter terminado (ex.: F5 com a janela aberta)
    const pending = getData("pendingCleanup", false) === true;
    if (isActiveGM() && ((getData("trees", { list: [] })?.list ?? []).length || pending)) {
      const rep = await fixOrphans();
      if (pending) await setData("pendingCleanup", false);
      if (rep.length) ui.notifications.info(L`Árvore da Mesa: pontos devolvidos para ${rep.length} personagem(ns) de habilidades que não existem mais (detalhes no chat).`);
    }
  } catch (e) { console.error(L("Árvore da Mesa | pontos presos"), e); }
  // descansos longos que jogadores fizeram com o mestre fora
  try { if (isActiveGM()) await processAllRestQueues(); } catch (e) { console.error("Árvore da Mesa | descansos pendentes", e); }
  game.modules.get(MOD).api = {
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
    name: "arvore-habilidades", title: L("Árvore da Mesa"), icon: "fas fa-sitemap",
    button: true, visible: true, order: Object.keys(tools).length,
    onChange: () => openApp()
  };
});
