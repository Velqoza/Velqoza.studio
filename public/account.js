// Auth + credit UX for the local Studio prototype. Sessions are HTTP-only cookies.
const $=id=>document.getElementById(id);
let current=null,pricing={exportCredits:10,welcomeCredits:50};
const API=async(path,options={})=>{
  const res=await fetch(path,{credentials:'same-origin',...options});
  const type=res.headers.get('content-type')||'';const data=type.includes('json')?await res.json():{};
  if(!res.ok)throw new Error(data.error||`Request failed (${res.status})`);
  return data;
};
function showStatus(msg){$('authStatus').textContent=msg}
function paint(){
  $('accountChip').textContent=current?`${current.credits} credits`:'Sign in / Register';
  $('accountInfo').textContent=current?`Signed in as ${current.email} · ${current.credits} credits`:'Create an account to save cloud projects and export MP4 videos.';
  $('accountLogout').hidden=!current;
  $('loginForm').hidden=Boolean(current);
  $('registrationForm').hidden=Boolean(current);
  $('accountSecurity').hidden=!current;
  $('creditPolicy').textContent=`${pricing.welcomeCredits} welcome credits · ${pricing.exportCredits} credits per successful MP4 export · No set limit on videos or edits. Previewing and editing are free. Buying credits is not enabled yet.`;
  $('exportPrice').textContent=`MP4 export costs ${pricing.exportCredits} credits. Editing and preview are free.`;
  window.dispatchEvent(new CustomEvent('studio-auth-change',{detail:current}));
}
function open(){ $('accountModal').hidden=false;paint();$('accountClose').focus() }
function close(){ $('accountModal').hidden=true;showStatus('') }
async function refresh(){try{pricing=await API('/api/pricing')}catch{}try{current=(await API('/api/account')).user}catch{current=null}paint();return current}
async function refreshCredits(){try{current=(await API('/api/account')).user;paint()}catch{current=null;paint()}}
function user(){return current}
function requireLogin(){if(current)return true;open();showStatus('Sign in or create an account before exporting MP4.');return false}
async function requireBalance(){if(!requireLogin())return false;await refreshCredits();if(!current)return false;if(current.credits<pricing.exportCredits){open();showStatus(`Insufficient credits. You have ${current.credits}; MP4 export costs ${pricing.exportCredits}.`);return false}return true}
async function refreshHistory(){if(!current){$('creditHistory').textContent='Sign in to see your credits.';return}try{const {events}=await API('/api/credits/history');$('creditHistory').replaceChildren();if(!events.length){$('creditHistory').textContent='No credit activity.';return}for(const e of events.slice(0,10)){const li=document.createElement('li');const date=new Date(e.createdAt).toLocaleDateString();li.textContent=`${e.delta>0?'+':''}${e.delta} · ${e.detail} · ${date}`;$('creditHistory').append(li)}}catch(e){$('creditHistory').textContent=e.message}}
function initialize(){
 $('accountChip').addEventListener('click',()=>{open();refreshHistory()});
 $('accountClose').addEventListener('click',close);
 $('accountModal').addEventListener('click',ev=>{if(ev.target===$('accountModal'))close()});
 $('accountLogout').addEventListener('click',async()=>{try{await API('/api/logout',{method:'POST'});current=null;paint();close()}catch(e){showStatus(e.message)}});
 $('loginForm').addEventListener('submit',async ev=>{ev.preventDefault();const button=$('loginSubmit');button.disabled=true;showStatus('Signing in…');try{const data=await API('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('loginEmail').value,password:$('loginPassword').value})});current=data.user;$('loginPassword').value='';paint();await refreshHistory();showStatus('Signed in successfully.');setTimeout(close,500)}catch(e){showStatus(e.message)}finally{button.disabled=false}});
 $('registrationForm').addEventListener('submit',async ev=>{ev.preventDefault();const button=$('registerSubmit');button.disabled=true;showStatus('Creating account…');try{const data=await API('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('registerEmail').value,password:$('registerPassword').value})});current=data.user;$('registerPassword').value='';paint();await refreshHistory();showStatus('Account created with welcome credits!');setTimeout(close,700)}catch(e){showStatus(e.message)}finally{button.disabled=false}});
 $('changePasswordForm').addEventListener('submit',async ev=>{
  ev.preventDefault();if(!current)return;
  const button=$('changePasswordSubmit');button.disabled=true;showStatus('Updating password…');
  try{
    await API('/api/account/change-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword:$('currentPassword').value,newPassword:$('newPassword').value})});
    $('currentPassword').value='';$('newPassword').value='';
    await refresh();showStatus('Password updated. All other sessions were signed out.');
  }catch(e){showStatus(e.message)}finally{button.disabled=false}
 });
 $('logoutAllDevices').addEventListener('click',async()=>{
   if(!current||!confirm('Log out on all devices, including this one?'))return;
   try{await API('/api/account/logout-all',{method:'POST'});current=null;paint();close()}catch(e){showStatus(e.message)}
 });
 document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&!$('accountModal').hidden)close()});
 refresh();
}
initialize();
export const StudioAccount={api:API,user,refresh,refreshCredits,requireLogin,requireBalance,open,getPrice:()=>pricing.exportCredits};
