// Only caller-created, isolated GPG homes belong here. Never use a personal keyring.
import { spawn } from 'node:child_process';
import { realpath, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

export async function runIsolatedGpg({gpgPath=process.platform === 'darwin' ? '/opt/homebrew/bin/gpg' : '/usr/bin/gpg',homedir,args,input=Buffer.alloc(0),maxBytes=16*1024*1024}) {
  if (!isAbsolute(homedir) || !isAbsolute(gpgPath)) throw new Error('Isolated GPG requires absolute paths');
  const home = await realpath(homedir);
  const info = await stat(home);
  if (!info.isDirectory() || (info.mode & 0o077)!==0) throw new Error('GPG home must be private');
  return new Promise((resolve,reject)=>{
    const child=spawn(gpgPath,['--no-options','--homedir',home,'--batch','--no-tty',...args],{stdio:['pipe','pipe','pipe'],env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',GNUPGHOME:home,LANG:'C'}});
    const chunks=[];let size=0;let failed=false;
    const timer=setTimeout(()=>{failed=true;child.kill('SIGKILL');},30000);
    const wipe=()=>{for(const chunk of chunks)chunk.fill(0);};
    const fail=()=>{failed=true;child.kill();};
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>maxBytes)fail();else chunks.push(chunk);});
    // Diagnostics can include key IDs and plaintext filenames. Never forward them.
    child.stderr.resume();
    child.stdin.on('error',()=>{failed=true;});
    child.on('error',()=>{clearTimeout(timer);wipe();reject(new Error('Isolated GPG operation failed'));});
    child.on('close',code=>{clearTimeout(timer);if(code!==0||failed){wipe();reject(new Error('Isolated GPG operation failed'));}else{const output=Buffer.concat(chunks);wipe();resolve(output);}});
    child.stdin.end(input);
  });
}
export function decryptOpenPgpInMemory(ciphertext,options) {
  return runIsolatedGpg({...options,args:['--decrypt'],input:ciphertext});
}
