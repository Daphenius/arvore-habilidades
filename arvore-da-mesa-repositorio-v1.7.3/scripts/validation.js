const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const safeId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value) && !['__proto__','constructor','prototype'].includes(value);
export function validateTrees(raw) {
  const trees = Array.isArray(raw) ? raw : [raw];
  if (!trees.length || trees.length > 200) throw Error('Quantidade de árvores inválida (1 a 200).');
  const walk = (v, depth = 0) => {
    if (depth > 50) throw Error('JSON excessivamente aninhado.');
    if (!v || typeof v !== 'object') return;
    for (const [k,x] of Object.entries(v)) {
      if (['__proto__','constructor','prototype'].includes(k)) throw Error('Chave inválida no JSON.');
      walk(x, depth + 1);
    }
  };
  walk(trees);
  for (const t of trees) {
    if (!object(t) || !safeId(t.id) || typeof t.name !== 'string' || !t.name.trim()) throw Error('Árvore sem ID ou nome válido.');
    if (!Array.isArray(t.nodes) || t.nodes.length > 10000 || !Array.isArray(t.edges)) throw Error('Nós ou conexões inválidos.');
    const ids = new Set();
    for (const n of t.nodes) {
      if (!object(n) || !safeId(n.id) || ids.has(n.id) || typeof n.name !== 'string') throw Error('Habilidade com ID duplicado/inválido ou nome inválido.');
      ids.add(n.id);
      for (const k of ['x','y','cost','costGp','costPp','ranks','trainDays','size']) if (n[k] !== undefined && !Number.isFinite(Number(n[k]))) throw Error(`Valor numérico inválido: ${k}.`);
      for (const k of ['items','features','changes','reqNodes','reqItems','consume','ingredients','reqClasses','rankDescs']) if (n[k] !== undefined && !Array.isArray(n[k])) throw Error(`Lista inválida: ${k}.`);
      for (const k of ['features','changes','reqNodes','reqItems','consume','ingredients','reqClasses']) if (n[k]?.some(x => !object(x))) throw Error(`Entrada inválida em ${k}.`);
      if (n.items?.some(x => typeof x !== 'string')) throw Error('Referência de item inválida.');
    }
    for (const e of t.edges) if (!object(e) || !ids.has(e.from) || !ids.has(e.to) || e.from === e.to) throw Error('Conexão aponta para habilidade inexistente ou para si mesma.');
    // Kahn: rejeita ciclos sem recursão, inclusive em árvores grandes.
    const indegree = new Map([...ids].map(id => [id,0])), next = new Map([...ids].map(id => [id,[]]));
    for (const e of t.edges) { indegree.set(e.to,indegree.get(e.to)+1); next.get(e.from).push(e.to); }
    const queue = [...ids].filter(id => !indegree.get(id));
    for (let i=0;i<queue.length;i++) for (const id of next.get(queue[i])) { indegree.set(id,indegree.get(id)-1); if (!indegree.get(id)) queue.push(id); }
    if (queue.length !== ids.size) throw Error('A árvore contém conexões cíclicas.');
    for (const k of ['drawings','assigned']) if (t[k] !== undefined && !Array.isArray(t[k])) throw Error(`Lista inválida: ${k}.`);
    for (const d of t.drawings ?? []) {
      if (!object(d) || !safeId(d.id)) throw Error('Desenho inválido.');
      for (const k of ['x','y','w','h','size','width']) if (d[k] !== undefined && !Number.isFinite(Number(d[k]))) throw Error('Coordenada inválida no desenho.');
      if (d.type === 'path' && (!Array.isArray(d.points) || d.points.some(p => !Array.isArray(p) || p.length !== 2 || p.some(x => !Number.isFinite(Number(x)))))) throw Error('Traçado inválido.');
    }
  }
  return trees;
}

// Remapeia também pré-requisitos internos ao copiar/importar uma árvore.
export function remapTree(tree, id, nodeIds = new Map()) {
  const copy = structuredClone(tree), old = tree.id;
  copy.id = id;
  for (const n of copy.nodes) {
    n.id = nodeIds.get(n.id) ?? n.id;
    n.reqNodes = (n.reqNodes ?? []).map(r => r.tree === old ? {...r,tree:id,node:nodeIds.get(r.node) ?? r.node} : r);
  }
  copy.edges = copy.edges.map(e => ({...e,from:nodeIds.get(e.from) ?? e.from,to:nodeIds.get(e.to) ?? e.to}));
  return copy;
}
