import {StudioAccount} from './account.js';
import {attachStudioAssistant} from './studio-chat.js';
const SCENE_FIELDS=['introMain','introSub','ideaLabel','buildLabel','finalMain','finalSub','endUrl'];
const DEFAULT_SCENES={introMain:'YOUR IDEA.',introSub:'IN MOTION.',ideaLabel:'ONE SIMPLE PROMPT',buildLabel:'FROM WORDS TO WEBSITES',finalMain:'DON’T JUST IMAGINE IT.',finalSub:'CREATE IT.',endUrl:'ai.velqoza.com'};
const PROJECT_KEY='velqoza-studio-projects-v6';
const OLD_PROJECT_KEY='velqoza-studio-projects-v5';
const DRAFT_KEY='velqoza-studio-draft-v6';
const OLD_DRAFT_KEY='velqoza-studio-draft-v5';
const DEFAULT_PACING={intro:25,idea:25,build:28,reveal:22};
const PACE_FIELDS=['intro','idea','build','reveal'];
const PACE_IDS={intro:'paceIntro',idea:'paceIdea',build:'paceBuild',reveal:'paceReveal'};

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');const ctx=canvas.getContext('2d',{alpha:false});
let ratio='9:16',config=null,play=false,startTime=0,current=0,raf=0,logoImage=null,recording=false;
let activeElement=null, hitRegions=[],dragState=null;const objectEdits={};
let layers=[],activeLayerId=null,layerHitRegions=[],layerDrag=null;
const layerImages=new Map();let replaceLayerImageNext=false;
let undoLayers=[],redoLayers=[],lastLayerState="[]";const MAX_LAYER_UNDO=30;
const photoState={idea:null,build:null}; // Each item is {src,img}; image source is a compressed local data URL
const photoIds={idea:['ideaPhoto','ideaPhotoPreview','removeIdeaPhoto'],build:['buildPhoto','buildPhotoPreview','removeBuildPhoto']};
const el={prompt:$('prompt'),brand:$('brandName'),style:$('style'),duration:$('duration'),accent:$('accent'),music:$('music'),generate:$('generate'),play:$('play'),download:$('download'),scrub:$('scrub'),time:$('timeLabel'),status:$('exportState'),stage:$('stageInner'),brief:$('briefBox')};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x)};

function font(size,weight=700){return `${weight} ${Math.round(size)}px "Space Grotesk",Arial,sans-serif`}
function hex2rgb(hex){return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)]}
function rgba(hex,a){const [r,g,b]=hex2rgb(hex);return `rgba(${r},${g},${b},${a})`}
function textCenter(txt,x,y,size,color,alpha=1,weight=700){ctx.save();ctx.globalAlpha=clamp(alpha,0,1);ctx.fillStyle=color;ctx.font=font(size,weight);ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(txt,x,y);ctx.restore()}
function rounded(x,y,w,h,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
function wrap(txt,width,size,max=3){ctx.font=font(size,600);const out=[];let l='';for(const word of String(txt).split(/\s+/)){if(ctx.measureText(l?l+' '+word:word).width>width&&l){out.push(l);l=word;if(out.length>=max-1)break}else l=l?l+' '+word:word}if(l)out.push(l);return out.slice(0,max)}
function safeString(v,max){return typeof v==='string'?v.slice(0,max):''}
function titleCase(s){return s.replace(/\b\w/g,m=>m.toUpperCase())}
function pickKeywords(text){
  const stop=new Set(['the','and','for','with','your','this','that','from','into','show','video','brand','create','make','launch','modern','beautiful','website','websites','idea','cinematic','ad','advertisement','business','شركة','فيديو','اعلان','إعلان','موقع','الموقع','تصميم','ذكاء','اصطناعي']);
  const words=(text.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]).filter(w=>w.length>2&&!stop.has(w));
  const unique=[];for(const w of words){if(!unique.includes(w))unique.push(w);if(unique.length>=4)break}return unique;
}
function shortPhrase(text,maxWords=4){const words=(text.match(/[\p{L}\p{N}'’.-]+/gu)||[]).slice(0,maxWords);return words.join(' ')}
const TEMPLATES={
 barber:{name:'Barber — Launch',prompt:'A premium barber shop launch advertisement: close-ups of fresh fades, precision tools, and an inviting atmosphere.',brand:'ONYX BARBER',accent:'#c69c57',style:'luxury',music:'cinematic',scenes:{introMain:'PRECISION.',introSub:'REDEFINED.',ideaLabel:'YOUR NEXT FRESH LOOK',buildLabel:'STYLE IN EVERY DETAIL',finalMain:'BOOK YOUR NEXT CUT.',finalSub:'LOOK SHARP.',endUrl:'yourbarber.com'}},
 restaurant:{name:'Restaurant — Launch',prompt:'A modern restaurant promotional video featuring fresh dishes, warm lighting, dining atmosphere and a booking call to action.',brand:'YOUR RESTAURANT',accent:'#f2a45d',style:'luxury',music:'ambient',scenes:{introMain:'MADE TO',introSub:'BE SAVOURED.',ideaLabel:'FRESH TASTE EVERY DAY',buildLabel:'EXPERIENCE EVERY BITE',finalMain:'YOUR TABLE AWAITS.',finalSub:'DINE WITH US.',endUrl:'yourrestaurant.com'}},
 tech:{name:'AI Product — Launch',prompt:'An AI website builder turns one sentence into a polished professional website. Show the prompt, the build and the final interface.',brand:'VELQOZA AI',accent:'#ad8aff',style:'neon',music:'cinematic',scenes:{introMain:'ONE IDEA.',introSub:'INFINITE POSSIBILITIES.',ideaLabel:'DESCRIBE YOUR VISION',buildLabel:'WATCH YOUR SITE TAKE SHAPE',finalMain:'BUILD THE FUTURE.',finalSub:'WITH AI.',endUrl:'ai.velqoza.com'}},
 estate:{name:'Real Estate — Showcase',prompt:'A real estate listing showcase featuring a modern home, natural light, architectural detail and a property tour invitation.',brand:'YOUR REALTY',accent:'#94b9ab',style:'minimal',music:'ambient',scenes:{introMain:'FIND YOUR',introSub:'NEXT CHAPTER.',ideaLabel:'MORE THAN A PROPERTY',buildLabel:'WELCOME TO YOUR FUTURE HOME',finalMain:'EXPLORE THE SPACE.',finalSub:'FEEL AT HOME.',endUrl:'yourrealty.com'}},
 fashion:{name:'Fashion — Collection',prompt:'A high-end fashion brand campaign with fabric details, editorial product photography and a new collection reveal.',brand:'YOUR LABEL',accent:'#d6b8ce',style:'minimal',music:'uplift',scenes:{introMain:'OWN THE',introSub:'MOMENT.',ideaLabel:'THE NEW COLLECTION',buildLabel:'DESIGNED TO STAND OUT',finalMain:'DISCOVER THE DROP.',finalSub:'WEAR YOUR STORY.',endUrl:'yourfashion.com'}}
};
function selectTemplate(id){
 const t=TEMPLATES[id];if(!t||recording)return;
 stop();$('projectName').value=t.name;el.prompt.value=t.prompt;el.brand.value=t.brand;el.accent.value=t.accent;el.style.value=t.style;el.music.value=t.music;
 for(const field of SCENE_FIELDS)$(field).value=t.scenes[field]||DEFAULT_SCENES[field];
 $('colorText').textContent=t.accent.toUpperCase();document.querySelectorAll('[data-template]').forEach(b=>b.classList.toggle('active',b.dataset.template===id));
 prepare();createBrief();projectMessage(`Template applied: ${t.name}. You can customize everything.`)
}
function setPreview(kind){const p=$(`${kind}PhotoPreview`);p.replaceChildren();const item=photoState[kind];if(item?.src){const img=document.createElement('img');img.src=item.src;img.alt=`${kind} photo`;p.append(img)}else p.textContent='No image'}
function setPhoto(kind,src){if(!src){photoState[kind]=null;setPreview(kind);prepare();return Promise.resolve()}
 return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{photoState[kind]={src,img};setPreview(kind);prepare();resolve()};img.onerror=()=>reject(new Error('Could not load photo'));img.src=src})
}
async function handlePhotoUpload(kind,file){if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024){projectMessage('Use a JPG/PNG/WebP image under 8 MB.');return}
 const url=URL.createObjectURL(file);try{
  const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=url});
  const maxSide=900,scale=Math.min(1,maxSide/Math.max(img.width,img.height));
  const cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(img.width*scale));cv.height=Math.max(1,Math.round(img.height*scale));cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
  const src=cv.toDataURL('image/jpeg',.78);await setPhoto(kind,src);projectMessage(`Image added to ${kind.toUpperCase()} scene. It will be included in exported videos.`)
 }catch{projectMessage('This image could not be opened.')}finally{URL.revokeObjectURL(url)}}
