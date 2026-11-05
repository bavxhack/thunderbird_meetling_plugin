import {defaults,settings} from '../lib/core.mjs';
const $=id=>document.getElementById(id);
const fields=['baseUrl','apiBasePath','loginBasePath','timeoutSeconds'];
const endpoints=Object.keys(defaults.endpoints);
const loaded=await browser.runtime.sendMessage({action:'config'}), s=loaded.configuration || defaults;
for (const id of fields) $(id).value=s[id];
for (const id of endpoints) $(id).value=s.endpoints[id];
for (const input of document.querySelectorAll('input,button')) input.disabled=loaded.managed;
$('status').textContent=loaded.managed ? 'Diese Konfiguration wird von der Organisation vorgegeben. '+loaded.status : loaded.status;
$('settings').addEventListener('submit',async event=>{
  event.preventDefault();
  try {
    const value=Object.fromEntries(fields.map(id=>[id,$(id).value])); value.timeoutSeconds=Number(value.timeoutSeconds);
    value.endpoints=Object.fromEntries(endpoints.map(id=>[id,$(id).value]));
    const result=await browser.runtime.sendMessage({action:'saveConfig',configuration:settings(value)});
    $('status').textContent=result.status;
  } catch(e) {$('status').textContent=e.message;}
});
