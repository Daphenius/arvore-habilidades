// ═══════════════════════════════════════════════════════════════════════════
//  Árvore da Mesa — importar e exportar Skill Trees
//  Métodos da janela ArvoreHabilidades (copiados para a classe em app.js)
// ═══════════════════════════════════════════════════════════════════════════

import { L } from "./i18n.js?v=1.7.7";
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
} from "./core.js?v=1.7.7";
import { SaveQueue } from "./persistence.js?v=1.7.7";
import { validateTrees, remapTree } from "./validation.js?v=1.7.7";
import { actorOperation } from "./operations.js?v=1.7.7";
import { DialogV2, charCard, whoSub, whoTools, wireWho } from "./ui-kit.js?v=1.7.7";

// links do GitHub viram o endereço do arquivo puro
export function rawLink(url) {
  let u = String(url ?? "").trim();
  const gh = u.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/i);
  if (gh) u = `https://raw.githubusercontent.com/${gh[1]}/${gh[2]}/${gh[3]}`;
  const gist = u.match(/^https?:\/\/gist\.github\.com\/([^/]+)\/([0-9a-f]+)\/?$/i);
  if (gist) u = `https://gist.githubusercontent.com/${gist[1]}/${gist[2]}/raw`;
  return u;
}

export class MixIo {
  // Troca o conteúdo de uma Skill Tree pela versão importada, mantendo ids, atribuições e o progresso
  async replaceTree(old, tr) {
    if (!this.gm) throw new Error(L("Somente o mestre pode atualizar árvores."));
    validateTrees(tr);
    const used = new Set(), idMap = {};
    const oldNodes = old.nodes;
    const match = n => oldNodes.find(o => !used.has(o.id) && o.id === n.id)
      ?? oldNodes.find(o => !used.has(o.id) && n.presetKey && o.presetKey === n.presetKey)
      ?? oldNodes.find(o => !used.has(o.id) && o.name === n.name);
    for (const n of tr.nodes) {
      const o = match(n);
      if (o) { used.add(o.id); idMap[n.id] = o.id; }
    }
    // habilidades novas ganham ids que não colidem com as antigas
    const taken = new Set(oldNodes.map(o => o.id));
    for (const n of tr.nodes) if (!idMap[n.id]) { let id; do id = uid(); while (taken.has(id)); taken.add(id); idMap[n.id] = id; }
    const fresh = normalizeTree({
      ...clone(tr), id: old.id, section: catOf(old), assigned: [...old.assigned],
      nodes: tr.nodes.map(n => ({
        ...clone(n), id: idMap[n.id],
        reqNodes: (n.reqNodes ?? []).map(rn => rn.tree === tr.id ? { ...rn, tree: old.id, node: idMap[rn.node] ?? rn.node } : rn)
      })),
      edges: tr.edges.filter(e => idMap[e.from] && idMap[e.to]).map(e => ({ ...e, from: idMap[e.from], to: idMap[e.to] }))
    });
    const i = this.trees.findIndex(x => x.id === old.id);
    this.trees[i] = fresh; this.treeId = fresh.id; this.sel = null;
    this._lastIdMap = idMap; // ids antigos (do arquivo) → ids no mundo, para combos de outras árvores do mesmo pacote
    this.save();
    await this.flushSave();
    // A atualização abaixo afeta documentos de atores; o histórico do editor só contém árvores.
    this.undoStack = []; this.redoStack = [];
    // refaz na ficha as habilidades que os personagens já tinham
    let fichas = 0;
    for (const actor of game.actors.filter(x => unlockedOf(x, fresh).length)) {
      await actorOperation(actor, async a => {
      const un = unlockedOf(a, fresh);
      for (const n of fresh.nodes) {
        const r = rankOf(a, fresh, n, un);
        if (!r) continue;
        await revoke(a, fresh, n);
        // evolução: se uma filha que substitui esta já foi desbloqueada, esta fica fora da ficha
        const substituida = fresh.edges.some(e => e.from === n.id && un.includes(e.to) && nodeById(fresh, e.to)?.replaces);
        if (!substituida) await grant(a, fresh, n, r);
      }
      fichas++;
      });
    }
    const rep = await fixOrphans(null, { trees: this.trees });
    ui.notifications.info(L`"${fresh.name}" atualizada: ${used.size} habilidade(s) mantidas, ${fresh.nodes.length - used.size} nova(s), ${oldNodes.length - used.size} removida(s).${fichas ? L` Fichas refeitas: ${fichas}.` : ""}${rep.length ? L` Pontos devolvidos para ${rep.length} personagem(ns).` : ""}`);
  }