function drawPhoto(img,x,y,w,h,fit='cover'){if(!img)return;const sw=img.width,sh=img.height;if(!sw||!sh)return;const scale=fit==='contain'?Math.min(w/sw,h/sh):Math.max(w/sw,h/sh);const dw=sw*scale,dh=sh*scale;ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh)}
function paceValues(){return {intro:+$('paceIntro').value,idea:+$('paceIdea').value,build:+$('paceBuild').value,reveal:+$('paceReveal').value}}
function normalizedPacing(raw=paceValues()){const total=PACE_FIELDS.reduce((s,k)=>s+(+raw[k]||0),0)||100;const out={};PACE_FIELDS.forEach(k=>out[k]=raw[k]/total);return out}
function updatePaceLabels(){const p=normalizedPacing();$('paceIntroOut').textContent=`${Math.round(p.intro*100)}%`; $('paceIdeaOut').textContent=`${Math.round(p.idea*100)}%`; $('paceBuildOut').textContent=`${Math.round(p.build*100)}%`; $('paceRevealOut').textContent=`${Math.round(p.reveal*100)}%`;}
function getBounds(){const p=normalizedPacing();const b1=p.intro,b2=b1+p.idea,b3=b2+p.build;return {intro:[0,b1],idea:[b1,b2],build:[b2,b3],reveal:[b3,1]}}
function jumpTime(name){const b=getBounds();const r=b[name]||[0,0.9];return r[0]*Number(el.duration.value)}
function phaseRange(sec,total,[a,b]){const start=a*total,end=b*total;return {start,end,duration:Math.max(0.001,end-start)}}
function sceneWindow(sec,total,bounds,idx){const keys=['intro','idea','build','reveal'],k=keys[idx],r=phaseRange(sec,total,bounds[k]),x=(sec-r.start)/r.duration;const entrance=smooth(x/.28),exit=1-smooth((x-.76)/.24);return clamp(Math.min(entrance,exit),0,1)}

function readScenes(){return Object.fromEntries(SCENE_FIELDS.map(id=>[id,($(id).value||'').trim().slice(0,60)]))}
function snapshot(){return {version:6,name:$('projectName').value.trim().slice(0,64)||'Untitled',prompt:el.prompt.value,brand:el.brand.value,style:el.style.value,duration:+el.duration.value,accent:el.accent.value,music:el.music.value,ratio,scenes:readScenes(),pacing:paceValues(),brief:el.brief.innerText,images:{idea:photoState.idea?.src||null,build:photoState.build?.src||null},photoFit:$('photoFit').value,objectEdits:JSON.parse(JSON.stringify(objectEdits)),layers:JSON.parse(JSON.stringify(layers))}}
function getSaved(){try{const data=JSON.parse(localStorage.getItem(PROJECT_KEY)||localStorage.getItem(OLD_PROJECT_KEY)||'{}');return data&&typeof data==='object'&&!Array.isArray(data)?data:{}}catch{return {}}}
function setSaved(data){localStorage.setItem(PROJECT_KEY,JSON.stringify(data))}
function projectMessage(msg){$('projectStatus').textContent=msg}
function saveDraft(){localStorage.setItem(DRAFT_KEY,JSON.stringify(snapshot()))}
function restoreDraft(){try{const draft=JSON.parse(localStorage.getItem(DRAFT_KEY)||localStorage.getItem(OLD_DRAFT_KEY)||'null');if(draft?.version>=3)applyProject(draft,false)}catch{}}
function refreshProjects(selected=''){const data=getSaved(),sel=$('savedProjects');sel.replaceChildren(new Option('Select a saved project…',''));Object.entries(data).sort((a,b)=>(b[1].savedAt||0)-(a[1].savedAt||0)).forEach(([id,p])=>sel.add(new Option(p.name||'Untitled',id)));sel.value=selected&&data[selected]?selected:''}
function applyProject(p,announce=true){
  if(!p||typeof p!=='object')throw new Error('Invalid project file');
  el.prompt.value=safeString(p.prompt,600)||el.prompt.value;
  el.brand.value=safeString(p.brand,34)||'YOUR BRAND';
  $('projectName').value=safeString(p.name,64)||'Untitled';
  el.style.value=['cinematic','minimal','neon','luxury'].includes(p.style)?p.style:'cinematic';
  el.duration.value=[10,15,20].includes(Number(p.duration))?String(p.duration):'20';
  el.accent.value=/^#[0-9a-f]{6}$/i.test(p.accent)?p.accent:'#ad8aff';
  el.music.value=['cinematic','ambient','uplift','off'].includes(p.music)?p.music:'cinematic';
  for(const id of SCENE_FIELDS)$(id).value=safeString(p.scenes?.[id]??DEFAULT_SCENES[id],60);
  const pacing={...DEFAULT_PACING,...(p.pacing||{})};
  $('paceIntro').value=clamp(+pacing.intro||25,10,45);$('paceIdea').value=clamp(+pacing.idea||25,10,45);$('paceBuild').value=clamp(+pacing.build||28,10,45);$('paceReveal').value=clamp(+pacing.reveal||22,10,45);
  updatePaceLabels();
  for(const id of Object.keys(objectEdits))delete objectEdits[id];
  for(const [id,val] of Object.entries(p.objectEdits||{})){if(EDITABLE_IDS.includes(id)&&val&&typeof val==='object')objectEdits[id]={x:clamp(Number(val.x)||0,-40,40),y:clamp(Number(val.y)||0,-40,40),scale:clamp(Number(val.scale)||1,.5,2.2)};}
  layers=Array.isArray(p.layers)?p.layers.slice(0,50).map(normalizeLayer).filter(Boolean):[];
  activeLayerId=null;refreshLayers();showLayerInspector();resetLayerHistory();
  activeElement=null;showInspector();
  $('photoFit').value=p.photoFit==='contain'?'contain':'cover';
  for(const kind of ['idea','build']){const src=p.images?.[kind];if(typeof src==='string'&&src.startsWith('data:image/')&&src.length<2500000){setPhoto(kind,src).catch(()=>setPhoto(kind,null))}else setPhoto(kind,null)}
  el.brief.textContent=safeString(p.brief||'',3000)||'Click Generate brief to create a hook, voiceover and shot plan from your idea.';
  $('colorText').textContent=el.accent.value.toUpperCase();el.scrub.max=el.duration.value;setRatio(['9:16','16:9','1:1'].includes(p.ratio)?p.ratio:'9:16');prepare(false);if(announce)projectMessage('Project loaded. Note: uploaded logos must be selected again.')
}

function autoStoryboard(){
  const brand=(el.brand.value.trim()||'YOUR BRAND').toUpperCase();
  const prompt=el.prompt.value.trim()||'A cinematic brand launch';
  const kws=pickKeywords(prompt);const k1=(kws[0]||'your idea').toUpperCase();const k2=(kws[1]||'your brand').toUpperCase();
  const styles={cinematic:['TURN IDEAS','INTO IMPACT.'],minimal:['CLEAR IDEA.','CLEAR RESULT.'],neon:['BOLD VISION.','LIVE MOTION.'],luxury:['ELEVATE YOUR','BRAND PRESENCE.']};
  const pair=styles[el.style.value]||styles.cinematic;
  $('introMain').value=pair[0].slice(0,32);
  $('introSub').value=pair[1].slice(0,32);
  $('ideaLabel').value=titleCase(`Prompting ${k1}`).slice(0,42);
  $('buildLabel').value=titleCase(`Built for ${k2}`).slice(0,48);
  $('finalMain').value=titleCase(`Choose ${brand}`).slice(0,40);
  $('finalSub').value=(el.style.value==='luxury'?'PREMIUM RESULTS.':'CREATE FASTER.').slice(0,30);
  $('endUrl').value=$('endUrl').value.trim()||'velqoza.com';
  createBrief();
  prepare();
  projectMessage('Storyboard auto-written from your prompt.');
}

function createBrief(){
  const brand=el.brand.value.trim()||'YOUR BRAND';
  const prompt=el.prompt.value.trim()||'A cinematic brand launch';
  const scenes=readScenes();
  const kws=pickKeywords(prompt);
  const hook=scenes.introMain+' '+scenes.introSub;
  const voice=[scenes.introMain+'.',`It starts with ${shortPhrase(prompt,6)||'a simple idea'}.`,`${brand} turns it into something real.`,`${scenes.finalMain} ${scenes.finalSub}`].join(' ');
  const shotPlan=[
    `1) Hook — large typography reveal: "${scenes.introMain} / ${scenes.introSub}"`,
    `2) Idea — show the prompt or business concept, focus on ${kws[0]||'the main offer'}`,
    `3) Build — interface / product reveal with caption "${scenes.buildLabel}"`,
    `4) Reveal — final brand lockup, CTA and URL "${scenes.endUrl}"`
  ].join('\n');
  const bestFor = kws.length?`Best suited for: ${kws.join(', ')}.`:'Best suited for short brand launches and social ads.';
  el.brief.textContent=`HOOK\n${hook}\n\nVOICEOVER\n${voice}\n\nSHOT PLAN\n${shotPlan}\n\nCREATIVE NOTE\nUse the ${el.style.options[el.style.selectedIndex].text} look, ${ratio} framing, ${el.duration.value}s runtime and ${el.music.options[el.music.selectedIndex].text.toLowerCase()}.\n${bestFor}`;
  saveDraft();
  return el.brief.innerText;
}

