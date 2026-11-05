import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {Vault} from '../extension/lib/vault.mjs';
if (!globalThis.crypto) globalThis.crypto=webcrypto;
function fake(){const data={};return {data,storage:{local:{get:async key=>({[key]:data[key]}),set:async obj=>Object.assign(data,obj),remove:async key=>{delete data[key];}}},meetlingNative:{encrypt:async text=>'encrypted:'+Buffer.from(text).toString('base64'),decrypt:async text=>Buffer.from(text.slice(10),'base64').toString()}};}
test('vault uses encrypted records bound to installation, including subpath',async()=>{
 const b=fake(), v=new Vault(b), base='https://example.org/a/';await v.save(base,{token:'SECRET',name:'User'});
 assert(!JSON.stringify(b.data).includes('SECRET'));assert.deepEqual(await v.load(base),{token:'SECRET',name:'User'});
 assert.equal(await v.load('https://example.org/b/'),null);
 const k=await v.key(base);b.data[await v.key('https://example.org/b/')]=b.data[k];await assert.rejects(()=>v.load('https://example.org/b/'));
 await v.remove(base);assert.equal(await v.load(base),null);
});
test('no plaintext fallback when encryption fails',async()=>{
 const b=fake();b.meetlingNative.encrypt=async()=>{throw new Error('locked');};
 await assert.rejects(()=>new Vault(b).save('https://x/',{token:'SECRET',name:'User'}));assert.deepEqual(b.data,{});
});
test('cancelled encryption cannot write a stale token over a later login',async()=>{
 const b=fake(), v=new Vault(b);let resolve;let current=true;
 b.meetlingNative.encrypt=text=>new Promise(r=>{resolve=()=>r('encrypted:'+Buffer.from(text).toString('base64'));});
 const pending=v.save('https://x/',{token:'old',name:'Old'},()=>current);
 await new Promise(r=>setImmediate(r));current=false;resolve();assert.equal(await pending,false);assert.deepEqual(b.data,{});
 b.meetlingNative.encrypt=async text=>'encrypted:'+Buffer.from(text).toString('base64');
 await v.save('https://x/',{token:'new',name:'New'});assert.equal((await v.load('https://x/')).token,'new');
});
