import './env.mjs';
import {get,set} from './env.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SaveQueue } from '../scripts/persistence.js';
import { validateTrees, remapTree } from '../scripts/validation.js';
const V=JSON.parse(fs.readFileSync(new URL('../module.json',import.meta.url))).version;
const {actorOperation}=await import(`../scripts/operations.js?v=${V}`);
const core=await import(`../scripts/core.js?v=${V}`);
const {ArvoreHabilidades}=await import('../scripts/app.js');
let count=0;
async function test(name,fn) { await fn(); console.log('PASS',name);count++; }
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
class Collection extends Map { map(fn){return [...this.values()].map(fn);} filter(fn){return [...this.values()].filter(fn);} find(fn){return [...this.values()].find(fn);} [Symbol.iterator](){return this.values();} }
let serial=0;
function apply(doc,changes){for(const [p,v] of Object.entries(changes)){if(p.includes('-=')){const [base,key]=p.split('-=');const o=base?get(doc,base.slice(0,-1)):doc;if(o)delete o[key];}else set(doc,p,structuredClone(v));}}
function actor(){
 const a={id:`a${++serial}`,isOwner:true,name:'Teste',type:'character',flags:{world:{}},system:{details:{level:1},currency:{gp:20,pp:3},resources:{mana:{value:10}}},items:new Collection(),effects:new Collection()};a.uuid=`Actor.${a.id}`;
 Object.defineProperty(a,'_source',{get:()=>({flags:a.flags,system:a.system})});
 a.getEmbeddedCollection=t=>t==='Item'?a.items:a.effects;
 a.update=async changes=>{if(a.failUpdate){a.failUpdate=false;throw Error('actor update failed');}apply(a,changes);return a;};
 a.createEmbeddedDocuments=async(type,data)=>{
  if(a.failCreate){a.failCreate=false;throw Error('create failed');}
  return data.map(d=>{const source=structuredClone(d);source._id??=`d${++serial}`;const doc={...source,id:source._id,toObject:()=>structuredClone(source)};a.getEmbeddedCollection(type).set(doc.id,doc);return doc;});
 };
 a.deleteEmbeddedDocuments=async(type,ids)=>{for(const id of ids)a.getEmbeddedCollection(type).delete(id);};
 a.updateEmbeddedDocuments=async(type,updates)=>{for(const d of updates)apply(a.getEmbeddedCollection(type).get(d._id),d);};
 a.getActiveTokens=()=>[];
 return a;
}
function tree(){const n=core.newNode(0,0,{name:'Ability',cost:3}); const t=core.newTree('Test');t.resPath='system.resources.mana.value';t.nodes=[n];return{t,n};}
await test('queue keeps latest snapshot and serializes writes',async()=>{const calls=[],gate=defer();const q=new SaveQueue(async v=>{calls.push(v);if(calls.length===1)await gate.promise;});q.stage([1]);const p=q.flush();q.stage([2]);q.stage([3]);assert.equal(calls.length,1);gate.resolve();await p;assert.deepEqual(calls,[[1],[3]]);assert.equal(q.dirty,false);});
await test('failed save remains pending and can retry',async()=>{let fails=true;const q=new SaveQueue(async()=>{if(fails)throw Error('disk');});q.stage([1]);await assert.rejects(q.flush());assert.equal(q.dirty,true);fails=false;await q.flush();assert.equal(q.dirty,false);});
await test('example trees in "Exemplo de Arvores" validate',()=>{const d='Exemplo de Arvores';const files=fs.readdirSync(d).filter(f=>f.endsWith('.json'));assert.ok(files.length>=3);for(const f of files)validateTrees(JSON.parse(fs.readFileSync(`${d}/${f}`)));});
await test('invalid IDs, cycles and drawing coordinates rejected',()=>{const {t,n}=tree();t.nodes.push({...n});assert.throws(()=>validateTrees(t));t.nodes.pop();t.edges=[{from:n.id,to:n.id}];assert.throws(()=>validateTrees(t));t.edges=[];t.drawings=[{id:'ok',type:'path',points:[['" onload="x',0]]}];assert.throws(()=>validateTrees(t));});
await test('copy remaps internal requirements and preserves external links',()=>{const {t,n}=tree();n.reqNodes=[{tree:t.id,node:n.id},{tree:'external',node:'other'}];const copy=remapTree(t,'new',new Map([[n.id,'newNode']]));assert.deepEqual(copy.nodes[0].reqNodes,[{tree:'new',node:'newNode'},{tree:'external',node:'other'}]);assert.equal(t.nodes[0].id,n.id);});
await test('old potion trees become ordinary point trees, keep IDs, section and progress data',()=>{const {t,n}=tree();t.mode='sequence';t.sanPath='x';t.acting=[{name:'a',value:5}];n.seq='9';n.ingredients=[{name:'erva'}];n.digestReq=50;const id=t.id;
 const m=core.normalizeTree(structuredClone(t));assert.equal(m.id,id);assert.equal(m.mode,'skill');assert.equal(m.rules,'custom');assert.equal(core.catOf(m),'sequences');assert.equal(m.resPath,'@tree');assert.equal(m.resources[0].kind,'counter');
 assert(!('sanPath' in m));assert(!('acting' in m));assert(!('seq' in m.nodes[0]));assert(!('ingredients' in m.nodes[0]));assert.equal(m.nodes[0].id,n.id);
 t.section='custom';assert.equal(core.catOf(core.normalizeTree(structuredClone(t))),'custom');});