function initializeProjects(){
  refreshProjects();
  document.querySelectorAll('[data-template]').forEach(btn=>btn.addEventListener('click',()=>selectTemplate(btn.dataset.template)));
  for(const kind of ['idea','build']){const [input,,remove]=photoIds[kind];$(input).addEventListener('change',e=>handlePhotoUpload(kind,e.target.files?.[0]));$(remove).addEventListener('click',()=>{const [i]=photoIds[kind];$(i).value='';setPhoto(kind,null)})}
  $('photoFit').addEventListener('change',prepare);
  for(const id of SCENE_FIELDS)$(id).addEventListener('input',()=>{if(!recording){config=buildConfig();render(current);saveDraft()}});
  ['prompt','brandName','style','duration','accent','music','projectName'].forEach(id=>$(id).addEventListener('input',()=>{saveDraft()}));
  PACE_FIELDS.forEach(k=>$(PACE_IDS[k]).addEventListener('input',()=>{updatePaceLabels();prepare();saveDraft()}));
  $('saveProject').addEventListener('click',()=>{try{const data=getSaved(),id=$('savedProjects').value||('p_'+Date.now().toString(36));data[id]={...snapshot(),savedAt:Date.now()};setSaved(data);refreshProjects(id);projectMessage('Project saved on this device.')}catch(e){projectMessage('Save failed: '+e.message)}});
  $('loadProject').addEventListener('click',()=>{const id=$('savedProjects').value,project=getSaved()[id];if(!project)return projectMessage('Select a project first.');applyProject(project,true)});
  $('deleteProject').addEventListener('click',()=>{const id=$('savedProjects').value;if(!id)return projectMessage('Select a project first.');if(!confirm('Delete this saved project?'))return;const data=getSaved();delete data[id];setSaved(data);refreshProjects();projectMessage('Saved project deleted.')});
  $('newProject').addEventListener('click',()=>{applyProject({name:'Untitled Project',prompt:'A cinematic launch ad for my business',brand:'MY BRAND',style:'cinematic',duration:20,accent:'#ad8aff',music:'cinematic',ratio:'9:16',scenes:DEFAULT_SCENES,pacing:DEFAULT_PACING,brief:'',images:{idea:null,build:null}});$('savedProjects').value='';logoImage=null;$('logo').value='';$('logoName').textContent='No logo selected';prepare();projectMessage('New project started.')});
  $('exportProject').addEventListener('click',()=>{downloadBlob(new Blob([JSON.stringify(snapshot(),null,2)],{type:'application/json'}),'velqoza-studio-project.json');projectMessage('Project JSON exported. Uploaded logo is not included; scene photos are included.')});
  $('importProject').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>1550000)return projectMessage('JSON file is too large (1.55 MB limit).');try{const p=JSON.parse(await file.text());applyProject(p,false);$('savedProjects').value='';projectMessage('Project imported. Save it to keep it on this device.')}catch(err){projectMessage('Import failed: '+err.message)}finally{e.target.value=''}});
  document.querySelectorAll('[data-jump]').forEach(btn=>btn.addEventListener('click',()=>{stop();render(jumpTime(btn.dataset.jump))}));
  document.addEventListener('keydown',e=>{if(e.code==='Space'&&!['INPUT','TEXTAREA','SELECT','BUTTON'].includes(document.activeElement?.tagName)){e.preventDefault();togglePlay()}});
  $('autoStoryboard').addEventListener('click',autoStoryboard);
  $('generateBrief').addEventListener('click',()=>{createBrief();projectMessage('Creative brief updated.')});
}

function setRatio(next){ratio=next;const dims=next==='9:16'?[540,960]:next==='16:9'?[960,540]:[760,760];canvas.width=dims[0];canvas.height=dims[1];el.stage.style.aspectRatio=next==='9:16'?'9/16':next==='16:9'?'16/9':'1/1';el.stage.style.height=next==='9:16'?'min(610px,62vh)':'auto';el.stage.style.maxHeight='600px';document.querySelectorAll('.format').forEach(b=>b.classList.toggle('active',b.dataset.ratio===next));render(current)}
function buildConfig(){const prompt=el.prompt.value.trim()||'A cinematic brand launch';const brand=el.brand.value.trim()||'YOUR BRAND';const parsed=prompt.replace(/https?:\/\/\S+/g,'').replace(/[\n\r]+/g,' ').trim();const sentence=parsed.length>80?parsed.slice(0,77)+'…':parsed;return {prompt:sentence,brand,style:el.style.value,duration:Number(el.duration.value),accent:el.accent.value,music:el.music.value,ratio,logo:logoImage,scenes:readScenes(),pacing:normalizedPacing(),photoFit:$('photoFit').value,photos:{idea:photoState.idea?.img||null,build:photoState.build?.img||null}}}

const EDITABLE_IDS=['introMain','introSub','ideaPhoto','ideaLabel','buildPhoto','buildObject','buildLabel','logoObject','finalMain','finalSub','endUrl'];
const TEXT_ELEMENTS=new Set(['introMain','introSub','ideaLabel','buildLabel','finalMain','finalSub','endUrl']);
const ELEMENT_LABELS={introMain:'Opening headline',introSub:'Opening subheadline',ideaPhoto:'Scene 2 image / prompt card',ideaLabel:'Scene 2 caption',buildPhoto:'Scene 3 image',buildObject:'Scene 3 animated object',buildLabel:'Scene 3 caption',logoObject:'Brand logo / name',finalMain:'Closing headline',finalSub:'Closing subheadline',endUrl:'Website / CTA'};
function editFor(id){return objectEdits[id]||{x:0,y:0,scale:1}}
function xform(id,x,y,fn){const e=editFor(id);ctx.save();ctx.translate(x+(e.x/100)*canvas.width,y+(e.y/100)*canvas.height);ctx.scale(e.scale,e.scale);ctx.translate(-x,-y);fn();ctx.restore()}
function hit(id,x,y,w,h,alpha=1){if(alpha<.12||recording)return;const e=editFor(id),cx=x+w/2+(e.x/100)*canvas.width,cy=y+h/2+(e.y/100)*canvas.height;hitRegions.push({id,x:cx-w*e.scale/2,y:cy-h*e.scale/2,w:w*e.scale,h:h*e.scale})}
function editableText(id,txt,x,y,size,color,alpha=1,weight=700){const w=Math.max(100,Math.min(canvas.width*.88,Math.max(1,txt.length)*size*.54)),h=Math.max(size*1.6,34);xform(id,x,y,()=>textCenter(txt,x,y,size,color,alpha,weight));hit(id,x-w/2,y-h/2,w,h,alpha)}
function editablePhoto(id,img,x,y,w,h,fit,alpha){xform(id,x+w/2,y+h/2,()=>{if(img){ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();drawPhoto(img,x,y,w,h,fit);ctx.restore()}else{ctx.save();ctx.strokeStyle='#b6a3ff';ctx.lineWidth=3;ctx.strokeRect(x,y,w,h);ctx.restore()}});hit(id,x,y,w,h,alpha)}
function editableObject(id,x,y,w,h,drawFn,alpha){xform(id,x+w/2,y+h/2,drawFn);hit(id,x,y,w,h,alpha)}
function currentScene(){const t=current/Number(el.duration.value),b=getBounds();return Object.keys(b).find(k=>t>=b[k][0]&&t<b[k][1])||'reveal'}
function showInspector(){const panel=$('elementInspector');if(!panel)return;panel.hidden=!activeElement;if(!activeElement)return;const id=activeElement,e=editFor(id);$('selectedElement').textContent=ELEMENT_LABELS[id]||id;$('elementTextWrap').hidden=!TEXT_ELEMENTS.has(id);$('elementPhotoWrap').hidden=!['ideaPhoto','buildPhoto'].includes(id);$('elementObjectWrap').hidden=id!=='buildObject';if(TEXT_ELEMENTS.has(id))$('elementText').value=$(id).value;$('elementX').value=e.x;$('elementY').value=e.y;$('elementScale').value=Math.round(e.scale*100);updateTransformLabels()}
function updateTransformLabels(){$('elementXVal').textContent=$('elementX').value+'%';$('elementYVal').textContent=$('elementY').value+'%';$('elementScaleVal').textContent=$('elementScale').value+'%'}
function selectElement(id){if(recording||!EDITABLE_IDS.includes(id))return;stop();activeElement=id;showInspector();render(current)}
function deselect(){activeElement=null;showInspector();render(current)}
function setEditValue(id,key,value){objectEdits[id]??={x:0,y:0,scale:1};objectEdits[id][key]=value;config=buildConfig();render(current);saveDraft()}
function canvasCoords(ev){const box=canvas.getBoundingClientRect();return {x:(ev.clientX-box.left)*canvas.width/box.width,y:(ev.clientY-box.top)*canvas.height/box.height}}
function initElementEditor(){
 canvas.style.cursor='pointer';
 canvas.addEventListener('pointerdown',ev=>{if(recording)return;stop();const p=canvasCoords(ev);const region=[...hitRegions].reverse().find(r=>p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h);if(!region){deselect();return}selectElement(region.id);dragState={id:region.id,x:p.x,y:p.y,ex:editFor(region.id).x,ey:editFor(region.id).y};canvas.setPointerCapture(ev.pointerId)});
 canvas.addEventListener('pointermove',ev=>{if(!dragState||recording)return;const p=canvasCoords(ev);setEditValue(dragState.id,'x',clamp(dragState.ex+100*(p.x-dragState.x)/canvas.width,-40,40));setEditValue(dragState.id,'y',clamp(dragState.ey+100*(p.y-dragState.y)/canvas.height,-40,40));showInspector()});
 for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,()=>{dragState=null});
 $('elementText').addEventListener('input',()=>{if(!TEXT_ELEMENTS.has(activeElement))return;$(activeElement).value=$('elementText').value;config=buildConfig();render(current);saveDraft()});
 for(const key of ['X','Y','Scale'])$('element'+key).addEventListener('input',()=>{if(!activeElement)return;const value=key==='Scale'?Number($('elementScale').value)/100:Number($('element'+key).value);setEditValue(activeElement,key.toLowerCase(),value);updateTransformLabels()});
 $('resetElement').addEventListener('click',()=>{if(!activeElement)return;delete objectEdits[activeElement];showInspector();render(current);saveDraft()});
 $('closeElement').addEventListener('click',deselect);
 $('replaceElementPhoto').addEventListener('click',()=>$(activeElement==='ideaPhoto'?'ideaPhoto':'buildPhoto').click());
 $('jumpEditIntro').addEventListener('click',()=>{stop();render(jumpTime('intro')+Math.min(1.5,Number(el.duration.value)*.065));deselect()});
 $('jumpEditIdea').addEventListener('click',()=>{stop();render(jumpTime('idea')+Math.min(1.5,Number(el.duration.value)*.065));deselect()});
 $('jumpEditBuild').addEventListener('click',()=>{stop();render(jumpTime('build')+Math.min(1.5,Number(el.duration.value)*.065));deselect()});
 $('jumpEditReveal').addEventListener('click',()=>{stop();render(jumpTime('reveal')+Math.min(1.5,Number(el.duration.value)*.065));deselect()});
}

