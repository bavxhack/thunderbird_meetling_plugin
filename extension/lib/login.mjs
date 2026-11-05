import {endpoint, exactLogin, parseLogin} from './core.mjs';
export class BrowserLogin {
  constructor(browser, trace = () => {}) { this.browser = browser; this.trace = trace; this.active = null; }
  async start(s) {
    if (this.active) return this.active.promise;
    const b = this.browser, expected = endpoint(s,'login');
    const session = {expected, tabs:new Set(), filters:new Set(), finished:false, repaired:false};
    this.active = session;
    session.promise = new Promise((resolve,reject) => { session.resolve=resolve; session.reject=reject; });
    const finish = async (result, error) => {
      if (session.finished) return; session.finished=true;
      clearTimeout(session.timer);
      b.webRequest.onBeforeRequest.removeListener(before);
      b.webRequest.onHeadersReceived.removeListener(headers);
      b.tabs.onRemoved.removeListener(removed);
      for (const filter of session.filters) { try { filter.close(); } catch {} }
      if (session.container) {
        // Close only this login's isolated tabs, including SSO popups.
        const tabs = await b.tabs.query({cookieStoreId:session.container.cookieStoreId}).catch(() => []);
        for (const tab of tabs) await b.tabs.remove(tab.id).catch(() => {});
        await b.contextualIdentities.remove(session.container.cookieStoreId).catch(() => {});
      }
      if (this.active === session) this.active=null;
      error ? session.reject(error) : session.resolve(result);
    };
    session.cancel = () => finish(null);
    const own = d => session.container && d.cookieStoreId === session.container.cookieStoreId;
    const before = d => {
      if (!own(d) || !['main_frame','sub_frame'].includes(d.type)) return {};
      if (d.url.startsWith('https://') || d.url === 'about:blank') return {};
      // Repair only a same-host, exact-path HTTP return, once; never copy parameters.
      try {
        const u=new URL(d.url), e=new URL(expected);
        if (!session.repaired && u.protocol==='http:' && !u.username && !u.password && !u.search && !u.hash && !/[?#]/.test(d.url) && !u.port && !e.port && u.hostname===e.hostname && u.pathname===e.pathname) {
          session.repaired=true; return {redirectUrl:expected};
        }
      } catch {}
      this.trace('login','blocked-navigation'); return {cancel:true};
    };
    const headers = d => {
      if (!own(d) || d.type !== 'main_frame' || !exactLogin(expected,d.url)) return {};
      if (d.statusCode !== 200) { this.trace('login','http-error'); return {}; }
      const filter = b.webRequest.filterResponseData(d.requestId);
      session.filters.add(filter);
      const chunks=[]; let size=0, tooLarge=false;
      filter.ondata = event => { if (session.finished) return; size += event.data.byteLength; if (size <= 1024*1024) chunks.push(new Uint8Array(event.data)); else tooLarge=true; };
      filter.onerror = () => { session.filters.delete(filter); this.trace('login','response-unavailable'); };
      filter.onstop = () => {
        session.filters.delete(filter);
        if (session.finished) return;
        // Never display/download the raw token response.
        filter.write(new TextEncoder().encode('<!doctype html><html lang="de"><meta charset="utf-8"><p>Meetling-Antwort empfangen. Den Status sehen Sie im Meetling-Fenster.</p></html>'));
        filter.close();
        if (session.finished) return;
        try {
          if (tooLarge) throw new Error('Login-Antwort ist zu groß.');
          const bytes=new Uint8Array(size); let pos=0; for (const c of chunks) { bytes.set(c,pos); pos+=c.length; }
          const result = parseLogin(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
          this.trace('login','validated-response'); void finish(result);
        } catch { this.trace('login','invalid-response'); session.error='Keine gültige Tokenantwort. SSO/MFA abschließen und „Zurück zu Meetling“ wählen. Der Endpunkt muss JSON mit token und name liefern.'; }
      };
      const safe=(d.responseHeaders || []).filter(h=>!['content-disposition','content-type','content-length'].includes(h.name.toLowerCase()));
      safe.push({name:'Content-Type',value:'text/html; charset=utf-8'},{name:'Cache-Control',value:'no-store'});
      return {responseHeaders:safe};
    };
    const removed = id => { if (id === session.tabId) void finish(null); };
    try {
      session.container=await b.contextualIdentities.create({name:'Meetling Anmeldung',color:'blue',icon:'briefcase'});
      if (session.finished) { await b.contextualIdentities.remove(session.container.cookieStoreId); return session.promise; }
      b.webRequest.onBeforeRequest.addListener(before,{urls:['<all_urls>']},['blocking']);
      b.webRequest.onHeadersReceived.addListener(headers,{urls:['https://*/*'],types:['main_frame']},['blocking','responseHeaders']);
      b.tabs.onRemoved.addListener(removed);
      session.timer=setTimeout(()=>void finish(null,new Error('Anmeldung nach fünf Minuten beendet.')),300000);
      const win=await b.windows.create({type:'popup',url:'about:blank',cookieStoreId:session.container.cookieStoreId,width:1000,height:780});
      session.tabId=win.tabs[0].id;
      if (session.finished) { await b.windows.remove(win.id).catch(()=>{}); return session.promise; }
      await b.tabs.update(session.tabId,{url:expected});
      this.trace('login','start');
    } catch { await finish(null,new Error('Isoliertes Anmeldefenster konnte nicht geöffnet werden. Thunderbird-Version und Berechtigungen prüfen.')); }
    return session.promise;
  }
  async returnToMeetling() {
    const s=this.active; if (!s || s.finished || !s.tabId) return;
    await this.browser.tabs.update(s.tabId,{url:s.expected,active:true});
    const tab=await this.browser.tabs.get(s.tabId); await this.browser.windows.update(tab.windowId,{focused:true});
  }
  async cancel() { await this.active?.cancel(); }
}
