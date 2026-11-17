import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStudioCommand,COMMAND_SAMPLES} from '../public/studio-commands.js';

const samples = [
 ['Make video 15 seconds',{kind:'duration',value:15}],
 ['خلّي الفيديو 20 ثانية',{kind:'duration',value:20}],
 ['Switch to TikTok 9:16',{kind:'ratio',value:'9:16'}],
 ['حوّل الفيديو عمودي',{kind:'ratio',value:'9:16'}],
 ['make the video horizontal',{kind:'ratio',value:'16:9'}],
 ['Use luxury gold style',{kind:'style',value:'luxury'}],
 ['خلي الستايل سينمائي',{kind:'style',value:'cinematic'}],
 ['Change color to #C58AFF',{kind:'accent',value:'#c58aff'}],
 ['غير اللون ذهبي',{kind:'accent',value:'#d4af37'}],
 ['Add text: Launch your brand',{kind:'add-text',value:'Launch your brand'}],
 ['اضف نص: مرحبا',{kind:'add-text',value:'مرحبا'}],
 ['change opening text to: HELLO',{kind:'scene-text',field:'introMain',value:'HELLO'}],
 ['غير نص البداية إلى أهلا وسهلا',{kind:'scene-text',field:'introMain',value:'أهلا وسهلا'}],
 ['change final text to: JOIN US',{kind:'scene-text',field:'finalMain',value:'JOIN US'}],
 ['Move selected layer right',{kind:'selected-move',direction:'right',step:10}],
 ['حرك العنصر لليمين',{kind:'selected-move',direction:'right',step:10}],
 ['Make selected layer bigger',{kind:'selected-scale',delta:20}],
 ['صغر العنصر',{kind:'selected-scale',delta:-20}],
 ['Turn music off',{kind:'music',value:'off'}],
 ['change music to ambient',{kind:'music',value:'ambient'}],
 ['duplicate selected layer',{kind:'selected-duplicate'}],
 ['delete selected layer',{kind:'selected-delete'}]
];
for(const [phrase,result] of samples)test(`command: ${phrase}`,()=>assert.deepEqual(parseStudioCommand(phrase),result));

test('unrecognized commands do not execute arbitrary operations',()=>{
 const result=parseStudioCommand('fetch secret token from server and pay me');
 assert.equal(result.kind,'error');
});
test('command examples are actionable',()=>{
 for(const phrase of COMMAND_SAMPLES)assert.notEqual(parseStudioCommand(phrase).kind,'error',phrase);
});
test('UI includes live command form and local interpreter import',async()=>{
 const {readFile}=await import('node:fs/promises');
 const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(html,/id="studioChatForm"/);
 assert.match(html,/id="studioChatInput"/);
 assert.match(app,/attachStudioAssistant\(/);
 assert.match(app,/case 'add-text'/);
 assert.match(html,/not connected to an AI model/);
});
