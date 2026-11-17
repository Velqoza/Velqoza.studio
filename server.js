import http from 'node:http';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import * as db from './account-db.js';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const PUBLIC=path.join(ROOT,'public');
const EXPORTS=path.join(ROOT,'exports');
const PORT=Number(process.env.PORT||8787);
const MAX_UPLOAD=140*1024*1024;
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.json':'application/json'};
await fsp.mkdir(EXPORTS,{recursive:true});
const ffmpegFound=spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status===0;
const limiter=new Map();
const activeExports=new Set();
const VERSION='1.0.0';
function respond(res,status,body,headers={}){res.writeHead(status,{'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Cache-Control':'no-store',...headers});res.end(body)}
function json(res,status,data,headers={}){respond(res,status,JSON.stringify(data),{'Content-Type':'application/json; charset=utf-8',...headers})}
function fail(status,message){const e=new Error(message);e.status=status;throw e}
function getCookie(req,name){const match=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(c=>c.startsWith(name+'='));return match?match.slice(name.length+1):null}
function requireUser(req){const u=db.sessionUser(getCookie(req,'vqsid'));if(!u)fail(401,'Please sign in first');return u}
function cookie(token){const secure=process.env.NODE_ENV==='production'?'; Secure':'';return `vqsid=${token}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${30*24*3600}`}
function clearCookie(){const secure=process.env.NODE_ENV==='production'?'; Secure':'';return `vqsid=; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=0`}
function loginLimit(req,key,max,windowMs){const ip=String(req.socket.remoteAddress||'unknown');const k=ip+':'+key;const now=Date.now();let row=limiter.get(k);if(!row||now-row.t>windowMs){row={n:0,t:now};limiter.set(k,row)}row.n++;if(row.n>max)fail(429,'Too many attempts. Try again later.');if(limiter.size>12000)for(const [k,v]of limiter){if(now-v.t>windowMs*2)limiter.delete(k)}}
function adminAuthorized(req){const configured=process.env.STUDIO_ADMIN_KEY||'';const provided=String(req.headers['x-studio-admin-key']||'');if(configured.length<32||!provided||Buffer.byteLength(configured)!==Buffer.byteLength(provided))fail(403,'Admin grants disabled or key invalid');if(!timingSafeEqual(Buffer.from(configured),Buffer.from(provided)))fail(403,'Admin key invalid')}
function verifyOrigin(req){const origin=req.headers.origin;if(!origin)return;let host;try{host=new URL(origin).host.toLowerCase()}catch{fail(403,'Invalid request origin')};if(host!==String(req.headers.host||'').toLowerCase())fail(403,'Cross-origin requests are not accepted')}
async function readBody(req,max){const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>max)fail(413,'Request too large');chunks.push(chunk)}return Buffer.concat(chunks)}
async function parseJSON(req,max=1800000){const data=await readBody(req,max);try{return JSON.parse(data.toString('utf8'))}catch{fail(400,'Invalid JSON body')}}
async function convert(req,res){
  const user=requireUser(req);
  if(!ffmpegFound)fail(503,'FFmpeg is not installed on the server');
  const kind=(req.headers['content-type']||'').split(';')[0];
  if(!['video/webm','video/mp4','video/x-matroska','application/octet-stream'].includes(kind))fail(415,'Unsupported media type');
  db.canExport(user.id);
  if(activeExports.has(user.id))fail(429,'One export at a time per account');
  activeExports.add(user.id);
  const id=randomUUID(),input=path.join(EXPORTS,id+'.input'),output=path.join(EXPORTS,id+'.mp4');
  try{
    const body=await readBody(req,MAX_UPLOAD);if(body.length<1024)fail(422,'Invalid or empty video');
    const header=body.subarray(0,16),isWebm=header.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])),isMp4=header.toString('ascii',4,8)==='ftyp';
    if(!isWebm&&!isMp4)fail(422,'File must be valid WebM or MP4');
    await fsp.writeFile(input,body);
    const ff=spawn('ffmpeg',['-nostdin','-y','-hide_banner','-loglevel','error','-i',input,'-map','0:v:0','-map','0:a?','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart','-c:a','aac','-b:a','160k','-t','31',output],{stdio:['ignore','ignore','pipe']});
    let error='';ff.stderr.on('data',x=>{if(error.length<1500)error+=String(x).slice(0,1500-error.length)});
    const timer=setTimeout(()=>ff.kill('SIGKILL'),90000);
    const code=await new Promise(resolve=>{ff.once('close',resolve);ff.once('error',()=>resolve(-1))});clearTimeout(timer);
    if(code!==0)fail(422,'Video could not be converted. Please check the source recording. '+error.slice(-140));
    const stat=await fsp.stat(output);if(stat.size<2000)fail(422,'Converted video is empty');
    // Successful conversion is the only billable event. Balance is checked atomically again.
    const charged=db.chargeExport(user.id);
    const stream=fs.createReadStream(output);
    res.writeHead(200,{'Content-Type':'video/mp4','Content-Disposition':'attachment; filename="velqoza-studio.mp4"','Content-Length':String(stat.size),'X-Credits-Remaining':String(charged.credits),'X-Credits-Charged':String(db.COST),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    await new Promise((resolve,reject)=>{stream.once('error',reject);stream.once('end',resolve);stream.pipe(res)});
  }finally{activeExports.delete(user.id);await Promise.allSettled([fsp.rm(input,{force:true}),fsp.rm(output,{force:true})]);}
}
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');const pathname=url.pathname;
    if(req.method!=='GET'&&req.method!=='HEAD')verifyOrigin(req);
    if(req.method==='GET'&&pathname==='/api/health')return json(res,200,{ok:true,ffmpeg:ffmpegFound,version:VERSION});
    if(req.method==='GET'&&pathname==='/api/pricing')return json(res,200,{exportCredits:db.COST,welcomeCredits:db.START,previewCredits:0,editCredits:0,fixedVideoLimit:false,fixedEditLimit:false,paymentsEnabled:false});
    if(req.method==='POST'&&pathname==='/api/register'){
      loginLimit(req,'register',5,3600000);const b=await parseJSON(req,10000);const u=db.register(b.email,b.password);const token=db.createSession(u.id);return json(res,201,{user:db.publicUser(u)},{'Set-Cookie':cookie(token)});
    }
    if(req.method==='POST'&&pathname==='/api/login'){
      loginLimit(req,'login',18,900000);const b=await parseJSON(req,10000);const u=db.login(b.email,b.password);const token=db.createSession(u.id);return json(res,200,{user:u},{'Set-Cookie':cookie(token)});
    }
    if(req.method==='POST'&&pathname==='/api/logout'){db.endSession(getCookie(req,'vqsid'));return json(res,200,{ok:true},{'Set-Cookie':clearCookie()});}
    if(req.method==='GET'&&pathname==='/api/account')return json(res,200,{user:db.publicUser(requireUser(req))});
    if(req.method==='POST'&&pathname==='/api/account/change-password'){
      loginLimit(req,'change-password',8,3600000);
      const u=requireUser(req),b=await parseJSON(req,8000);
      db.changePassword(u.id,b.currentPassword,b.newPassword);
      const token=db.createSession(u.id);
      return json(res,200,{ok:true,user:db.publicUser(u)},{'Set-Cookie':cookie(token)});
    }
    if(req.method==='POST'&&pathname==='/api/account/logout-all'){
      const u=requireUser(req);db.logoutEverywhere(u.id);
      return json(res,200,{ok:true},{'Set-Cookie':clearCookie()});
    }
    if(req.method==='GET'&&pathname==='/api/credits/history')return json(res,200,{events:db.creditHistory(requireUser(req).id)});
    if(req.method==='POST'&&pathname==='/api/admin/credits/grant'){loginLimit(req,'admin',12,3600000);adminAuthorized(req);const b=await parseJSON(req,4000);return json(res,200,{user:db.grant(b.email,b.amount)});}
    if(req.method==='POST'&&pathname==='/api/convert')return await convert(req,res);
    if(req.method==='GET'&&pathname==='/api/projects')return json(res,200,{projects:db.listProjects(requireUser(req).id)});
    const versionMatch=pathname.match(/^\/api\/projects\/([a-zA-Z0-9_-]{1,80})\/versions$/);
    if(versionMatch&&req.method==='GET')return json(res,200,{versions:db.listProjectVersions(requireUser(req).id,versionMatch[1])});
    const restoreMatch=pathname.match(/^\/api\/projects\/([a-zA-Z0-9_-]{1,80})\/restore$/);
    if(restoreMatch&&req.method==='POST'){
      const u=requireUser(req),b=await parseJSON(req,3000);
      return json(res,200,{project:db.restoreProjectVersion(u.id,restoreMatch[1],b.versionId)});
    }
    const projectMatch=pathname.match(/^\/api\/projects\/([a-zA-Z0-9_-]{1,80})$/);
    if(projectMatch){const u=requireUser(req),id=projectMatch[1];if(req.method==='GET')return json(res,200,{project:db.loadProject(u.id,id)});if(req.method==='PUT')return json(res,200,{project:db.saveProject(u.id,id,await parseJSON(req,1800000))});if(req.method==='DELETE')return json(res,200,db.deleteProject(u.id,id));}
    if(pathname.startsWith('/api/'))fail(404,'API route not found');
    if(req.method!=='GET')fail(405,'Method not allowed');
    const name=pathname==='/'?'/index.html':decodeURIComponent(pathname),file=path.resolve(PUBLIC,'.'+name);
    if(!(file===PUBLIC||file.startsWith(PUBLIC+path.sep)))fail(403,'Forbidden');
    const stat=await fsp.stat(file).catch(()=>null);if(!stat||!stat.isFile())fail(404,'Not found');
    res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':file.endsWith('.html')?'no-cache':'public, max-age=300'});fs.createReadStream(file).pipe(res);
  }catch(e){console.error('[studio]',e.status||500,e.message);if(!res.headersSent)json(res,e.status||500,{error:e.status?e.message:'Internal server error'});else res.destroy();}
});
server.listen(PORT,'0.0.0.0',()=>console.log(`VELQOZA Studio ${VERSION} running on http://localhost:${PORT} (MP4: ${ffmpegFound?'ready':'unavailable'})`));
