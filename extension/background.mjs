import {settings, ApiClient, ApiError} from './lib/core.mjs';
import {BrowserLogin} from './lib/login.mjs';
import {Vault} from './lib/vault.mjs';
const b=browser, vault=new Vault(b), panels=new Map();
let config=null, managed=false, login=null, cache=null, epoch=0, busy=false, signingIn=false;
let status='Konfiguration fehlt.', recovery=null, controller=new AbortController();
const diagnostics=[];
function trace(action,phase) {
  // Call sites supply fixed categories only. No URLs, bodies, credentials or exception text.
  diagnostics.push({time:new Date().toISOString(),action,phase}); if (diagnostics.length>200) diagnostics.shift();
}
const browserLogin=new BrowserLogin(b,trace);
function snapshot() { return {status,configured:!!config,managed,busy,signingIn,name:login?.name || null,servers:cache?.list || [],recovery,loginHint:browserLogin.active?.error || '',diagnostics}; }
function invalidate() { epoch++; controller.abort(); controller=new AbortController(); login=null; cache=null; void browserLogin.cancel(); signingIn=false; }
async function reload(initial=false) {
  invalidate(); config=null; managed=false;
  try {
    let input;
    try {
      const policy=await b.storage.managed.get(null);
      if (Object.hasOwn(policy,'configuration')) { managed=true; input=policy.configuration; }
    } catch (e) {
      // Thunderbird throws when no policy manifest exists. Other policy errors fail closed.
      if (!/Managed storage manifest not found|No managed storage|managed storage is not available/i.test(e.message)) { managed=true; throw new Error('Organisationskonfiguration konnte nicht gelesen werden.'); }
    }
    if (!managed) input=(await b.storage.local.get('configuration')).configuration;
    if (!input) {status='Bitte in den Einstellungen eine HTTPS-Installationsadresse hinterlegen.'; return;}
    config=settings(input);
    if (initial) login=await vault.load(config.baseUrl);
    status=login ? 'Angemeldet als ' + login.name + ' (noch nicht geprüft)' : 'Nicht angemeldet.';
  } catch (e) { status=e.message; }
}
function api() { if (!config || !login) throw new Error('Bitte Einstellungen prüfen und anmelden.'); return new ApiClient(config,login.token,fetch,trace); }
async function signIn() {
  if (busy || signingIn || !config) return;
  invalidate(); signingIn=true; status='Anmeldung läuft. SSO/MFA im Anmeldefenster abschließen.';
  const version=epoch, s=config;
  try {
    const result=await browserLogin.start(s);
    if (version!==epoch) return;
    if (!result) {status='Anmeldung abgebrochen.'; return;}
    const saved=await vault.save(s.baseUrl,result,()=>version===epoch);
    if (!saved) return;
    if (version!==epoch) return;
    login=result; cache=null; status='Angemeldet als ' + login.name;
  } catch (e) { if (version===epoch) status=e.message; }
  finally { if (version===epoch) signingIn=false; }
}
async function servers(force=false) {
  if (!force && cache && Date.now()-cache.time<120000) return cache.list;
  const list=await api().request('servers',null,controller.signal); cache={list,time:Date.now()}; return list;
}
async function error(e,context,version) {
  if (epoch!==version) return;
  if (e instanceof ApiError && e.invalidToken) {
    login=null; cache=null;
    try {await vault.remove(config.baseUrl);} catch {status='Anmeldung ungültig; gespeichertes Token konnte nicht entfernt werden.';return;}
    status='Anmeldung nicht mehr gültig. Bitte erneut anmelden.';
  } else status=context + (e instanceof ApiError ? ' ' + e.message : e instanceof TypeError || e.name==='AbortError' ? ' Netzwerk, DNS, Proxy, Zertifikat oder Timeout prüfen. Ein Transportfehler löscht die Anmeldung nicht.' : ' ' + e.message);
}
async function openPanel(windowId, target=null) {
  if (windowId == null && !target) windowId=(await b.windows.getLastFocused({windowTypes:['normal']})).id;
  const id=crypto.randomUUID(); panels.set(id,{windowId,target,window:null});
  const win=await b.windows.create({type:'popup',url:b.runtime.getURL('ui/panel.html')+'?panel='+id,width:550,height:740});
  panels.get(id).window=win.id;
}
b.browserAction.onClicked.addListener(tab=>void openPanel(tab.windowId));
b.composeAction.onClicked.addListener(tab=>void openPanel(tab.windowId));
b.meetlingNative.onInvoke.addListener(key=>void openPanel(null,key));
b.windows.onRemoved.addListener(id=>{
  for (const [key,p] of panels) if (p.window===id) { if (p.target) void b.meetlingNative.release(p.target); panels.delete(key); }
});
async function handle(message,sender) {
  if (sender.id!==b.runtime.id || !sender.url?.startsWith(b.runtime.getURL('ui/'))) throw new Error('Ungültiger Aufruf.');
  if (message.action==='state') return snapshot();
  if (message.action==='config') return {configuration:config,managed,status};
  if (message.action==='options') {await b.runtime.openOptionsPage();return snapshot();}
  if (message.action==='login') {void signIn(); return snapshot();}
  if (message.action==='return') {await browserLogin.returnToMeetling();return snapshot();}
  if (message.action==='cancelLogin') {if (!signingIn) return snapshot();invalidate(); status='Anmeldung abgebrochen.'; return snapshot();}
  if (busy || signingIn) throw new Error('Bitte laufenden Vorgang abschließen oder Anmeldung abbrechen.');
  const version=epoch; busy=true;
  try {
    switch(message.action) {
      case 'saveConfig':
        if (managed) throw new Error('Die Organisation gibt die Konfiguration vor.');
        await b.storage.local.set({configuration:settings(message.configuration)}); await reload(); break;
      case 'reload': await reload(); break;
      case 'refresh': {const list=await servers(true); status=list.length ? list.length+' Server verfügbar.' : 'Keine Server verfügbar.'; break;}
      case 'prepare': {
        api(); const panel=panels.get(message.panel); if (!panel) throw new Error('Bitte Meetling erneut über den Thunderbird-Button öffnen.');
        if (!panel.target) panel.target=await b.meetlingNative.capture(panel.windowId);
        const list=await servers();
        if (!list.length) {status='Keine Server verfügbar.'; break;}
        if (list.length>1) return {...snapshot(),selection:list};
        await create(panel,list[0].id,version); break;
      }
      case 'create': {
        const panel=panels.get(message.panel); if (!panel?.target) throw new Error('Zielentwurf fehlt.');
        const list=await servers(); if (!list.some(s=>s.id===message.serverId)) throw new Error('Ungültige Serverauswahl.');
        await create(panel,message.serverId,version); break;
      }
      case 'logout': {
        if (!login || !config) break;
        const s=config; cache=null;
        try {await api().request('logout',null,controller.signal); await vault.remove(s.baseUrl); invalidate();status='Nicht angemeldet. Token serverseitig widerrufen.';}
        catch(e) {
          if (e instanceof ApiError && e.reason==='No user loged found') {await vault.remove(s.baseUrl);invalidate();status='Lokal abgemeldet. Token war nicht zugeordnet; kein neuer Widerruf bestätigt.';}
          else {status='Serverseitiger Widerruf nicht bestätigt. Erneut versuchen oder ausdrücklich nur lokal abmelden.';}
        }
        break;
      }
      case 'localLogout': if (config) await vault.remove(config.baseUrl); invalidate();status='Nur lokal abgemeldet. Kein serverseitiger Widerruf bestätigt.'; break;
      case 'clearRecovery': recovery=null; break;
      default: throw new Error('Unbekannte Aktion.');
    }
  } catch(e) {await error(e,'Vorgang fehlgeschlagen.',version);}
  finally {busy=false;}
  return snapshot();
}
async function create(panel,id,version) {
  let requested=false;
  try {
    const client=api(), signal=controller.signal;
    await b.meetlingNative.markPending(panel.target); requested=true; recovery=null;
    status='Konferenz wird erstellt.';
    const conference=await client.request('createConference',id,signal);
    // Keep a copy even if the editor closed or insertion partly failed. Never retry create.
    recovery=conference;
    if (epoch!==version) {status='Konferenz erstellt. Links bitte manuell übernehmen.';return;}
    await b.meetlingNative.apply(panel.target,conference);
    recovery=null;
    status=conference.moderatorEditUrl ? 'Konferenz in den Entwurf eingefügt.' : 'Konferenz eingefügt. Der Server lieferte keine gültige Konferenz-ID für den Bearbeitungslink.';
  } catch(e) {
    await error(e,recovery ? 'Konferenz erstellt; Einfügung fehlgeschlagen. Links manuell übernehmen.' : requested ? 'Erstellung fehlgeschlagen oder Ausgang unklar. Raum kann bereits existieren. Kein erneuter Versuch für diesen Entwurf; Server prüfen.' : 'Konferenz konnte nicht vorbereitet werden.',version);
  }
}
const ready=reload(true);
b.runtime.onMessage.addListener(async(message,sender)=>{await ready;return handle(message,sender);});
await ready;
if (config && !login) { await openPanel(null); void signIn(); }
