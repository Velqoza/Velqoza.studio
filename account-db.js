// Local development persistence. Deploy only with an attached persistent disk; do not expose DB files.
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {randomBytes,randomUUID,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
const dir=process.env.STUDIO_DATA_DIR||path.join(import.meta.dirname,'data');
mkdirSync(dir,{recursive:true,mode:0o700});
const db=new DatabaseSync(path.join(dir,'studio.sqlite'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,salt TEXT NOT NULL,hash TEXT NOT NULL,credits INTEGER NOT NULL DEFAULT 0 CHECK(credits>=0),created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE TABLE IF NOT EXISTS credit_events(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,delta INTEGER NOT NULL,kind TEXT NOT NULL,detail TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS credit_events_user_idx ON credit_events(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,content TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS projects_user_idx ON projects(user_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS project_versions(
  version_id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  saved_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS project_versions_lookup ON project_versions(user_id,project_id,version_id DESC);
`);
const COST=Number.isSafeInteger(+process.env.STUDIO_EXPORT_CREDITS)&&+process.env.STUDIO_EXPORT_CREDITS>0?+process.env.STUDIO_EXPORT_CREDITS:10;
const START=Number.isSafeInteger(+process.env.STUDIO_WELCOME_CREDITS)&&+process.env.STUDIO_WELCOME_CREDITS>=0?+process.env.STUDIO_WELCOME_CREDITS:50;
const SESSION_TTL=30*24*60*60*1000;
const LIMIT_BODY=1_800_000;
function fail(status,message){const e=new Error(message);e.status=status;throw e}
function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const v=fn();db.exec('COMMIT');return v}catch(e){db.exec('ROLLBACK');throw e}}
function passHash(password,salt){return scryptSync(password,Buffer.from(salt,'hex'),64,{N:16384,r:8,p:1,maxmem:32*1024*1024}).toString('hex')}
function passwordValid(p){return typeof p==='string'&&p.length>=10&&p.length<=128}
function validEmail(e){return typeof e==='string'&&e.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)}
function publicUser(u){return u&&{id:u.id,email:u.email,credits:u.credits,createdAt:u.created_at,exportCost:COST}}
function getUser(id){return db.prepare('SELECT id,email,credits,created_at FROM users WHERE id=?').get(id)}
function event(userId,delta,kind,detail){db.prepare('INSERT INTO credit_events(id,user_id,delta,kind,detail,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),userId,delta,kind,detail,Date.now())}
function register(email,password){email=(email||'').trim().toLowerCase();if(!validEmail(email))fail(400,'Enter a valid email');if(!passwordValid(password))fail(400,'Password must be 10–128 characters');const salt=randomBytes(16).toString('hex');const hash=passHash(password,salt);return transaction(()=>{const id=randomUUID(),now=Date.now();try{db.prepare('INSERT INTO users(id,email,salt,hash,credits,created_at) VALUES(?,?,?,?,?,?)').run(id,email,salt,hash,START,now)}catch(e){if(String(e).includes('UNIQUE'))fail(409,'An account with this email already exists');throw e}if(START)event(id,START,'welcome','New account welcome credits');return getUser(id)})}
function login(email,password){email=(email||'').trim().toLowerCase();const row=db.prepare('SELECT * FROM users WHERE email=?').get(email);const salt=row?.salt||'0123456789abcdef0123456789abcdef';const actual=Buffer.from(passHash(typeof password==='string'?password:'',salt),'hex');const expected=Buffer.from(row?.hash||'00'.repeat(64),'hex');if(!row||!timingSafeEqual(actual,expected))fail(401,'Invalid email or password');return publicUser(row)}
function createSession(userId){const token=randomBytes(32).toString('base64url'),digest=hashToken(token);db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(digest,userId,Date.now()+SESSION_TTL);return token}
function hashToken(t){return createHash('sha256').update(t).digest('hex')}
function sessionUser(token){if(!token||typeof token!=='string'||token.length>200)return null;const row=db.prepare('SELECT u.id,u.email,u.credits,u.created_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(hashToken(token),Date.now());return row||null}
function endSession(token){if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token))}
function creditHistory(userId){return db.prepare('SELECT delta,kind,detail,created_at AS createdAt FROM credit_events WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(userId)}
function canExport(userId){const user=getUser(userId);if(!user)fail(401,'Sign in to export');if(user.credits<COST)fail(402,`Not enough credits. Export costs ${COST}, available ${user.credits}.`);return user}
function chargeExport(userId){return transaction(()=>{const r=db.prepare('UPDATE users SET credits=credits-? WHERE id=? AND credits>=?').run(COST,userId,COST);if(!r.changes)fail(402,'Not enough credits to complete export');event(userId,-COST,'export','Successful MP4 export');return publicUser(getUser(userId))})}
function grant(email,amount){email=(email||'').trim().toLowerCase();if(!validEmail(email)||!Number.isSafeInteger(amount)||amount<=0||amount>10000)fail(400,'Invalid email or credit amount (1–10000)');return transaction(()=>{const u=db.prepare('SELECT id FROM users WHERE email=?').get(email);if(!u)fail(404,'User not found');db.prepare('UPDATE users SET credits=credits+? WHERE id=?').run(amount,u.id);event(u.id,amount,'admin_grant','Credits granted by administrator');return publicUser(getUser(u.id))})}
function listProjects(userId){return db.prepare('SELECT id,name,created_at AS createdAt,updated_at AS updatedAt FROM projects WHERE user_id=? ORDER BY updated_at DESC LIMIT 200').all(userId)}
function loadProject(userId,id){const r=db.prepare('SELECT * FROM projects WHERE id=? AND user_id=?').get(id,userId);if(!r)fail(404,'Project not found');return {id:r.id,name:r.name,data:JSON.parse(r.content),updatedAt:r.updated_at}}
function saveProject(userId,id,p){
  if(!/^[a-z0-9_-]{1,80}$/i.test(id))fail(400,'Invalid project id');
  if(!p||typeof p!=='object'||Array.isArray(p))fail(400,'Invalid project');
  const name=typeof p.name==='string'?(p.name.trim().slice(0,80)||'Untitled'):'Untitled';
  const content=JSON.stringify(p);
  if(Buffer.byteLength(content)>LIMIT_BODY)fail(413,'Project too large. Reduce image sizes.');
  const now=Date.now();
  return transaction(()=>{
    const existing=db.prepare('SELECT * FROM projects WHERE id=?').get(id);
    if(existing&&existing.user_id!==userId)fail(403,'This project belongs to another account');
    if(existing){
      if(existing.content!==content){
        db.prepare('INSERT INTO project_versions(project_id,user_id,name,content,saved_at) VALUES(?,?,?,?,?)').run(id,userId,existing.name,existing.content,now);
        db.prepare('UPDATE projects SET name=?,content=?,updated_at=? WHERE id=? AND user_id=?').run(name,content,now,id,userId);
        pruneVersions(userId,id);
      }
    }else{
      db.prepare('INSERT INTO projects(id,user_id,name,content,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,userId,name,content,now,now);
    }
    return {id,name,updatedAt:now};
  });
}
function listProjectVersions(userId,id){
  const owned=db.prepare('SELECT id FROM projects WHERE id=? AND user_id=?').get(id,userId);
  if(!owned)fail(404,'Project not found');
  return db.prepare('SELECT version_id AS versionId,name,saved_at AS savedAt FROM project_versions WHERE project_id=? AND user_id=? ORDER BY version_id DESC LIMIT 12').all(id,userId);
}
function restoreProjectVersion(userId,id,versionId){
  if(!Number.isSafeInteger(versionId)||versionId<1)fail(400,'Invalid version');
  return transaction(()=>{
    const owned=db.prepare('SELECT * FROM projects WHERE id=? AND user_id=?').get(id,userId);
    if(!owned)fail(404,'Project not found');
    const old=db.prepare('SELECT * FROM project_versions WHERE project_id=? AND user_id=? AND version_id=?').get(id,userId,versionId);
    if(!old)fail(404,'Project version not found');
    const now=Date.now();
    db.prepare('INSERT INTO project_versions(project_id,user_id,name,content,saved_at) VALUES(?,?,?,?,?)').run(id,userId,owned.name,owned.content,now);
    db.prepare('UPDATE projects SET name=?,content=?,updated_at=? WHERE id=? AND user_id=?').run(old.name,old.content,now,id,userId);
    pruneVersions(userId,id);
    return {id,name:old.name,data:JSON.parse(old.content),updatedAt:now};
  });
}
function pruneVersions(userId,id){
  db.prepare('DELETE FROM project_versions WHERE version_id IN (SELECT version_id FROM project_versions WHERE project_id=? AND user_id=? ORDER BY version_id DESC LIMIT -1 OFFSET 12)').run(id,userId);
}
function changePassword(userId,currentPassword,newPassword){
  if(!passwordValid(newPassword))fail(400,'New password must be 10–128 characters');
  const row=db.prepare('SELECT * FROM users WHERE id=?').get(userId);
  if(!row)fail(401,'Account not found');
  const candidate=passHash(typeof currentPassword==='string'?currentPassword:'',row.salt);
  if(!timingSafeEqual(Buffer.from(candidate,'hex'),Buffer.from(row.hash,'hex')))fail(401,'Current password is incorrect');
  if(currentPassword===newPassword)fail(400,'Choose a different password');
  const salt=randomBytes(16).toString('hex');const hash=passHash(newPassword,salt);
  return transaction(()=>{
    db.prepare('UPDATE users SET salt=?,hash=? WHERE id=?').run(salt,hash,userId);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
    return {ok:true};
  });
}
function logoutEverywhere(userId){
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
  return {ok:true};
}
function deleteProject(userId,id){const r=db.prepare('DELETE FROM projects WHERE id=? AND user_id=?').run(id,userId);if(!r.changes)fail(404,'Project not found');return {ok:true}}
export {register,login,createSession,sessionUser,endSession,publicUser,creditHistory,canExport,chargeExport,grant,listProjects,loadProject,saveProject,deleteProject,listProjectVersions,restoreProjectVersion,changePassword,logoutEverywhere,COST,START,fail};
