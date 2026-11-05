const $=id=>document.getElementById(id), panel=new URLSearchParams(location.search).get('panel');
let working=false, selecting=false;
function render(s) {
  $('status').textContent=s.status; $('hint').textContent=s.loginHint;
  for (const id of ['prepare','refresh']) $(id).disabled=working || s.busy || s.signingIn || !s.name || selecting;
  $('login').disabled=working || s.busy || s.signingIn || !s.configured;
  for (const id of ['logout','localLogout']) $(id).disabled=working || s.busy || s.signingIn || !s.name;
  $('reload').disabled=working || s.busy || s.signingIn;
  $('loginControls').hidden=!s.signingIn;
  $('recovery').hidden=!s.recovery;
  if (s.recovery) $('recoveryText').value=s.recovery.bodyText;
  $('diagnostics').textContent=s.diagnostics.map(d=>`${d.time} ${d.action}: ${d.phase}`).join('\n');
  if (s.selection) {
    selecting=true; $('selection').hidden=false; $('servers').replaceChildren();
    const counts=new Map(); for (const server of s.selection) counts.set(server.name,(counts.get(server.name)||0)+1);
    for (const server of s.selection) {
      const button=document.createElement('button'); button.className='server'; button.title=server.name+' (ID: '+server.id+')';
      const img=document.createElement('img'); img.src='../icons/meetling.svg'; img.alt='';
      const text=document.createElement('span'); text.textContent=server.name+(counts.get(server.name)>1 ? ' (ID: '+server.id+')' : '');
      button.append(img,text); button.addEventListener('click',()=>{selecting=false;$('selection').hidden=true;void send('create',{serverId:server.id});});
      $('servers').append(button);
    }
  }
}
async function send(action,extra={}) {
  if (working) return; working=true;
  try {render(await browser.runtime.sendMessage({action,panel,...extra}));}
  catch(e) {$('status').textContent=e.message;}
  finally {working=false;}
}
for (const id of ['prepare','login','refresh','options','return','cancelLogin','logout','localLogout','reload','clearRecovery']) {
  $(id).addEventListener('click',()=>{
    if (id==='logout' && !confirm('Token für alle Clients mit demselben Wert widerrufen? Die SSO-Websitzung wird dadurch nicht beendet.')) return;
    if (id==='localLogout' && !confirm('Nur die lokale Anmeldung löschen? Das Token bleibt auf dem Server gültig.')) return;
    if (id==='reload' && !confirm('Konfiguration neu laden und aktuelle Anmeldung im Arbeitsspeicher verwerfen?')) return;
    void send(id);
  });
}
$('cancelSelection').addEventListener('click',()=>{selecting=false;$('selection').hidden=true;});
$('copy').addEventListener('click',async()=>{
  $('recoveryText').focus();$('recoveryText').select();
  try {await navigator.clipboard.writeText($('recoveryText').value);} catch {document.execCommand('copy');}
});
async function poll() {if (!working) try {render(await browser.runtime.sendMessage({action:'state'}));} catch {} }
await poll();setInterval(poll,750);
