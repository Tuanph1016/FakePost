import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const html=fs.readFileSync(new URL('index.html',root),'utf8');
const old=fs.readFileSync(new URL('fixtures/old-ensure-fonts.js',import.meta.url),'utf8');
const manifest=fs.readFileSync(new URL('assets/font-manifest.js',root),'utf8');
const source=html.slice(html.indexOf('// Resolve against every bundled family'),html.indexOf('// Keep browser shaping'));
const before=old;
function environment(rows,{previous=false,avatar=true,name='K',lang='ko',loadFails=false}={}){
  const calls=[],content={innerHTML:'<b>Original unchanged</b>'};
  const nodes=rows.map(({text,family='"Be Vietnam Pro"',weight='400',style='normal',hidden=false})=>{
    const element={style:{},getClientRects:()=>hidden?[]:[{}],original:{fontFamily:family,fontWeight:weight,fontStyle:style}};
    return {textContent:text,parentElement:element};
  });
  let cursor=0;
  const post={lang,style:{},original:{fontFamily:'"Be Vietnam Pro"',fontWeight:'400',fontStyle:'normal'}};
  const sandbox={window:{},post,S:{avatar,contentHTML:content.innerHTML},NodeFilter:{SHOW_TEXT:4},
    document:{createTreeWalker:()=>({nextNode:()=>nodes[cursor++]||null}),fonts:{ready:Promise.resolve(),load:async(q,text)=>{calls.push({q,text});return loadFails?[]:[{status:'loaded'}];},check:()=>true}},
    getComputedStyle:element=>({...element.original,...element.style}),loadFontFace:async()=>{},initial:()=>name,$:()=>content};
  vm.createContext(sandbox);vm.runInContext(manifest+'\nconst fontError=msg=>Object.assign(new Error(msg),{font:true});\n'+(previous?before:source),sandbox);
  return {run:()=>vm.runInContext('ensureFonts()',sandbox),sandbox,calls,nodes};
}
test('Reproduces the old false missing U+C0B4 and fixes it using the bundled Korean font',async()=>{
  const row={text:'살',family:'"Be Vietnam Pro"'};
  await assert.rejects(environment([row],{previous:true}).run(),/U\+C0B4/);
  const env=environment([row]);const faces=await env.run();assert.ok(faces.some(f=>f.family==='Noto Sans KR'));assert.ok(env.nodes[0].parentElement.style.fontFamily.includes('Noto Sans KR'));
});
test('All 11,172 modern Hangul syllables plus compatibility/decomposed Jamo',async()=>{
  const text=String.fromCodePoint(...Array.from({length:11172},(_,i)=>0xac00+i))+' ㄱㄴㄷㅏㅣ 살';
  const faces=await environment([{text,family:'Arial'}]).run();assert.ok(faces.some(f=>f.family==='Noto Sans KR'));
});
test('Korean, Japanese, Chinese, Vietnamese and English mixed inside legacy single-family markup',async()=>{
  const text='살 사랑 삶 이야기 日本語 ひらがな カタカナ 中文汉字 Tiếng Việt ắ ộ ỵ English café e\u0301';
  for(const family of ['"Be Vietnam Pro"','Arial','system-ui','"Noto Sans JP"',"'noto sans kr'",'"Unknown, custom font"']){
    const env=environment([{text,family}]);await env.run();assert.ok(env.calls.length>=2);
  }
});
test('Bold, semibold, italic and oblique preserve style and prefer the closest available packaged weight',async()=>{
  for(const weight of ['400','500','600','700'])for(const style of ['normal','italic','oblique']){
    const faces=await environment([{text:'살',weight,style}]).run();const face=faces.find(f=>f.family==='Noto Sans KR');assert.ok(face);assert.ok(Math.abs(+face.weight-Number(weight))<=100);
  }
  const faces=await environment([{text:'Tiếng Việt',style:'italic',weight:'700'}]).run();assert.equal(faces[0].style,'italic');assert.equal(faces[0].weight,'700');
});
test('Emoji, skin tone, ZWJ, flags, text/emoji selectors and supplementary CJK IVS do not trigger false errors',async()=>{
  const faces=await environment([{text:'☕ ❤ ❤️ 👩‍💻 🇰🇷 👍🏻 살\u200e\u2067中\u{E0100}'}]).run();assert.ok(faces.some(f=>f.family==='Noto Emoji'));
});
test('Fallback fonts also cover placeholder initials; hidden text does not block export',async()=>{
  const faces=await environment([{text:'\u{10FFFF}',hidden:true}],{avatar:false,name:'살'}).run();assert.ok(faces.some(f=>f.family==='Noto Sans KR'&&f.weight==='700'));
});
test('Actually unsupported glyphs and font load failures still stop instead of producing missing text',async()=>{
  await assert.rejects(environment([{text:'\u{10FFFF}'}]).run(),/U\+10FFFF/);
  await assert.rejects(environment([{text:'살'}],{loadFails:true}).run(),/chưa sẵn sàng/);
});
test('Full HTML scripts parse and each manifest entry has a local WOFF2 payload',()=>{
  for(const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
  const context=vm.createContext({window:{}});vm.runInContext(manifest+'\nwindow.pack=FONT_PACK;',context);
  assert.equal(context.window.pack.length,17);
  for(const face of context.window.pack){const payload=fs.readFileSync(new URL(face.src,root),'utf8');const data=JSON.parse(payload.slice(payload.indexOf('=')+1).trim().replace(/;$/,''));const bytes=Buffer.from(data.split(',')[1],'base64');assert.equal(bytes.subarray(0,4).toString(),'wOF2');}
});
