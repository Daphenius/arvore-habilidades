import { randomBytes } from 'node:crypto';
export const get = (o,p) => p.split('.').reduce((v,k)=>v?.[k],o);
export const set = (o,p,v) => { const keys=p.split('.'); const k=keys.pop(); let at=o; for(const x of keys) at=at[x]??={}; at[k]=v; return o; };
globalThis.foundry={applications:{api:{ApplicationV2:class {render(){} async close(){this._onClose({});} _onClose(){}},DialogV2:{}},ux:{TextEditor:{implementation:{}}},apps:{FilePicker:{implementation:{}}}},audio:{AudioHelper:{}},utils:{getProperty:get,setProperty:set,deepClone:structuredClone,randomID:(n=8)=>randomBytes(n).toString('hex').slice(0,n),saveDataToFile(...x){return globalThis.__saveHook?.(...x);}}};
globalThis.game={user:{id:'gm',isGM:true,name:'Test'},users:[],actors:[],i18n:{localize:s=>s},settings:{get:()=>undefined}};
globalThis.CONFIG={ActiveEffect:{changeTypes:{}},DND5E:{}};
globalThis.window={innerWidth:1600,innerHeight:1000};
globalThis.ui={notifications:{info(){},warn(){},error(){}}};
globalThis.ChatMessage={create:async()=>{},getSpeaker:()=>({})};
globalThis.canvas={};
globalThis.Hooks={on(){},off(){}};
globalThis.document={removeEventListener(){}};

game.actors.get = id => game.actors.find(a => a.id === id);
