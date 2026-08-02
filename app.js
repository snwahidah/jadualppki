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
const ui = { tab:'kelas', tetapanGuru:0, busy:false };

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

function periodHeaderCells(cfg){
  let h='';
  for(let p=0;p<cfg.periods.length;p++){
    h+=`<th class="pcol"><div class="pnum">${p+1}</div><div class="ptime">${cfg.periods[p].start}<br>–${cfg.periods[p].end}</div></th>`;
    if(p===cfg.rehatAfter) h+=`<th class="rehat-col" title="${esc(cfg.rehatLabel)}">R<br>E<br>H<br>A<br>T</th>`;
  }
  return h;
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
          html+=`<td class="perhim${bad}">PERHIMPUNAN</td>`;
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
      if(p===cfg.rehatAfter) html+=`<td class="rehat-cell"></td>`;
    }
    html+=`</tr>`;
  }
  html+=`</tbody></table>`;
  const tamat = cls.periodsPerDay.map((n,d)=>`${cfg.days[d]} ${cfg.periods[n-1].end}`).join(' · ');
  return `<div class="gridblock"><h3>${esc(cname)} <span class="tahap">(TAHAP ${cls.tahap})</span></h3><div class="tamat">Waktu tamat: ${tamat}</div>${html}</div>`;
}

function teacherGridHTML(cfg, grid, tname){
  const D=derived(cfg);
  const notes=(cfg.perdanaNotes||{})[tname]||[];
  const noteMap={};
  for(const [d,ps,pe,label] of notes) for(let p=ps;p<=pe;p++) noteMap[d+'|'+p]=label;
  let total=0;
  let html=`<table class="jadual"><thead><tr><th class="daycol">HARI / MASA</th>${periodHeaderCells(cfg)}</tr></thead><tbody>`;
  for(let d=0;d<cfg.days.length;d++){
    html+=`<tr><td class="daycol">${esc(cfg.days[d].toUpperCase())}</td>`;
    for(let p=0;p<D.NP;p++){
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
        html+=`<td class="perhim">PERHIMPUNAN</td>`;
      } else if(D.unav[tname]&&D.unav[tname][d][p]){
        const label=noteMap[d+'|'+p]||'TUGAS PERDANA';
        html+=`<td class="perdana"><div>${esc(label)}</div></td>`;
      } else {
        html+=`<td class="freecell"></td>`;
      }
      if(p===cfg.rehatAfter) html+=`<td class="rehat-cell"></td>`;
    }
    html+=`</tr>`;
  }
  html+=`</tbody></table>`;
  const extra=(cfg.perdanaExtra||{})[tname]||[];
  const extraHtml = extra.length?`<div class="tamat">Luar grid PPKI (perdana): ${extra.map(esc).join(' · ')}</div>`:'';
  return `<div class="gridblock"><h3><span class="dot" style="background:${teacherColor(tname)}"></span> ${esc(tname).toUpperCase()} <span class="tahap">— ${total} waktu PPKI + 1 perhimpunan = ${total+1}</span></h3>${html}${extraHtml}</div>`;
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
      <td><input type="color" data-act="t-color" data-i="${i}" value="${esc(t.color)}"></td>
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
      <div class="hint">Guru bertukar? Tukar sahaja namanya — semua subjek & jadual akan ikut. Guru baharu mengambil alih tugas guru lama: tukar nama guru lama kepada nama baharu.</div>
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
<p><b>Melihat & mencetak.</b> Tab <i>Jadual Kelas</i> dan <i>Jadual Guru</i> memaparkan jadual semasa. Tekan <b>Cetak</b> untuk cetak tab yang sedang dibuka (sesuai untuk cetakan rasmi, orientasi landskap automatik).</p>
<p><b>Mengubah secara manual.</b> Di tab <i>Editor</i>, klik mana-mana sel — menu pilihan subjek akan terbuka. Sistem akan menanda <span style="color:#c0392b"><b>merah</b></span> secara automatik jika ada pertindihan guru, guru digunakan semasa slot perdana, kuota subjek tidak cukup, atau subjek berulang melebihi 2 waktu sehari. Senarai isu dipaparkan di bahagian atas.</p>
<p><b>Panel Cowork vs pelayar.</b> Aplikasi ini berfungsi sepenuhnya dalam panel Cowork. Namun jika butang Cetak atau Muat turun disekat oleh panel, buka fail <b>Sistem_Jadual_PPKI.html</b> (dalam folder Jadual PPKI anda) dengan Chrome/Edge — semua fungsi tersedia di sana.</p>
<p><b>Guru bertukar / berpindah.</b> Di tab <i>Tetapan</i>: (1) tukar nama guru lama kepada nama guru baharu (semua kelas akan ikut), atau agihkan semula subjek melalui pilihan Guru dalam jadual peruntukan; (2) jika guru baharu ada komitmen aliran perdana, kemas kini grid "Slot tidak tersedia"; (3) tekan <b>⚡ Jana Jadual</b>.</p>
<p><b>Tahun baharu.</b> Kemas kini peruntukan subjek/waktu dan waktu tamat di <i>Tetapan</i> (pastikan jumlah peruntukan = slot P&P), kemudian <b>⚡ Jana Jadual</b>. Penjana akan mencari susunan tanpa pertindihan yang menghormati semua kekangan secara automatik.</p>
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

  const main=document.getElementById('main');
  document.body.dataset.tab=ui.tab;
  document.querySelectorAll('.tabbtn').forEach(b=>b.classList.toggle('active',b.dataset.tab===ui.tab));

  if(ui.tab==='kelas'){
    main.innerHTML = cfg.classes.map(c=>classGridHTML(cfg,grid,c.name,false)).join('');
  } else if(ui.tab==='guru'){
    main.innerHTML = `<div class="gridblock"><h3>RINGKASAN BEBAN GURU</h3>${loadTableHTML(cfg,grid)}</div>` +
      cfg.teachers.map(t=>teacherGridHTML(cfg,grid,t.name)).join('');
  } else if(ui.tab==='editor'){
    const list = issues.length? `<div class="issuebox"><b>Isu (${issues.length}):</b><ul>${issues.slice(0,25).map(i=>`<li>${esc(i.msg)}</li>`).join('')}${issues.length>25?'<li>…</li>':''}</ul></div>`
      : `<div class="issuebox ok">Tiada isu — jadual sah. ✓</div>`;
    main.innerHTML = list + cfg.classes.map(c=>
      `<div class="gridblock">${classGridHTML(cfg,grid,c.name,true)}<div class="chips">${quotaChipsHTML(cfg,grid,c.name)}</div></div>`).join('');
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
  else if(act==='jana'){ janaJadual(); return; }
  else if(act==='cetak'){ try{ window.print(); }catch(err){ toast('Cetakan disekat dalam panel ini — buka fail HTML dalam pelayar untuk mencetak.',true);} return; }
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
