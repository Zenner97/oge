import {cpSync,mkdirSync,copyFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'), target=resolve(root,'public');
rmSync(target,{recursive:true,force:true});mkdirSync(target,{recursive:true});
for(const file of ['index.html','privacy.html','.nojekyll'])copyFileSync(resolve(root,file),resolve(target,file));
cpSync(resolve(root,'assets'),resolve(target,'assets'),{recursive:true});
console.log('Static site compiled into public/; server files and secrets excluded.');