// V0.6: A true editable overlay track on the same canvas used for export.
function normalizeLayer(raw){
 if(!raw||typeof raw!=='object'||!['text','shape','image'].includes(raw.type))return null;
 const duration=Number(el.duration.value)||20;
 const start=clamp(Number(raw.start)||0,0,duration-.1);
 const end=clamp(Number(raw.end)||duration,start+.1,duration);
 return {id:String(raw.id||('layer-'+Date.now())).slice(0,80),type:raw.type,src:raw.type==='image'&&typeof raw.src==='string'&&/^data:image\/(?:jpeg|png|webp);base64,/i.test(raw.src)&&raw.src.length<300000?raw.src:null,animation:['none','fade','pop','slide-up'].includes(raw.animation)?raw.animation:'fade',text:safeString(raw.text,90)||(raw.type==='image'?'PHOTO':'NEW LAYER'),start,end,color:/^#[0-9a-f]{6}$/i.test(raw.color)?raw.color:'#ffffff',size:clamp(Number(raw.size)||40,12,110),x:clamp(Number(raw.x ?? 50),0,100),y:clamp(Number(raw.y ?? 50),0,100),scale:clamp(Number(raw.scale)||100,20,300),opacity:clamp(Number(raw.opacity ?? 100),0,100),keyframes:Array.isArray(raw.keyframes)?raw.keyframes.slice(0,100).map(k=>({t:clamp(Number(k.t)||0,0,duration),x:clamp(Number(k.x ?? 50),0,100),y:clamp(Number(k.y ?? 50),0,100),scale:clamp(Number(k.scale)||100,20,300),opacity:clamp(Number(k.opacity ?? 100),0,100)})).sort((a,b)=>a.t-b.t):[]};
}
function serializedLayers(){return JSON.stringify(layers)}
function updateHistoryButtons(){
  $('undoLayer').disabled=!undoLayers.length;$('redoLayer').disabled=!redoLayers.length;
  $('historyStatus').textContent=`${undoLayers.length} undo · ${redoLayers.length} redo`;
}
function resetLayerHistory(){undoLayers=[];redoLayers=[];lastLayerState=serializedLayers();if($('undoLayer'))updateHistoryButtons()}
function commitLayerHistory(){
  if(recording)return;
  const next=serializedLayers();if(next===lastLayerState)return;
  undoLayers.push(lastLayerState);if(undoLayers.length>MAX_LAYER_UNDO)undoLayers.shift();
  redoLayers=[];lastLayerState=next;updateHistoryButtons();saveDraft();
}
function applyLayerHistory(state){
  layers=JSON.parse(state).map(normalizeLayer).filter(Boolean).slice(0,30);
  activeLayerId=layers.some(l=>l.id===activeLayerId)?activeLayerId:null;
  refreshLayers();showLayerInspector();render(current);saveDraft();
  lastLayerState=serializedLayers();updateHistoryButtons();
}
function undoLayerEdit(){if(!undoLayers.length||recording)return;const previous=undoLayers.pop();redoLayers.push(serializedLayers());applyLayerHistory(previous)}
function redoLayerEdit(){if(!redoLayers.length||recording)return;const next=redoLayers.pop();undoLayers.push(serializedLayers());applyLayerHistory(next)}
function loadLayerImage(src){
  if(!src)return null;
  if(layerImages.has(src))return layerImages.get(src);
  const entry={img:null,ready:false};layerImages.set(src,entry);
  const img=new Image();img.onload=()=>{entry.img=img;entry.ready=true;render(current)};
  img.onerror=()=>{entry.ready=false};img.src=src;return entry;
}
function changeLayerOrder(direction){
  const index=layers.findIndex(l=>l.id===activeLayerId);
  if(index<0||recording)return;const next=index+direction;if(next<0||next>=layers.length)return;
  [layers[index],layers[next]]=[layers[next],layers[index]];refreshLayers();render(current);commitLayerHistory();
}
function duplicateSelectedLayer(){
  const index=layers.findIndex(l=>l.id===activeLayerId);if(index<0||recording)return;
  if(layers.length>=30)return projectMessage('Maximum 30 layers per project.');
  const layer=structuredClone(layers[index]);layer.id='layer-'+Date.now()+'-'+Math.floor(Math.random()*10000);
  layer.text=(layer.type==='image'?'PHOTO COPY':layer.text+' COPY').slice(0,90);
  layer.x=clamp(layer.x+4,0,100);layer.y=clamp(layer.y+4,0,100);
  layer.keyframes=layer.keyframes.map(k=>({...k,x:clamp(k.x+4,0,100),y:clamp(k.y+4,0,100)}));
  layers.splice(index+1,0,layer);activeLayerId=layer.id;
  refreshLayers();showLayerInspector();render(current);commitLayerHistory();
}
function createImageLayer(src){
  if(recording||!src)return;
  if(layers.length>=30)return projectMessage('Maximum 30 layers per project.');
  if(layers.filter(l=>l.type==='image').length>=3)return projectMessage('Maximum 3 image layers to keep cloud projects manageable.');
  const duration=Number(el.duration.value),start=Math.min(Math.max(0,current),duration-.5);
  const item=normalizeLayer({id:'image-'+Date.now(),type:'image',src,text:'PHOTO',start,end:Math.min(duration,start+Math.max(3,duration*.45)),x:50,y:48,size:74,scale:100,opacity:100,color:'#ffffff',keyframes:[],animation:'pop'});
  if(!item?.src)return projectMessage('Image could not be added.');
  layers.push(item);activeLayerId=item.id;activeElement=null;showInspector();stop();render(start+.2);refreshLayers();showLayerInspector();commitLayerHistory();
}
async function processLayerImage(file){
  if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024)return projectMessage('Use JPG / PNG / WebP smaller than 8 MB.');
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=url});
    let src='';for(const maxSide of [720,560,420]){
      const scale=Math.min(1,maxSide/Math.max(img.width,img.height));const cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(img.width*scale));cv.height=Math.max(1,Math.round(img.height*scale));cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);src=cv.toDataURL('image/webp',.68);if(!src.startsWith('data:image/webp;'))src=cv.toDataURL('image/jpeg',.62);if(src.length<230000)break;
    }
    if(src.length>=300000)throw new Error('This image is too complex to store. Try a smaller one.');
    // Account project endpoint caps JSON payload at 1.8MB; check after adding an image.
    const old=layerSelected();const replacing=replaceLayerImageNext&&old?.type==='image';
    if(replacing){const previous=old.src;old.src=src;
      if(JSON.stringify(snapshot()).length>1550000){old.src=previous;throw new Error('Project is too large to sync. Remove an image first.')}
      loadLayerImage(src);refreshLayers();render(current);commitLayerHistory();projectMessage('Image layer replaced.');
    }else{
      if(layers.filter(l=>l.type==='image').length>=3)throw new Error('Maximum 3 image layers per project.');
      createImageLayer(src);
      if(JSON.stringify(snapshot()).length>1550000){layers=layers.filter(l=>l.id!==activeLayerId);activeLayerId=null;refreshLayers();showLayerInspector();render(current);resetLayerHistory();throw new Error('Project too large for cloud sync. Use smaller images.')}
      loadLayerImage(src);projectMessage('Image layer added. Drag it and animate with keyframes.');
    }
  }catch(e){projectMessage('Image failed: '+e.message)}finally{URL.revokeObjectURL(url);replaceLayerImageNext=false;$('layerImageInput').value=''}
}
function layerSelected(){return layers.find(l=>l.id===activeLayerId)}
function createLayer(type){
 if(recording)return;
 if(layers.length>=30)return projectMessage('Maximum 30 custom layers per project.');
 const dur=Number(el.duration.value),start=Math.min(Math.max(0,current),dur-.5);
 const l=normalizeLayer({id:'layer-'+Date.now()+'-'+Math.floor(Math.random()*10000),type,text:type==='text'?'NEW TEXT':'◆',start,end:Math.min(dur,start+Math.max(2,dur*.35)),x:50,y:48,size:42,scale:100,opacity:100,color:type==='text'?'#ffffff':el.accent.value,keyframes:[]});
 layers.push(l);activeLayerId=l.id;activeElement=null;showInspector();stop();render(start+.12);refreshLayers();showLayerInspector();commitLayerHistory();
}
function refreshLayers(){
 const root=$('layerList');if(!root)return;root.replaceChildren();
 const dur=Number(el.duration.value);
 if(!layers.length){const msg=document.createElement('p');msg.className='hint';msg.textContent='No extra layers yet. Add text or shape above.';root.append(msg)}
 for(const l of layers){
  const b=document.createElement('button');b.type='button';b.className='layer-item'+(l.id===activeLayerId?' active':'');
  const t=document.createElement('span');t.className='layer-label';t.textContent=(l.type==='shape'?'◆ Shape: ':l.type==='image'?'▧ Image: ':'T Text: ')+l.text;
  const sub=document.createElement('small');sub.textContent=l.start.toFixed(1)+'–'+l.end.toFixed(1)+'s · '+l.keyframes.length+' keyframes';t.append(sub);
  const track=document.createElement('span');track.className='layer-track';const fill=document.createElement('b');fill.style.left=(l.start/dur*100)+'%';fill.style.width=((l.end-l.start)/dur*100)+'%';track.append(fill);b.append(t,track);
  b.addEventListener('click',()=>{activeLayerId=l.id;stop();render(clamp(current,l.start+.15,l.end-.1));refreshLayers();showLayerInspector()});root.append(b)
 }
 const bar=$('layerTimebar');bar.replaceChildren();for(const mark of [0,.25,.5,.75,1]){const item=document.createElement('span');item.textContent=(dur*mark).toFixed(1)+'s';bar.append(item)}
}
function showLayerInspector(){const root=$('layerInspector');const l=layerSelected();root.hidden=!l;if(!l)return;
 $('layerSelectedTitle').textContent=l.type==='text'?'Text layer':l.type==='image'?'Image layer':'Shape layer';
 $('layerTextTools').hidden=l.type==='image';$('layerImageTools').hidden=l.type!=='image';$('layerAnimation').value=l.animation||'fade';
 for(const [id,value] of [['layerText',l.text],['layerStart',l.start],['layerEnd',l.end],['layerFontSize',l.size],['layerColor',l.color],['layerX',l.x],['layerY',l.y],['layerScale',l.scale],['layerOpacity',l.opacity]])$(id).value=value;
 updateKeyframeStatus();
}
function updateKeyframeStatus(){const l=layerSelected();if(!l)return;$('layerKeyframes').textContent=l.keyframes.length?l.keyframes.map(k=>'◆ '+k.t.toFixed(1)+'s').join('  ·  '):'No keyframes yet. Move playhead, set position and press Add keyframe.'}
function readLayerFields(){const l=layerSelected();if(!l)return;const duration=Number(el.duration.value);
 if(l.type!=='image')l.text=safeString($('layerText').value,90)||' ';l.animation=$('layerAnimation').value;l.start=clamp(Number($('layerStart').value)||0,0,duration-.1);l.end=clamp(Number($('layerEnd').value)||duration,l.start+.1,duration);
 l.size=clamp(Number($('layerFontSize').value)||40,12,110);l.color=$('layerColor').value;
 l.x=clamp(Number($('layerX').value)||0,0,100);l.y=clamp(Number($('layerY').value)||0,0,100);
 l.scale=clamp(Number($('layerScale').value)||100,20,300);l.opacity=clamp(Number($('layerOpacity').value)||100,0,100);
 refreshLayers();render(current);commitLayerHistory();
}
function layerPosition(l,t){const frames=l.keyframes;let before=null,after=null;
 for(const k of frames){if(k.t<=t)before=k;if(k.t>t){after=k;break}}
 if(!before&&!after)return {x:l.x,y:l.y,scale:l.scale,opacity:l.opacity};
 if(!before)return after;if(!after)return before;
 const a=clamp((t-before.t)/(after.t-before.t),0,1);return Object.fromEntries(['x','y','scale','opacity'].map(k=>[k,before[k]+(after[k]-before[k])*a]));
}
function drawLayers(t){layerHitRegions=[];const W=canvas.width,H=canvas.height;
 for(const l of layers){if(t<l.start||t>l.end)continue;
  const p=layerPosition(l,t);const x=p.x/100*W,y=p.y/100*H,scale=p.scale/100;
  const enter=clamp((t-l.start)/.55,0,1),out=clamp((l.end-t)/.22,0,1);
  const ease=smooth(enter);const anim=l.animation||'fade';
  const opacityIn=anim==='none'||anim==='pop'?1:ease;
  const pop=anim==='pop'?.65+.35*ease:1;
  const slide=anim==='slide-up'?(1-ease)*H*.075:0;
  ctx.save();ctx.translate(x,y+slide);ctx.scale(scale*pop,scale*pop);ctx.globalAlpha=clamp(p.opacity/100*opacityIn*out,0,1);
  const fs=l.size*W/540;
  let imageWidth=0,imageHeight=0;
  if(l.type==='shape'){const size=fs*1.9;ctx.rotate(Math.PI/4);rounded(-size/2,-size/2,size,size,size*.12,l.color)}
  else if(l.type==='image'){
    imageWidth=clamp(W*.45*(l.size/74),W*.09,W*.83);
    const entry=loadLayerImage(l.src);const img=entry?.ready?entry.img:null;
    imageHeight=img?clamp(imageWidth*img.height/img.width,H*.06,H*.54):imageWidth*.7;
    if(img){ctx.save();ctx.shadowColor='#00000088';ctx.shadowBlur=18;ctx.drawImage(img,-imageWidth/2,-imageHeight/2,imageWidth,imageHeight);ctx.restore()}
    else{rounded(-imageWidth/2,-imageHeight/2,imageWidth,imageHeight,8,'#4d4268');textCenter('LOADING IMAGE',0,0,fs*.32,'#ffffff')}
  }
  else{textCenter(l.text,0,0,fs,l.color,1,700)}ctx.restore();
  if(!recording){const ww=l.type==='image'?imageWidth*scale*pop:l.type==='shape'?fs*2*scale:Math.max(65*W/540,Math.min(W*.9,l.text.length*fs*.56*scale));const hh=l.type==='image'?imageHeight*scale*pop:Math.max(30*H/960,fs*2*scale);layerHitRegions.push({id:l.id,x:x-ww/2,y:y+slide-hh/2,w:ww,h:hh});
   if(activeLayerId===l.id){ctx.save();ctx.strokeStyle='#83ffd2';ctx.setLineDash([8,5]);ctx.lineWidth=2;ctx.strokeRect(x-ww/2,y-hh/2,ww,hh);ctx.restore()}}
 }
}
function initLayers(){
 $('addTextLayer').addEventListener('click',()=>createLayer('text'));$('addShapeLayer').addEventListener('click',()=>createLayer('shape'));
  $('addImageLayer').addEventListener('click',()=>{replaceLayerImageNext=false;$('layerImageInput').click()});
  $('replaceLayerImage').addEventListener('click',()=>{if(layerSelected()?.type==='image'){replaceLayerImageNext=true;$('layerImageInput').click()}});
  $('layerImageInput').addEventListener('change',e=>processLayerImage(e.target.files?.[0]));
  $('duplicateLayer').addEventListener('click',duplicateSelectedLayer);
  $('layerBackward').addEventListener('click',()=>changeLayerOrder(-1));
  $('layerForward').addEventListener('click',()=>changeLayerOrder(1));
  $('undoLayer').addEventListener('click',undoLayerEdit);$('redoLayer').addEventListener('click',redoLayerEdit);
  $('layerAnimation').addEventListener('change',readLayerFields);
  document.addEventListener('keydown',e=>{
    if(recording||!(e.metaKey||e.ctrlKey)||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
    if(e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redoLayerEdit():undoLayerEdit()}
    else if(e.key.toLowerCase()==='y'){e.preventDefault();redoLayerEdit()}
    else if(e.key.toLowerCase()==='d'&&layerSelected()){e.preventDefault();duplicateSelectedLayer()}
  });
 for(const id of ['layerText','layerStart','layerEnd','layerFontSize','layerColor','layerX','layerY','layerScale','layerOpacity'])$(id).addEventListener('input',readLayerFields);
 $('layerDelete').addEventListener('click',()=>{if(recording)return;layers=layers.filter(l=>l.id!==activeLayerId);activeLayerId=null;refreshLayers();showLayerInspector();render(current);commitLayerHistory()});
 $('addKeyframe').addEventListener('click',()=>{const l=layerSelected();if(!l||recording)return;readLayerFields();const t=clamp(current,l.start,l.end);const k={t,x:l.x,y:l.y,scale:l.scale,opacity:l.opacity};l.keyframes=l.keyframes.filter(e=>Math.abs(e.t-t)>.06);l.keyframes.push(k);l.keyframes.sort((a,b)=>a.t-b.t);refreshLayers();updateKeyframeStatus();render(current);commitLayerHistory()});
 $('deleteKeyframe').addEventListener('click',()=>{const l=layerSelected();if(!l||recording||!l.keyframes.length)return;let at=0;for(let i=1;i<l.keyframes.length;i++)if(Math.abs(l.keyframes[i].t-current)<Math.abs(l.keyframes[at].t-current))at=i;l.keyframes.splice(at,1);refreshLayers();updateKeyframeStatus();render(current);commitLayerHistory()});
 // Capture-phase hit testing so overlay elements take priority over built-in objects.
 canvas.addEventListener('pointerdown',ev=>{if(recording)return;const p=canvasCoords(ev);const r=[...layerHitRegions].reverse().find(r=>p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h);if(!r)return;ev.stopImmediatePropagation();stop();activeLayerId=r.id;activeElement=null;showInspector();refreshLayers();showLayerInspector();layerDrag={id:r.id,x:p.x,y:p.y,px:layerPosition(layerSelected(),current).x,py:layerPosition(layerSelected(),current).y};canvas.setPointerCapture(ev.pointerId);render(current)},true);
 canvas.addEventListener('pointermove',ev=>{if(!layerDrag||recording)return;ev.stopImmediatePropagation();const p=canvasCoords(ev),l=layerSelected();if(!l)return;l.x=clamp(layerDrag.px+(p.x-layerDrag.x)/canvas.width*100,0,100);l.y=clamp(layerDrag.py+(p.y-layerDrag.y)/canvas.height*100,0,100);if(l.keyframes.length){const nearest=l.keyframes.reduce((a,b)=>Math.abs(b.t-current)<Math.abs(a.t-current)?b:a);if(Math.abs(nearest.t-current)<.07){nearest.x=l.x;nearest.y=l.y}else{l.keyframes.push({t:current,x:l.x,y:l.y,scale:l.scale,opacity:l.opacity});l.keyframes.sort((a,b)=>a.t-b.t)}}$('layerX').value=Math.round(l.x);$('layerY').value=Math.round(l.y);render(current);saveDraft()},true);
 ['pointerup','pointercancel','lostpointercapture'].forEach(type=>canvas.addEventListener(type,()=>{if(layerDrag){layerDrag=null;refreshLayers();commitLayerHistory()}},true));
 refreshLayers();showLayerInspector();resetLayerHistory();
}

function draw(t){
  if(!config)config=buildConfig();const c=config;const W=canvas.width,H=canvas.height,C=c.accent,land=W>H;let unit=Math.min(W,land?H*1.28:W),center=W/2;const sec=t,cFrac=sec/c.duration,bounds=getBounds();hitRegions=[];
  const palettes={cinematic:['#050611','#100b1d'],minimal:['#0b0c13','#242135'],neon:['#030c14','#091c2d'],luxury:['#120d08','#24180d']};let pal=palettes[c.style]||palettes.cinematic;
  const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,pal[0]);bg.addColorStop(.58,pal[1]);bg.addColorStop(1,'#050611');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
  const rad=ctx.createRadialGradient(center,H*.46,0,center,H*.46,W*.9);rad.addColorStop(0,rgba(C,.22));rad.addColorStop(1,rgba(C,0));ctx.fillStyle=rad;ctx.fillRect(0,0,W,H);
  for(let i=0;i<46;i++){const k=i*137.51;const px=(Math.sin(k*1.75)*.48+.5)*W,py=(Math.cos(k*.73)*.48+.5)*H;const size=1.5+(i%5)*.7;ctx.fillStyle=rgba(C,(.10+.24*(Math.sin(t*1.5+i)+1)/2));ctx.fillRect(px+Math.sin(t*.27+i)*8,py+Math.cos(t*.34+i)*8,size,size)}
  ctx.fillStyle=rgba('#ffffff',.38);ctx.font=font(unit*.018,600);ctx.textAlign='center';ctx.fillText('VELQOZA  /  STUDIO',center,H*.1);

  const intro=sceneWindow(sec,c.duration,bounds,0);if(intro>0){ctx.save();ctx.translate(center,H*.46);ctx.rotate(Math.sin(t*.5)*.045);ctx.strokeStyle=rgba(C,intro*.65);ctx.lineWidth=2;for(let j=0;j<3;j++){ctx.save();ctx.rotate(j*Math.PI/3+t*.08);ctx.scale(1,.4+j*.1);ctx.beginPath();ctx.ellipse(0,0,unit*.36,unit*.35,0,0,Math.PI*2);ctx.stroke();ctx.restore()}ctx.restore();editableText('introMain',c.scenes.introMain,center,H*.43,Math.min(unit*.105,unit*3.7/Math.max(12,c.scenes.introMain.length)),'#ffffff',intro);editableText('introSub',c.scenes.introSub,center,H*.43+unit*.12,Math.min(unit*.105,unit*3.7/Math.max(12,c.scenes.introSub.length)),C,intro)}

  const idea=sceneWindow(sec,c.duration,bounds,1);if(idea>0){const cardW=unit*.83,cardH=unit*.49,x=center-cardW/2,y=H*.35;ctx.save();ctx.globalAlpha=idea;rounded(x,y,cardW,cardH,unit*.035,'#181b29');ctx.strokeStyle=rgba(C,.6);ctx.lineWidth=1;ctx.strokeRect(x+1,y+1,cardW-2,cardH-2);rounded(x+unit*.04,y+unit*.05,cardW-unit*.08,unit*.09,unit*.015,'#25283b');ctx.fillStyle=C;ctx.beginPath();ctx.arc(x+unit*.085,y+unit*.095,unit*.013,0,7);ctx.fill();if(c.photos.idea){ctx.save();ctx.beginPath();ctx.roundRect(x+unit*.04,y+unit*.16,cardW-unit*.08,unit*.27,unit*.016);ctx.clip();editablePhoto('ideaPhoto',c.photos.idea,x+unit*.04,y+unit*.16,cardW-unit*.08,unit*.27,c.photoFit,idea);ctx.restore()}else{hit('ideaPhoto',x+unit*.04,y+unit*.16,cardW-unit*.08,unit*.27,idea);const words=wrap(c.prompt,cardW-unit*.1,unit*.037,4);words.forEach((s,i)=>{const reveal=clamp((idea*1.4)-(i*.18),0,1);textCenter(s,center,y+unit*.21+i*unit*.055,unit*.037,'#e2dffc',reveal)})};ctx.restore();editableText('ideaLabel',c.scenes.ideaLabel,center,H*.7,Math.min(unit*.045,unit*3.9/Math.max(20,c.scenes.ideaLabel.length)),'#ffffff',idea)}

  const building=sceneWindow(sec,c.duration,bounds,2);if(building>0){ctx.save();ctx.globalAlpha=building;const cardW=unit*.8,cardH=unit*.76,yy=H*.30;rounded(center-cardW/2,yy,cardW,cardH,unit*.035,'#f1f0f7');rounded(center-cardW/2,yy,cardW,unit*.085,unit*.025,'#181621');ctx.fillStyle=C;for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(center-cardW/2+unit*(.065+i*.038),yy+unit*.045,unit*.012,0,7);ctx.fill()}rounded(center-cardW*.43,yy+unit*.16,cardW*.86,unit*.29,unit*.026,'#171326');if(c.photos.build){ctx.save();ctx.beginPath();ctx.roundRect(center-cardW*.43,yy+unit*.16,cardW*.86,unit*.29,unit*.026);ctx.clip();editablePhoto('buildPhoto',c.photos.build,center-cardW*.43,yy+unit*.16,cardW*.86,unit*.29,c.photoFit,building);ctx.restore()}else{editableObject('buildObject',center-unit*.10,yy+unit*.205,unit*.20,unit*.20,()=>{ctx.save();ctx.translate(center,yy+unit*.305);ctx.rotate(t*.3);ctx.strokeStyle=rgba(C,.8);ctx.lineWidth=unit*.008;ctx.strokeRect(-unit*.09,-unit*.09,unit*.18,unit*.18);ctx.restore()},building)}rounded(center-cardW*.43,yy+unit*.52,cardW*.42,unit*.037,unit*.008,'#bbb9c9');rounded(center-cardW*.43,yy+unit*.59,cardW*.58,unit*.025,unit*.008,'#d5d3df');rounded(center-cardW*.43,yy+unit*.65,cardW*.29,unit*.06,unit*.014,C);ctx.restore();editableText('buildLabel',c.scenes.buildLabel,center,H*.78,Math.min(unit*.038,unit*3.8/Math.max(20,c.scenes.buildLabel.length)),'#ffffff',building)}

  const finale=sceneWindow(sec,c.duration,bounds,3);if(finale>0){ctx.save();ctx.globalAlpha=finale;const size=unit*.11;const logoY=H*.43;if(c.logo){const maxW=unit*.65,maxH=unit*.20;const scale=Math.min(maxW/c.logo.width,maxH/c.logo.height);editableObject('logoObject',center-c.logo.width*scale/2,logoY-unit*.14,c.logo.width*scale,c.logo.height*scale,()=>ctx.drawImage(c.logo,center-c.logo.width*scale/2,logoY-unit*.14,c.logo.width*scale,c.logo.height*scale),finale)}else{editableObject('logoObject',center-unit*.34,logoY-unit*.065,unit*.68,unit*.13,()=>textCenter(c.brand,center,logoY,size,'#ffffff',1),finale)}editableText('finalMain',c.scenes.finalMain,center,H*.57,Math.min(unit*.047,unit*3.6/Math.max(20,c.scenes.finalMain.length)),'#ffffff');editableText('finalSub',c.scenes.finalSub,center,H*.57+unit*.075,Math.min(unit*.072,unit*3.6/Math.max(13,c.scenes.finalSub.length)),C);editableText('endUrl',c.scenes.endUrl,center,H*.81,Math.min(unit*.033,unit*3.7/Math.max(18,c.scenes.endUrl.length)),'#ffffff');rounded(center-unit*.25,H*.70,unit*.5,unit*.003,unit*.001,C);ctx.restore()}
  textCenter(`CREATED WITH ${c.brand.toUpperCase()}`,center,H*.93,unit*.021,rgba('#ffffff',.5));
  drawLayers(t);
  if(activeElement&&!recording){const r=hitRegions.find(h=>h.id===activeElement);if(r){ctx.save();ctx.setLineDash([8,5]);ctx.strokeStyle='#b5ffdc';ctx.lineWidth=Math.max(2,W*.005);ctx.strokeRect(r.x,r.y,r.w,r.h);ctx.restore()}}
  if(land){ctx.fillStyle='#03040a';ctx.fillRect(0,0,W,H*.055);ctx.fillRect(0,H*.945,W,H*.055)}
}

