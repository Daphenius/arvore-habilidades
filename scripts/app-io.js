// ═══════════════════════════════════════════════════════════════════════════
//  Árvore da Mesa — importar e exportar Skill Trees
//  Métodos da janela ArvoreHabilidades (copiados para a classe em app.js)
// ═══════════════════════════════════════════════════════════════════════════

import { loc } from "./idioma.js";
import { catOf, clone, esc, nodeById, normalizeTree, saveFile, uid } from "./core.js";
import { fixOrphans } from "./compras.js";
import { grant, revoke } from "./itens.js";
import { actorOperation } from "./operations.js";
import { rankOf, unlockedOf } from "./regras.js";
import { DialogV2 } from "./ui-kit.js";
import { remapTree, validateTrees } from "./validation.js";

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
    if (!this.gm) throw new Error(loc("ARVORE.Importar.somenteOMestrePodeAtualizarArvores"));
    validateTrees(tr);
    const used = new Set(), idMap = {};
    const oldNodes = old.nodes;
    const match = n => oldNodes.find(o => !used.has(o.id) && o.id === n.id)
      ?? oldNodes.find(o => !used.has(o.id) && o.name === n.name);
    for (const n of tr.nodes) {
      const o = match(n);
      if (o) { used.add(o.id); idMap[n.id] = o.id; }
    }
    // habilidades novas ganham ids que não colidem com as antigas
    const taken = new Set(oldNodes.map(o => o.id));
    for (const n of tr.nodes) if (!idMap[n.id]) { let id; do id = uid(); while (taken.has(id)); taken.add(id); idMap[n.id] = id; }
    const nova = normalizeTree({
      ...clone(tr), id: old.id, section: catOf(old), assigned: [...old.assigned],
      nodes: tr.nodes.map(n => ({
        ...clone(n), id: idMap[n.id],
        reqNodes: (n.reqNodes ?? []).map(rn => rn.tree === tr.id ? { ...rn, tree: old.id, node: idMap[rn.node] ?? rn.node } : rn)
      })),
      edges: tr.edges.filter(e => idMap[e.from] && idMap[e.to]).map(e => ({ ...e, from: idMap[e.from], to: idMap[e.to] }))
    });
    const i = this.trees.findIndex(x => x.id === old.id);
    this.trees[i] = nova; this.treeId = nova.id; this.sel = null;
    this._lastIdMap = idMap; // ids antigos (do arquivo) → ids no mundo, para combos de outras árvores do mesmo pacote
    this.save();
    await this.flushSave();
    // A atualização abaixo afeta documentos de atores; o histórico do editor só contém árvores.
    this.undoStack = []; this.redoStack = [];
    // refaz na ficha as habilidades que os personagens já tinham
    let fichas = 0;
    for (const actor of game.actors.filter(x => unlockedOf(x, nova).length)) {
      await actorOperation(actor, async a => {
      const un = unlockedOf(a, nova);
      for (const n of nova.nodes) {
        const r = rankOf(a, nova, n, un);
        if (!r) continue;
        await revoke(a, nova, n);
        // evolução: se uma filha que substitui esta já foi desbloqueada, esta fica fora da ficha
        const substituida = nova.edges.some(e => e.from === n.id && un.includes(e.to) && nodeById(nova, e.to)?.replaces);
        if (!substituida) await grant(a, nova, n, r);
      }
      fichas++;
      });
    }
    const rep = await fixOrphans(null, { trees: this.trees });
    ui.notifications.info(`${loc("ARVORE.Importar.atualizadaHabilidadeSMantidas", { name: nova.name, size: used.size, v: nova.nodes.length - used.size, v2: oldNodes.length - used.size })}${fichas ? ` ${loc("ARVORE.Importar.fichasRefeitas", { fichas })}` : ""}${rep.length ? ` ${loc("ARVORE.Comum.pontosDevolvidosParaPersonagem", { length: rep.length })}` : ""}`);
  }

  // ── pacote (exportar/importar com itens) ──
  async exportPackage(t) {
    const { pkg, count } = await this.buildPackage(t);
    saveFile(JSON.stringify(pkg, null, 2), "text/json", `skilltree-${t.name.slugify() || t.id}.json`);
    ui.notifications.info(loc("ARVORE.Importar.exportadoComItemNsJunto", { count }));
  }

  // Todas as árvores num arquivo só (o Importar aceita a lista inteira)
  async exportAll() {
    if (!this.gm) return false;
    if (!this.trees.length) { ui.notifications.warn(loc("ARVORE.Importar.naoHaSkillTreesParaExportar")); return false; }
    const list = [];
    for (const t of this.trees) list.push((await this.buildPackage(t)).pkg);
    const stamp = new Date().toISOString().slice(0, 10);
    saveFile(JSON.stringify(list, null, 2), "text/json", `skilltrees-backup-${stamp}.json`);
    ui.notifications.info(`${list.length} ${loc("ARVORE.Importar.skillTreeSExportadas")}`);
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
      window: { title: loc("ARVORE.Importar.importarSkillTree"), icon: "fas fa-upload" }, position: { width: 480 },
      content: `<div class="st-c"><p class="st-c-lead">${loc("ARVORE.Importar.deOndeVemASkillTree")}</p>
        <p class="st-c-hint"><b>${loc("ARVORE.Importar.arquivo")}</b>: ${loc("ARVORE.Importar.umJsonSalvoNoComputador")}<br><b>${loc("ARVORE.Importar.link")}</b>: ${loc("ARVORE.Importar.enderecoDeUmJsonNaInternetGithub")}</p></div>`,
      buttons: [
        { action: "file", label: loc("ARVORE.Importar.arquivo"), icon: "fas fa-file-arrow-up", default: true },
        { action: "link", label: loc("ARVORE.Importar.link"), icon: "fas fa-link" }
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
        if (input.files[0].size > 20 * 1024 * 1024) throw new Error(loc("ARVORE.Importar.jsonMaiorQue20Mb"));
        await this.importText(await input.files[0].text());
      } catch (err) { ui.notifications.error(`${loc("ARVORE.Importar.falhaAoImportar")} ${err.message}`); }
    };
    input.click();
  }

  async importLink() {
    const url = await DialogV2.prompt({
      window: { title: loc("ARVORE.Importar.importarPorLink"), icon: "fas fa-link" }, position: { width: 520 },
      content: `<div class="st-c"><div class="st-c-row"><label>${loc("ARVORE.Importar.linkDoJson")}</label><div class="st-c-f"><input name="url" type="url" placeholder="https://github.com/…/arvore.json" autofocus></div>
        <p class="st-c-hint">${loc("ARVORE.Importar.linksDePaginaDoGithubBlobSao")}</p></div></div>`,
      ok: { label: loc("ARVORE.Importar.importar"), icon: "fas fa-download", callback: (e, b) => b.form.elements.url.value.trim() },
      rejectClose: false
    });
    if (!url) return;
    const src = rawLink(url);
    if (!/^https:\/\//i.test(src)) return ui.notifications.warn(loc("ARVORE.Importar.useUmLinkQueComeceComHttps"));
    try {
      const res = await fetch(src, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const len = Number(res.headers.get("content-length")) || 0;
      if (len > 20 * 1024 * 1024) throw new Error(loc("ARVORE.Importar.jsonMaiorQue20Mb"));
      const text = await res.text();
      if (text.length > 20 * 1024 * 1024) throw new Error(loc("ARVORE.Importar.jsonMaiorQue20Mb"));
      await this.importText(text);
    } catch (err) {
      ui.notifications.error(`${loc("ARVORE.Importar.falhaAoImportar")} ${err.message}`);
      if (/fetch|NetworkError|CORS/i.test(String(err?.message))) ui.notifications.warn(loc("ARVORE.Importar.oSiteBloqueouODownloadDireto"));
    }
  }

  async importText(text) {
    if (!this.gm) return;
    let data;
    try { data = JSON.parse(text); } catch { throw new Error(loc("ARVORE.Importar.oConteudoNaoEUmJsonValido")); }
        const raw = validateTrees(data);
        // ids do arquivo → ids no mundo, de todas as árvores do pacote (combos e bloqueios entre elas)
        const treeMap = {}, nodeMaps = {}, featMap = {}, imported = [];
        for (const tr of raw) {
          if (!Array.isArray(tr.nodes)) throw new Error(loc("ARVORE.Importar.arquivoSemHabilidades"));
          // já existe uma versão desta Skill Tree no mundo? atualiza mantendo o progresso
          const old = this.trees.find(x => x.id === tr.id) ?? this.trees.find(x => x.name === tr.name);
          const choice = old ? await DialogV2.wait({
            window: { title: loc("ARVORE.Importar.importarSkillTree") }, position: { width: 460 },
            content: `<p>${loc("ARVORE.Importar.jaExisteASkillTree")} <b>${esc(old.name)}</b> ${loc("ARVORE.Importar.noMundo")}</p>
              <p><b>${loc("ARVORE.Importar.atualizar")}</b> ${loc("ARVORE.Importar.trocaOConteudoPelaVersaoDoArquivo")}</p>`,
            buttons: [
              { action: "upd", label: loc("ARVORE.Importar.atualizarAExistente"), icon: "fas fa-rotate", default: true },
              { action: "new", label: loc("ARVORE.Importar.criarOutraCopia"), icon: "fas fa-plus" }
            ],
            rejectClose: false
          }) : "new";
          if (!choice) continue;
          const pkgItems = tr._package?.items ?? {};
          delete tr._package;
          const map = {};
          const n = Object.keys(pkgItems).length;
          if (n && await DialogV2.confirm({ window: { title: loc("ARVORE.Importar.importarItens") }, content: `<p>${loc("ARVORE.Importar.estePacoteTraz")} <b>${n}</b> ${loc("ARVORE.Importar.itemNsCriarNoMundoNumaPastaPropria")}</p>` })) {
            const ItemCls = CONFIG.Item.documentClass, FolderCls = CONFIG.Folder.documentClass;
            const folder = await FolderCls.create({ name: `Skill Tree: ${tr.name}`, type: "Item" });
            const entries = Object.entries(pkgItems);
            const criados = await ItemCls.createDocuments(entries.map(([, d]) => ({ ...d, _id: undefined, folder: folder?.id })));
            entries.forEach(([old], i) => { if (criados[i]) map[old] = criados[i].uuid; });
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
          const nova = normalizeTree({ ...remapTree(tr, uid()), section: keep ? tr.section : this.category, assigned: [] });
          const usedFeats = new Set(this.trees.flatMap(x => x.feats.map(f => f.id)));
          for (const f of nova.feats) if (usedFeats.has(f.id)) { const nid = uid(); featMap[f.id] = nid; if (nova.lockFeat === f.id) nova.lockFeat = nid; f.id = nid; }
          treeMap[tr.id] = nova.id; nodeMaps[tr.id] = {};
          imported.push(nova.id);
          this.trees.push(nova); this.treeId = nova.id;
        }
        // segunda passada: combos e bloqueios que apontam para outra árvore do mesmo arquivo
        for (const id of imported) {
          const T = this.trees.find(x => x.id === id); if (!T) continue;
          for (const node of T.nodes) node.reqNodes = (node.reqNodes ?? []).map(rn => treeMap[rn.tree] && treeMap[rn.tree] !== id
            ? { ...rn, tree: treeMap[rn.tree], node: nodeMaps[rn.tree]?.[rn.node] ?? rn.node } : rn);
          if (T.lockFeat && featMap[T.lockFeat]) T.lockFeat = featMap[T.lockFeat];
        }
        this.save(); await this.flushSave(); this.render();
        ui.notifications.info(loc("ARVORE.Importar.importacaoConcluida"));
  }
}
