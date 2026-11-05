import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../extension/experiments/native/api.js',import.meta.url),'utf8');
function setup(win,invitation=false){
 let cleanup,registered=false;
 const cal={itip:{isInvitation:()=>invitation}};
 const context={extension:{id:'test',windowManager:{get:()=>({window:win})}},callOnClose:obj=>{cleanup=obj.close;}};
 class ExtensionAPI{};class EventManager{api(){return {};}}
 const sandbox={ChromeUtils:{importESModule:url=>url.includes('ExtensionCommon') ? {ExtensionCommon:{ExtensionAPI,EventManager}} : url.includes('ExtensionSupport') ? {ExtensionSupport:{registerWindowListener:()=>{registered=true;},unregisterWindowListener:()=>{registered=false;}}} : url.includes('Timer') ? {setTimeout,clearTimeout} : {cal}},
 Cc:{'@mozilla.org/security/sdr;1':{getService:()=>({encryptString:v=>'cipher',decryptString:v=>'plain'})}},Ci:{nsISecretDecoderRing:{},nsIEditor:{eEditorReadonlyMask:1},nsIHTMLEditor:{}},Services:{wm:{getEnumerator:()=>[]}}};
 vm.createContext(sandbox);vm.runInContext(source,sandbox);
 const api=vm.runInContext('new meetlingNative()',sandbox).getAPI(context).meetlingNative;
 return {api,cleanup:()=>cleanup(),registered:()=>registered};
}
function compose(){const headers=new Map(),inserted=[];const editor={flags:0,beginTransaction(){inserted.push('begin');},endTransaction(){inserted.push('end');},endOfDocument(){inserted.push('tail');},insertText:t=>inserted.push(t),insertHTML:t=>inserted.push(t),QueryInterface(){return this;}};
 const win={closed:false,gMsgCompose:{composeHTML:true,compFields:{getHeader:k=>headers.get(k)||'',setHeader:(k,v)=>headers.set(k,v)}},GetCurrentEditor:()=>editor};
 return {win,headers,inserted,editor};}
test('native compose targets remain fixed and cannot create twice, insertion preserves subject and never saves/sends',async()=>{
 const c=compose(), {api,cleanup,registered}=setup(c.win);
 c.win.subject='Keep';c.win.Save=()=>assert.fail('saved');c.win.Send=()=>assert.fail('sent');
 const key=await api.capture(1);await api.markPending(key);
 assert.equal(c.headers.get('X-MEETLING-CREATION-STATE'),'pending');
 await assert.rejects(()=>api.markPending(key));
 await api.apply(key,{url:'https://room',html:'<a href="https://room">Join</a>',bodyText:'Join'});
 assert.equal(c.headers.get('X-MEETLING-CREATION-STATE'),'created');assert.equal(c.headers.get('X-MEETLING-PARTICIPANT-LINK'),'https://room');
 assert.equal(c.win.subject,'Keep');assert.deepEqual(c.inserted,['begin','tail','<br><br><a href="https://room">Join</a>','end']);
 await assert.rejects(()=>api.capture(1));cleanup();assert(!registered());
});
test('closed/read-only editor cannot trigger a create request; pending marker survives failed insertion',async()=>{
 const c=compose(),{api}=setup(c.win),key=await api.capture(1);await api.markPending(key);c.win.closed=true;
 await assert.rejects(()=>api.apply(key,{url:'https://room',html:'Join',bodyText:'Join'}));
 assert.equal(c.headers.get('X-MEETLING-CREATION-STATE'),'pending');
 c.win.closed=false;c.editor.flags=1;await assert.rejects(()=>api.capture(1));
});
test('native calendar refuses invitations and appends HTML to writable draft',async()=>{
 const props=new Map(), calls=[], location={value:'Old'};
 const editor={beginTransaction:()=>{},endTransaction:()=>{},endOfDocument:()=>calls.push('tail'),insertHTML:h=>calls.push(h)};
 const element={getHTMLEditor:()=>editor,contentWindow:{}};
 const w={closed:false,gIsReadOnly:false,calendarItem:{isEvent:()=>true,calendar:{readOnly:false},getProperty:k=>props.get(k),setProperty:(k,v)=>props.set(k,v)},document:{getElementById:id=>id==='item-description'?element:id==='item-location'?location:null},updateAccept:()=>calls.push('update')};
 const {api}=setup(w),key=await api.capture(1);await api.markPending(key);await api.apply(key,{url:'https://room',html:'Join'});
 assert.equal(location.value,'Meetling Konferenz');assert.deepEqual(calls,['tail','<br><br>Join','update']);
 const other=setup(w,true).api;await assert.rejects(()=>other.capture(1));
});
