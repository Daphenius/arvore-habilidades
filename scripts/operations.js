// A fila é local ao cliente. Não equivale a uma transação do servidor Foundry.
import { loc } from "./idioma.js";
import { SCOPE } from "./core.js";
const queues = new Map();
export function actorOperation(actor, operation) {
  if (!actor || (!game.user.isGM && !actor.isOwner)) return Promise.reject(Error(loc("ARVORE.Operacoes.semPermissaoParaAlterarEstePersonagem")));
  const key = actor.uuid ?? actor.id;
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(() => transaction(actor, operation));
  queues.set(key,next);
  next.finally(() => { if (queues.get(key) === next) queues.delete(key); }).catch(() => {});
  return next;
}
const clone = value => foundry.utils.deepClone(value);
const get = (doc,path) => foundry.utils.getProperty(doc._source ?? doc,path);
function restoreField(path, value) {
  if (value !== undefined) return {[path]:clone(value)};
  const parts=path.split('.'), key=parts.pop();
  return {[`${parts.length ? parts.join('.')+'.' : ''}-=${key}`]:null};
}
async function transaction(actor, operation) {
  const undo = [];
  const proxy = new Proxy(actor, {get(target,key) {
    if (key === 'update') return async (changes, options) => {
      const restore={};
      for (const path of Object.keys(changes)) Object.assign(restore,restoreField(path,get(target,path)));
      undo.push(() => target.update(restore));
      return target.update(changes,options);
    };
    if (key === 'createEmbeddedDocuments') return async (type,data,options) => {
      const collection=()=>target.getEmbeddedCollection(type);
      const antes=new Set(collection().map(d=>d.id));
      const criados=new Set();
      undo.push(async()=>{
        // Limit recovery to IDs returned by this call or matching its module tags.
        for(const doc of collection()) if(!antes.has(doc.id) && data.some(d=>d.flags?.[SCOPE]?.skillTree && JSON.stringify(d.flags[SCOPE].skillTree)===JSON.stringify(doc.flags?.[SCOPE]?.skillTree))) criados.add(doc.id);
        const ids=[...criados].filter(id=>collection().has(id));
        if(ids.length) await target.deleteEmbeddedDocuments(type,ids);
      });
      const result=await target.createEmbeddedDocuments(type,data,options);
      result.forEach(d=>criados.add(d.id)); return result;
    };
    if (key === 'deleteEmbeddedDocuments') return async (type,ids,options) => {
      const antes=ids.map(id=>target.getEmbeddedCollection(type).get(id)?.toObject()).filter(Boolean);
      undo.push(async()=>{const missing=antes.filter(d=>!target.getEmbeddedCollection(type).has(d._id)); if(missing.length) await target.createEmbeddedDocuments(type,missing,{keepId:true});});
      return target.deleteEmbeddedDocuments(type,ids,options);
    };
    if (key === 'updateEmbeddedDocuments') return async (type,changes,options) => {
      const antes=changes.map(change=>{const doc=target.getEmbeddedCollection(type).get(change._id); const restore={_id:change._id}; for(const path of Object.keys(change)) if(path!=='_id') Object.assign(restore,restoreField(path,get(doc,path))); return restore;});
      undo.push(()=>target.updateEmbeddedDocuments(type,antes));
      return target.updateEmbeddedDocuments(type,changes,options);
    };
    const value=Reflect.get(target,key,target); return typeof value==='function'?value.bind(target):value;
  }});
  try { return await operation(proxy); }
  catch (error) {
    const failed=[];
    for(const restore of undo.reverse()) try { await restore(); } catch(e) { failed.push(e); }
    if(failed.length) {
      console.error('Árvore da Mesa | recuperação incompleta',error,failed);
      ui.notifications.error(loc("ARVORE.Operacoes.aOperacaoFalhouEARecuperacao"),{permanent:true});
    }
    throw error;
  }
}
