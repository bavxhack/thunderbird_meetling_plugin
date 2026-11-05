import {readdir,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
async function walk(dir) {for (const f of await readdir(dir,{withFileTypes:true})) {const path=dir+'/'+f.name; if(f.isDirectory()) await walk(path); else if(/\.m?js$/.test(path)) {const r=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});if(r.status) throw new Error(r.stderr);} else if(path.endsWith('.json')) JSON.parse(await readFile(path,'utf8'));}}
await walk('extension');await walk('scripts');
const manifest=JSON.parse(await readFile('extension/manifest.json','utf8'));
for(const path of [manifest.background.page,manifest.options_ui.page,manifest.storage.managed_schema,manifest.experiment_apis.meetlingNative.schema,manifest.experiment_apis.meetlingNative.parent.script,manifest.browser_action.default_icon]) await readFile('extension/'+path);
console.log('JavaScript syntax, JSON and manifest resources verified.');
