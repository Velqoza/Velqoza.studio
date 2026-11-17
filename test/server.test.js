import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const port=29000+Math.floor(Math.random()*1000),base=`http://127.0.0.1:${port}`;
const scratch=mkdtempSync(path.join(tmpdir(),'studio-v09-'));
const adminKey='test_admin_key_1234567890_abcdefghijklmnop';
const proc=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),STUDIO_DATA_DIR:scratch,STUDIO_ADMIN_KEY:adminKey,NODE_ENV:'test'},stdio:'ignore'});
async function waitUntilReady(){for(let i=0;i<80;i++){try{const r=await fetch(base+'/api/health');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,70))}throw new Error('Server not ready')}
async function request(route,method='GET',body=null,cookie='',extra={}){const headers={...extra};if(body&&!(body instanceof Uint8Array))headers['Content-Type']='application/json';if(cookie)headers.Cookie=cookie;const resp=await fetch(base+route,{method,headers,body:body instanceof Uint8Array?body:body?JSON.stringify(body):undefined});const data=resp.headers.get('content-type')?.includes('json')?await resp.json():null;return {resp,data}}
const creds={email:'creator@example.test',password:'myLongTestPassword1234'};
test('accounts, credits, project ownership, successful MP4 charge and export failures',async()=>{
 try{
  await waitUntilReady();
  const health=await request('/api/health');assert.equal(health.data.version,'1.0.0');assert.equal(health.resp.status,200);
  const pricing=await request('/api/pricing');assert.equal(pricing.data.exportCredits,10);assert.equal(pricing.data.fixedVideoLimit,false);assert.equal(pricing.data.fixedEditLimit,false);
  const page=await request('/');assert.equal(page.resp.status,200);const html=await page.resp.text();assert.match(html,/accountChip/);assert.match(html,/cloudSave/);
  const js=await request('/app.js');assert.match(await js.resp.text(),/StudioAccount.requireBalance/);
  const anon=await request('/api/projects');assert.equal(anon.resp.status,401);
  const invalidReg=await request('/api/register','POST',{email:'bad',password:'12'});assert.equal(invalidReg.resp.status,400);
  const create=await request('/api/register','POST',creds);assert.equal(create.resp.status,201);assert.equal(create.data.user.credits,50);
  const cookie=create.resp.headers.get('set-cookie').split(';')[0];assert.match(create.resp.headers.get('set-cookie'),/HttpOnly/);
  const dup=await request('/api/register','POST',creds);assert.equal(dup.resp.status,409);
  const badlogin=await request('/api/login','POST',{...creds,password:'wrong'});assert.equal(badlogin.resp.status,401);
  const oklogin=await request('/api/login','POST',creds);assert.equal(oklogin.resp.status,200);
  const me=await request('/api/account','GET',null,cookie);assert.equal(me.data.user.credits,50);
  const put=await request('/api/projects/project_test','PUT',{name:'My video',scenes:{introMain:'Hello'}},cookie);assert.equal(put.resp.status,200);
  const got=await request('/api/projects/project_test','GET',null,cookie);assert.equal(got.data.project.data.scenes.introMain,'Hello');
  const saveNew=await request('/api/projects/project_test','PUT',{name:'My video updated',scenes:{introMain:'Updated title'}},cookie);assert.equal(saveNew.resp.status,200);
  const versions=await request('/api/projects/project_test/versions','GET',null,cookie);assert.equal(versions.resp.status,200);assert.equal(versions.data.versions.length,1);
  const initialVersion=versions.data.versions[0].versionId;
  const restored=await request('/api/projects/project_test/restore','POST',{versionId:initialVersion},cookie);assert.equal(restored.resp.status,200);
  assert.equal(restored.data.project.data.scenes.introMain,'Hello','Restoring should recover earlier scene contents');
  const versionAfterRestore=await request('/api/projects/project_test/versions','GET',null,cookie);assert.equal(versionAfterRestore.data.versions.length,2,'Current version should be archived before restore');
  const list=await request('/api/projects','GET',null,cookie);assert.equal(list.data.projects.length,1);
  const person2=await request('/api/register','POST',{email:'other@example.test',password:'aLongTestPassword0987'});const cookie2=person2.resp.headers.get('set-cookie').split(';')[0];
  const privateRead=await request('/api/projects/project_test','GET',null,cookie2);assert.equal(privateRead.resp.status,404);
  const privateVersions=await request('/api/projects/project_test/versions','GET',null,cookie2);assert.equal(privateVersions.resp.status,404);
  const privateRestore=await request('/api/projects/project_test/restore','POST',{versionId:initialVersion},cookie2);assert.equal(privateRestore.resp.status,404);
  const privateWrite=await request('/api/projects/project_test','PUT',{name:'hacked'},cookie2);assert.equal(privateWrite.resp.status,403);
  const noGrant=await request('/api/admin/credits/grant','POST',{email:creds.email,amount:20});assert.equal(noGrant.resp.status,403);
  const grant=await request('/api/admin/credits/grant','POST',{email:creds.email,amount:20},'',{'X-Studio-Admin-Key':adminKey});assert.equal(grant.data.user.credits,70);
  const badContent=await request('/api/convert','POST',Buffer.from('not-video'),cookie,{'Content-Type':'text/plain'});assert.equal(badContent.resp.status,415);
  const badVideo=await request('/api/convert','POST',Buffer.alloc(2048),cookie,{'Content-Type':'video/webm'});assert.equal(badVideo.resp.status,422);
  const afterInvalid=await request('/api/account','GET',null,cookie);assert.equal(afterInvalid.data.user.credits,70,'Invalid render should not charge');
  const input=path.join(scratch,'input.webm');
  execFileSync('ffmpeg',['-y','-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=black:s=320x568:r=12:d=1','-f','lavfi','-i','sine=frequency=220:duration=1','-c:v','libvpx','-b:v','130k','-c:a','libopus','-shortest',input],{timeout:30000});
  const raw=await import('node:fs/promises').then(f=>f.readFile(input));
  const exportResp=await request('/api/convert','POST',raw,cookie,{'Content-Type':'video/webm'});
  assert.equal(exportResp.resp.status,200,'Video conversion should succeed');
  assert.equal(exportResp.resp.headers.get('content-type'),'video/mp4');
  assert.equal(exportResp.resp.headers.get('x-credits-charged'),'10');
  const mp4=Buffer.from(await exportResp.resp.arrayBuffer());assert.ok(mp4.length>2500);
  const after=await request('/api/account','GET',null,cookie);assert.equal(after.data.user.credits,60);
  const history=await request('/api/credits/history','GET',null,cookie);assert.ok(history.data.events.some(e=>e.kind==='export'&&e.delta===-10));
  // No fixed generation/edit count; available credits alone determine export eligibility.
  for(let i=0;i<6;i++){
    // Wait for the server-side file stream cleanup after the previous response body finished.
    await new Promise(r=>setTimeout(r,90));
    const next=await request('/api/convert','POST',raw,cookie,{'Content-Type':'video/webm'});
    assert.equal(next.resp.status,200,`Export #${i+2} should succeed while credits remain`);
    await next.resp.arrayBuffer();
  }
  const empty=await request('/api/account','GET',null,cookie);assert.equal(empty.data.user.credits,0);
  const exhausted=await request('/api/convert','POST',raw,cookie,{'Content-Type':'video/webm'});
  assert.equal(exhausted.resp.status,402,'Account with no credits may not export');
  const historyExhausted=await request('/api/credits/history','GET',null,cookie);
  assert.equal(historyExhausted.data.events.filter(e=>e.kind==='export').length,7);

  const blocked=await request('/api/register','POST',{email:'evil@example.test',password:'12345678910'},'',{Origin:'https://evil.com'});assert.equal(blocked.resp.status,403);
  const noData=await request('/data/studio.sqlite');assert.equal(noData.resp.status,404);
  const deleteResult=await request('/api/projects/project_test','DELETE',null,cookie);assert.equal(deleteResult.resp.status,200);
  const wrongChange=await request('/api/account/change-password','POST',{currentPassword:'wrongpassword',newPassword:'NewPassword123456'},cookie);
  assert.equal(wrongChange.resp.status,401);
  const goodChange=await request('/api/account/change-password','POST',{currentPassword:creds.password,newPassword:'NewPassword123456'},cookie);
  assert.equal(goodChange.resp.status,200);
  const newCookie=goodChange.resp.headers.get('set-cookie').split(';')[0];
  assert.notEqual(newCookie,cookie);
  const oldSession=await request('/api/account','GET',null,cookie);assert.equal(oldSession.resp.status,401,'Old session must be revoked after password change');
  const stillSignedIn=await request('/api/account','GET',null,newCookie);assert.equal(stillSignedIn.resp.status,200);
  const oldLogin=await request('/api/login','POST',creds);assert.equal(oldLogin.resp.status,401);
  const newLogin=await request('/api/login','POST',{email:creds.email,password:'NewPassword123456'});assert.equal(newLogin.resp.status,200);
  const logoutAll=await request('/api/account/logout-all','POST',null,newCookie);assert.equal(logoutAll.resp.status,200);
  const afterLogout=await request('/api/account','GET',null,newCookie);assert.equal(afterLogout.resp.status,401);
  const otherSessionCookie=newLogin.resp.headers.get('set-cookie').split(';')[0];
  const otherSession=await request('/api/account','GET',null,otherSessionCookie);assert.equal(otherSession.resp.status,401,'Logout all should revoke every session');
 }finally{proc.kill();rmSync(scratch,{recursive:true,force:true})}
});