function render(t){current=clamp(t,0,Number(el.duration.value));draw(current);el.scrub.value=current;const f=n=>String(Math.floor(n)).padStart(2,'0');el.time.textContent=`${f(current/60)}:${f(current%60)} / 00:${f(Number(el.duration.value))}`}
function stop(){play=false;cancelAnimationFrame(raf);$('playIcon').textContent='▶';el.play.lastChild.textContent=' Play preview'}
function loop(ts){if(!play)return;const dt=(ts-startTime)/1000;if(dt>=Number(el.duration.value)){stop();render(Number(el.duration.value));return}render(dt);raf=requestAnimationFrame(loop)}
function togglePlay(){if(recording)return;if(play){stop();return}if(current>=Number(el.duration.value)-.05)render(0);play=true;startTime=performance.now()-current*1000;$('playIcon').textContent='Ⅱ';el.play.lastChild.textContent=' Pause';raf=requestAnimationFrame(loop)}
function prepare(save=true){stop();config=buildConfig();render(0);el.download.disabled=false;el.status.textContent='Concept ready. Preview it, then export your video.';if(save)saveDraft()}

for(const b of document.querySelectorAll('.format'))b.addEventListener('click',()=>{if(recording)return;setRatio(b.dataset.ratio);prepare()});
el.accent.addEventListener('input',()=>{$('colorText').textContent=el.accent.value.toUpperCase();if(!recording)prepare()});el.generate.addEventListener('click',()=>{prepare();togglePlay()});el.play.addEventListener('click',togglePlay);el.scrub.addEventListener('input',e=>{stop();render(+e.target.value)});el.duration.addEventListener('change',()=>{el.scrub.max=el.duration.value;prepare()});