await test('purchase failure restores points and progress',async()=>{const a=actor(),{t,n}=tree();n.items=['Item.missing'];globalThis.fromUuid=async()=>null;const before=structuredClone(a._source);await assert.rejects(core.doUnlock(a,t,n,{quiet:true}));assert.deepEqual(a.system,before.system);assert.equal(core.rankOf(a,t,n),0);assert.deepEqual(core.unlockedOf(a,t),[]);assert.deepEqual(core.logOf(a),[]);assert.equal(a.items.size,0);
 const b=actor();n.items=['Item.source'];n.changes=[{key:'system.abilities.str.value',type:'add',value:'1'}];
 globalThis.fromUuid=async()=>({toObject:()=>({name:'Granted',type:'feat'})});
 const create=b.createEmbeddedDocuments;b.createEmbeddedDocuments=async(type,data,options)=>{if(type==='ActiveEffect')throw Error('effect failed after item creation');return create(type,data,options);};
 await assert.rejects(core.doUnlock(b,t,n,{quiet:true}));assert.equal(b.items.size,0);assert.equal(b.system.resources.mana.value,10);assert.equal(core.rankOf(b,t,n),0);
 globalThis.fromUuid=async()=>null;
});
await test('successful purchase and refund preserve formulas',async()=>{const a=actor(),{t,n}=tree();assert.equal(await core.doUnlock(a,t,n,{quiet:true}),true);assert.equal(a.system.resources.mana.value,7);assert.equal(core.rankOf(a,t,n),1);assert.equal(await core.doRefund(a,t,n,{quiet:true}),true);assert.equal(a.system.resources.mana.value,10);assert.equal(core.rankOf(a,t,n),0);});
await test('same-client simultaneous purchases charge once at max rank',async()=>{const a=actor(),{t,n}=tree();await Promise.all([core.doUnlock(a,t,n,{quiet:true}),core.doUnlock(a,t,n,{quiet:true})]);assert.equal(a.system.resources.mana.value,7);assert.equal(core.rankOf(a,t,n),1);});
await test('refund failure restores removed embedded item and rank',async()=>{const a=actor(),{t,n}=tree();await core.doUnlock(a,t,n,{quiet:true});await a.createEmbeddedDocuments('Item',[{_id:'owned',name:'Granted',flags:{world:{skillTree:{tree:t.id,node:n.id}}}}]);a.failUpdate=true;await assert.rejects(core.doRefund(a,t,n,{quiet:true}));assert(a.items.has('owned'));assert.equal(core.rankOf(a,t,n),1);assert.equal(a.system.resources.mana.value,7);});
await test('failed training completion retains payment and training',async()=>{const a=actor(),{t,n}=tree();n.trainDays=1;n.items=['Item.missing'];await core.doUnlock(a,t,n,{quiet:true});const before=structuredClone(a._source);game.settings.get=(mod,key)=>key==='trees'?{list:[t]}:undefined;core.invalidateTrees();await assert.rejects(core.advanceTraining(a));assert.deepEqual(a.system,before.system);assert.deepEqual(core.trainingOf(a),before.flags.world.skillTraining);assert.deepEqual(core.logOf(a),before.flags.world.skillLog);assert.equal(core.rankOf(a,t,n),0);game.settings.get=()=>undefined;core.invalidateTrees();});
await test('player cannot grant free skills or bypass approval',async()=>{const a=actor(),{t,n}=tree();t.assigned=[a.id];game.user.isGM=false;await assert.rejects(core.doUnlock(a,t,n,{free:true}));t.approval=true;await assert.rejects(core.doUnlock(a,t,n));game.user.isGM=true;});
await test('closing waits for pending save before cleanup',async()=>{const gate=defer(),events=[];const app=Object.create(ArvoreHabilidades.prototype);app.trees=[];app._hooks=[];app._writer=new SaveQueue(async()=>{events.push('write');await gate.promise;events.push('saved');});app._writer.stage([]);const close=app.close();await Promise.resolve();assert.deepEqual(events,['write']);gate.resolve();await close;assert.equal(app._writer.dirty,false);});
await test('failed close leaves editor data available',async()=>{const app=Object.create(ArvoreHabilidades.prototype);app.trees=[{id:'preserve'}];app._writer=new SaveQueue(async()=>{throw Error('offline');});app._writer.stage(app.trees);assert.equal(await app.close(),app);assert.equal(app._writer.dirty,true);assert.equal(app.trees[0].id,'preserve');});
await test('SVG text and path data cannot inject attributes',()=>{const p=ArvoreHabilidades.prototype;const svg=p.drawingSVG({id:'x" onload="evil',type:'path',points:[['"/><script>evil</script>',0]],color:'red'});assert(!svg.includes('<script>'));assert(svg.includes('&quot;'));});
await test('pointer completion forwards the event and removes every listener',()=>{
 const listeners=new Map();window.addEventListener=(k,v)=>listeners.set(k,v);window.removeEventListener=(k,v)=>{if(listeners.get(k)===v)listeners.delete(k);};
 const app=Object.create(ArvoreHabilidades.prototype);let received;
 app.bindPointer(()=>{},e=>received=e);const event={type:'pointerup',ctrlKey:true};listeners.get('pointerup')(event);assert.equal(received,event);assert.equal(listeners.size,0);
 app.bindPointer(()=>{},()=>{});app.endPointerInteraction();assert.equal(listeners.size,0);
});
await test('new UI renders custom sections and no bundled preset buttons',async()=>{
 core.ST.catalog={};const {t}=tree();t.nodes=[];
 const settings={trees:{list:[t]},sections:{list:[{id:'fantasy',name:'Minha seção'}]}};
 game.settings.get=(m,k)=>settings[k];game.settings.set=async(m,k,v)=>settings[k]=v;
 const app=new ArvoreHabilidades();core.ST.app=app;app.mode='edit';
 const html=await app._renderHTML();assert(html.includes('Minha seção'));assert(html.includes('data-act="addSection"'));assert(!html.includes('data-act="presets"'));assert(!html.includes('data-cat="lotd"'));
 app.tree.name='Alterada';app.save();await app.flushSave();assert.equal(settings.trees.list[0].name,'Alterada');app.undo();await app.flushSave();assert.equal(settings.trees.list[0].name,'Test');app.redo();await app.flushSave();assert.equal(settings.trees.list[0].name,'Alterada');
 await app.close();core.ST.app=null;game.settings.get=()=>undefined;core.invalidateTrees();
});
await test('renaming imported node with stable ID preserves rank references',async()=>{
 const {t,n}=tree();const settings={trees:{list:[t]}};game.settings.get=(m,k)=>settings[k];game.settings.set=async(m,k,v)=>settings[k]=v;
 const app=new ArvoreHabilidades();const replacement=structuredClone(t);replacement.nodes[0].name='Renamed';await app.replaceTree(app.trees[0],replacement);
 assert.equal(app.trees[0].nodes[0].id,n.id);assert.equal(app.trees[0].nodes[0].name,'Renamed');assert.equal(app.undoStack.length,0);
 await app.close();game.settings.get=()=>undefined;core.invalidateTrees();
});
await test('section creation and rename persist without changing tree identities',async()=>{
 const {t}=tree();const settings={trees:{list:[t]},sections:{list:[{id:'fantasy',name:'Fantasia'}]}};
 game.settings.get=(m,k)=>settings[k];game.settings.set=async(m,k,v)=>settings[k]=v;
 const app=new ArvoreHabilidades();foundry.applications.api.DialogV2.prompt=async()=> 'Inimigos';await app.sectionDialog();const id=app.category;
 assert.equal(settings.sections.list.find(c=>c.id===id).name,'Inimigos');assert.equal(settings.trees.list[0].id,t.id);
 foundry.applications.api.DialogV2.prompt=async()=> 'Aliados';await app.sectionDialog(true);assert.equal(settings.sections.list.find(c=>c.id===id).name,'Aliados');
 await app.close();game.settings.get=()=>undefined;core.invalidateTrees();
});
await test('stale editor cannot overwrite a changed world setting',async()=>{
 const {t}=tree();const settings={trees:{list:[t]}};game.settings.get=(m,k)=>settings[k];game.settings.set=async(m,k,v)=>settings[k]=v;
 const app=new ArvoreHabilidades();app.trees[0].name='Local edit';app.save();settings.trees={list:[{...t,name:'Remote edit'}]};
 const log=console.error;console.error=()=>{};try {await assert.rejects(app.flushSave());} finally {console.error=log;}
 assert.equal(settings.trees.list[0].name,'Remote edit');assert.equal(app.trees[0].name,'Local edit');assert.equal(app._writer.dirty,true);
 game.settings.get=()=>undefined;core.invalidateTrees();
});
await test('bulk preview rounds each paid rank as individual refund does',()=>{
 const a=actor(),{t,n}=tree();n.ranks=2;t.refundPct=50;
 set(a,core.K_UNLOCK(t.id),[n.id]);set(a,core.K_RANKS(t.id),[{id:n.id,r:2,paid:[1,1],paidX:[{gp:1},{gp:1}]}]);
 const app=Object.create(ArvoreHabilidades.prototype);app.refundSel=new Set([n.id]);const calc=app.refundCalc(a,t);
 assert.equal(calc.back.res,0);assert.equal(calc.back.gp,0);
});
await test('refund cannot break explicit cross-tree prerequisites',async()=>{
 const a=actor(),{t,n}=tree(),other=tree();n.ranks=2;other.n.reqNodes=[{tree:t.id,node:n.id,rank:2}];
 set(a,core.K_UNLOCK(t.id),[n.id]);set(a,core.K_RANKS(t.id),[{id:n.id,r:2,paid:[3,3]}]);set(a,core.K_UNLOCK(other.t.id),[other.n.id]);
 game.settings.get=(m,k)=>k==='trees'?{list:[t,other.t]}:undefined;core.invalidateTrees();
 assert.equal(await core.doRefund(a,t,n,{quiet:true}),false);assert.equal(core.rankOf(a,t,n),2);
 game.settings.get=()=>undefined;core.invalidateTrees();
});
await test('deleting a section moves or deletes its trees after confirmation',async()=>{
 const t1=tree().t,t2=tree().t;t1.section='s1';t2.section='fantasy';
 const settings={trees:{list:[t1,t2]},sections:{list:[{id:'fantasy',name:'Fantasia'},{id:'s1',name:'Nova'}]}};
 game.settings.get=(m,k)=>settings[k];game.settings.set=async(m,k,v)=>settings[k]=v;core.invalidateTrees();
 const D=foundry.applications.api.DialogV2;const app=new ArvoreHabilidades();app.category='s1';
 D.prompt=async()=>({what:'move',target:'fantasy'});D.confirm=async()=>false;
 await app.deleteSectionDialog();assert.equal(settings.sections.list.length,2);assert.equal(core.catOf(app.trees[0]),'s1');
 D.confirm=async()=>true;await app.deleteSectionDialog();await app.flushSave();
 assert.deepEqual(settings.sections.list.map(c=>c.id),['fantasy']);assert.equal(settings.trees.list.length,2);
 assert(settings.trees.list.every(t=>core.catOf(t)==='fantasy'));assert.equal(app.category,'fantasy');
 settings.sections.list.push({id:'s2',name:'Outra'});app.trees[0].section='s2';app.save();await app.flushSave();app.category='s2';
 D.prompt=async()=>({what:'delete',target:'fantasy'});await app.deleteSectionDialog();await app.flushSave();
 assert.equal(settings.trees.list.length,1);assert(!settings.sections.list.some(c=>c.id==='s2'));
 app.undo();await app.flushSave();assert.equal(app.sections().find(c=>c.id==='s2')?.name,'Outra');
 app.redo();await app.flushSave();app.category='fantasy';
 await app.deleteSectionDialog();assert.equal(settings.sections.list.length,1);
 await app.close();game.settings.get=()=>undefined;core.invalidateTrees();
});
await test('zerar árvores asks first, wipes trees and sections and cleans character sheets',async()=>{
 const a=actor(),{t,n}=tree();t.assigned=[a.id];
 const settings={trees:{list:[t]},sections:{list:[{id:'fantasy',name:'Fantasia'},{id:'x',name:'X'}]}};
 game.settings.get=(m,k)=>settings[k];game.settings.set=async(m,k,v)=>settings[k]=v;core.invalidateTrees();
 assert.equal(await core.doUnlock(a,t,n,{quiet:true}),true);assert.equal(core.rankOf(a,t,n),1);game.actors.push(a);
 const D=foundry.applications.api.DialogV2;const app=new ArvoreHabilidades();
 D.wait=async()=>'no';await app.resetAllDialog();assert.equal(settings.trees.list.length,1);
 D.wait=async()=>({sections:true});await app.resetAllDialog();
 assert.equal(settings.trees.list.length,0);assert.deepEqual(settings.sections.list,[{id:'fantasy',name:'Fantasia'}]);
 assert.deepEqual(core.unlockedOf(a,t),[]);assert.equal(core.rankOf(a,t,n),0);assert.equal(app.undoStack.length,0);
 const html=await app._renderHTML();assert(html.includes('nenhuma Skill Tree'));
 const again=new ArvoreHabilidades();assert.equal(again.trees.length,0);
 await again.close();await app.close();game.actors.length=0;game.settings.get=()=>undefined;core.invalidateTrees();
});
await test('gold resource also spends platinum, gives change in gold and refunds to gold',async()=>{
 const a=actor(),{t,n}=tree();t.resPath='@coins';t.rules='dnd';n.cost=40;a.system.currency={gp:3,pp:5};
 assert.equal(core.resOf(a,t),53);assert.equal(await core.doUnlock(a,t,n,{quiet:true}),true);
 assert.equal(a.system.currency.pp,1);assert.equal(a.system.currency.gp,3);assert.equal(core.resOf(a,t),13);
 assert.equal(await core.doRefund(a,t,n,{quiet:true}),true);assert.equal(a.system.currency.gp,43);assert.equal(core.resOf(a,t),53);
});
await test('extra gold cost and gold resource are both charged',async()=>{
 const a=actor(),{t,n}=tree();t.resPath='@coins';n.cost=3;n.costGp=5;a.system.currency={gp:20,pp:0};
 assert.equal(await core.doUnlock(a,t,n,{quiet:true}),true);assert.equal(a.system.currency.gp,12);
 const b=actor(),x=tree();x.t.resPath='@coins';x.n.cost=3;x.n.costGp=5;b.system.currency={gp:6,pp:0};
 assert.equal(await core.doUnlock(b,x.t,x.n,{quiet:true}),false);assert.equal(b.system.currency.gp,6);
});
await test('old trees migrate: gold becomes Ouro, platinum and potions become Personalizado',()=>{
 const g=core.normalizeTree({...core.newTree('g'),resPath:'system.currency.gp',resLabel:'PO',rules:undefined});
 assert.equal(g.resPath,'@coins');assert.equal(g.resLabel,'Ouro');assert.equal(g.rules,'dnd');
 const p=core.normalizeTree({...core.newTree('p'),resPath:'system.currency.pp',resLabel:'PL',rules:undefined});
 assert.equal(p.rules,'custom');assert.equal(p.resPath,'system.currency.pp');assert.equal(p.resLabel,'PL');
 const s=core.normalizeTree({...core.newTree('s'),mode:'sequence',rules:undefined});assert.equal(s.rules,'custom');assert.equal(s.mode,'skill');
 const x=core.normalizeTree({...core.newTree('x'),resPath:'@skill',resLabel:'qualquer'});assert.equal(x.resLabel,'Pontos de Habilidade');
 assert(!core.resPresets().some(r=>r.value==='system.currency.pp'));
});
function fakeForm(v){const el={};for(const [k,val] of Object.entries(v))el[k]=typeof val==='boolean'?{checked:val,value:''}:{value:String(val)};return{form:{elements:el}};}
function cfgForm(over={},rows=[]){const f=fakeForm({name:'Nova',section:'fantasy',desc:'',rules:'dnd',resDnd:'@skill',useCoins:true,refundPlayer:true,refundPct:100,approval:false,costInc:0,linkStyle:'curve',snap:10,bg:'',bgOpacity:0.35,sound:'',lockKind:'',lockFeat:'',lockItem:'',lockHide:false,...over});
 f.form.querySelectorAll=()=>rows.map(r=>({dataset:{id:r.id??''},querySelector:sel=>{const k=sel.match(/data-k="(\w+)"/)[1];return {value:r[k]??''};}}));return f;}
