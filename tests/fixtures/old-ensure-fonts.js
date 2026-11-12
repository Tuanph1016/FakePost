async function ensureFonts(){
  if(!document.fonts)throw fontError('Trình duyệt không hỗ trợ kiểm tra font.');
  const jobs=new Map(),needed=new Set();
  function collect(text,cs,weight=cs.fontWeight){
    const families=cs.fontFamily.split(',').map(f=>f.trim().replace(/^['"]|['"]$/g,''));
    const numeric=Number(weight)||400;
    const candidates=families.map(family=>FONT_PACK.filter(f=>f.family===family).sort((a,b)=>
      (a.style===cs.fontStyle?0:1000)+Math.abs(+a.weight-numeric)-((b.style===cs.fontStyle?0:1000)+Math.abs(+b.weight-numeric)))[0]).filter(Boolean);
    for(const ch of text){
      const cp=ch.codePointAt(0);
      if(/[\s\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufe00-\ufe0f]/u.test(ch))continue;
      const face=candidates.find(f=>f.ranges.some(([lo,hi])=>cp>=lo&&cp<=hi));
      if(!face)throw fontError(`Font đóng gói chưa có ký tự ${ch} (U+${cp.toString(16).toUpperCase()}); đã dừng để tránh dùng font dự phòng.`);
      needed.add(face);jobs.set(face,(jobs.get(face)||'')+ch);
    }
  }
  const walker=document.createTreeWalker(post,NodeFilter.SHOW_TEXT);
  for(let n;(n=walker.nextNode());)if(n.parentElement.getClientRects().length)collect(n.textContent,getComputedStyle(n.parentElement));
  if(!S.avatar)collect(initial(),getComputedStyle(post),'700');
  await Promise.all([...jobs].map(async([face,text])=>{
    await loadFontFace(face);
    const query=`${face.style} ${face.weight} 16px "${face.family}"`;
    let loaded;
    try{loaded=await document.fonts.load(query,text);}catch{throw fontError('Không tải được font '+face.family);}
    if(!loaded.length||loaded.some(f=>f.status!=='loaded')||!document.fonts.check(query,text))throw fontError('Font chưa sẵn sàng: '+face.family);
  }));
  await document.fonts.ready;
  return [...needed];
}