$('logo').addEventListener('change',e=>{const file=e.target.files?.[0];if(!file){logoImage=null;return}if(file.size>5e6){alert('Please upload an image smaller than 5 MB');e.target.value='';return}const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{logoImage=img;URL.revokeObjectURL(url);$('logoName').textContent=file.name;prepare()};img.onerror=()=>{alert('Image could not be opened');URL.revokeObjectURL(url)};img.src=url});$('clearLogo').addEventListener('click',()=>{$('logo').value='';logoImage=null;$('logoName').textContent='No logo selected';prepare()});

function soundtrack(audioCtx,dest,duration,type){if(type==='off')return;const now=audioCtx.currentTime;const master=audioCtx.createGain();master.gain.setValueAtTime(.0001,now);master.gain.exponentialRampToValueAtTime(.16,now+.5);master.gain.setTargetAtTime(.0001,now+duration-.85,.22);master.connect(dest);const bank={ambient:[110,164.8,220],cinematic:[82.41,123.47,164.81],uplift:[98,146.8,196]};const freq=bank[type]||bank.cinematic;freq.forEach((f,i)=>{const o=audioCtx.createOscillator(),g=audioCtx.createGain(),l=audioCtx.createBiquadFilter();o.type=type==='uplift'?(i===0?'triangle':'sine'):(i===0?'sine':'triangle');o.frequency.value=f;l.type='lowpass';l.frequency.value=type==='uplift'?680:440;g.gain.value=i===0?.19:.055;o.connect(l).connect(g).connect(master);o.start(now);o.stop(now+duration+.15)});for(let i=0;i<Math.ceil(duration/2);i++){const o=audioCtx.createOscillator(),g=audioCtx.createGain(),at=now+i*(type==='uplift'?1.5:2);o.type='sine';o.frequency.setValueAtTime(type==='uplift'?120:90,at);o.frequency.exponentialRampToValueAtTime(type==='uplift'?62:42,at+.3);g.gain.setValueAtTime(.0001,at);g.gain.linearRampToValueAtTime(type==='uplift'?.12:.17,at+.012);g.gain.exponentialRampToValueAtTime(.0001,at+.58);o.connect(g).connect(master);o.start(at);o.stop(at+.6)}}
async function exportVideo(){if(recording)return;if(!await StudioAccount.requireBalance()){el.status.textContent='Sign in and check your credit balance to export MP4.';return}if(!window.MediaRecorder||!canvas.captureStream){el.status.textContent='Your browser cannot record canvas video. Try Chrome on desktop.';return}recording=true;stop();el.download.disabled=true;el.generate.disabled=true;el.play.disabled=true;const chosenType=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'].find(MediaRecorder.isTypeSupported);if(!chosenType){el.status.textContent='Video recording unavailable in this browser.';recording=false;el.download.disabled=false;el.generate.disabled=false;el.play.disabled=false;return}
  let actx=null,stream=null,rec=null;try{config=buildConfig();const duration=config.duration;const FPS=30;stream=canvas.captureStream(FPS);actx=new AudioContext();const dest=actx.createMediaStreamDestination();soundtrack(actx,dest,duration,config.music);const combined=new MediaStream([...stream.getVideoTracks(),...dest.stream.getAudioTracks()]);let chunks=[];rec=new MediaRecorder(combined,{mimeType:chosenType,videoBitsPerSecond:5500000,audioBitsPerSecond:160000});rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};const finished=new Promise((resolve,reject)=>{rec.onerror=e=>reject(e.error||new Error('Recorder failed'));rec.onstop=()=>resolve(new Blob(chunks,{type:chosenType.split(';')[0]}))});rec.start(800);const started=performance.now();await new Promise(resolve=>{function tick(){const elapsed=(performance.now()-started)/1000;if(elapsed>=duration){render(duration);resolve();return}render(elapsed);el.status.textContent=`Recording video… ${Math.round(100*elapsed/duration)}%. Keep this tab open.`;requestAnimationFrame(tick)}requestAnimationFrame(tick)});rec.stop();const blob=await finished;combined.getTracks().forEach(t=>t.stop());await actx.close();actx=null;
    el.status.textContent='Rendering finished. Preparing MP4 on server…';
    const resp=await fetch('/api/convert',{method:'POST',credentials:'same-origin',headers:{'Content-Type':blob.type||'video/webm'},body:blob});
    if(!resp.ok){let message=`Server rejected export (${resp.status}).`;try{const error=await resp.json();message=error.error||message}catch{}throw new Error(message)}
    const mp4=await resp.blob();downloadBlob(mp4,'velqoza-studio.mp4');
    await StudioAccount.refreshCredits();
    el.status.textContent=`MP4 exported! ${StudioAccount.getPrice()} credits charged after successful conversion.`;

  }catch(e){console.error(e);el.status.textContent='Export failed: '+e.message}finally{if(rec?.state==='recording')rec.stop();stream?.getTracks().forEach(t=>t.stop());if(actx)actx.close().catch(()=>{});recording=false;el.download.disabled=false;el.generate.disabled=false;el.play.disabled=false;render(0)}}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