  // ── pacote (exportar/importar com itens) ──
  async exportPackage(t) {
    const { pkg, count } = await this.buildPackage(t);
    saveFile(JSON.stringify(pkg, null, 2), "text/json", `skilltree-${t.name.slugify() || t.id}.json`);
    ui.notifications.info(L`Exportado com ${count} item(ns) junto.`);
  }

  // Todas as árvores num arquivo só (o Importar aceita a lista inteira)
  async exportAll() {
    if (!this.gm) return false;
    if (!this.trees.length) { ui.notifications.warn(L("Não há Skill Trees para exportar.")); return false; }
    const list = [];
    for (const t of this.trees) list.push((await this.buildPackage(t)).pkg);
    const stamp = new Date().toISOString().slice(0, 10);
    saveFile(JSON.stringify(list, null, 2), "text/json", `skilltrees-backup-${stamp}.json`);
    ui.notifications.info(L`${list.length} Skill Tree(s) exportadas.`);
    return true;
  }

  async buildPackage(t) {
    const uuids = new Set();
    for (const n of t.nodes) {
      n.items.forEach(u => uuids.add(u));
      for (const k of ["reqItems", "consume"]) n[k].forEach(x => x.uuid && uuids.add(x.uuid));
    }
    const items = {};
    for (const u of uuids) {
      const it = await fromUuid(u);
      if (!it) continue;
      const d = it.toObject(); delete d.folder; delete d.ownership; delete d._stats;
      items[u] = d;
    }
    return { pkg: { ...clone(t), assigned: [], _package: { version: 3, items } }, count: Object.keys(items).length };
  }

  // Importar: arquivo do computador ou link (ex.: JSON publicado no GitHub)
  async importFile() {
    if (!this.gm) return;
    const choice = await DialogV2.wait({
      window: { title: L("Importar Skill Tree"), icon: "fas fa-upload" }, position: { width: 480 },
      content: `<div class="st-c"><p class="st-c-lead">${L("De onde vem a Skill Tree?")}</p>
        <p class="st-c-hint"><b>${L("Arquivo")}</b>: ${L("Um JSON salvo no computador.")}<br><b>${L("Link")}</b>: ${L("Endereço de um JSON na internet (GitHub, Patreon, Drive com link direto).")}</p></div>`,
      buttons: [
        { action: "file", label: L("Arquivo"), icon: "fas fa-file-arrow-up", default: true },
        { action: "link", label: L("Link"), icon: "fas fa-link" }
      ],
      rejectClose: false
    });
    if (choice === "link") return this.importLink();
    if (choice !== "file") return;
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".json,application/json";
    input.onchange = async () => {
      try {
        if (!input.files?.[0]) return;
        if (input.files[0].size > 20 * 1024 * 1024) throw new Error(L("JSON maior que 20 MB."));
        await this.importText(await input.files[0].text());
      } catch (err) { ui.notifications.error(L`Falha ao importar: ${err.message}`); }
    };
    input.click();
  }

