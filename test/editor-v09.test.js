import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const js=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const layerUtils=js.match(/function normalizeLayer\(raw\)\{[\s\S]*?\n\}/)?.[0];
const positions=js.match(/function layerPosition\(l,t\)\{[\s\S]*?\n\}/)?.[0];

const context={el:{duration:{value:'20'}},clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),safeString:(s,n)=>typeof s==='string'?s.slice(0,n):'',Date,Number,Math,Array,JSON,Object};
vm.createContext(context);
vm.runInContext(`${layerUtils}\n${positions}`,context);

test('V0.9 image layers validate embedded image and animation presets',()=>{
  const l=context.normalizeLayer({id:'portrait',type:'image',src:'data:image/jpeg;base64,AAAA',animation:'slide-up',start:1,end:7});
  assert.equal(l.type,'image');assert.equal(l.animation,'slide-up');assert.equal(l.src,'data:image/jpeg;base64,AAAA');
  assert.equal(context.normalizeLayer({type:'image',src:'javascript:alert(1)'}).src,null);
  assert.equal(context.normalizeLayer({type:'text',animation:'invalid'}).animation,'fade');
  assert.equal(context.normalizeLayer({type:'video'}),null);
});

test('Keyframe motion interpolates positions and opacity',()=>{
  const l=context.normalizeLayer({type:'image',start:0,end:20,keyframes:[{t:0,x:10,y:20,scale:100,opacity:0},{t:10,x:90,y:80,scale:200,opacity:100}]});
  const p=context.layerPosition(l,5);
  assert.equal(p.x,50);assert.equal(p.y,50);assert.equal(p.scale,150);assert.equal(p.opacity,50);
});

test('Editor has actionable controls for image layers, order, undo, redo',()=>{
  for(const id of ['addImageLayer','layerImageInput','replaceLayerImage','layerAnimation','duplicateLayer','layerBackward','layerForward','undoLayer','redoLayer'])
    assert.match(html,new RegExp(`id="${id}"`));
  assert.match(js,/function createImageLayer/);assert.match(js,/function undoLayerEdit/);assert.match(js,/function duplicateSelectedLayer/);
});
