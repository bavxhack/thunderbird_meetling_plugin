import test from 'node:test';
import assert from 'node:assert/strict';
import {settings,endpoint,exactLogin,parseJson,parseLogin,parseServers,parseConference,ApiClient,ApiError} from '../extension/lib/core.mjs';
const s=settings({baseUrl:'https://example.org/meetling'});
test('installation subpath, routes and narrow legacy migration',()=>{
 assert.equal(endpoint(s,'login'),'https://example.org/meetling/room/outlook/plugin/outlooklogin');
 assert.equal(endpoint(s,'servers'),'https://example.org/meetling/api/v1/outlook/plugin/server');
 assert.equal(settings({...s,apiBasePath:'room/outlook/plugin',endpoints:{login:'login'}}).endpoints.login,'outlooklogin');
 assert.equal(settings({...s,apiBasePath:'custom/',endpoints:{login:'login'}}).endpoints.login,'login');
 for(const baseUrl of ['http://example.org','https://a:b@example.org','https://example.org/?x','https://example.org/#','https://example.org/?']) assert.throws(()=>settings({baseUrl}));
 for(const path of ['/evil','../evil','a/../b','https://evil','a%2fb','a?b','a#b','a\\b']) assert.throws(()=>settings({...s,apiBasePath:path}));
 for(const timeoutSeconds of [0,301,1.5,'30']) assert.throws(()=>settings({...s,timeoutSeconds}));
});
test('login only accepts exact HTTPS endpoint with no parameter channels',()=>{
 const expected=endpoint(s,'login'); assert(exactLogin(expected,expected));
 for(const actual of [expected+'?',expected+'#',expected+'?token=bad',expected+'/',expected.replace('https:','http:'),expected.replace('example.org','evil.org'),expected.replace('example.org','u@example.org')]) assert(!exactLogin(expected,actual));
 assert.deepEqual(parseLogin('{"token":"opaque","name":"Test"}'),{token:'opaque',name:'Test'});
 for(const text of ['[]','{"token":"x"}','{"token":"x\\n","name":"n"}','{"token":"a","token":"b","name":"n"}']) assert.throws(()=>parseLogin(text));
});
test('strict JSON preserves huge integer IDs and rejects duplicate keys and broken syntax',()=>{
 assert.equal(parseServers('[{"id":9007199254740993123456789,"name":"same"},{"id":2,"name":"same"}]')[0].id,'9007199254740993123456789');
 for(const text of ['[{"id":"1","name":"s"}]','[{"id":1.0,"name":"s"}]','[{"id":1,"name":"s"},{"id":1,"name":"s"}]','{}']) assert.throws(()=>parseServers(text));
 for(const text of ['{"a":1,"a":2}','[1,]','{"a":01}','[true] trailing','{"a":"x\n"}','\u00a0{}','<html>','']) assert.throws(()=>parseJson(text));
});
test('conference links, ID, dial-in and escaping preserve the Outlook contract',()=>{
 const c=parseConference('{"id":900719925474099312345,"url":"http://call.example/room?a=1&b=2","title":"Title","phone":{"numbersEnabled":false,"numbers":{"numbers":{"DE":"001234","CH":"5678","bad":42}},"dialIn":"00012"}}',s);
 assert.equal(c.moderatorEditUrl,s.baseUrl+'room/dashboard?editConference_id=900719925474099312345');
 assert(c.bodyText.includes('DE: 001234'));assert(c.bodyText.includes('Einwahl-PIN: 00012')); assert(c.html.includes('a=1&amp;b=2'));
 assert.equal(parseConference('{"url":"https://x.org","title":"T","phone":null}',s).moderatorEditUrl,null);
 assert.equal(parseConference('{"id":"0001","url":"https://x.org","title":"T"}',s).id,'0001');
 for(const url of ['javascript:alert(1)','/relative','https://u:p@example.org']) assert.throws(()=>parseConference(JSON.stringify({url,title:'T'}),s));
 assert.throws(()=>parseConference('[{"url":"https://x.org","title":"T"}]',s));
});
test('GET/POST, Bearer, form body only server_id, cookies omitted and no redirects/retries',async()=>{
 const calls=[];const client=new ApiClient(s,'opaque',async(url,options)=>{calls.push({url,options});return {ok:true,status:200,text:async()=>options.method==='POST' ? '{"url":"https://x.org","title":"T"}' : '[{"id":1,"name":"S"}]'};});
 await client.request('servers');await client.request('createConference','9007199254740993');
 assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.headers.Authorization,'Bearer opaque');
 assert.equal(calls[1].options.method,'POST');assert.equal(calls[1].options.body.toString(),'server_id=9007199254740993');
 for(const {options} of calls) {assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');}
 const failed=new ApiClient(s,'opaque',async()=>{throw new TypeError('transport');}); await assert.rejects(()=>failed.request('servers'));assert.equal(calls.length,2);
});
test('documented token errors and logout confirmation',async()=>{
 assert.throws(()=>parseJson('{"error":true,"reason":"No user loged in"}'),e=>e instanceof ApiError && e.invalidToken);
 assert.throws(()=>parseJson('{"error":true,"reason":"SECRET"}'),e=>!e.message.includes('SECRET'));
 for(const [text,ok] of [['{"token":null}',true],['{}',false],['{"token":"still-valid"}',false]]) {
  const client=new ApiClient(s,'t',async()=>({ok:true,status:200,text:async()=>text}));
  if(ok) await client.request('logout');else await assert.rejects(()=>client.request('logout'));
 }
 await assert.rejects(()=>new ApiClient(s,'t',async()=>({ok:false,status:401})).request('servers'),e=>e.invalidToken);
});