  async importLink() {
    const url = await DialogV2.prompt({
      window: { title: L("Importar por link"), icon: "fas fa-link" }, position: { width: 520 },
      content: `<div class="st-c"><div class="st-c-row"><label>${L("Link do JSON")}</label><div class="st-c-f"><input name="url" type="url" placeholder="https://github.com/…/arvore.json" autofocus></div>
        <p class="st-c-hint">${L("Links de página do GitHub (…/blob/…) são convertidos sozinhos para o arquivo. O site precisa permitir download direto.")}</p></div></div>`,
      ok: { label: L("Importar"), icon: "fas fa-download", callback: (e, b) => b.form.elements.url.value.trim() },
      rejectClose: false
    });
    if (!url) return;
    const src = rawLink(url);
    if (!/^https:\/\//i.test(src)) return ui.notifications.warn(L("Use um link que comece com https://"));
    try {
      const res = await fetch(src, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const len = Number(res.headers.get("content-length")) || 0;
      if (len > 20 * 1024 * 1024) throw new Error(L("JSON maior que 20 MB."));
      const text = await res.text();
      if (text.length > 20 * 1024 * 1024) throw new Error(L("JSON maior que 20 MB."));
      await this.importText(text);
    } catch (err) {
      ui.notifications.error(L`Falha ao importar: ${err.message}`);
      if (/fetch|NetworkError|CORS/i.test(String(err?.message))) ui.notifications.warn(L("O site bloqueou o download direto. Baixe o arquivo e use Importar → Arquivo."));
    }
  }

  async importText(text) {
    if (!this.gm) return;
    let data;
    try { data = JSON.parse(text); } catch { throw new Error(L("O conteúdo não é um JSON válido.")); }
        const raw = validateTrees(data);
        // ids do arquivo → ids no mundo, de todas as árvores do pacote (combos e bloqueios entre elas)
        const treeMap = {}, nodeMaps = {}, featMap = {}, imported = [];
        for (const tr of raw) {
          if (!Array.isArray(tr.nodes)) throw new Error(L("arquivo sem habilidades"));
          // já existe uma versão desta Skill Tree no mundo? atualiza mantendo o progresso
          const old = this.trees.find(x => x.id === tr.id) ?? (tr.preset && this.trees.find(x => x.preset === tr.preset && x.mode === (tr.mode ?? "skill")))
            ?? this.trees.find(x => x.name === tr.name && x.mode === (tr.mode ?? "skill"));
          const choice = old ? await DialogV2.wait({
            window: { title: L("Importar Skill Tree") }, position: { width: 460 },
            content: L`<p>Já existe a Skill Tree <b>${esc(old.name)}</b> no mundo.</p>
              <p><b>Atualizar</b> troca o conteúdo pela versão do arquivo e mantém atribuições e progresso: os personagens continuam com o que já desbloquearam, as habilidades na ficha são refeitas com os textos novos, e quem tinha habilidades que saíram da árvore recebe os pontos de volta.</p>`,
            buttons: [
              { action: "upd", label: L("Atualizar a existente"), icon: "fas fa-rotate", default: true },
              { action: "new", label: L("Criar outra cópia"), icon: "fas fa-plus" }
            ],
            rejectClose: false
          }) : "new";
          if (!choice) continue;
          const pkgItems = tr._package?.items ?? {};
          delete tr._package;
          const map = {};
          const n = Object.keys(pkgItems).length;
          if (n && await DialogV2.confirm({ window: { title: L("Importar itens") }, content: L`<p>Este pacote traz <b>${n}</b> item(ns). Criar no mundo, numa pasta própria?</p>` })) {
            const ItemCls = CONFIG.Item.documentClass, FolderCls = CONFIG.Folder.documentClass;
            const folder = await FolderCls.create({ name: `Skill Tree: ${tr.name}`, type: "Item" });
            const entries = Object.entries(pkgItems);
            const created = await ItemCls.createDocuments(entries.map(([, d]) => ({ ...d, _id: undefined, folder: folder?.id })));
            entries.forEach(([old], i) => { if (created[i]) map[old] = created[i].uuid; });
          }
          const fix = u => map[u] ?? u;
          for (const node of tr.nodes) {
            node.items = (node.items ?? []).map(fix);
            for (const k of ["reqItems", "consume"]) (node[k] ?? []).forEach(x => { if (x.uuid) x.uuid = fix(x.uuid); });
          }
          if (choice === "upd") {
            const pkgId = tr.id;
            await this.replaceTree(old, tr);
            treeMap[pkgId] = old.id; nodeMaps[pkgId] = this._lastIdMap ?? {};
            imported.push(old.id);
            continue;
          }
          const keep = tr.section && this.sections().some(c => c.id === tr.section);
          const fresh = normalizeTree({ ...remapTree(tr, uid()), section: keep ? tr.section : this.category, assigned: [] });
          const usedFeats = new Set(this.trees.flatMap(x => x.feats.map(f => f.id)));
          for (const f of fresh.feats) if (usedFeats.has(f.id)) { const nid = uid(); featMap[f.id] = nid; if (fresh.lockFeat === f.id) fresh.lockFeat = nid; f.id = nid; }
          treeMap[tr.id] = fresh.id; nodeMaps[tr.id] = {};
          imported.push(fresh.id);
          this.trees.push(fresh); this.treeId = fresh.id;
        }
        // segunda passada: combos e bloqueios que apontam para outra árvore do mesmo arquivo
        for (const id of imported) {
          const T = this.trees.find(x => x.id === id); if (!T) continue;
          for (const node of T.nodes) node.reqNodes = (node.reqNodes ?? []).map(rn => treeMap[rn.tree] && treeMap[rn.tree] !== id
            ? { ...rn, tree: treeMap[rn.tree], node: nodeMaps[rn.tree]?.[rn.node] ?? rn.node } : rn);
          if (T.lockFeat && featMap[T.lockFeat]) T.lockFeat = featMap[T.lockFeat];
        }
        this.save(); await this.flushSave(); this.render();
        ui.notifications.info(L("Importação concluída."));
  }
}
