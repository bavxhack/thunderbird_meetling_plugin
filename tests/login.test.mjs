import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserLogin} from '../extension/lib/login.mjs';
import {settings,endpoint} from '../extension/lib/core.mjs';
const s=settings({baseUrl:'https://example.org/sub/'});
function event(){const listeners=new Set();return {listeners,addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f),emit:d=>[...listeners].map(f=>f(d))};}
function fake(){
 const created=[],removed=[],updates=[],filters=[];
 const b={contextualIdentities:{create:async()=>({cookieStoreId:'firefox-container-42'}),remove:async id=>removed.push(id)},
 windows:{create:async data=>{created.push(data);return {id:10,tabs:[{id:20}]};},update:async()=>{},remove:async()=>{}},
 tabs:{onRemoved:event(),query:async()=>[{id:20},{id:21}],remove:async id=>removed.push(id),update:async(id,data)=>updates.push({id,...data}),get:async()=>({windowId:10})},
 webRequest:{onBeforeRequest:event(),onHeadersReceived:event(),filterResponseData:()=>{const f={written:[],write:data=>f.written.push(data),close:()=>{f.closed=true;}};filters.push(f);return f;}}};
 return {b,created,removed,updates,filters};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('isolated login captures only own exact response, redacts token and removes all SSO tabs',async()=>{
 const m=fake(), login=new BrowserLogin(m.b), promise=login.start(s);await tick();
 assert.equal(m.created[0].cookieStoreId,'firefox-container-42');
 const request={cookieStoreId:'firefox-container-42',type:'main_frame',statusCode:200,url:endpoint(s,'login'),requestId:'1',responseHeaders:[{name:'Content-Disposition',value:'attachment'}]};
 m.b.webRequest.onHeadersReceived.emit({...request,cookieStoreId:'firefox-default'});assert.equal(m.filters.length,0);
 m.b.webRequest.onHeadersReceived.emit({...request,url:request.url+'?x=1'});assert.equal(m.filters.length,0);
 const [result]=m.b.webRequest.onHeadersReceived.emit(request);assert(!result.responseHeaders.some(h=>h.name==='Content-Disposition'));
 const f=m.filters[0];f.ondata({data:new TextEncoder().encode('{"token":"OPAQUE_SECRET","name":"User"}').buffer});f.onstop();
 assert.deepEqual(await promise,{token:'OPAQUE_SECRET',name:'User'});
 assert(!new TextDecoder().decode(f.written[0]).includes('OPAQUE_SECRET'));
 assert(m.removed.includes(20));assert(m.removed.includes(21));assert(m.removed.includes('firefox-container-42'));
 assert.equal(m.b.webRequest.onHeadersReceived.listeners.size,0);
});
test('invalid response keeps SSO session, supports return and closes filters on cancel',async()=>{
 const m=fake(), login=new BrowserLogin(m.b), promise=login.start(s);await tick();
 m.b.webRequest.onHeadersReceived.emit({cookieStoreId:'firefox-container-42',type:'main_frame',statusCode:200,url:endpoint(s,'login'),requestId:'1'});
 const f=m.filters[0];f.ondata({data:new TextEncoder().encode('{"error":true,"reason":"No user loged in"}').buffer});f.onstop();
 assert(login.active.error);await login.returnToMeetling();assert.equal(m.updates.at(-1).url,endpoint(s,'login'));
 await login.cancel();assert.equal(await promise,null);assert.equal(login.active,null);
});
test('only exact same host HTTP return repaired once, others blocked',async()=>{
 const m=fake(), login=new BrowserLogin(m.b), promise=login.start(s);await tick();
 const request={cookieStoreId:'firefox-container-42',type:'main_frame',url:endpoint(s,'login').replace('https:','http:')};
 assert.deepEqual(m.b.webRequest.onBeforeRequest.emit({...request,url:'https://idp.example/mfa'})[0],{});
 assert.deepEqual(m.b.webRequest.onBeforeRequest.emit({...request,url:request.url+'?code=secret'})[0],{cancel:true});
 assert.deepEqual(m.b.webRequest.onBeforeRequest.emit(request)[0],{redirectUrl:endpoint(s,'login')});
 assert.deepEqual(m.b.webRequest.onBeforeRequest.emit(request)[0],{cancel:true});
 await login.cancel();await promise;
});
test('late network response cannot complete cancelled login',async()=>{
 const m=fake(), login=new BrowserLogin(m.b), promise=login.start(s);await tick();
 m.b.webRequest.onHeadersReceived.emit({cookieStoreId:'firefox-container-42',type:'main_frame',statusCode:200,url:endpoint(s,'login'),requestId:'1'});
 const f=m.filters[0];await login.cancel();assert(f.closed);
 f.ondata({data:new TextEncoder().encode('{"token":"late","name":"Late"}').buffer});f.onstop();assert.equal(await promise,null);
});
