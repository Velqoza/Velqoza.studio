import {parseStudioCommand,COMMAND_SAMPLES} from './studio-commands.js';

const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

/**
 * Chat UI coordinator. An editor adapter supplies supported local editing
 * operations, no arbitrary command execution or server-side AI dependency.
 */
export function attachStudioAssistant(adapter){
 const $=(id)=>document.getElementById(id);
 const log=$('studioChatLog'),input=$('studioChatInput'),form=$('studioChatForm'),status=$('studioAssistantStatus');
 if(!log||!input||!form||!status)return;
 const historyKey='velqoza-studio-command-history-v1';
 const transcript=[];
 function append(role,message,persist=true){
  const bubble=document.createElement('div');bubble.className='chat-bubble '+(role==='user'?'user':role==='error'?'error':'assistant');
  bubble.textContent=String(message).slice(0,700);
  log.appendChild(bubble);log.scrollTop=log.scrollHeight;
  if(persist){transcript.push({role,text:bubble.textContent});if(transcript.length>26)transcript.splice(0,transcript.length-26);try{sessionStorage.setItem(historyKey,JSON.stringify(transcript))}catch{}}
 }
 try{const old=JSON.parse(sessionStorage.getItem(historyKey)||'[]');if(Array.isArray(old)){for(const item of old.slice(-18)){if(['user','assistant','error'].includes(item.role)&&typeof item.text==='string'){append(item.role,item.text,false);transcript.push({role:item.role,text:item.text.slice(0,700)})}}}}catch{}
 async function execute(text){
  if(adapter.isBusy()){append('error','Video export is in progress. Edit when recording has finished.');return}
  append('user',text);const command=parseStudioCommand(text);
  if(command.kind==='help'){append('assistant',`Supported commands:\n• ${COMMAND_SAMPLES.join('\n• ')}\n• Change opening text to: HELLO\n• Duplicate selected layer\n• Delete selected layer`);return}
  if(command.kind==='error'){append('error',command.message);return}
  try{const message=await adapter.apply(command);append('assistant',message);status.textContent='Change applied. Preview, save or export your video.'}
  catch(e){const msg=(e&&e.message)||'Could not apply this change.';append('error',msg);status.textContent=msg}
 }
 form.addEventListener('submit',e=>{e.preventDefault();const value=input.value.trim();if(!value)return;input.value='';execute(value)});
 for(const button of document.querySelectorAll('[data-command]'))button.addEventListener('click',()=>execute(button.dataset.command));
 return {execute};
}
