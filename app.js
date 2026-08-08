'use strict';
/* ===== Sistem Jadual Waktu PPKI =====
   Semua data dalam memori. Guna Eksport/Import JSON untuk simpanan kekal. */

// ---------- Utiliti ----------
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function mulberry32(a){return function(){a|=0;a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
function textColorFor(hex){
  const m=/^#?([0-9a-f]{6})$/i.exec(hex||'');
  if(!m) return '#000';
  const n=parseInt(m[1],16), r=n>>16, g=(n>>8)&255, b=n&255;
  return (0.299*r+0.587*g+0.114*b) > 150 ? '#111' : '#fff';
}
function deepCopy(o){return JSON.parse(JSON.stringify(o));}

// ---------- Keadaan ----------
let state = deepCopy(window.DEFAULT_STATE);
// Guna semula warna yang pernah disimpan dalam pelayar ini (jika ada & jika storan dibenarkan)
const GHTOK_KEY='jadualppki_ghtoken';
// Bersihkan simpanan warna peranti versi lama (ciri ini telah dibuang — warna kini
// sepenuhnya dari pangkalan data supaya semua pengguna sentiasa seragam)
try{ localStorage.removeItem('jadualppki_colors'); }catch(e){}
// Muatan global: API pangkalan data (sumber utama). Jika tiada API (fail HTML /
// GitHub Pages), fallback ke data.json + tema.json statik.
// Lengkapkan medan konfigurasi baharu yang belum wujud dalam data terbitan lama
function fillDefaults(cfgLoaded){
  try{
    const d=window.DEFAULT_STATE.config;
    for(const k in d){ if(!(k in cfgLoaded)) cfgLoaded[k]=deepCopy(d[k]); }
  }catch(e){}
}
(async function loadRemote(){
  let changed=false, apiLoaded=false;
  // 1. API pangkalan data (Vercel + Redis) — sumber kebenaran, serta-merta
  try{
    const r=await fetch('/api/data?v='+Date.now(), {cache:'no-store'});
    const isJson=(r.headers.get('content-type')||'').includes('json');
    if(r.ok && isJson){
      const s=await r.json();
      if(s && s.config && s.grid){ state=s; fillDefaults(state.config); changed=true; apiLoaded=true; ui.apiOk=true; }
    } else if(r.status===404 && isJson){
      ui.apiOk=true; // API wujud tapi belum ada data — boleh terbit kali pertama
    }
  }catch(e){/* bukan di Vercel — abaikan */}
  // 2. Fallback statik HANYA jika API tiada (jangan tindih data pangkalan data!)
  if(!apiLoaded){
    try{
      const r=await fetch('data.json?v='+Date.now(), {cache:'no-store'});
      if(r.ok){
        const s=await r.json();
        if(s && s.config && s.grid && s.config.teachers && s.config.classes){ state=s; fillDefaults(state.config); changed=true; }
      }
    }catch(e){/* fail:// atau panel — abaikan */}
    try{
      const r=await fetch('tema.json?v='+Date.now(), {cache:'no-store'});
      if(r.ok){
        const tema=await r.json();
        if(tema && tema.colors){
          for(const t of state.config.teachers) if(tema.colors[t.name]) t.color=tema.colors[t.name];
          changed=true;
        }
      }
    }catch(e){}
  }
  if(changed) renderAll();
})();
const ui = { tab:'guru', tetapanGuru:0, busy:false, admin:false };
const ADMIN_TABS = ['editor','tetapan','panduan'];
const PRESET_COLORS = ['#FF8894','#FFA1B2','#8485B5','#B16F94','#176298','#5CC2C6','#B2DCA1','#7CCCAA','#A05757','#C68483','#E9BFC1','#F6DCDF'];
function adminPin(){ return String(state.config.adminPin || '191989'); }
function openPinModal(action, title){
  ui.pinAction = action;
  openModal(`<h4>🔒 ${esc(title||'Masukkan PIN admin')}</h4>
    <input id="pin-in" class="pinin" type="password" inputmode="numeric" maxlength="12" placeholder="••••••" autocomplete="off">
    <div class="modal-foot"><button class="act primary" data-act="pin-ok">Sahkan</button> <button class="act" data-act="modal-close">Batal</button></div>`);
  setTimeout(()=>{const i=document.getElementById('pin-in'); if(i) i.focus();}, 60);
}

// ---------- Derivasi konfigurasi ----------
function derived(cfg){
  const NP = cfg.periods.length;
  const classNames = cfg.classes.map(c=>c.name);
  const consec = new Set();
  for(let i=0;i<NP-1;i++) if(i!==cfg.rehatAfter) consec.add(i+'-'+(i+1));
  const teacherOf={}, morning={}, quota={}, banned={}, pair={};
  for(const c of classNames){
    teacherOf[c]={}; morning[c]=new Set(); quota[c]={}; banned[c]={}; pair[c]=new Set();
    for(const s of (cfg.curriculum[c]||[])){
      teacherOf[c][s.code]=s.teacher;
      if(s.morning) morning[c].add(s.code);
      quota[c][s.code]=(quota[c][s.code]||0)+s.waktu;
      banned[c][s.code]=new Set(s.noDays||[]);
      if(s.pair) pair[c].add(s.code);
    }
  }
  const sess = {};
  for(const c of cfg.classes) sess[c.name]=c.periodsPerDay;
  function inSession(c,d,p){ return p < sess[c][d]; }
  const unav={};
  for(const t of cfg.teachers){
    unav[t.name]=cfg.days.map(()=>new Array(NP).fill(false));
    const u=cfg.unavailable[t.name];
    if(u) for(let d=0;d<cfg.days.length;d++) for(const p of (u[d]||[])) if(p<NP) unav[t.name][d][p]=true;
  }
  return {NP, classNames, consec, teacherOf, morning, quota, sess, inSession, unav, banned, pair};
}

// ---------- Semakan (pengesan pertindihan & isu) ----------
function checkIssues(cfg, grid){
  const D = derived(cfg);
  const issues=[]; // {msg, cells:[[c,d,p]]}
  const ND = cfg.days.length;
  const asm = cfg.assembly;
  for(const c of D.classNames){
    const g = grid[c]||[];
    const cnt={};
    for(let d=0;d<ND;d++) for(let p=0;p<D.NP;p++){
      const v = g[d] ? g[d][p] : null;
      const ins = D.inSession(c,d,p);
      if(ins && !v) issues.push({msg:`Slot kosong: ${c}, ${cfg.days[d]} waktu ${p+1}`, cells:[[c,d,p]]});
      if(ins && v && v!=='PERHIM' && !D.teacherOf[c][v]) issues.push({msg:`Subjek "${v}" tiada dalam peruntukan ${c}`, cells:[[c,d,p]]});
      if(v && v!=='PERHIM' && ins) cnt[v]=(cnt[v]||0)+1;
    }
    for(const [code,w] of Object.entries(D.quota[c]))
      if((cnt[code]||0)!==w) issues.push({msg:`Kuota ${c} · ${code}: ${cnt[code]||0}/${w} waktu`, cells:[]});
    if(D.inSession(c,asm.day,asm.period) && (!g[asm.day] || g[asm.day][asm.period]!=='PERHIM'))
      issues.push({msg:`Perhimpunan (${cfg.days[asm.day]} waktu ${asm.period+1}) tiada dalam ${c}`, cells:[[c,asm.day,asm.period]]});
  }
  // pertindihan guru + slot tidak tersedia
  for(let d=0;d<ND;d++) for(let p=0;p<D.NP;p++){
    const seen={};
    for(const c of D.classNames){
      const v = grid[c] && grid[c][d] ? grid[c][d][p] : null;
      if(!v || v==='PERHIM' || !D.inSession(c,d,p)) continue;
      const t = D.teacherOf[c][v];
      if(!t) continue;
      if(seen[t]) issues.push({msg:`Pertindihan: ${t} mengajar ${seen[t]} & ${c} serentak (${cfg.days[d]} waktu ${p+1})`, cells:[[seen[t],d,p],[c,d,p]]});
      seen[t]=c;
      if(D.unav[t] && D.unav[t][d][p]) issues.push({msg:`${t} tidak tersedia (jadual perdana/tugas luar): ${cfg.days[d]} waktu ${p+1} (${c})`, cells:[[c,d,p]]});
    }
  }
  // corak subjek harian
  for(const c of D.classNames) for(let d=0;d<ND;d++){
    const pos={};
    for(let p=0;p<D.NP;p++){
      const v = grid[c] && grid[c][d] ? grid[c][d][p] : null;
      if(v && v!=='PERHIM' && D.inSession(c,d,p)) (pos[v]=pos[v]||[]).push(p);
    }
    for(const [code,ps] of Object.entries(pos)){
      if(ps.length>2) issues.push({msg:`${c} · ${code}: melebihi 2 waktu sehari (${cfg.days[d]})`, cells:ps.map(p=>[c,d,p])});
      if(ps.length===2 && !D.consec.has(ps[0]+'-'+ps[1])) issues.push({msg:`${c} · ${code}: 2 waktu terpisah pada ${cfg.days[d]} (elok bersebelahan)`, cells:ps.map(p=>[c,d,p])});
      if(D.morning[c].has(code)) for(const p of ps) if(!cfg.morningPeriods.includes(p))
        issues.push({msg:`${c} · ${code}: sepatutnya waktu pagi/sebelum rehat (${cfg.days[d]} waktu ${p+1})`, cells:[[c,d,p]]});
      if(D.banned[c][code] && D.banned[c][code].has(d))
        issues.push({msg:`${c} · ${code}: tidak dibenarkan pada hari ${cfg.days[d]}`, cells:ps.map(p=>[c,d,p])});
      if(D.pair[c].has(code) && ps.length===1)
        issues.push({msg:`${c} · ${code}: mesti 2 waktu berturutan (${cfg.days[d]} hanya 1 waktu)`, cells:[[c,d,ps[0]]]});
    }
  }
  // beban harian guru
  for(const t of cfg.teachers){
    for(let d=0;d<ND;d++){
      let n=0;
      for(const c of D.classNames) for(let p=0;p<D.NP;p++){
        const v = grid[c] && grid[c][d] ? grid[c][d][p] : null;
        if(v && v!=='PERHIM' && D.inSession(c,d,p) && D.teacherOf[c][v]===t.name) n++;
      }
      if(n>cfg.maxPerDay) issues.push({msg:`${t.name}: ${n} waktu pada ${cfg.days[d]} (melebihi had ${cfg.maxPerDay})`, cells:[]});
    }
  }
  return issues;
}

// ---------- Penjana jadual (simulated annealing + polish) ----------
function solveOnce(cfg, seed, maxIter){
  const D = derived(cfg);
  const rnd = mulberry32(seed);
  const ND = cfg.days.length, NP = D.NP;
  const W = 1000;
  const asm = cfg.assembly;

  const grid={}, slots={};
  for(const c of D.classNames){
    grid[c]=[]; slots[c]=[];
    for(let d=0;d<ND;d++){
      grid[c].push(new Array(NP).fill(null));
    }
    if(D.inSession(c,asm.day,asm.period)) grid[c][asm.day][asm.period]='PERHIM';
    for(let d=0;d<ND;d++) for(let p=0;p<NP;p++)
      if(D.inSession(c,d,p) && grid[c][d][p]===null) slots[c].push([d,p]);
    const items=[];
    for(const s of cfg.curriculum[c]) for(let i=0;i<s.waktu;i++) items.push(s.code);
    if(items.length!==slots[c].length) throw `Kelas ${c}: jumlah peruntukan ${items.length} waktu ≠ ${slots[c].length} slot P&P. Laraskan peruntukan atau waktu tamat.`;
    for(let i=items.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[items[i],items[j]]=[items[j],items[i]];}
    slots[c].forEach(([d,p],i)=>{grid[c][d][p]=items[i];});
  }

  function colCost(d,p){
    let cost=0; const seen={};
    for(const c of D.classNames){
      const v=grid[c][d][p];
      if(!v||v==='PERHIM'||!D.inSession(c,d,p)) continue;
      const t=D.teacherOf[c][v];
      if(seen[t]) cost+=W;
      seen[t]=true;
      if(D.unav[t]&&D.unav[t][d][p]) cost+=W;
    }
    return cost;
  }
  function rowCost(c,d){
    let cost=0; const pos={};
    for(let p=0;p<NP;p++){
      const v=grid[c][d][p];
      if(!v||v==='PERHIM'||!D.inSession(c,d,p)) continue;
      (pos[v]=pos[v]||[]).push(p);
      if(D.morning[c].has(v)&&!cfg.morningPeriods.includes(p)) cost+=W;
      if(D.banned[c][v]&&D.banned[c][v].has(d)) cost+=W;
    }
    for(const [code,ps] of Object.entries(pos)){
      if(ps.length>2) cost+=W*(ps.length-2);
      if(ps.length===2&&!D.consec.has(ps[0]+'-'+ps[1])) cost+=W;
      if(D.pair[c].has(code)&&ps.length===1) cost+=W;
      cost+=1;
    }
    return cost;
  }
  function loadCost(t,d){
    let n=0;
    for(const c of D.classNames) for(let p=0;p<NP;p++){
      const v=grid[c][d][p];
      if(v&&v!=='PERHIM'&&D.inSession(c,d,p)&&D.teacherOf[c][v]===t) n++;
    }
    return n>cfg.maxPerDay ? W*(n-cfg.maxPerDay) : 0;
  }
  function totalCost(){
    let s=0;
    for(let d=0;d<ND;d++) for(let p=0;p<NP;p++) s+=colCost(d,p);
    for(const c of D.classNames) for(let d=0;d<ND;d++) s+=rowCost(c,d);
    for(const t of cfg.teachers) for(let d=0;d<ND;d++) s+=loadCost(t.name,d);
    return s;
  }
  function localCost(c,d1,p1,d2,p2){
    let s=colCost(d1,p1)+rowCost(c,d1)+colCost(d2,p2);
    if(d2!==d1) s+=rowCost(c,d2);
    const v1=grid[c][d1][p1], v2=grid[c][d2][p2];
    const ts=new Set();
    if(v1&&v1!=='PERHIM') ts.add(D.teacherOf[c][v1]);
    if(v2&&v2!=='PERHIM') ts.add(D.teacherOf[c][v2]);
    for(const t of ts){ s+=loadCost(t,d1); if(d2!==d1) s+=loadCost(t,d2); }
    return s;
  }
  function violating(){
    const out=[];
    for(const c of D.classNames) for(const [d,p] of slots[c]){
      const v=grid[c][d][p], t=D.teacherOf[c][v];
      let bad = D.unav[t]&&D.unav[t][d][p];
      if(!bad) for(const c2 of D.classNames){
        if(c2===c) continue;
        const v2=grid[c2][d][p];
        if(v2&&v2!=='PERHIM'&&D.inSession(c2,d,p)&&D.teacherOf[c2][v2]===t){bad=true;break;}
      }
      if(!bad){
        let cnt=0, other=-1;
        for(let q=0;q<NP;q++) if(grid[c][d][q]===v&&D.inSession(c,d,q)){cnt++;if(q!==p)other=q;}
        if(cnt>2) bad=true;
        else if(cnt===2&&!D.consec.has(Math.min(p,other)+'-'+Math.max(p,other))) bad=true;
        if(D.pair[c].has(v)&&cnt===1) bad=true;
        if(D.morning[c].has(v)&&!cfg.morningPeriods.includes(p)) bad=true;
        if(D.banned[c][v]&&D.banned[c][v].has(d)) bad=true;
      }
      if(bad) out.push([c,d,p]);
    }
    return out;
  }
  function copyGrid(){const o={};for(const c of D.classNames)o[c]=grid[c].map(r=>r.slice());return o;}

  let cost=totalCost(), T=60;
  const cool=Math.pow(0.02/T,1/maxIter);
  let viol=violating(), bestValid=null, bestValidCost=Infinity, firstValidIt=-1;

  for(let it=0;it<maxIter;it++){
    if(it%2000===0){
      viol=violating();
      if(viol.length===0){
        if(firstValidIt<0) firstValidIt=it;
        if(cost<bestValidCost){bestValidCost=cost;bestValid=copyGrid();}
      }
      if(firstValidIt>=0 && it>firstValidIt+120000) break;
    }
    let c,d1,p1;
    if(viol.length&&rnd()<0.7){
      const v=viol[Math.floor(rnd()*viol.length)];
      c=v[0];d1=v[1];p1=v[2];
    } else {
      c=D.classNames[Math.floor(rnd()*D.classNames.length)];
      const s=slots[c][Math.floor(rnd()*slots[c].length)];
      d1=s[0];p1=s[1];
    }
    const s2=slots[c][Math.floor(rnd()*slots[c].length)];
    const d2=s2[0],p2=s2[1];
    if(d1===d2&&p1===p2) continue;
    const v1=grid[c][d1][p1], v2=grid[c][d2][p2];
    if(v1===v2) continue;
    const before=localCost(c,d1,p1,d2,p2);
    grid[c][d1][p1]=v2; grid[c][d2][p2]=v1;
    const after=localCost(c,d1,p1,d2,p2);
    const delta=after-before;
    if(delta<=0||rnd()<Math.exp(-delta/T)) cost+=delta;
    else {grid[c][d1][p1]=v1; grid[c][d2][p2]=v2;}
    T*=cool; if(T<0.02)T=0.02;
  }
  if(!bestValid) return null;

  for(const c of D.classNames) for(let d=0;d<ND;d++) grid[c][d]=bestValid[c][d].slice();
  let improved=true, rounds=0;
  while(improved&&rounds<25){
    improved=false; rounds++;
    for(const c of D.classNames){
      const S=slots[c];
      for(let i=0;i<S.length;i++) for(let j=i+1;j<S.length;j++){
        const [d1,p1]=S[i],[d2,p2]=S[j];
        const v1=grid[c][d1][p1], v2=grid[c][d2][p2];
        if(v1===v2) continue;
        const before=localCost(c,d1,p1,d2,p2);
        grid[c][d1][p1]=v2; grid[c][d2][p2]=v1;
        const after=localCost(c,d1,p1,d2,p2);
        if(after<before) improved=true;
        else {grid[c][d1][p1]=v1; grid[c][d2][p2]=v2;}
      }
    }
  }
  return violating().length===0 ? copyGrid() : bestValid;
}

async function janaJadual(){
  if(ui.busy) return;
  ui.busy=true;
  const status=document.getElementById('jana-status');
  try{
    for(let seed=1;seed<=10;seed++){
      if(status) status.textContent=`Menjana... cubaan ${seed}/10`;
      await new Promise(r=>setTimeout(r,30));
      let g=null;
      try{ g=solveOnce(state.config, seed + Math.floor(Math.random()*10000), 400000); }
      catch(e){ toast(typeof e==='string'?e:String(e), true); break; }
      if(g){
        state.grid=g;
        if(status) status.textContent='';
        toast('Jadual baharu berjaya dijana — tiada pertindihan.');
        renderAll();
        ui.busy=false;
        return;
      }
    }
    if(status) status.textContent='';
    toast('Tidak menemui penyelesaian. Semak kekangan (slot guru, peruntukan, waktu tamat).', true);
  } finally { ui.busy=false; renderAll(); }
}

// ---------- Terbit ke GitHub (untuk semua pengguna) ----------
async function ghPut(tok, path, payloadStr, msg){
  const repo=state.config.repo||{owner:'snwahidah',name:'jadualppki'};
  const api=`https://api.github.com/repos/${repo.owner}/${repo.name}/contents/${path}`;
  const headers={ 'Authorization':'Bearer '+tok, 'Accept':'application/vnd.github+json', 'Content-Type':'application/json' };
  let sha=null;
  const g=await fetch(api, {headers});
  if(g.ok){ sha=(await g.json()).sha; }
  const body={ message:msg, content: btoa(unescape(encodeURIComponent(payloadStr))) };
  if(sha) body.sha=sha;
  return fetch(api, {method:'PUT', headers, body: JSON.stringify(body)});
}

async function publishGlobal(){
  const cfg=state.config;
  // Laluan pantas: API pangkalan data (Vercel + Redis) — serta-merta, guna PIN
  if(ui.apiOk){
    const pinI=document.getElementById('pub-pin');
    const pin=pinI?pinI.value.trim():'';
    if(!pin){ toast('Sila masukkan PIN admin.', true); return; }
    const status=document.getElementById('jana-status');
    if(status) status.textContent='Menerbitkan ke pangkalan data...';
    try{
      const r=await fetch('/api/data', {method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({pin, state:{config:state.config, grid:state.grid}})});
      if(r.ok){
        closeModal();
        toast('🌐 Diterbitkan SERTA-MERTA! Semua pengguna mendapat versi terkini sekarang (muat semula halaman mereka).');
      } else if(r.status===401){
        if(pinI){pinI.value='';pinI.focus();}
        toast('PIN salah.', true);
      } else if(r.status===503){
        toast('Pangkalan data belum dikonfigurasi di Vercel (Storage → Upstash Redis).', true);
      } else {
        const j=await r.json().catch(()=>({}));
        toast('Gagal terbit: '+(j.error||('HTTP '+r.status)), true);
      }
    }catch(e){
      toast('Tidak dapat hubungi pelayan — semak sambungan internet.', true);
    } finally {
      if(status) status.textContent='';
    }
    return;
  }
  const repo=cfg.repo||{owner:'snwahidah',name:'jadualppki'};
  const inp=document.getElementById('gh-tok');
  const tok=inp?inp.value.trim():'';
  if(!tok){ toast('Sila masukkan token GitHub.', true); return; }
  try{ localStorage.setItem(GHTOK_KEY, tok); }catch(e){}
  const status=document.getElementById('jana-status');
  if(status) status.textContent='Menerbitkan ke GitHub...';
  try{
    // 1. data.json — keseluruhan jadual + tetapan
    const dataStr=JSON.stringify({published:new Date().toISOString(), config:state.config, grid:state.grid});
    const r1=await ghPut(tok, repo.dataPath||'data.json', dataStr, 'Terbit jadual & tetapan (dari aplikasi)');
    // 2. tema.json — warna (untuk keserasian)
    const colors={};
    for(const t of cfg.teachers) colors[t.name]=t.color;
    const r2=await ghPut(tok, repo.temaPath||'tema.json', JSON.stringify({updated:new Date().toISOString(), colors}, null, 1), 'Kemas kini warna tema (dari aplikasi)');
    if(r1.ok && r2.ok){
      closeModal();
      toast('🌐 Diterbitkan! Semua pengguna laman akan mendapat jadual, tetapan & warna terkini dalam 1–2 minit.');
    } else {
      const bad = r1.ok ? r2 : r1;
      const j=await bad.json().catch(()=>({}));
      toast('Gagal terbit: '+(j.message||('HTTP '+bad.status))+'. Semak token (perlu Contents: Read and write untuk repo '+repo.name+').', true);
    }
  }catch(e){
    toast('Tidak dapat hubungi GitHub — semak sambungan internet. ('+String(e).slice(0,60)+')', true);
  } finally {
    if(status) status.textContent='';
  }
}

// ---------- Cetak satu kelas / satu guru ----------
function isMobileDevice(){
  try{ return window.innerWidth<700 || matchMedia('(pointer: coarse)').matches; }catch(e){ return false; }
}
let rotStyleEl=null;
function mobileRotOn(){
  if(!isMobileDevice()) return;
  rotStyleEl=document.createElement('style');
  rotStyleEl.textContent='@media print{ @page{ size: A4 portrait; margin: 5mm } }';
  document.head.appendChild(rotStyleEl);
  document.body.dataset.rotmob='1';
}
function mobileRotOff(){
  if(rotStyleEl){ try{rotStyleEl.remove();}catch(e){} rotStyleEl=null; }
  delete document.body.dataset.rotmob;
}
function printOne(jenis, nama){
  const cfg=state.config, grid=state.grid;
  const main=document.getElementById('main');
  const prevTab=ui.tab;
  try{
    main.innerHTML = jenis==='guru' ? teacherGridHTML(cfg, grid, nama) : classGridHTML(cfg, grid, nama, false);
    document.body.dataset.tab = jenis==='guru' ? 'guru' : 'kelas';
    document.body.dataset.printone = '1';
    mobileRotOn();
    // Pemulihan selamat: di telefon window.print() TIDAK menunggu (dialog kekal terbuka),
    // jadi pulihkan hanya selepas cetakan benar-benar selesai/dibatalkan.
    let restored=false;
    const restore=()=>{
      if(restored) return;
      restored=true;
      window.removeEventListener('afterprint', restore);
      document.removeEventListener('visibilitychange', onVis);
      mobileRotOff();
      delete document.body.dataset.printone;
      ui.tab=prevTab;
      renderAll();
    };
    const onVis=()=>{ if(document.visibilityState==='visible') setTimeout(restore, 400); };
    window.addEventListener('afterprint', restore);
    setTimeout(()=>{
      try{ window.print(); }
      catch(err){ toast('Cetakan disekat dalam panel ini — buka laman web/fail HTML untuk mencetak.', true); restore(); return; }
      if(!isMobileDevice()){
        // desktop: print() menyekat sehingga dialog ditutup — selamat pulih terus
        setTimeout(restore, 250);
      } else {
        // telefon: tunggu isyarat selesai; jika tiada, pulih bila pengguna kembali ke halaman
        document.addEventListener('visibilitychange', onVis);
        setTimeout(restore, 180000); // jaring keselamatan 3 minit
      }
    }, 120);
  }catch(e){
    mobileRotOff();
    delete document.body.dataset.printone;
    ui.tab=prevTab;
    renderAll();
  }
}

// ---------- Paparan ----------
function toast(msg, isErr){
  const t=document.getElementById('toast');
  t.textContent=msg;
  t.className='toast show'+(isErr?' err':'');
  clearTimeout(t._h);
  t._h=setTimeout(()=>{t.className='toast';},5000);
}

function teacherColor(name){
  const t=state.config.teachers.find(x=>x.name===name);
  return t?t.color:'#ccc';
}

function openModal(html){
  const m=document.getElementById('modal');
  document.getElementById('modal-box').innerHTML=html;
  m.hidden=false;
}
function closeModal(){ document.getElementById('modal').hidden=true; }

function periodHeaderCells(cfg, plist, noRehat){
  const list = plist || cfg.periods;
  let h='';
  for(let p=0;p<list.length;p++){
    h+=`<th class="pcol"><div class="pnum">${p+1}</div><div class="ptime">${list[p].start}<br>–${list[p].end}</div></th>`;
    if(p===cfg.rehatAfter && !noRehat) h+=`<th class="rehat-col" title="${esc(cfg.rehatLabel)}"></th>`;
  }
  return h;
}

// Waktu khas guru perdana (cth: Hafizah — ikut masa aliran perdana, tanpa rehat PPKI)
function teacherTimeView(cfg, tname){
  const o=(cfg.perdanaTimes||{})[tname];
  const base=cfg.periods.map((p,i)=> (o && o.periods && o.periods[i]) ? o.periods[i] : p);
  return { base, noRehat: !!(o && o.noRehat) };
}

function classGridHTML(cfg, grid, cname, editable){
  const D=derived(cfg);
  const cls=cfg.classes.find(c=>c.name===cname);
  const issues = ui.issueCells||new Set();
  let html=`<table class="jadual"><thead><tr><th class="daycol">HARI / MASA</th>${periodHeaderCells(cfg)}</tr></thead><tbody>`;
  for(let d=0;d<cfg.days.length;d++){
    html+=`<tr><td class="daycol">${esc(cfg.days[d].toUpperCase())}</td>`;
    for(let p=0;p<D.NP;p++){
      const key=`${cname}|${d}|${p}`;
      const bad=issues.has(key)?' bad':'';
      if(!D.inSession(cname,d,p)){
        html+=`<td class="nosession"></td>`;
      } else {
        const v=grid[cname][d][p];
        if(v==='PERHIM'){
          html+=`<td class="perhim${bad}" title="Perhimpunan">P</td>`;
        } else if(editable){
          const t=v?D.teacherOf[cname][v]:null;
          const bg=t?teacherColor(t):'#fff';
          html+=`<td class="editcell${bad}" style="background:${bg};color:${textColorFor(bg)}" data-act="cell" data-c="${esc(cname)}" data-d="${d}" data-p="${p}" title="Klik untuk pilih subjek"><div class="scode">${v?esc(v):'＋'}</div><div class="tname">${t?esc(t):''}</div></td>`;
        } else {
          const t=v?D.teacherOf[cname][v]:null;
          const bg=t?teacherColor(t):'#fff';
          html+=`<td class="subcell${bad}" style="background:${bg};color:${textColorFor(bg)}"><div class="scode">${v?esc(v):''}</div><div class="tname">${t?esc(t):''}</div></td>`;
        }
      }
      if(p===cfg.rehatAfter && d===0) html+=`<td class="rehat-cell rehat-merged" rowspan="${cfg.days.length}">R<br>E<br>H<br>A<br>T</td>`;
    }
    html+=`</tr>`;
  }
  html+=`</tbody></table>`;
  const tamat = cls.periodsPerDay.map((n,d)=>`${cfg.days[d]} ${cfg.periods[n-1].end}`).join(' · ');
  return `<div class="gridblock"><h3>${esc(cname)} <span class="tahap">(TAHAP ${cls.tahap})</span></h3><div class="tamat">Waktu tamat: ${tamat} &nbsp;·&nbsp; P = Perhimpunan</div>${html}</div>`;
}

function teacherGridHTML(cfg, grid, tname){
  const D=derived(cfg);
  const notes=(cfg.perdanaNotes||{})[tname]||[];
  const noteMap={};
  for(const [d,ps,pe,label] of notes) for(let p=ps;p<=pe;p++) noteMap[d+'|'+p]=label;
  // panjangkan grid jika guru ada komitmen perdana melepasi grid PPKI (cth: hingga 12.50)
  const hasExtra = notes.some(n=>n[2]>=D.NP);
  const tv = teacherTimeView(cfg, tname);
  const plist = hasExtra ? tv.base.concat(cfg.extraPeriods||[]) : tv.base;
  let total=0;
  let html=`<table class="jadual"><thead><tr><th class="daycol">HARI / MASA</th>${periodHeaderCells(cfg, plist, tv.noRehat)}</tr></thead><tbody>`;
  for(let d=0;d<cfg.days.length;d++){
    html+=`<tr><td class="daycol">${esc(cfg.days[d].toUpperCase())}</td>`;
    for(let p=0;p<plist.length;p++){
      if(p>=D.NP){
        const label=noteMap[d+'|'+p];
        html+= label ? `<td class="perdana"><div>${esc(label)}</div></td>` : `<td class="freecell"></td>`;
        continue;
      }
      let cell=null;
      for(const c of D.classNames){
        const v=grid[c]&&grid[c][d]?grid[c][d][p]:null;
        if(v&&v!=='PERHIM'&&D.inSession(c,d,p)&&D.teacherOf[c][v]===tname){cell={c,v};break;}
      }
      const isAsm = d===cfg.assembly.day && p===cfg.assembly.period;
      if(cell){
        total++;
        const bg=teacherColor(tname);
        html+=`<td class="subcell" style="background:${bg};color:${textColorFor(bg)}"><div class="scode">${esc(cell.v)}</div><div class="tname">${esc(cell.c)}</div></td>`;
      } else if(isAsm){
        html+=`<td class="perhim" title="Perhimpunan">P</td>`;
      } else if(D.unav[tname]&&D.unav[tname][d][p]){
        const label=noteMap[d+'|'+p]||'TUGAS PERDANA';
        html+=`<td class="perdana"><div>${esc(label)}</div></td>`;
      } else {
        html+=`<td class="freecell"></td>`;
      }
      if(p===cfg.rehatAfter && d===0 && !tv.noRehat) html+=`<td class="rehat-cell rehat-merged" rowspan="${cfg.days.length}">R<br>E<br>H<br>A<br>T</td>`;
    }
    html+=`</tr>`;
  }
  html+=`</tbody></table>`;
  const extra=(cfg.perdanaExtra||{})[tname]||[];
  const extraHtml = extra.length?`<div class="tamat">Luar grid PPKI (perdana): ${extra.map(esc).join(' · ')}</div>`:'';
  const bebanInfo = ui.admin ? ` <span class="tahap">— ${total} waktu PPKI + 1 perhimpunan = ${total+1}</span>` : '';
  return `<div class="gridblock"><h3><span class="dot" style="background:${teacherColor(tname)}"></span> ${esc(tname).toUpperCase()}${bebanInfo}</h3>${html}${extraHtml}</div>`;
}

function loadTableHTML(cfg, grid){
  const D=derived(cfg);
  let html=`<table class="mini"><thead><tr><th>Guru</th>${cfg.days.map(d=>`<th>${esc(d)}</th>`).join('')}<th>Jumlah</th><th>+Perhim.</th></tr></thead><tbody>`;
  for(const t of cfg.teachers){
    let loads=cfg.days.map(()=>0);
    for(const c of D.classNames) for(let d=0;d<cfg.days.length;d++) for(let p=0;p<D.NP;p++){
      const v=grid[c]&&grid[c][d]?grid[c][d][p]:null;
      if(v&&v!=='PERHIM'&&D.inSession(c,d,p)&&D.teacherOf[c][v]===t.name) loads[d]++;
    }
    const sum=loads.reduce((a,b)=>a+b,0);
    html+=`<tr><td><span class="dot" style="background:${t.color}"></span> ${esc(t.name)}</td>${loads.map(n=>`<td>${n}</td>`).join('')}<td><b>${sum}</b></td><td><b>${sum+1}</b></td></tr>`;
  }
  return html+`</tbody></table>`;
}

// ---------- Tab: Editor ----------
function quotaChipsHTML(cfg, grid, cname){
  const D=derived(cfg);
  const cnt={};
  for(let d=0;d<cfg.days.length;d++) for(let p=0;p<D.NP;p++){
    const v=grid[cname][d][p];
    if(v&&v!=='PERHIM'&&D.inSession(cname,d,p)) cnt[v]=(cnt[v]||0)+1;
  }
  return cfg.curriculum[cname].map(s=>{
    const n=cnt[s.code]||0;
    const ok=n===s.waktu;
    return `<span class="chip ${ok?'ok':'notok'}">${esc(s.code)} ${n}/${s.waktu}</span>`;
  }).join(' ');
}

// ---------- Tab: Senarai (paparan mudah alih) ----------
function senaraiHTML(cfg, grid){
  const D=derived(cfg);
  if(!ui.list) ui.list={type:'guru', name:cfg.teachers[0]?cfg.teachers[0].name:''};
  const mode=ui.list;
  const names = mode.type==='guru' ? cfg.teachers.map(t=>t.name) : cfg.classes.map(c=>c.name);
  if(!names.includes(mode.name)) mode.name=names[0]||'';
  const typeChips=`<button class="ddbtn ${mode.type==='guru'?'sel':''}" data-act="list-type" data-v="guru">Ikut Guru</button>
    <button class="ddbtn ${mode.type==='kelas'?'sel':''}" data-act="list-type" data-v="kelas">Ikut Kelas</button>`;
  const nameChips=names.map(n=>{
    const col = mode.type==='guru' ? teacherColor(n) : '#888';
    return `<button class="ddbtn ${n===mode.name?'sel':''}" data-act="list-name" data-v="${esc(n)}">${mode.type==='guru'?`<span class="dot" style="background:${col}"></span> `:''}${esc(n)}</button>`;
  }).join(' ');
  const notes=(cfg.perdanaNotes||{})[mode.name]||[];
  const noteMap={};
  for(const [d,ps,pe,label] of notes) for(let p=ps;p<=pe;p++) noteMap[d+'|'+p]=label;
  const tv = mode.type==='guru' ? teacherTimeView(cfg, mode.name) : {base:cfg.periods, noRehat:false};

  let cards='';
  for(let d=0;d<cfg.days.length;d++){
    let rows='', jum=0;
    for(let p=0;p<D.NP;p++){
      if(p===cfg.rehatAfter+1 && !tv.noRehat) rows+=`<div class="lrow lrehat"><span class="ltime"></span><span class="lmain">☕ ${esc(cfg.rehatLabel)}</span></div>`;
      const time=`${tv.base[p].start}–${tv.base[p].end}`;
      const isAsm = d===cfg.assembly.day && p===cfg.assembly.period;
      if(mode.type==='kelas'){
        if(!D.inSession(mode.name,d,p)) continue;
        const v=grid[mode.name]&&grid[mode.name][d]?grid[mode.name][d][p]:null;
        if(v==='PERHIM'){ rows+=`<div class="lrow"><span class="ltime">${time}</span><span class="lchip" style="background:#f5f0dc">✦</span><span class="lmain">Perhimpunan</span></div>`; continue; }
        const s=(cfg.curriculum[mode.name]||[]).find(x=>x.code===v);
        const t=v?D.teacherOf[mode.name][v]:null;
        const bg=t?teacherColor(t):'#eee';
        rows+=`<div class="lrow"><span class="ltime">${time}</span><span class="lchip" style="background:${bg};color:${textColorFor(bg)}">${v?esc(v):'—'}</span><span class="lmain">${s?esc(s.name):''}${t?` <small>· ${esc(t)}</small>`:''}</span></div>`;
        jum += v&&v!=='PERHIM'?1:0;
      } else {
        let cell=null;
        for(const c of D.classNames){
          const v=grid[c]&&grid[c][d]?grid[c][d][p]:null;
          if(v&&v!=='PERHIM'&&D.inSession(c,d,p)&&D.teacherOf[c][v]===mode.name){cell={c,v};break;}
        }
        if(cell){
          const s=(cfg.curriculum[cell.c]||[]).find(x=>x.code===cell.v);
          const bg=teacherColor(mode.name);
          rows+=`<div class="lrow"><span class="ltime">${time}</span><span class="lchip" style="background:${bg};color:${textColorFor(bg)}">${esc(cell.v)}</span><span class="lmain">${s?esc(s.name):''} <small>· ${esc(cell.c)}</small></span></div>`;
          jum++;
        } else if(isAsm){
          rows+=`<div class="lrow"><span class="ltime">${time}</span><span class="lchip" style="background:#f5f0dc">✦</span><span class="lmain">Perhimpunan</span></div>`;
        } else if(D.unav[mode.name]&&D.unav[mode.name][d][p]){
          rows+=`<div class="lrow lperdana"><span class="ltime">${time}</span><span class="lchip" style="background:#4a4a58;color:#fff">P</span><span class="lmain">${esc(noteMap[d+'|'+p]||'Tugas perdana')}</span></div>`;
        }
      }
    }
    if(mode.type==='guru'){
      const extras=cfg.extraPeriods||[];
      for(let e2=0;e2<extras.length;e2++){
        const pe=D.NP+e2;
        if(noteMap[d+'|'+pe]) rows+=`<div class="lrow lperdana"><span class="ltime">${esc(extras[e2].start)}–${esc(extras[e2].end)}</span><span class="lchip" style="background:#4a4a58;color:#fff">P</span><span class="lmain">${esc(noteMap[d+'|'+pe])}</span></div>`;
      }
    }
    const extra = mode.type==='guru' ? ((cfg.perdanaExtra||{})[mode.name]||[]).filter(x=>x.startsWith(cfg.days[d])) : [];
    for(const x of extra) rows+=`<div class="lrow lperdana"><span class="ltime"></span><span class="lchip" style="background:#4a4a58;color:#fff">P</span><span class="lmain">${esc(x.replace(cfg.days[d],'').replace(/^\s*/,''))}</span></div>`;
    cards+=`<div class="daycard"><h4>${esc(cfg.days[d].toUpperCase())}${mode.type==='guru'?` <span class="tahap">— ${jum} waktu</span>`:''}</h4>${rows||'<div class="hint">Tiada jadual</div>'}</div>`;
  }
  return `<div class="listpick">${typeChips}<div style="height:6px"></div>${nameChips}</div>${cards}`;
}

// ---------- Tab: Tetapan ----------
function consSummary(s){
  const parts=[];
  if(s.morning) parts.push('Pagi');
  if(s.pair) parts.push('Berpasangan');
  if((s.noDays||[]).length) parts.push('✕'+s.noDays.map(d=>state.config.days[d].slice(0,3)).join(','));
  return parts.length?parts.join(' · '):'—';
}
function consModalHTML(){
  const {ci,si}=ui.pickCons;
  const s=state.config.curriculum[state.config.classes[ci].name][si];
  const chips=state.config.days.map((dn,d)=>`<button class="ddbtn ${((s.noDays||[]).includes(d))?'sel':''}" data-act="cons-day" data-d="${d}">${esc(dn)}</button>`).join(' ');
  return `<h4>Kekangan — ${esc(s.name)} (${esc(s.code)})</h4>
    <p style="font-size:13px"><button class="ddbtn ${s.morning?'sel':''}" data-act="cons-morning">☀ Waktu pagi sahaja (sebelum rehat)</button>
    <button class="ddbtn ${s.pair?'sel':''}" data-act="cons-pair">⧉ Mesti 2 waktu berturutan</button></p>
    <p style="font-size:13px"><b>Tidak dibenarkan pada hari:</b> (klik untuk togol)<br>${chips}</p>
    <div class="modal-foot"><button class="act" data-act="modal-close">Selesai</button></div>`;
}
function tetapanHTML(cfg){
  const teacherRows = cfg.teachers.map((t,i)=>`
    <tr>
      <td><input data-act="t-name" data-i="${i}" value="${esc(t.name)}"></td>
      <td><input type="color" data-act="t-color" data-i="${i}" value="${esc(t.color)}"> <input class="w80 hexin" data-act="t-colorhex" data-i="${i}" value="${esc(t.color)}" maxlength="7" spellcheck="false" placeholder="#AABBCC" title="Tampal kod warna hex di sini"> <button class="ddbtn" data-act="pick-preset" data-i="${i}" title="Pilih dari palet pratetap">🎨</button></td>
      <td><button class="sm danger" data-act="t-del" data-i="${i}">Buang</button></td>
    </tr>`).join('');

  const classBlocks = cfg.classes.map((cl,ci)=>{
    const cur = cfg.curriculum[cl.name]||[];
    const rows = cur.map((s,si)=>`
      <tr>
        <td><input data-act="s-name" data-c="${ci}" data-i="${si}" value="${esc(s.name)}"></td>
        <td><input class="w60" data-act="s-code" data-c="${ci}" data-i="${si}" value="${esc(s.code)}"></td>
        <td><button class="ddbtn" data-act="pick-teacher" data-c="${ci}" data-i="${si}"><span class="dot" style="background:${teacherColor(s.teacher)}"></span> ${esc(s.teacher)} ▾</button></td>
        <td><input class="w60" type="number" min="1" max="12" data-act="s-waktu" data-c="${ci}" data-i="${si}" value="${s.waktu}"></td>
        <td><button class="ddbtn" data-act="pick-cons" data-c="${ci}" data-i="${si}">${esc(consSummary(s))} ▾</button></td>
        <td><button class="sm danger" data-act="s-del" data-c="${ci}" data-i="${si}">Buang</button></td>
      </tr>`).join('');
    const jumlah = cur.reduce((a,s)=>a+s.waktu,0);
    const slotSum = cl.periodsPerDay.reduce((a,b)=>a+b,0)-1; // -1 perhimpunan
    const tamatSel = cl.periodsPerDay.map((n,d)=>`
      <label>${esc(cfg.days[d])} <button class="ddbtn" data-act="pick-tamat" data-c="${ci}" data-d="${d}">${esc(cfg.periods[n-1].end)} (${n} waktu) ▾</button></label>`).join(' ');
    return `<fieldset><legend>
        <input class="w120" data-act="c-name" data-c="${ci}" value="${esc(cl.name)}">
        Tahap <input class="w40" type="number" min="1" max="2" data-act="c-tahap" data-c="${ci}" value="${cl.tahap}">
        <button class="sm danger" data-act="c-del" data-c="${ci}">Buang kelas</button></legend>
      <div class="tamat-edit"><b>Waktu tamat:</b> ${tamatSel}</div>
      <table class="mini"><thead><tr><th>Subjek</th><th>Kod</th><th>Guru</th><th>Waktu</th><th>Kekangan</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      <div class="hint">Jumlah peruntukan: <b>${jumlah}</b> waktu — slot P&P tersedia: <b>${slotSum}</b> (mesti sama sebelum jana) &nbsp; <button class="sm" data-act="s-add" data-c="${ci}">+ Tambah subjek</button></div>
    </fieldset>`;
  }).join('');

  const tsel = cfg.teachers.map((t,i)=>`<button class="ddbtn ${i===ui.tetapanGuru?'sel':''}" data-act="uv-guru-chip" data-i="${i}"><span class="dot" style="background:${t.color}"></span> ${esc(t.name)}</button>`).join(' ');
  const tn = cfg.teachers[ui.tetapanGuru] ? cfg.teachers[ui.tetapanGuru].name : null;
  let unavGrid='';
  if(tn){
    const D=derived(cfg);
    unavGrid=`<table class="mini unav"><thead><tr><th></th>${cfg.periods.map((p,i)=>`<th>${i+1}<br><small>${p.start}</small></th>`).join('')}</tr></thead><tbody>`;
    for(let d=0;d<cfg.days.length;d++){
      unavGrid+=`<tr><td>${esc(cfg.days[d])}</td>`;
      for(let p=0;p<cfg.periods.length;p++){
        const on=D.unav[tn]&&D.unav[tn][d][p];
        unavGrid+=`<td class="uv ${on?'on':''}" data-act="uv" data-d="${d}" data-p="${p}">${on?'✕':''}</td>`;
      }
      unavGrid+=`</tr>`;
    }
    unavGrid+=`</tbody></table>
    <div class="hint">Klik sel untuk tanda slot guru ini TIDAK tersedia untuk PPKI (cth: mengajar aliran perdana). ✕ = tidak tersedia.</div>`;
  }

  return `
  <div class="settings">
    <fieldset><legend>Maklumat sekolah</legend>
      <label>Nama sekolah <input class="wide" data-act="m-school" value="${esc(cfg.meta.school)}"></label>
      <label>Program <input class="wide" data-act="m-program" value="${esc(cfg.meta.program)}"></label>
      <label>Tahun <input class="w80" data-act="m-tahun" value="${esc(cfg.meta.tahun)}"></label>
      <label>Had waktu guru sehari <input class="w60" type="number" min="1" max="12" data-act="m-maxday" value="${cfg.maxPerDay}"></label>
    </fieldset>
    <fieldset><legend>Guru</legend>
      <table class="mini"><thead><tr><th>Nama</th><th>Warna</th><th></th></tr></thead><tbody>${teacherRows}</tbody></table>
      <button class="sm" data-act="t-add">+ Tambah guru</button>
      <span style="width:14px;display:inline-block"></span>
      <button class="sm" data-act="save-colors-global" style="font-weight:700">🌐 Terbit ke laman (SEMUA pengguna)</button>
      <div class="hint">Guru bertukar? Tukar sahaja namanya — semua subjek & jadual akan ikut. Guru baharu mengambil alih tugas guru lama: tukar nama guru lama kepada nama baharu.</div>
      <div class="hint"><b>🌐 Terbit ke laman</b> menerbitkan KESELURUHAN keadaan semasa (jadual, tetapan & warna) supaya semua pengguna mendapat versi terkini serta-merta.</div>
    </fieldset>
    <fieldset><legend>Slot tidak tersedia (jadual perdana / tugas luar)</legend>
      <div>Guru: ${tsel}</div>
      ${unavGrid}
    </fieldset>
    <fieldset><legend>Kelas & peruntukan subjek</legend>
      ${classBlocks}
      <button class="sm" data-act="c-add">+ Tambah kelas</button>
    </fieldset>
    <div class="hint big">Selepas mengubah tetapan, tekan <b>⚡ Jana Jadual</b> untuk bina jadual baharu, kemudian semak di tab Editor.</div>
  </div>`;
}

// ---------- Tab: Panduan ----------
const PANDUAN = `
<div class="panduan">
<h3>Cara guna sistem ini</h3>
<p><b>Mod admin.</b> Pengguna biasa hanya melihat tab <i>Senarai</i>, <i>Jadual Kelas</i> dan <i>Jadual Guru</i> (serta butang Cetak). Klik <b>🔒 Admin</b> dan masukkan PIN untuk membuka Editor, Tetapan, Jana Jadual dan Eksport/Import. Butang ⚡ Jana Jadual juga meminta PIN setiap kali sebagai perlindungan daripada jana secara tidak sengaja. Klik 🔓 Admin sekali lagi untuk kembali ke mod biasa. (PIN boleh ditukar melalui medan <code>adminPin</code> dalam fail Eksport JSON.)</p>
<p><b>Melihat & mencetak.</b> Tab <i>Jadual Kelas</i> dan <i>Jadual Guru</i> memaparkan jadual semasa. Tekan <b>Cetak</b> untuk cetak tab yang sedang dibuka (sesuai untuk cetakan rasmi, orientasi landskap automatik).</p>
<p><b>Telefon mudah alih.</b> Tab <i>📱 Senarai</i> direka untuk skrin kecil — pilih guru atau kelas dan jadual dipaparkan hari demi hari dalam bentuk senarai (dibuka secara automatik pada telefon). Jadual penuh juga boleh dileret ke kiri/kanan; lajur hari kekal kelihatan.</p>
<p><b>Mengubah secara manual.</b> Di tab <i>Editor</i>, klik mana-mana sel — menu pilihan subjek akan terbuka. Sistem akan menanda <span style="color:#c0392b"><b>merah</b></span> secara automatik jika ada pertindihan guru, guru digunakan semasa slot perdana, kuota subjek tidak cukup, atau subjek berulang melebihi 2 waktu sehari. Senarai isu dipaparkan di bahagian atas.</p>
<p><b>Panel Cowork vs pelayar.</b> Aplikasi ini berfungsi sepenuhnya dalam panel Cowork. Namun jika butang Cetak atau Muat turun disekat oleh panel, buka fail <b>Sistem_Jadual_PPKI.html</b> (dalam folder Jadual PPKI anda) dengan Chrome/Edge — semua fungsi tersedia di sana.</p>
<p><b>Guru bertukar / berpindah.</b> Di tab <i>Tetapan</i>: (1) tukar nama guru lama kepada nama guru baharu (semua kelas akan ikut), atau agihkan semula subjek melalui pilihan Guru dalam jadual peruntukan; (2) jika guru baharu ada komitmen aliran perdana, kemas kini grid "Slot tidak tersedia"; (3) tekan <b>⚡ Jana Jadual</b>.</p>
<p><b>Tahun baharu.</b> Kemas kini peruntukan subjek/waktu dan waktu tamat di <i>Tetapan</i> (pastikan jumlah peruntukan = slot P&P), kemudian <b>⚡ Jana Jadual</b>. Penjana akan mencari susunan tanpa pertindihan yang menghormati semua kekangan secara automatik. Selepas puas hati, tekan <b>🌐 Terbit ke laman</b> (di Tetapan → Guru) supaya semua pengguna laman web mendapat jadual baharu — dan simpan juga satu Eksport JSON sebagai arkib tahun itu.</p>
<p><b>⚠️ Simpanan.</b> Aplikasi ini tidak menyimpan secara automatik. Selepas sebarang perubahan, tekan <b>Eksport JSON</b> dan simpan fail itu. Untuk sambung kerja, tekan <b>Import JSON</b> dan pilih fail simpanan anda. Anda juga boleh meminta Claude mengemas kini artifact ini secara kekal dengan memberikan fail JSON tersebut.</p>
<h3>Kekangan yang dijaga oleh sistem</h3>
<p>Seorang guru tidak boleh mengajar 2 kelas serentak · guru tidak dijadualkan semasa slot "tidak tersedia" (jadual perdana) · kuota waktu setiap subjek dipenuhi tepat · maksimum 2 waktu subjek yang sama sehari dan mesti bersebelahan · subjek bertanda "Pagi" (PJ/PJK) dijadualkan sebelum rehat sahaja · subjek bertanda "Berpasangan" (PJ) mesti 2 waktu berturutan · hari larangan subjek (cth: PJ/PJK tiada pada Isnin) · had beban harian guru · perhimpunan Isnin waktu 1 untuk semua. Semua kekangan ini boleh diubah bagi setiap subjek melalui butang <b>Kekangan</b> di tab Tetapan.</p>
</div>`;

// ---------- Render utama ----------
function renderAll(){
  const cfg=state.config, grid=state.grid;
  // status isu
  const issues=checkIssues(cfg,grid);
  ui.issueCells=new Set();
  for(const iss of issues) for(const [c,d,p] of iss.cells) ui.issueCells.add(`${c}|${d}|${p}`);
  const pill=document.getElementById('status-pill');
  if(issues.length===0){ pill.className='pill ok'; pill.textContent='✓ Sah — tiada pertindihan'; }
  else { pill.className='pill err'; pill.textContent=`⚠ ${issues.length} isu`; }

  document.getElementById('hdr-school').textContent=cfg.meta.school;
  document.getElementById('hdr-sub').textContent=`${cfg.meta.program} · ${cfg.meta.tahun}`;

  // mod admin: hadkan tab untuk pengguna biasa
  if(!ui.admin && ADMIN_TABS.includes(ui.tab)) ui.tab='kelas';
  document.body.dataset.admin = ui.admin ? '1' : '0';
  const ab=document.getElementById('admin-btn');
  if(ab){ ab.textContent = ui.admin ? '🔓 Admin' : '🔒 Admin'; ab.classList.toggle('on', ui.admin); }

  const main=document.getElementById('main');
  document.body.dataset.tab=ui.tab;
  document.querySelectorAll('.tabbtn').forEach(b=>b.classList.toggle('active',b.dataset.tab===ui.tab));

  if(ui.tab==='kelas'){
    main.innerHTML = cfg.classes.map(c=>classGridHTML(cfg,grid,c.name,false)).join('');
  } else if(ui.tab==='guru'){
    const ringkasan = ui.admin ? `<div class="gridblock"><h3>RINGKASAN BEBAN GURU</h3>${loadTableHTML(cfg,grid)}</div>` : '';
    main.innerHTML = ringkasan + cfg.teachers.map(t=>teacherGridHTML(cfg,grid,t.name)).join('');
  } else if(ui.tab==='editor'){
    const list = issues.length? `<div class="issuebox"><b>Isu (${issues.length}):</b><ul>${issues.slice(0,25).map(i=>`<li>${esc(i.msg)}</li>`).join('')}${issues.length>25?'<li>…</li>':''}</ul></div>`
      : `<div class="issuebox ok">Tiada isu — jadual sah. ✓</div>`;
    main.innerHTML = list + cfg.classes.map(c=>
      `<div class="gridblock">${classGridHTML(cfg,grid,c.name,true)}<div class="chips">${quotaChipsHTML(cfg,grid,c.name)}</div></div>`).join('');
  } else if(ui.tab==='senarai'){
    main.innerHTML = senaraiHTML(cfg, grid);
  } else if(ui.tab==='tetapan'){
    main.innerHTML = tetapanHTML(cfg);
  } else {
    main.innerHTML = PANDUAN;
  }
}

// ---------- Peristiwa ----------
function ensureGridClass(cname, periods){
  if(!state.grid[cname]){
    state.grid[cname]=state.config.days.map(()=>new Array(periods).fill(null));
  }
}

document.addEventListener('change', e=>{
  const t=e.target, act=t.dataset.act;
  const cfg=state.config;
  if(!act) return;
  if(act==='m-school') cfg.meta.school=t.value;
  else if(act==='m-program') cfg.meta.program=t.value;
  else if(act==='m-tahun') cfg.meta.tahun=t.value;
  else if(act==='m-maxday') cfg.maxPerDay=+t.value||7;
  else if(act==='t-name'){
    const i=+t.dataset.i, old=cfg.teachers[i].name, nw=t.value.trim();
    if(!nw||cfg.teachers.some((x,xi)=>xi!==i&&x.name===nw)){toast('Nama guru mesti unik.',true);renderAll();return;}
    cfg.teachers[i].name=nw;
    for(const c of Object.keys(cfg.curriculum)) for(const s of cfg.curriculum[c]) if(s.teacher===old) s.teacher=nw;
    if(cfg.unavailable[old]){cfg.unavailable[nw]=cfg.unavailable[old];delete cfg.unavailable[old];}
    if(cfg.perdanaNotes&&cfg.perdanaNotes[old]){cfg.perdanaNotes[nw]=cfg.perdanaNotes[old];delete cfg.perdanaNotes[old];}
    if(cfg.perdanaExtra&&cfg.perdanaExtra[old]){cfg.perdanaExtra[nw]=cfg.perdanaExtra[old];delete cfg.perdanaExtra[old];}
  }
  else if(act==='t-color') cfg.teachers[+t.dataset.i].color=t.value;
  else if(act==='t-colorhex'){
    let v=t.value.trim();
    if(v && v[0]!=='#') v='#'+v;
    if(/^#[0-9a-fA-F]{6}$/.test(v)) cfg.teachers[+t.dataset.i].color=v.toUpperCase();
    else { toast('Kod warna tidak sah — guna format #RRGGBB, cth: #AFD8F5', true); }
  }
  else if(act==='s-name') cfg.curriculum[cfg.classes[+t.dataset.c].name][+t.dataset.i].name=t.value;
  else if(act==='s-code'){
    const cname=cfg.classes[+t.dataset.c].name, i=+t.dataset.i;
    const old=cfg.curriculum[cname][i].code, nw=t.value.trim().toUpperCase();
    if(!nw){renderAll();return;}
    cfg.curriculum[cname][i].code=nw;
    for(let d=0;d<cfg.days.length;d++) for(let p=0;p<cfg.periods.length;p++)
      if(state.grid[cname][d][p]===old) state.grid[cname][d][p]=nw;
  }
  else if(act==='s-waktu') cfg.curriculum[cfg.classes[+t.dataset.c].name][+t.dataset.i].waktu=Math.max(1,+t.value||1);
  else if(act==='c-name'){
    const i=+t.dataset.c, old=cfg.classes[i].name, nw=t.value.trim();
    if(!nw||cfg.classes.some((x,xi)=>xi!==i&&x.name===nw)){toast('Nama kelas mesti unik.',true);renderAll();return;}
    cfg.classes[i].name=nw;
    cfg.curriculum[nw]=cfg.curriculum[old]; delete cfg.curriculum[old];
    state.grid[nw]=state.grid[old]; delete state.grid[old];
  }
  else if(act==='c-tahap') cfg.classes[+t.dataset.c].tahap=+t.value||1;
  renderAll();
});

document.addEventListener('click', e=>{
  if(e.target.id==='modal'){ closeModal(); return; }
  const t=e.target.closest('[data-act],[data-tab]');
  if(!t) return;
  const cfg=state.config;
  if(t.dataset.tab){ ui.tab=t.dataset.tab; renderAll(); return; }
  const act=t.dataset.act;
  // ---- pemilih tersuai (modal) ----
  if(act==='modal-close'){ closeModal(); return; }
  if(act==='cell'){
    const c=t.dataset.c, d=+t.dataset.d, p=+t.dataset.p;
    ui.pickCell={c,d,p};
    const cur=state.grid[c][d][p];
    const opts=cfg.curriculum[c].map(s=>{
      const bg=teacherColor(s.teacher);
      return `<button class="optbtn${s.code===cur?' cur':''}" data-act="cell-pick" data-v="${esc(s.code)}"><span class="optcode" style="background:${bg};color:${textColorFor(bg)}">${esc(s.code)}</span> ${esc(s.name)} <small>· ${esc(s.teacher)}</small></button>`;
    }).join('');
    openModal(`<h4>Pilih subjek — ${esc(c)} · ${esc(cfg.days[d])} · Waktu ${p+1} (${esc(cfg.periods[p].start)}–${esc(cfg.periods[p].end)})</h4>
      <div class="optlist">${opts}<button class="optbtn" data-act="cell-pick" data-v=""><span class="optcode" style="background:#eee">—</span> Kosongkan slot</button></div>
      <div class="modal-foot"><button class="act" data-act="modal-close">Tutup</button></div>`);
    return;
  }
  if(act==='cell-pick'){
    const {c,d,p}=ui.pickCell||{};
    if(c!==undefined){ state.grid[c][d][p]=t.dataset.v||null; }
    closeModal(); renderAll(); return;
  }
  if(act==='pick-teacher'){
    ui.pickSubj={ci:+t.dataset.c, si:+t.dataset.i};
    const opts=cfg.teachers.map(g=>`<button class="optbtn" data-act="teacher-pick" data-name="${esc(g.name)}"><span class="dot" style="background:${g.color}"></span> ${esc(g.name)}</button>`).join('');
    openModal(`<h4>Pilih guru</h4><div class="optlist">${opts}</div><div class="modal-foot"><button class="act" data-act="modal-close">Tutup</button></div>`);
    return;
  }
  if(act==='teacher-pick'){
    const {ci,si}=ui.pickSubj||{};
    if(ci!==undefined) cfg.curriculum[cfg.classes[ci].name][si].teacher=t.dataset.name;
    closeModal(); renderAll(); return;
  }
  if(act==='pick-tamat'){
    ui.pickTamat={ci:+t.dataset.c, d:+t.dataset.d};
    const opts=cfg.periods.map((pp,pi)=>`<button class="optbtn" data-act="tamat-pick" data-n="${pi+1}">Tamat ${esc(pp.end)} — ${pi+1} waktu</button>`).join('');
    openModal(`<h4>Waktu tamat — ${esc(cfg.classes[+t.dataset.c].name)} · ${esc(cfg.days[+t.dataset.d])}</h4><div class="optlist">${opts}</div><div class="modal-foot"><button class="act" data-act="modal-close">Tutup</button></div>`);
    return;
  }
  if(act==='tamat-pick'){
    const {ci,d}=ui.pickTamat||{};
    if(ci!==undefined){
      const n=+t.dataset.n;
      cfg.classes[ci].periodsPerDay[d]=n;
      const cname=cfg.classes[ci].name;
      for(let p=n;p<cfg.periods.length;p++) state.grid[cname][d][p]=null;
    }
    closeModal(); renderAll(); return;
  }
  if(act==='uv-guru-chip'){ ui.tetapanGuru=+t.dataset.i; renderAll(); return; }
  if(act==='list-type'){ ui.list=ui.list||{}; ui.list.type=t.dataset.v; renderAll(); return; }
  if(act==='list-name'){ ui.list=ui.list||{type:'guru'}; ui.list.name=t.dataset.v; renderAll(); return; }
  if(act==='pick-preset'){
    ui.presetFor=+t.dataset.i;
    const cur=cfg.teachers[ui.presetFor]?cfg.teachers[ui.presetFor].color:'';
    const sw=PRESET_COLORS.map(c=>`<button class="swatch${c.toUpperCase()===String(cur).toUpperCase()?' cur':''}" style="background:${c}" data-act="preset-pick" data-v="${c}"><span class="swcode">${c}</span></button>`).join('');
    openModal(`<h4>🎨 Palet warna — ${esc(cfg.teachers[ui.presetFor].name)}</h4><div class="swgrid">${sw}</div>
      <div class="modal-foot"><button class="act" data-act="modal-close">Tutup</button></div>`);
    return;
  }
  if(act==='preset-pick'){
    if(ui.presetFor!==undefined && cfg.teachers[ui.presetFor]) cfg.teachers[ui.presetFor].color=t.dataset.v.toUpperCase();
    closeModal(); renderAll(); return;
  }
  if(act==='pick-cons'){
    ui.pickCons={ci:+t.dataset.c, si:+t.dataset.i};
    openModal(consModalHTML());
    return;
  }
  if(act==='cons-morning'||act==='cons-pair'||act==='cons-day'){
    const {ci,si}=ui.pickCons||{};
    if(ci===undefined) return;
    const s=cfg.curriculum[cfg.classes[ci].name][si];
    if(act==='cons-morning') s.morning=!s.morning;
    else if(act==='cons-pair') s.pair=!s.pair;
    else {
      const d=+t.dataset.d;
      s.noDays=s.noDays||[];
      const ix=s.noDays.indexOf(d);
      if(ix>=0) s.noDays.splice(ix,1); else s.noDays.push(d);
      s.noDays.sort();
    }
    openModal(consModalHTML());
    renderAll();
    return;
  }
  if(act==='c-del-yes'){
    const name=t.dataset.name;
    const i=cfg.classes.findIndex(x=>x.name===name);
    if(i>=0){ cfg.classes.splice(i,1); delete cfg.curriculum[name]; delete state.grid[name]; }
    closeModal(); renderAll(); return;
  }
  if(act==='eksport-dl'){
    try{
      const blob=new Blob([document.getElementById('json-ta').value],{type:'application/json'});
      const a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download=`jadual_ppki_${cfg.meta.tahun}.json`;
      a.click();
      toast('Fail dimuat turun (jika pelayar membenarkan).');
    }catch(err){ toast('Muat turun disekat — salin teks JSON secara manual.',true); }
    return;
  }
  if(act==='copy-json'){
    const ta=document.getElementById('json-ta');
    ta.select();
    try{ document.execCommand('copy'); toast('JSON disalin ke papan keratan.'); }
    catch(err){ toast('Salin disekat — tekan Ctrl+C selepas pilih teks.',true); }
    return;
  }
  if(act==='import-apply'){
    try{
      const s=JSON.parse(document.getElementById('json-ta').value);
      if(!s.config||!s.grid||!s.config.teachers||!s.config.classes) throw 'format';
      state=s;
      closeModal();
      toast('Data simpanan dibuka.');
      renderAll();
    }catch(err){ toast('JSON tidak sah — pastikan teks penuh dari Eksport.',true); }
    return;
  }
  if(act==='import-file'){ document.getElementById('importfile').click(); return; }
  if(act==='t-add'){
    let n=1; while(cfg.teachers.some(x=>x.name==='Guru '+n)) n++;
    cfg.teachers.push({name:'Guru '+n,color:'#9b59b6'});
  }
  else if(act==='t-del'){
    const i=+t.dataset.i, name=cfg.teachers[i].name;
    const used=Object.values(cfg.curriculum).some(list=>list.some(s=>s.teacher===name));
    if(used){toast(`${name} masih mempunyai subjek. Agihkan semula subjek dahulu.`,true);return;}
    cfg.teachers.splice(i,1);
    delete cfg.unavailable[name];
    if(ui.tetapanGuru>=cfg.teachers.length) ui.tetapanGuru=0;
  }
  else if(act==='uv'){
    const tn=cfg.teachers[ui.tetapanGuru].name;
    const d=+t.dataset.d, p=+t.dataset.p;
    if(!cfg.unavailable[tn]) cfg.unavailable[tn]=cfg.days.map(()=>[]);
    const arr=cfg.unavailable[tn][d];
    const ix=arr.indexOf(p);
    if(ix>=0) arr.splice(ix,1); else arr.push(p);
  }
  else if(act==='s-add'){
    const cname=cfg.classes[+t.dataset.c].name;
    cfg.curriculum[cname].push({name:'Subjek Baharu',code:'SB',teacher:cfg.teachers[0].name,waktu:2,morning:false,pair:false,noDays:[]});
  }
  else if(act==='s-del'){
    const cname=cfg.classes[+t.dataset.c].name;
    const code=cfg.curriculum[cname][+t.dataset.i].code;
    cfg.curriculum[cname].splice(+t.dataset.i,1);
    for(let d=0;d<cfg.days.length;d++) for(let p=0;p<cfg.periods.length;p++)
      if(state.grid[cname][d][p]===code) state.grid[cname][d][p]=null;
  }
  else if(act==='c-add'){
    let n=1; while(cfg.classes.some(x=>x.name==='KELAS '+n)) n++;
    const name='KELAS '+n;
    cfg.classes.push({name,tahap:1,periodsPerDay:[8,8,8,8,7]});
    cfg.curriculum[name]=[];
    state.grid[name]=cfg.days.map(()=>new Array(cfg.periods.length).fill(null));
    state.grid[name][cfg.assembly.day][cfg.assembly.period]='PERHIM';
  }
  else if(act==='c-del'){
    const name=cfg.classes[+t.dataset.c].name;
    openModal(`<h4>Buang kelas ${esc(name)}?</h4><p style="font-size:13px">Semua peruntukan subjek dan jadual kelas ini akan dipadam.</p>
      <div class="modal-foot"><button class="act danger2" data-act="c-del-yes" data-name="${esc(name)}">Ya, buang</button> <button class="act" data-act="modal-close">Batal</button></div>`);
    return;
  }
  else if(act==='admin-toggle'){
    if(ui.admin){ ui.admin=false; toast('Mod admin dimatikan.'); renderAll(); }
    else openPinModal('admin','Masukkan PIN admin');
    return;
  }
  else if(act==='pin-ok'){
    const inp=document.getElementById('pin-in');
    const val=inp?inp.value.trim():'';
    if(val===adminPin()){
      const action=ui.pinAction;
      ui.pinAction=null;
      closeModal();
      if(action==='admin'){ ui.admin=true; toast('Mod admin diaktifkan.'); renderAll(); }
      else if(action==='jana'){ janaJadual(); }
    } else {
      if(inp){ inp.value=''; inp.focus(); }
      toast('PIN salah.', true);
    }
    return;
  }
  else if(act==='jana'){
    if(!ui.admin){ toast('Mod admin diperlukan.', true); return; }
    openPinModal('jana','Masukkan PIN untuk jana jadual baharu');
    return;
  }
  else if(act==='save-colors-global'){
    if(ui.apiOk){
      openModal(`<h4>🌐 Terbit — pangkalan data</h4>
        <p style="font-size:12.5px">Keseluruhan keadaan semasa (<b>jadual, tetapan, kekangan & warna</b>) akan disimpan ke pangkalan data dan tersebar <b>serta-merta</b> kepada semua pengguna. Masukkan PIN admin untuk sahkan.</p>
        <input id="pub-pin" class="pinin" type="password" inputmode="numeric" maxlength="12" placeholder="••••••" autocomplete="off">
        <div class="modal-foot"><button class="act primary" data-act="global-colors-go">🌐 Terbit sekarang</button> <button class="act" data-act="modal-close">Batal</button></div>`);
      setTimeout(()=>{const i=document.getElementById('pub-pin'); if(i) i.focus();}, 60);
      return;
    }
    let tok='';
    try{ tok=localStorage.getItem(GHTOK_KEY)||''; }catch(e){}
    openModal(`<h4>🌐 Terbit ke laman — untuk semua pengguna</h4>
      <p style="font-size:12.5px">Keseluruhan keadaan semasa (<b>jadual, tetapan, kekangan & warna</b>) akan diterbitkan ke laman web, dan semua pengguna mendapat versi terkini sebentar lagi. Perlukan token GitHub anda (kekal dalam pelayar ini sahaja, tidak dikongsi; jika luput, tampal token baharu di sini).</p>
      <input id="gh-tok" class="jsonta" style="height:auto;padding:8px;font-size:12px" type="password" placeholder="github_pat_..." value="${esc(tok)}">
      <div class="modal-foot"><button class="act primary" data-act="global-colors-go">🌐 Terbit sekarang</button> <button class="act" data-act="modal-close">Batal</button></div>`);
    return;
  }
  else if(act==='global-colors-go'){
    publishGlobal();
    return;
  }
  else if(act==='cetak'){
    const kChips=cfg.classes.map(c=>`<button class="ddbtn" data-act="cetak-satu" data-t="kelas" data-v="${esc(c.name)}">${esc(c.name)}</button>`).join(' ');
    const gChips=cfg.teachers.map(g=>`<button class="ddbtn" data-act="cetak-satu" data-t="guru" data-v="${esc(g.name)}"><span class="dot" style="background:${g.color}"></span> ${esc(g.name)}</button>`).join(' ');
    openModal(`<h4>🖨 Cetak</h4>
      <p style="font-size:13px;margin:6px 0"><button class="ddbtn" data-act="cetak-now" style="font-weight:700">Cetak paparan semasa (${ui.tab==='guru'?'semua guru':ui.tab==='kelas'?'semua kelas':'tab semasa'})</button></p>
      <p style="font-size:12.5px;margin:10px 0 4px"><b>Atau cetak satu kelas sahaja:</b></p>
      <div>${kChips}</div>
      <p style="font-size:12.5px;margin:10px 0 4px"><b>Atau cetak satu guru sahaja:</b></p>
      <div>${gChips}</div>
      <div class="modal-foot"><button class="act" data-act="modal-close">Tutup</button></div>`);
    return;
  }
  else if(act==='cetak-now'){
    closeModal();
    setTimeout(()=>{ try{ window.print(); }catch(err){ toast('Cetakan disekat dalam panel ini — buka laman web/fail HTML untuk mencetak.',true);} }, 120);
    return;
  }
  else if(act==='cetak-satu'){
    closeModal();
    printOne(t.dataset.t, t.dataset.v);
    return;
  }
  else if(act==='eksport'){
    openModal(`<h4>Eksport / Simpan</h4>
      <p style="font-size:12.5px">Salin teks di bawah dan simpan dalam fail (cth: Notepad → jadual_ppki.json), atau cuba muat turun terus.</p>
      <textarea id="json-ta" class="jsonta" readonly>${esc(JSON.stringify(state))}</textarea>
      <div class="modal-foot"><button class="act primary" data-act="copy-json">📋 Salin</button> <button class="act" data-act="eksport-dl">⬇ Muat turun fail</button> <button class="act" data-act="modal-close">Tutup</button></div>`);
    return;
  }
  else if(act==='import'){
    openModal(`<h4>Import / Buka simpanan</h4>
      <p style="font-size:12.5px">Tampal teks JSON simpanan anda di bawah, atau pilih fail.</p>
      <textarea id="json-ta" class="jsonta" placeholder='Tampal JSON di sini...'></textarea>
      <div class="modal-foot"><button class="act primary" data-act="import-apply">Guna JSON ini</button> <button class="act" data-act="import-file">📂 Pilih fail...</button> <button class="act" data-act="modal-close">Tutup</button></div>`);
    return;
  }
  else return;
  renderAll();
});

document.addEventListener('keydown', e=>{
  if(e.key!=='Enter' || document.getElementById('modal').hidden) return;
  if(document.getElementById('pin-in')){
    e.preventDefault();
    const b=document.querySelector('[data-act="pin-ok"]');
    if(b) b.click();
  } else if(document.getElementById('pub-pin')){
    e.preventDefault();
    const b=document.querySelector('[data-act="global-colors-go"]');
    if(b) b.click();
  }
});

document.getElementById('importfile').addEventListener('change', e=>{
  const f=e.target.files[0];
  if(!f) return;
  const r=new FileReader();
  r.onload=()=>{
    try{
      const s=JSON.parse(r.result);
      if(!s.config||!s.grid||!s.config.teachers||!s.config.classes) throw 'format';
      state=s;
      closeModal();
      toast('Fail simpanan dibuka.');
      renderAll();
    }catch(err){ toast('Fail tidak sah — pastikan fail eksport dari sistem ini.',true); }
  };
  r.readAsText(f);
  e.target.value='';
});

renderAll();
