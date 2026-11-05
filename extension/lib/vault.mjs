import {validateToken} from './core.mjs';
export class Vault {
  constructor(b) { this.b=b; this.queue=Promise.resolve(); }
  async key(installation) {
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(installation));
    return 'token-' + [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
  }
  serialize(work) { const result=this.queue.then(work); this.queue=result.catch(()=>{}); return result; }
  async save(installation, login, current=()=>true) {
    return this.serialize(async()=>{
    validateToken(login.token);
    const encrypted=await this.b.meetlingNative.encrypt(JSON.stringify({installation,...login}));
    if (!current()) return false;
    const key=await this.key(installation);
    if (!current()) return false;
    await this.b.storage.local.set({[key]:encrypted});
    if (!current()) { await this.b.storage.local.remove(key); return false; }
    return true;
    });
  }
  async load(installation) {
    const key=await this.key(installation), record=(await this.b.storage.local.get(key))[key];
    if (!record) return null;
    const data=JSON.parse(await this.b.meetlingNative.decrypt(record));
    if (data.installation !== installation || typeof data.name !== 'string' || !data.name.trim()) throw new Error('Gespeicherte Anmeldung ist ungültig.');
    return {token:validateToken(data.token),name:data.name};
  }
  async remove(installation) { await this.serialize(async()=>this.b.storage.local.remove(await this.key(installation))); }
}
