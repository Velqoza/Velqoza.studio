/**
 * VELQOZA Studio Assistant v1 — deterministic, offline command interpreter.
 * Never calls a remote AI service. No arbitrary code execution.
 */
const COLORS = Object.freeze({
  purple:'#a78bfa',violet:'#a78bfa',بنفسجي:'#a78bfa',gold:'#d4af37',golden:'#d4af37',ذهبي:'#d4af37',
  blue:'#3b82f6',أزرق:'#3b82f6',ازرق:'#3b82f6',red:'#ef4444',أحمر:'#ef4444',احمر:'#ef4444',
  green:'#22c55e',أخضر:'#22c55e',اخضر:'#22c55e',white:'#ffffff',أبيض:'#ffffff',ابيض:'#ffffff',
  pink:'#ec4899',وردي:'#ec4899',black:'#161616',أسود:'#161616',اسود:'#161616'
});
const clean = input => String(input??'').trim().replace(/\s+/g,' ').slice(0,400);
const unwrap = x=>x.replace(/^[\s:'"“”‘’]+|[\s'"“”‘’]+$/g,'').trim();
const isActionContext=s=>/\b(?:make|set|change|switch|turn|use|convert|video|duration|style|theme|music|sound|color|colour|background|format|ratio)\b|(?:خل|غير|غيّر|حول|حوّل|اجعل|خلي|ضبط|بدل|اللون|الصوت|الموسيقى|ستايل|مقاس|مدة|الفيديو|اختر)/i.test(s);
export const COMMAND_SAMPLES = Object.freeze([
 'Make video 15 seconds', 'Switch to TikTok 9:16', 'Use luxury gold style',
 'Change color to #c58aff', 'Add text: Launch your brand', 'Move selected layer right',
 'Make selected layer bigger', 'Turn music off'
]);
export function parseStudioCommand(input){
 const raw=clean(input);if(!raw)return {kind:'error',message:'Type a command to edit the video.'};
 const s=raw.toLowerCase();
 if(/^(help|commands|مساعدة|ساعدني|الاوامر|الأوامر|شو بقدر اعمل)[!؟?. ]*$/.test(s))return {kind:'help'};
 // Content commands are matched first to avoid accidentally treating quoted words as style changes.
 let m=raw.match(/^(?:add|insert)\s+(?:a\s+)?(?:text|caption|title)\s*(?::|saying\s+|that\s+says\s+)?\s*(.+)$/i)
    ||raw.match(/^(?:أضف|اضف|حط)\s+(?:نص|كتابة|كلام|عنوان)\s*(?::|يقول\s+|مكتوب\s+)?\s*(.+)$/u);
 if(m){const value=unwrap(m[1]);return value?{kind:'add-text',value:value.slice(0,90)}:{kind:'error',message:'Write the text to add.'}}
 m=raw.match(/^(?:change|set|replace)\s+(?:the\s+)?(?:opening|intro|start)\s+(?:headline|title|text)\s*(?:to|:|with)\s*:?\s*(.+)$/i)
  ||raw.match(/^(?:غير|غيّر|بدل|بدّل)\s+(?:نص|عنوان)\s+(?:البداية|المقدمة)\s*(?:الى|إلى|لـ|:)?\s*(.+)$/u);
 if(m){const value=unwrap(m[1]);return value?{kind:'scene-text',field:'introMain',value:value.slice(0,32)}:{kind:'error',message:'Provide new opening text.'}}
 m=raw.match(/^(?:change|set|replace)\s+(?:the\s+)?(?:ending|closing|final|outro)\s+(?:headline|title|text)\s*(?:to|:|with)\s*:?\s*(.+)$/i)
  ||raw.match(/^(?:غير|غيّر|بدل|بدّل)\s+(?:نص|عنوان)\s+(?:النهاية|الختام)\s*(?:الى|إلى|لـ|:)?\s*(.+)$/u);
 if(m){const value=unwrap(m[1]);return value?{kind:'scene-text',field:'finalMain',value:value.slice(0,40)}:{kind:'error',message:'Provide new closing text.'}}
 if(/\b(?:remove|delete)\s+(?:the\s+)?selected\s+layer\b|(?:احذف|امح|امسح)\s+(?:الطبقة|العنصر)\s*(?:المحدد|المحددة)?/.test(s))return {kind:'selected-delete'};
 if(/\bduplicate\s+(?:the\s+)?selected\s+layer\b|(?:انسخ|كرر|كرّر)\s+(?:الطبقة|العنصر)\s*(?:المحدد|المحددة)?/.test(s))return {kind:'selected-duplicate'};
 if(/(?:selected\s+(?:layer|object)|العنصر|الطبقة)/i.test(s)){
  const dir = /\b(?:right|left|up|down)\b|يمين|يسار|فوق|تحت|أعلى|اعلى|أسفل|اسفل/i.exec(s);
  if(dir && /\bmove\b|حرك|حرّك|نقل/i.test(s)){
    const d=dir[0];const direction= /right|يمين/i.test(d)?'right':/left|يسار/i.test(d)?'left':/up|فوق|أعلى|اعلى/i.test(d)?'up':'down';
    return {kind:'selected-move',direction,step:10};
  }
  if(/\b(?:bigger|larger|increase|enlarge|smaller|shrink|decrease)\b|كبّر|كبر|صغّر|صغر/i.test(s))return {kind:'selected-scale',delta:/\b(?:bigger|larger|increase|enlarge)\b|كبّر|كبر/i.test(s)?20:-20};
  if(/\b(?:fade|pop|slide)\b|تلاشي|ظهور|انزلاق/i.test(s))return {kind:'selected-animation',animation:/\bpop\b|ظهور/i.test(s)?'pop':/slide|انزلاق/i.test(s)?'slide-up':'fade'};
 }
 // Length, orientation, style, sound and palette operate on global project settings.
 if(isActionContext(s)){
  m=s.match(/(?:^|\s)(10|15|20)\s*(?:seconds?|sec|s|ثواني|ثوان|ثانية|ثانيه)(?:\b|$)/i);
  if(m)return {kind:'duration',value:Number(m[1])};
  m=s.match(/(?:^|\s)(9\s*:\s*16|16\s*:\s*9|1\s*:\s*1)(?:\b|$)/);
  if(m)return {kind:'ratio',value:m[1].replace(/\s/g,'')};
  if(/\b(?:tiktok|reels|shorts|vertical|portrait)\b|عمودي|تيك\s*توك/i.test(s))return {kind:'ratio',value:'9:16'};
  if(/\b(?:youtube|landscape|horizontal)\b|افقي|أفقي|يوتيوب/i.test(s))return {kind:'ratio',value:'16:9'};
  if(/\b(?:square)\b|مربع/i.test(s))return {kind:'ratio',value:'1:1'};
  if(/\b(?:cinematic|neon|minimal|luxury)\b|سينمائي|نيون|بسيط|فخم/i.test(s)){
   const val=/neon|نيون/.test(s)?'neon':/minimal|بسيط/.test(s)?'minimal':/luxury|فخم/.test(s)?'luxury':'cinematic';
   return {kind:'style',value:val};
  }
  if(/\b(?:music|audio|sound|mute|unmute)\b|الموسيقى|موسيقى|الصوت/.test(s)){
   if(/\b(?:off|mute|none|stop|remove|disable)\b|طفي|اطف|وقف|بدون|احذف/.test(s))return {kind:'music',value:'off'};
   if(/\b(?:ambient|calm)\b|هادئ|هادية|هادئه/.test(s))return {kind:'music',value:'ambient'};
   if(/\b(?:uplift|energetic|energetic)\b|حماسي/.test(s))return {kind:'music',value:'uplift'};
   if(/\b(?:cinematic|on|enable)\b|سينمائي|شغل|شغّل/.test(s))return {kind:'music',value:'cinematic'};
  }
  const hex=s.match(/#[0-9a-f]{6}(?![0-9a-f])/i);if(hex)return {kind:'accent',value:hex[0].toLowerCase()};
  if(/\b(?:color|colour|accent)\b|اللون|لون/.test(s)){
   const color=Object.keys(COLORS).find(k=>s.includes(k));if(color)return {kind:'accent',value:COLORS[color]};
  }
 }
 return {kind:'error',message:'I cannot apply that command yet. Try: “Make video 15 seconds”, “Add text: Hello”, or “Change color to gold”.'};
}