el.download.addEventListener('click',exportVideo);

// Cloud projects are private to the signed-in account; local saves continue to work.
let cloudCurrentId='';
async function refreshCloudProjects(){
  const select=$('cloudProjects');
  select.replaceChildren(new Option('Select a cloud project…',''));
  if(!StudioAccount.user()){$('cloudStatus').textContent='Sign in first to access account projects.';return}
  try{
    const {projects}=await StudioAccount.api('/api/projects');
    for(const p of projects)select.add(new Option(p.name,p.id));
    if(cloudCurrentId&&projects.some(p=>p.id===cloudCurrentId))select.value=cloudCurrentId;
    $('cloudStatus').textContent=`${projects.length} cloud project(s) available.`;
  }catch(e){$('cloudStatus').textContent='Could not load account projects: '+e.message}
}
$('cloudSave').addEventListener('click',async()=>{
  if(!StudioAccount.requireLogin())return;
  $('cloudStatus').textContent='Saving project…';
  try{
    const id=cloudCurrentId||('project_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7));
    const {project}=await StudioAccount.api('/api/projects/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(snapshot())});
    cloudCurrentId=project.id;await refreshCloudProjects();await refreshCloudHistory();
    $('cloudStatus').textContent='Saved privately to your account.';
  }catch(e){$('cloudStatus').textContent='Could not save: '+e.message}
});
$('cloudRefresh').addEventListener('click',refreshCloudProjects);
$('cloudProjects').addEventListener('change',ev=>{cloudCurrentId=ev.target.value;$('cloudVersions').replaceChildren(new Option('Choose a previous version…',''))});
async function refreshCloudHistory(){
  const id=$('cloudProjects').value;
  const select=$('cloudVersions');select.replaceChildren(new Option('Choose a previous version…',''));
  if(!StudioAccount.requireLogin())return;
  if(!id){$('cloudStatus').textContent='Choose a cloud project first.';return}
  try{
    const {versions}=await StudioAccount.api('/api/projects/'+id+'/versions');
    for(const item of versions){
      const dt=new Date(item.savedAt).toLocaleString();
      select.add(new Option(`${item.name} · ${dt}`,String(item.versionId)));
    }
    $('cloudStatus').textContent=versions.length?`${versions.length} older version(s) available.`:'No older versions yet. Save changes again to create history.';
  }catch(e){$('cloudStatus').textContent='Could not load history: '+e.message}
}
$('cloudHistory').addEventListener('click',refreshCloudHistory);
$('cloudRestore').addEventListener('click',async()=>{
  const id=$('cloudProjects').value;const versionId=Number($('cloudVersions').value);
  if(!StudioAccount.requireLogin())return;
  if(!id||!Number.isSafeInteger(versionId)||versionId<=0){$('cloudStatus').textContent='Choose a cloud project and a saved version.';return}
  if(!confirm('Restore this saved version? Your current cloud version will be kept in history.'))return;
  try{
    const {project}=await StudioAccount.api('/api/projects/'+id+'/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({versionId})});
    await applyProject(project.data,true);cloudCurrentId=id;
    await refreshCloudHistory();
    $('cloudStatus').textContent='Previous version restored. Current version was archived in history.';
  }catch(e){$('cloudStatus').textContent='Could not restore version: '+e.message}
});
$('cloudLoad').addEventListener('click',async()=>{
  const id=$('cloudProjects').value;
  if(!StudioAccount.requireLogin())return;
  if(!id){$('cloudStatus').textContent='Choose a project first.';return}
  try{const {project}=await StudioAccount.api('/api/projects/'+id);await applyProject(project.data,true);cloudCurrentId=id;$('cloudStatus').textContent='Cloud project opened.'}
  catch(e){$('cloudStatus').textContent='Could not open project: '+e.message}
});
$('cloudDelete').addEventListener('click',async()=>{
  if(!StudioAccount.requireLogin())return;
  const id=$('cloudProjects').value;if(!id)return;
  if(!confirm('Permanently delete this cloud project?'))return;
  try{await StudioAccount.api('/api/projects/'+id,{method:'DELETE'});cloudCurrentId='';await refreshCloudProjects();$('cloudStatus').textContent='Cloud project deleted.'}
  catch(e){$('cloudStatus').textContent='Could not delete project: '+e.message}
});
let lastAuthId=null;
window.addEventListener('studio-auth-change',()=>{const userId=StudioAccount.user()?.id||null;if(userId!==lastAuthId){lastAuthId=userId;cloudCurrentId='';refreshCloudProjects()}});
$('newProject').addEventListener('click',()=>{cloudCurrentId='';$('cloudProjects').value=''});


// V1.0: Chat-like command editing. Uses a deterministic local interpreter,
// not an LLM or third-party AI service. This adapter changes the REAL canvas state.
function applyStudioCommand(command){
 if(recording)throw new Error('Finish exporting before editing.');
 let layer=layerSelected();
 const requireLayer=()=>{if(!layer)throw new Error('Select a layer in the Timeline first.');return layer};
 switch(command.kind){
  case 'duration':{
   el.duration.value=String(command.value);el.scrub.max=el.duration.value;
   // Keep existing layers inside the chosen video length.
   for(const l of layers){l.start=clamp(l.start,0,command.value-.1);l.end=clamp(l.end,l.start+.1,command.value);l.keyframes=l.keyframes.filter(k=>k.t<=command.value)}
   prepare();refreshLayers();showLayerInspector();commitLayerHistory();
   return `Video length set to ${command.value} seconds. Layer timings are kept inside the new duration.`;
  }
  case 'ratio':{
   setRatio(command.value);prepare();
   return `Format changed to ${command.value}. The canvas and export now use this ratio.`;
  }
  case 'style':{
   el.style.value=command.value;prepare();
   return `Style changed to ${command.value}. The preview and final export use the new style.`;
  }
  case 'accent':{
   el.accent.value=command.value;$('colorText').textContent=command.value.toUpperCase();prepare();
   return `Accent color changed to ${command.value}.`;
  }
  case 'music':{
   el.music.value=command.value;prepare();
   return command.value==='off'?'Music disabled for the next export.':`Soundtrack set to ${command.value}.`;
  }
  case 'scene-text':{
   $(command.field).value=command.value;prepare();
   return `Changed ${command.field==='introMain'?'opening':'closing'} text to “${command.value}”.`;
  }
  case 'add-text':{
   if(layers.length>=30)throw new Error('Maximum 30 custom layers. Delete a layer first.');
   createLayer('text');layer=layerSelected();
   if(!layer)throw new Error('Layer could not be created.');
   layer.text=command.value.slice(0,90);
   // Show the newly added layer at a readable time in the preview.
   refreshLayers();showLayerInspector();render(clamp(layer.start+.65,layer.start,layer.end));commitLayerHistory();
   return `Text added as a new timeline layer: “${layer.text}”. Tap it to reposition it.`;
  }
  case 'selected-move':{
   const key=command.direction==='left'||command.direction==='right'?'x':'y';
   const delta=(command.direction==='right'||command.direction==='down'?1:-1)*command.step;
   if(layer){layer[key]=clamp(layer[key]+delta,0,100);refreshLayers();showLayerInspector();render(current);commitLayerHistory();
    return `Moved selected layer ${command.direction} by ${command.step}%.`}
   if(activeElement){setEditValue(activeElement,key,clamp(editFor(activeElement)[key]+delta,-40,40));showInspector();
    return `Moved selected ${activeElement} ${command.direction}.`}
   throw new Error('Select a text, image or object on the canvas or in the Timeline first.');
  }
  case 'selected-scale':{
   if(layer){layer.scale=clamp(layer.scale+command.delta,20,300);refreshLayers();showLayerInspector();render(current);commitLayerHistory();
    return `Selected layer scale is now ${layer.scale}%.`}
   if(activeElement){setEditValue(activeElement,'scale',clamp(editFor(activeElement).scale+command.delta/100,.5,2.2));showInspector();
    return `Selected object scale is now ${Math.round(editFor(activeElement).scale*100)}%.`}
   throw new Error('Select a text, image or object on the canvas or in the Timeline first.');
  }
  case 'selected-animation':{
   layer=requireLayer();layer.animation=command.animation;refreshLayers();showLayerInspector();render(current);commitLayerHistory();
   return `Selected layer animation set to ${command.animation}.`;
  }
  case 'selected-duplicate':{
   requireLayer();if(layers.length>=30)throw new Error('Maximum 30 layers.');duplicateSelectedLayer();
   return 'Selected layer duplicated. Its position and animation can be edited independently.';
  }
  case 'selected-delete':{
   requireLayer();layers=layers.filter(l=>l.id!==activeLayerId);activeLayerId=null;refreshLayers();showLayerInspector();render(current);commitLayerHistory();
   return 'Selected timeline layer deleted. You can use Undo to restore it.';
  }
  default: throw new Error('This command is not supported. Type help for examples.');
 }
}
attachStudioAssistant({isBusy:()=>recording,apply:applyStudioCommand});
initializeProjects();initElementEditor();initLayers();updatePaceLabels();setRatio('9:16');restoreDraft();prepare(false);