await test('tree settings: preset names are automatic; Personalizado has its own resources and field names',async()=>{
 const {t}=tree();t.resPath='@skill';t.rules='dnd';const settings={trees:{list:[t]}};
 game.settings.get=(m,k)=>settings[k];game.settings.set=async(m,k,v)=>settings[k]=v;core.invalidateTrees();
 const D=foundry.applications.api.DialogV2;const app=new ArvoreHabilidades();app.treeId=t.id;
 D.prompt=async o=>o.ok.callback(null,cfgForm({resDnd:'@coins'}));await app.treeConfig();
 assert.equal(app.tree.resPath,'@coins');assert.equal(app.tree.resLabel,'Ouro');assert.equal(app.tree.mode,'skill');
 D.prompt=async o=>o.ok.callback(null,cfgForm({resDnd:'system.details.xp.value'}));await app.treeConfig();assert.equal(app.tree.resLabel,'XP');
 D.prompt=async o=>o.ok.callback(null,cfgForm({rules:'custom','lbl-cost':'Preço','lbl-gp':'Moedas de ouro',useCoins:false},[{id:'k1',name:'Pontos de Ki',kind:'field',path:'system.resources.primary.value'},{id:'a1',name:'Fragmentos de Alma',kind:'counter'}]));await app.treeConfig();
 const T=app.tree;assert.equal(T.rules,'custom');assert.equal(T.resPath,'system.resources.primary.value');assert.equal(T.resLabel,'Pontos de Ki');
 assert.equal(T.resources.length,2);assert.equal(core.extraRes(T)[0].name,'Fragmentos de Alma');assert.equal(core.labelsOf(T).cost,'Preço');assert.equal(core.labelsOf(T).ranks,'Níveis');assert.equal(core.coinsOn(T),false);
 D.prompt=async o=>o.ok.callback(null,cfgForm({rules:'custom'},[{id:'f1',name:'Fé',kind:'field',path:''}]));await app.treeConfig();assert.equal(app.tree.resPath,'@tree');assert.equal(app.tree.resources[0].kind,'counter');
 D.prompt=async o=>o.ok.callback(null,cfgForm({rules:'dnd'}));await app.treeConfig();assert.equal(app.tree.rules,'dnd');assert.equal(app.tree.resources.length,0);
 await app.flushSave();assert.equal(settings.trees.list[0].rules,'dnd');
 await app.close();game.settings.get=()=>undefined;core.invalidateTrees();
});
await test('extra resources are charged, refunded and returned for deleted trees',async()=>{
 const a=actor(),{t,n}=tree();t.rules='custom';t.resources=[{id:'p',name:'Pontos',kind:'field',path:'system.resources.mana.value'},{id:'x',name:'Almas',kind:'counter'}];core.normalizeTree(t);
 n.extra={x:2};const ap=core.resPath(t,t.resources[1]);a.flags.world.stRes={[t.id]:{x:5}};
 assert.equal(core.nodeState(a,t,n).canBuy,true);assert.equal(await core.doUnlock(a,t,n,{quiet:true}),true);
 assert.equal(core.getProp(a,ap),3);assert.equal(a.system.resources.mana.value,7);
 assert.equal(await core.doRefund(a,t,n,{quiet:true}),true);assert.equal(core.getProp(a,ap),5);
 a.flags.world.stRes[t.id].x=1;assert.equal(core.nodeState(a,t,n).canBuy,false);
 a.flags.world.stRes[t.id].x=5;await core.doUnlock(a,t,n,{quiet:true});
 const r=core.orphanScan(a,[]);assert.equal(r.ex[ap],2);
});
await test('general settings open without trees and the toolbar offers them',async()=>{
 const settings={trees:{list:[]}};game.settings.get=(m,k)=>settings[k];game.settings.set=async(m,k,v)=>settings[k]=v;core.invalidateTrees();
 const D=foundry.applications.api.DialogV2;const app=new ArvoreHabilidades();app.mode='edit';
 const html=await app._renderHTML();assert(html.includes('data-act="generalCfg"'));assert(!html.includes('data-act="treeCfg"'));
 let opened=false;D.prompt=async o=>{opened=true;assert(o.content.includes('data-reset'));assert(o.content.includes('data-export'));return o.ok.callback(null,fakeForm({ptsPerLevel:2,maxLevel:20,levelNotice:false,availNotice:true,sheetButton:true,sheetTab:true,defaultSound:'x.wav'}));};
 await app.generalConfig();assert(opened);assert.equal(settings.ptsPerLevel,2);assert.equal(settings.maxLevel,20);
 await app.close();game.settings.get=()=>undefined;core.reloadCfg();core.invalidateTrees();
});
await test('deleting the last tree leaves a pending cleanup that closing resolves',async()=>{
 const {t}=tree();const settings={trees:{list:[t]}};game.settings.get=(m,k)=>settings[k];game.settings.set=async(m,k,v)=>settings[k]=v;core.invalidateTrees();
 const app=new ArvoreHabilidades();app.trees=[];app.save();await app.flushSave();assert.equal(settings.pendingCleanup,true);
 await app.close();assert.equal(settings.pendingCleanup,false);game.settings.get=()=>undefined;core.invalidateTrees();
});
await test('export all writes every tree in one importable file and backup runs before zerar',async()=>{
 const t1=tree().t,t2=tree().t;t1.section='s1';const settings={trees:{list:[t1,t2]}};
 game.settings.get=(m,k)=>settings[k];game.settings.set=async(m,k,v)=>settings[k]=v;core.invalidateTrees();
 let saved=null;globalThis.__saveHook=d=>{saved=d;};globalThis.fromUuid=async()=>null;
 const app=new ArvoreHabilidades();assert.equal(await app.exportAll(),true);
 const list=JSON.parse(saved);assert.equal(list.length,2);validateTrees(list);assert.equal(list[0].section,'s1');
 saved=null;foundry.applications.api.DialogV2.wait=async()=>({sections:false,backup:true});await app.resetAllDialog();
 assert.equal(JSON.parse(saved).length,2);assert.equal(settings.trees.list.length,0);
 await app.close();globalThis.__saveHook=null;game.settings.get=()=>undefined;core.invalidateTrees();
});
await test('feats belong to their tree, unlock locked trees and can be revoked',async()=>{
 const A=tree(),B=tree(),C=tree();A.t.name='Origem';A.t.feats=[{id:'f1',name:'Matou o Dragão',pts:2,desc:''}];C.t.feats=[{id:'f2',name:'Outro feito',pts:1}];
 B.t.lockKind='feat';B.t.lockFeat='f1';B.t.lockHide=true;
 const a=actor();A.t.assigned=B.t.assigned=C.t.assigned=[a.id];game.actors.push(a);
 const settings={trees:{list:[A.t,B.t,C.t]}};game.settings.get=(m,k)=>settings[k];game.settings.set=async(m,k,v)=>settings[k]=v;core.invalidateTrees();core.ST.catalog={};
 assert.equal(core.treeLock(a,B.t),'Grande Feito: Matou o Dragão');
 const st=core.nodeState(a,B.t,B.n);assert.equal(st.canBuy,false);assert(st.reasons.some(r=>r.includes('Matou o Dragão')));
 assert.equal(core.playerSees(B.t,a),false);assert.equal(core.playerSees(A.t,a),true);
 assert.equal(await core.doUnlock(a,B.t,B.n,{quiet:true}),false);
 const app=new ArvoreHabilidades();app.actorId=a.id;app.treeId=A.t.id;
 const html=app.featsHTML(a,app.tree);assert(html.includes('Matou o Dragão'));assert(!html.includes('Outro feito'));assert(html.includes('Libera: Test'));
 const given=await app.grantFeat([a.id],app.tree.feats[0]);assert.equal(given.length,1);
 assert.equal(core.mythicOf(a),2);assert(core.hasFeat(a,'f1'));assert(core.milestonesOf(a).includes('Matou o Dragão'));
 assert.equal(core.treeLock(a,B.t),null);assert.equal(core.playerSees(B.t,a),true);assert.equal(core.nodeState(a,B.t,B.n).canBuy,true);
 assert.equal((await app.grantFeat([a.id],app.tree.feats[0])).length,0);assert.equal(core.mythicOf(a),2);
 foundry.applications.api.DialogV2.confirm=async()=>true;await app.revokeFeat(a,'f1');
 assert.equal(core.mythicOf(a),0);assert(!core.hasFeat(a,'f1'));assert(core.treeLock(a,B.t));assert(!core.milestonesOf(a).includes('Matou o Dragão'));
 await app.close();game.actors.length=0;game.settings.get=()=>undefined;core.invalidateTrees();
});
await test('item locks, feat editing, deletion clears locks and linked feats are never trimmed',async()=>{
 const A=tree(),B=tree();B.t.lockKind='item';B.t.lockItem='Tomo Antigo';
 const a=actor();assert(core.treeLock(a,B.t));
 await a.createEmbeddedDocuments('Item',[{name:'Tomo antigo',system:{quantity:1}}]);assert.equal(core.treeLock(a,B.t),null);
 const settings={trees:{list:[A.t,B.t]}};game.settings.get=(m,k)=>settings[k];game.settings.set=async(m,k,v)=>settings[k]=v;core.invalidateTrees();
 const D=foundry.applications.api.DialogV2;const app=new ArvoreHabilidades();app.treeId=A.t.id;
 D.prompt=async o=>o.ok.callback(null,{form:{elements:{name:{value:'Salvou o reino'},pts:{value:'3'},desc:{value:'x'}}}});await app.editFeat(null);
 const f=app.tree.feats[0];assert.equal(f.name,'Salvou o reino');assert.equal(f.pts,3);
 app.trees[1].lockKind='feat';app.trees[1].lockFeat=f.id;D.confirm=async()=>true;await app.deleteFeat(f.id);
 assert.equal(app.tree.feats.length,0);assert.equal(app.trees[1].lockKind,'');
 const list=[{feat:'keep',text:'k'},...Array.from({length:80},(_, i)=>({text:'r'+i}))];const out=core.trimFeats(list);
 assert(out.some(x=>x.feat==='keep'));assert.equal(out.filter(x=>!x.feat).length,50);
 const norm=core.normalizeTree({...core.newTree('n'),feats:[{name:'',pts:'x'}],lockKind:'weird'});assert.equal(norm.feats[0].name,'Grande Feito');assert(norm.feats[0].id);assert.equal(norm.lockKind,'');
 await app.close();game.settings.get=()=>undefined;core.invalidateTrees();
});
await test('tree settings save the lock options',async()=>{
 const A=tree(),B=tree();A.t.feats=[{id:'fx',name:'Feito X',pts:1}];const settings={trees:{list:[A.t,B.t]}};
 game.settings.get=(m,k)=>settings[k];game.settings.set=async(m,k,v)=>settings[k]=v;core.invalidateTrees();
 const D=foundry.applications.api.DialogV2;const app=new ArvoreHabilidades();app.treeId=B.t.id;
 let content='';D.prompt=async o=>{content=o.content;return o.ok.callback(null,cfgForm({lockKind:'feat',lockFeat:'fx',lockItem:'',lockHide:true}));};
 await app.treeConfig();assert(content.includes('Feito X'));assert.equal(app.tree.lockKind,'feat');assert.equal(app.tree.lockFeat,'fx');assert.equal(app.tree.lockHide,true);
 D.prompt=async o=>o.ok.callback(null,cfgForm({lockKind:'feat',lockFeat:'',lockItem:'',lockHide:false}));await app.treeConfig();assert.equal(app.tree.lockKind,'');
 await app.close();game.settings.get=()=>undefined;core.invalidateTrees();
});
await test('english: every screen keeps the same HTML structure and user names are never translated',async()=>{
 const i18n=await import(`../scripts/i18n.js?v=${V}`);
 const A=tree(),B=tree();A.t.name='Escudo de Luz';A.t.desc='Nível de proteção';A.t.feats=[{id:'f1',name:'Salvou o reino',pts:2}];B.t.lockKind='feat';B.t.lockFeat='f1';
 A.n.name='Nova habilidade';A.n.ranks=2;A.n.features=[core.featureDefaults()];core.normalizeTree(A.t);
 const a=actor();A.t.assigned=[a.id];game.actors.push(a);
 const settings={trees:{list:[A.t,B.t]}};game.settings.get=(m,k)=>settings[k];game.settings.set=async(m,k,v)=>settings[k]=v;core.invalidateTrees();core.ST.catalog={classes:[],races:[]};
 globalThis.fromUuidSync=()=>null;globalThis.TextEditor={};core.TE.enrichHTML=async s=>s;
 const D=foundry.applications.api.DialogV2;const grab=[];D.prompt=async o=>{grab.push(o.content);return null;};D.wait=async o=>{grab.push(o.content);return null;};D.confirm=async o=>{grab.push(o.content);return false;};
 const shots=async()=>{grab.length=0;const app=new ArvoreHabilidades();app.actorId=a.id;app.treeId=A.t.id;const out=[];
  out.push(await app._renderHTML());app.sel=A.n.id;out.push(await app._renderHTML());app.mode='edit';out.push(await app._renderHTML());app.sel=null;out.push(await app._renderHTML());
  await app.treeConfig();await app.generalConfig();await app.featDialog();await app.editFeat('f1');await app.resetAllDialog();await app.themeDialog().catch(()=>{});
  await app.close();return [...out,...grab];};
 i18n.setLang('pt-BR');const pt=await shots();i18n.setLang('en');const en=await shots();i18n.setLang(null);
 const tags=h=>(h.match(/<\/?[a-zA-Z][^>]*>/g)||[]).map(t=>t.replace(/="[^"]*"/g,'=""'));
 assert.equal(pt.length,en.length);
 for(let i=0;i<pt.length;i++){assert.deepEqual(tags(en[i]),tags(pt[i]),'markup changed in screen '+i);}
 const all=en.join('');assert(all.includes('Escudo de Luz'));assert(all.includes('Nível de proteção'));assert(all.includes('Salvou o reino'));
 assert(all.includes('Play Mode')||all.includes('Edit'));assert(all.includes('Costs and rules'));assert(all.includes('Reset Trees'));assert(all.includes('Great Deed'));
 assert(!/Configurações gerais|Custos e regras|Zerar Árvores|Tem certeza/.test(all),'portuguese left in english');
 await core.normalizeTree(A.t);game.actors.length=0;game.settings.get=()=>undefined;core.invalidateTrees();
});
await test('available-ability notice: tells owners only about new purchasable abilities',async()=>{
 const a=actor(),{t,n}=tree();t.rules='custom';t.assigned=[a.id];const n2=core.newNode(1,1,{name:'Second',cost:20});t.nodes.push(n2);
 const settings={trees:{list:[t]}};game.settings.get=(m,k)=>settings[k];core.invalidateTrees();
 const msgs=[];const old=ChatMessage.create;ChatMessage.create=async m=>{msgs.push(m);};a.testUserPermission=()=>true;
 assert.deepEqual(await core.checkAvailable(a),[]);assert.equal(msgs.length,0);assert.equal(core.getProp(a,'flags.world.skillAvail').length,1);
 a.system.resources.mana.value=30;const fresh=await core.checkAvailable(a);assert.equal(fresh.length,1);assert.equal(msgs.length,1);assert(msgs[0].content.includes('Second'));
 assert.deepEqual(await core.checkAvailable(a),[]);assert.equal(msgs.length,1);
 a.system.resources.mana.value=0;await core.checkAvailable(a);a.system.resources.mana.value=30;await core.checkAvailable(a,{quiet:true});assert.equal(msgs.length,1);
 ChatMessage.create=old;game.settings.get=()=>undefined;core.invalidateTrees();
});
await test('temporary abilities end after long rests or on a date; event locks by level, class and date',async()=>{
 const a=actor(),{t,n}=tree();t.rules='custom';t.assigned=[a.id];game.time={worldTime:0};
 const settings={trees:{list:[t]}};game.settings.get=(m,k)=>settings[k];core.invalidateTrees();
 assert.equal(await core.grantTemp(a,t,n,{kind:'rests',left:2}),true);assert.equal(core.rankOf(a,t,n),1);assert.equal(a.system.resources.mana.value,10);
 await core.tickTemps(a,{rest:true});assert.equal(core.rankOf(a,t,n),1);assert.equal(core.tempsOf(a)[0].left,1);
 await core.tickTemps(a,{rest:true});assert.equal(core.rankOf(a,t,n),0);assert.equal(core.tempsOf(a).length,0);
 await core.grantTemp(a,t,n,{kind:'date',until:3});await core.tickTemps(a);assert.equal(core.rankOf(a,t,n),1);
 game.time.worldTime=86400*3;assert.equal(core.today(),3);await core.tickTemps(a);assert.equal(core.rankOf(a,t,n),0);
 await core.grantTemp(a,t,n,{kind:'rests',left:1});const e=core.tempsOf(a)[0];await core.endTemp(a,e.id,{keep:true});await core.tickTemps(a,{rest:true});assert.equal(core.rankOf(a,t,n),1);
 const B=tree().t;B.lockKind='level';B.lockLevel=3;assert(core.treeLock(a,B));a.system.details.level=3;assert.equal(core.treeLock(a,B),null);
 B.lockKind='class';B.lockClass='Mago';B.lockClassLevel=2;assert(core.treeLock(a,B));
 await a.createEmbeddedDocuments('Item',[{type:'class',name:'Mago',system:{identifier:'mago',levels:2}}]);assert.equal(core.treeLock(a,B),null);
 B.lockKind='date';B.lockDate=10;assert(core.treeLock(a,B));game.time.worldTime=86400*10;assert.equal(core.treeLock(a,B),null);
 const C=tree();C.n.reqDate=20;assert.equal(core.nodeState(a,C.t,C.n).canBuy,false);game.time.worldTime=86400*20;assert.equal(core.nodeState(a,C.t,C.n).canBuy,true);
 const norm=core.normalizeTree({...core.newTree('x'),lockKind:'date',lockDate:'7'});assert.equal(norm.lockDate,7);
 delete game.time;game.settings.get=()=>undefined;core.invalidateTrees();
});
await test('GM undo restores points, progress and removes what the action created',async()=>{
 const a=actor(),{t,n}=tree();t.rules='custom';t.assigned=[a.id];game.actors.push(a);
 n.items=[];const settings={trees:{list:[t]}};game.settings.get=(m,k)=>settings[k];game.settings.set=async(m,k,v)=>settings[k]=v;core.invalidateTrees();
 const D=foundry.applications.api.DialogV2;D.confirm=async()=>true;
 const app=new ArvoreHabilidades();app.actorId=a.id;app.treeId=t.id;
 a.flags.world.other='keep';
 await app.gmRecord('teste',[a],async()=>{await core.doUnlock(a,t,n,{free:true,quiet:true});await a.update({'system.resources.mana.value':99,'flags.world.skillPoints.bonus':5});await a.createEmbeddedDocuments('Item',[{name:'Granted',flags:{world:{skillTree:{tree:t.id,node:n.id}}}}]);});
 assert.equal(core.rankOf(a,t,n),1);assert.equal(settings.gmUndo.list.length,1);assert(app.undoHTML().includes('teste'));
 await app.undoEntry(settings.gmUndo.list[0].id);
 assert.equal(core.rankOf(a,t,n),0);assert.equal(a.system.resources.mana.value,10);assert.equal(core.getProp(a,'flags.world.skillPoints.bonus'),undefined);
 assert.equal(a.items.size,0);assert.equal(a.flags.world.other,'keep');assert.equal(settings.gmUndo.list.length,0);
 await app.gmRecord('nada',[a],async()=>false);assert.equal(settings.gmUndo.list.length,0);
 await app.close();game.actors.length=0;game.settings.get=()=>undefined;core.invalidateTrees();
});
await test('shared abilities: editing one copy updates the others, keeps position and links separate',async()=>{
 const A=tree(),B=tree();A.n.name='Ataque Extra';A.n.shared='sh1';B.n.shared='sh1';B.n.x=500;B.n.reqNodes=[{tree:'zz',node:'q'}];
 const settings={trees:{list:[A.t,B.t]}};game.settings.get=(m,k)=>settings[k];game.settings.set=async(m,k,v)=>settings[k]=v;core.invalidateTrees();core.ST.catalog={classes:[],races:[]};
 const app=new ArvoreHabilidades();app.mode='edit';app.treeId=A.t.id;app.sel=A.n.id;
 app.tree.nodes[0].cost=9;app.tree.nodes[0].desc='novo texto';app.save();await app.flushSave();
 const b=settings.trees.list[1].nodes[0];assert.equal(b.cost,9);assert.equal(b.desc,'novo texto');assert.equal(b.name,'Ataque Extra');assert.equal(b.x,500);assert.equal(b.reqNodes.length,1);
 assert.equal(core.sharedCopies(app.trees,'sh1',A.n.id).length,1);
 const html=await app._renderHTML();assert(html.includes('st-sharedcard'));
 await app.close();game.settings.get=()=>undefined;core.invalidateTrees();
});
await test('validator finds impossible and loose abilities; stats add up the cost to take everything',async()=>{
 const tools=await import(`../scripts/app-tools.js?v=${V}`);
 const {t,n}=tree();const a2=core.newNode(200,0,{name:'B',cost:2,group:'g'}),a3=core.newNode(400,0,{name:'C',cost:4,group:'g'}),a4=core.newNode(600,0,{name:'D',cost:1}),lone=core.newNode(900,900,{name:'Solta',cost:1});
 t.nodes.push(a2,a3,a4,lone);t.edges=[{from:n.id,to:a2.id},{from:n.id,to:a3.id},{from:a2.id,to:a4.id},{from:a3.id,to:a4.id}];
 a4.reqNodes=[{tree:'gone',node:'x'}];
 const P=tools.treeProblems(t,[t]);const txt=P.map(p=>p.name+':'+p.lvl+':'+p.text).join('\n');
 assert(/D:error:.*grupo exclusivo/.test(txt),txt);assert(/D:error:.*não existe mais/.test(txt));assert(/Solta:warn:.*solta/.test(txt));assert.equal(P[0].lvl,'error');
 const S=tools.treeStats(t);assert.equal(S.count,5);assert.equal(S.skipped,1);assert.equal(S.main,3+2+1+1);
 const pD=S.paths.find(p=>p.n.id===a4.id);assert.equal(pD.cost,3+2+4+1);
 t.nodes.find(x=>x.id===a4.id).prereq='any';assert.equal(tools.treeStats(t).paths.find(p=>p.n.id===a4.id).cost,3+2+1);
});
await test('import by link converts GitHub page links and imports the JSON; welcome shows once',async()=>{
 const {t}=tree();t.name='Remota';const settings={trees:{list:[]},welcomeSeen:false};game.settings.get=(m,k)=>settings[k];game.settings.set=async(m,k,v)=>settings[k]=v;core.invalidateTrees();core.ST.catalog={};
 const app=new ArvoreHabilidades();
 const io=await import(`../scripts/app-io.js?v=${V}`);assert.equal(io.rawLink('https://github.com/u/r/blob/main/a/b.json'),'https://raw.githubusercontent.com/u/r/main/a/b.json');
 let asked=null;globalThis.fetch=async u=>{asked=u;return{ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify([t])};};
 const D=foundry.applications.api.DialogV2;D.prompt=async o=>o.ok.callback?o.ok.callback(null,{form:{elements:{url:{value:'https://github.com/u/r/blob/main/x.json'}}}}):null;
 await app.importLink();assert.equal(asked,'https://raw.githubusercontent.com/u/r/main/x.json');assert.equal(settings.trees.list.length,1);assert.equal(settings.trees.list[0].name,'Remota');
 await assert.rejects(app.importText('nao é json'));
 let shown=0;D.prompt=async()=>{shown++;return null;};await app.welcomeDialog();assert.equal(shown,1);assert.equal(settings.welcomeSeen,true);
 app._welcomed=false;app.maybeWelcome();assert.equal(app._welcomed,false);
 await app.close();delete globalThis.fetch;game.settings.get=()=>undefined;core.invalidateTrees();
});
await test('BUG 1: deleting a tree with a custom resource refunds that resource, not Skill Points',async()=>{
 const a=actor(),{t,n}=tree();t.rules='custom';t.assigned=[a.id];
 assert.equal(await core.doUnlock(a,t,n,{quiet:true}),true);assert.equal(a.system.resources.mana.value,7);
 await a.createEmbeddedDocuments('Item',[{_id:'g1',name:'Granted',flags:{world:{skillTree:{tree:t.id,node:n.id}}}}]);
 game.actors.push(a);const rep=await core.fixOrphans([a],{trees:[],quiet:true});
 assert.equal(rep.length,1);assert.equal(a.system.resources.mana.value,10);assert.equal(a.items.size,0);assert.equal(core.getProp(a,'flags.world.skillPoints.spent')??0,0);
 game.actors.length=0;
});
await test('BUG 1b: changing the tree resource later still refunds where the payment came from',async()=>{
 const a=actor(),{t,n}=tree();t.rules='custom';await core.doUnlock(a,t,n,{quiet:true});
 t.resPath='@tree';assert.equal(await core.doRefund(a,t,n,{quiet:true}),true);assert.equal(a.system.resources.mana.value,10);
});
await test('BUG 2: undo of a free level restores the item the evolution replaced',async()=>{
 const a=actor(),{t,n}=tree();t.rules='custom';n.ranks=2;n.features=[core.featureDefaults()];n.features[0].name='Golpe';t.assigned=[a.id];game.actors.push(a);
 const settings={trees:{list:[t]}};game.settings.get=(m,k)=>settings[k];game.settings.set=async(m,k,v)=>settings[k]=v;core.invalidateTrees();
 globalThis.fromUuid=async()=>null;await core.doUnlock(a,t,n,{quiet:true});
 const before=[...a.items.values()].map(i=>i.id);assert.equal(before.length,1);
 const D=foundry.applications.api.DialogV2;D.confirm=async()=>true;const app=new ArvoreHabilidades();
 await app.gmRecord('nivel 2',[a],()=>core.doUnlock(a,t,n,{free:true,quiet:true}));
 assert.equal(core.rankOf(a,t,n),2);assert(!a.items.has(before[0]),'evolution replaced the item');
 await app.undoEntry(settings.gmUndo.list[0].id);
 assert.equal(core.rankOf(a,t,n),1);assert(a.items.has(before[0]),'original item restored');assert.equal(a.items.size,1);
 await app.close();game.actors.length=0;game.settings.get=()=>undefined;core.invalidateTrees();
});
await test('BUG 3: a temporary level expiring keeps the paid level and its refund',async()=>{
 const a=actor(),{t,n}=tree();t.rules='custom';n.ranks=2;t.assigned=[a.id];
 const settings={trees:{list:[t]}};game.settings.get=(m,k)=>settings[k];core.invalidateTrees();
 await core.grantTemp(a,t,n,{kind:'rests',left:1});assert.equal(await core.doUnlock(a,t,n,{quiet:true}),true);
 assert.equal(a.system.resources.mana.value,7);assert.deepEqual(core.rankEntry(a,t,n).paid,[0,3]);
 await core.tickTemps(a,{rest:true});assert.equal(core.rankOf(a,t,n),1);assert.deepEqual(core.rankEntry(a,t,n).paid,[3]);
 assert.equal(await core.doRefund(a,t,n,{quiet:true}),true);assert.equal(a.system.resources.mana.value,10);
 await core.grantTemp(a,t,n,{kind:'rests',left:1});await core.doUnlock(a,t,n,{quiet:true});
 assert.equal(await core.doRefund(a,t,n,{quiet:true}),true);assert.equal(a.system.resources.mana.value,10);assert.equal(core.rankOf(a,t,n),1);
 await core.tickTemps(a,{rest:true});assert.equal(core.rankOf(a,t,n),0);
 game.settings.get=()=>undefined;core.invalidateTrees();
});
await test('BUG 4: importing several trees keeps combos between them',async()=>{
 const A=tree(),B=tree();A.t.name='A-pkg';B.t.name='B-pkg';B.n.reqNodes=[{tree:A.t.id,node:A.n.id,rank:1}];
 B.t.lockKind='feat';A.t.feats=[{id:'fz',name:'F',pts:1}];B.t.lockFeat='fz';
 const settings={trees:{list:[{...core.newTree('X'),feats:[{id:'fz',name:'Old',pts:1}]}]}};game.settings.get=(m,k)=>settings[k];game.settings.set=async(m,k,v)=>settings[k]=v;core.invalidateTrees();core.ST.catalog={};
 const app=new ArvoreHabilidades();await app.importText(JSON.stringify([A.t,B.t]));
 const nA=settings.trees.list.find(x=>x.name==='A-pkg'),nB=settings.trees.list.find(x=>x.name==='B-pkg');
 assert.notEqual(nA.id,A.t.id);assert.equal(nB.nodes[0].reqNodes[0].tree,nA.id);assert.equal(nB.nodes[0].reqNodes[0].node,nA.nodes[0].id);
 assert.notEqual(nA.feats[0].id,'fz');assert.equal(nB.lockFeat,nA.feats[0].id);
 await app.close();game.settings.get=()=>undefined;core.invalidateTrees();
});
await test('sheet cleanup: refund removes granted items now; deleting a tree cleans sheets right away',async()=>{
 const a=actor(),{t,n}=tree();t.rules='custom';t.assigned=[a.id];game.actors.push(a);
 const settings={trees:{list:[t]}};game.settings.get=(m,k)=>settings[k];game.settings.set=async(m,k,v)=>settings[k]=v;core.invalidateTrees();core.ST.catalog={};
 n.features=[core.featureDefaults()];await core.doUnlock(a,t,n,{quiet:true});assert.equal(a.items.size,1);
 await core.doRefund(a,t,n,{quiet:true});assert.equal(a.items.size,0);
 await core.doUnlock(a,t,n,{quiet:true});assert.equal(a.items.size,1);
 const D=foundry.applications.api.DialogV2;D.confirm=async()=>true;const app=new ArvoreHabilidades();app.treeId=t.id;
 await app.onAction('delTree');assert.equal(a.items.size,0);assert.equal(a.system.resources.mana.value,10);assert.equal(settings.trees.list.length,0);
 await app.close();game.actors.length=0;game.settings.get=()=>undefined;core.invalidateTrees();
});
await test('long rest from the GM button, the Mesa and the calendar counts temporaries and training',async()=>{
 const a=actor(),{t,n}=tree();t.rules='custom';t.assigned=[a.id];game.actors.push(a);
 const n2=core.newNode(5,5,{name:'Treino',cost:1,trainDays:2});t.nodes.push(n2);
 const settings={trees:{list:[t]}};game.settings.get=(m,k)=>settings[k];game.settings.set=async(m,k,v)=>settings[k]=v;core.invalidateTrees();core.ST.catalog={};
 await core.grantTemp(a,t,n,{kind:'rests',left:2});await core.doUnlock(a,t,n2,{quiet:true});assert.equal(core.trainingOf(a)[0].left,2);
 const app=new ArvoreHabilidades();app.actorId=a.id;app.treeId=t.id;
 await app.onAction('trainDay');assert.equal(core.tempsOf(a)[0].left,1);assert.equal(core.trainingOf(a)[0].left,1);
 const list=await core.longRestAll();assert.equal(list.length,1);
 assert.equal(core.rankOf(a,t,n),0,'temporary ended');assert.equal(core.tempsOf(a).length,0);assert.equal(core.rankOf(a,t,n2),1,'training finished');
 await app.close();game.actors.length=0;game.settings.get=()=>undefined;core.invalidateTrees();
});
await test('long rest done by a player on the sheet is counted by the GM (also after logging in)',async()=>{
 const a=actor(),{t,n}=tree();t.rules='custom';t.assigned=[a.id];game.actors.push(a);
 const n2=core.newNode(5,5,{name:'Treino',cost:1,trainDays:2});t.nodes.push(n2);
 const settings={trees:{list:[t]}};game.settings.get=(m,k)=>settings[k];game.settings.set=async(m,k,v)=>settings[k]=v;core.invalidateTrees();core.ST.catalog={};
 await core.grantTemp(a,t,n,{kind:'rests',left:2});await core.doUnlock(a,t,n2,{quiet:true});
 const users=game.users;game.users=Object.assign([],{activeGM:{id:game.user.id}});
 await a.update({'flags.world.stRestQ':2});await core.processAllRestQueues();
 assert.equal(core.getProp(a,'flags.world.stRestQ'),0);assert.equal(core.tempsOf(a).length,0,'temporary ended');assert.equal(core.rankOf(a,t,n2),1,'training finished');
 await core.processAllRestQueues();
 game.users=users;game.actors.length=0;game.settings.get=()=>undefined;core.invalidateTrees();
});
await test('language follows the user setting, not the server default read before i18nInit',async()=>{
 const old=game.i18n.lang;game.i18n.lang='pt-BR';
 const i=await import(`../scripts/i18n.js?fresh=${Date.now()}`);
 assert.equal(i.L('Fantasia'),'Fantasia','before i18nInit stays in Portuguese');
 game.i18n.lang='en';i.i18nReady();
 assert.equal(i.isEnglish(),true);assert.equal(i.L('Fantasia'),'Fantasy');
 game.i18n.lang=old;
});
console.log(`TOTAL: ${count} passed`);
