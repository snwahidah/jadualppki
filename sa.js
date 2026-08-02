// ===== Jadual PPKI — Solver v3: Simulated Annealing / Min-Conflicts =====
const DAYS = ["Isnin","Selasa","Rabu","Khamis","Jumaat"];
const PERIODS = [
  {id:1,start:"7.30",end:"8.00"},{id:2,start:"8.00",end:"8.30"},{id:3,start:"8.30",end:"9.00"},
  {id:4,start:"9.20",end:"9.50"},{id:5,start:"9.50",end:"10.20"},{id:6,start:"10.20",end:"10.50"},
  {id:7,start:"10.50",end:"11.20"},{id:8,start:"11.20",end:"11.50"},{id:9,start:"11.50",end:"12.20"}
];
const NP = PERIODS.length;
const CONSEC = new Set(["0-1","1-2","3-4","4-5","5-6","6-7","7-8"]);
const T1 = [[0,1,2,3,4,5,6,7],[0,1,2,3,4,5,6,7],[0,1,2,3,4,5,6,7],[0,1,2,3,4,5,6,7],[0,1,2,3,4,5,6]];
const T2 = [[0,1,2,3,4,5,6,7,8],[0,1,2,3,4,5,6,7,8],[0,1,2,3,4,5,6,7],[0,1,2,3,4,5,6,7,8],[0,1,2,3,4,5,6]];

const CONFIG = {
  teachers:{Fazlina:{color:"#4FB3E8"},Mukmin:{color:"#FFF200"},Auni:{color:"#00A651"},Wahidah:{color:"#ED1C24"},Hafizah:{color:"#D97BC7"}},
  classes:{
    "1 KRISTAL":{tahap:1,sessions:T1},
    "2 INTAN":{tahap:1,sessions:T1},
    "4 BERLIAN":{tahap:2,sessions:T2}
  },
  assembly:{day:0,period:0,label:"PERHIMPUNAN"},
  curriculum:{
    "1 KRISTAL":[
      ["Bahasa Melayu","BM","Fazlina",4,null],["Matematik","MT","Fazlina",3,null],["Bahasa Inggeris","BI","Fazlina",3,null],
      ["Pengurusan Diri","PD","Auni",6,null],["Kemahiran Manipulatif","KM","Auni",6,null],["Pendidikan Islam","PI","Hafizah",5,null],
      ["Pendidikan Jasmani","PJ","Fazlina",4,"morning",[0],true],["Pendidikan Seni","PSV","Auni",4,null],["Pendidikan Muzik","MZ","Auni",3,null]],
    "2 INTAN":[
      ["Bahasa Melayu","BM","Wahidah",4,null],["Matematik","MT","Wahidah",3,null],["Bahasa Inggeris","BI","Wahidah",3,null],
      ["Pengurusan Diri","PD","Wahidah",6,null],["Kemahiran Manipulatif","KM","Wahidah",6,null],["Pendidikan Islam","PI","Hafizah",5,null],
      ["Pendidikan Jasmani","PJ","Mukmin",4,"morning",[0],true],["Pendidikan Seni","PSV","Auni",4,null],["Pendidikan Muzik","MZ","Auni",3,null]],
    "4 BERLIAN":[
      ["Bahasa Melayu","BM","Mukmin",5,null],["Matematik","MT","Mukmin",4,null],["Bahasa Inggeris","BI","Mukmin",4,null],
      ["Pengurusan Diri","PD","Auni",2,null],["Kemahiran Manipulatif","KM","Fazlina",3,null],["Pendidikan Islam","PI","Hafizah",5,null],
      ["Pendidikan Jasmani Kesihatan","PJK","Mukmin",3,"morning",[0]],["Pendidikan Seni","PS","Fazlina",2,null],["Pendidikan Muzik","MZ","Fazlina",2,null],
      ["Pend. Teknologi Maklumat","TMK","Mukmin",2,null],["Kemahiran Hidup Asas","KH","Fazlina",5,null],
      ["Pend. Sains, Sosial & Alam Sekitar","PSSAS","Mukmin",4,null]]
  },
  unavailable:{
    Hafizah:[[0,3,4],[0,1,3,4,7,8],[3,4,5,6,7,8],[0,1,2,3,7,8],[0,1,6,7]]
  },
  maxPerDayPerTeacher:7,
  morningPeriods:[0,1,2]
};

const W_HARD = 1000, W_SOFT = 1;

function mulberry32(a){return function(){a|=0;a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}

function solveSA(config, seed, maxIter) {
  const rnd = mulberry32(seed);
  const classNames = Object.keys(config.classes);
  const NC = classNames.length;

  // teacher lookup per (class, code); morning set per class
  const teacherOf = {}, morningSet = {}, banned = {}, pairSet = {};
  for (const c of classNames) {
    teacherOf[c] = {}; morningSet[c] = new Set(); banned[c] = {}; pairSet[c] = new Set();
    for (const [name,code,t,w,cons,noDays,pairFlag] of config.curriculum[c]) {
      teacherOf[c][code] = t;
      if (cons === "morning") morningSet[c].add(code);
      banned[c][code] = new Set(noDays||[]);
      if (pairFlag) pairSet[c].add(code);
    }
  }
  const unav = {};
  for (const t of Object.keys(config.teachers)) {
    unav[t] = DAYS.map(()=>new Array(NP).fill(false));
    const u = config.unavailable[t];
    if (u) for (let d=0; d<5; d++) for (const p of u[d]) unav[t][d][p] = true;
  }

  // grid[c][d][p] = code | "ASSEMBLY" | undefined
  const grid = {};
  const slots = {}; // senarai {d,p} boleh-tukar per kelas
  for (const c of classNames) {
    grid[c] = DAYS.map((_,d)=>{const r=new Array(NP).fill(undefined);for(const p of config.classes[c].sessions[d])r[p]=null;return r;});
    grid[c][config.assembly.day][config.assembly.period] = "ASSEMBLY";
    slots[c] = [];
    for (let d=0; d<5; d++) for (let p=0; p<NP; p++) if (grid[c][d][p] === null) slots[c].push([d,p]);
    // isi rawak: multiset kod subjek
    const items = [];
    for (const [name,code,t,w] of config.curriculum[c]) for (let i=0;i<w;i++) items.push(code);
    if (items.length !== slots[c].length) throw `Kuota ${c}: ${items.length} vs slot ${slots[c].length}`;
    for (let i=items.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[items[i],items[j]]=[items[j],items[i]];}
    slots[c].forEach(([d,p],i)=>{grid[c][d][p]=items[i];});
  }

  // ----- kos -----
  function colCost(d,p){ // pertindihan guru + slot perdana pada (d,p)
    let cost = 0; const seen = {};
    for (const c of classNames) {
      const v = grid[c][d][p];
      if (!v || v === "ASSEMBLY") continue;
      const t = teacherOf[c][v];
      if (seen[t]) cost += W_HARD;
      seen[t] = true;
      if (unav[t][d][p]) cost += W_HARD;
    }
    return cost;
  }
  function rowCost(c,d){ // corak subjek dalam satu hari kelas
    let cost = 0; const pos = {};
    const row = grid[c][d];
    for (let p=0;p<NP;p++){
      const v = row[p];
      if (!v || v === "ASSEMBLY") continue;
      (pos[v] = pos[v] || []).push(p);
      if (morningSet[c].has(v) && !config.morningPeriods.includes(p)) cost += W_HARD;
      if (banned[c][v] && banned[c][v].has(d)) cost += W_HARD;
    }
    for (const [code,ps] of Object.entries(pos)) {
      if (ps.length > 2) cost += W_HARD * (ps.length - 2);
      if (ps.length === 2 && !CONSEC.has(ps[0]+"-"+ps[1])) cost += W_HARD;
      if (pairSet[c].has(code) && ps.length === 1) cost += W_HARD;
      cost += W_SOFT; // galak gabung (kurangkan bilangan hari subjek tersebar)
    }
    return cost;
  }
  function loadCost(t,d){
    let n = 0;
    for (const c of classNames) for (let p=0;p<NP;p++){
      const v = grid[c][d][p];
      if (v && v !== "ASSEMBLY" && teacherOf[c][v] === t) n++;
    }
    return n > config.maxPerDayPerTeacher ? W_HARD * (n - config.maxPerDayPerTeacher) : 0;
  }

  function totalCost(){
    let s = 0;
    for (let d=0;d<5;d++) for (let p=0;p<NP;p++) s += colCost(d,p);
    for (const c of classNames) for (let d=0;d<5;d++) s += rowCost(c,d);
    for (const t of Object.keys(config.teachers)) for (let d=0;d<5;d++) s += loadCost(t,d);
    return s;
  }

  function localCost(c,d1,p1,d2,p2){
    let s = colCost(d1,p1) + rowCost(c,d1) + colCost(d2,p2);
    if (d2 !== d1) s += rowCost(c,d2);
    const v1 = grid[c][d1][p1], v2 = grid[c][d2][p2];
    const ts = new Set();
    if (v1 && v1 !== "ASSEMBLY") ts.add(teacherOf[c][v1]);
    if (v2 && v2 !== "ASSEMBLY") ts.add(teacherOf[c][v2]);
    for (const t of ts) { s += loadCost(t,d1); if (d2 !== d1) s += loadCost(t,d2); }
    return s;
  }

  // senarai slot bermasalah (dikira semula berkala)
  function violatingSlots(){
    const out = [];
    for (const c of classNames) for (const [d,p] of slots[c]) {
      const v = grid[c][d][p];
      const t = teacherOf[c][v];
      let bad = unav[t][d][p];
      if (!bad) { // clash?
        for (const c2 of classNames) {
          if (c2 === c) continue;
          const v2 = grid[c2][d][p];
          if (v2 && v2 !== "ASSEMBLY" && teacherOf[c2][v2] === t) { bad = true; break; }
        }
      }
      if (!bad) { // corak
        let cnt=0, other=-1;
        for (let q=0;q<NP;q++) if (grid[c][d][q] === v) { cnt++; if (q!==p) other=q; }
        if (cnt>2) bad = true;
        else if (cnt===2 && !CONSEC.has(Math.min(p,other)+"-"+Math.max(p,other))) bad = true;
        if (pairSet[c].has(v) && cnt===1) bad = true;
        if (morningSet[c].has(v) && !config.morningPeriods.includes(p)) bad = true;
        if (banned[c][v] && banned[c][v].has(d)) bad = true;
      }
      if (bad) out.push([c,d,p]);
    }
    return out;
  }

  function copyGrid(g){
    const out = {};
    for (const c of classNames) out[c] = g[c].map(r => r.slice());
    return out;
  }

  let cost = totalCost();
  let bestValid = null, bestValidCost = Infinity, firstValidIt = -1;
  let T = 60;
  const cool = Math.pow(0.02/T, 1/maxIter);
  let viol = violatingSlots();

  for (let it=0; it<maxIter; it++) {
    if (it % 2000 === 0) {
      viol = violatingSlots();
      if (viol.length === 0) {
        if (firstValidIt < 0) firstValidIt = it;
        if (cost < bestValidCost) { bestValidCost = cost; bestValid = copyGrid(grid); }
      }
      if (firstValidIt >= 0 && it > firstValidIt + 150000) break;
    }
    // pilih move: 70% sasarkan slot bermasalah
    let c, d1, p1;
    if (viol.length && rnd() < 0.7) {
      const [vc,vd,vp] = viol[Math.floor(rnd()*viol.length)];
      c = vc; d1 = vd; p1 = vp;
    } else {
      c = classNames[Math.floor(rnd()*NC)];
      const s = slots[c][Math.floor(rnd()*slots[c].length)];
      d1 = s[0]; p1 = s[1];
    }
    const s2 = slots[c][Math.floor(rnd()*slots[c].length)];
    const d2 = s2[0], p2 = s2[1];
    if (d1===d2 && p1===p2) continue;
    const v1 = grid[c][d1][p1], v2 = grid[c][d2][p2];
    if (v1 === v2) continue;
    const before = localCost(c,d1,p1,d2,p2);
    grid[c][d1][p1] = v2; grid[c][d2][p2] = v1;
    const after = localCost(c,d1,p1,d2,p2);
    const delta = after - before;
    if (delta <= 0 || rnd() < Math.exp(-delta/T)) {
      cost += delta;
    } else {
      grid[c][d1][p1] = v1; grid[c][d2][p2] = v2; // undo
    }
    T *= cool;
    if (T < 0.02) T = 0.02;
  }
  if (!bestValid) return { grid: null, cost: Infinity };

  // ---- fasa polish: hill-climbing pasangan swap (hard cost terpelihara) ----
  for (const c of classNames) for (let d=0; d<5; d++) grid[c][d] = bestValid[c][d].slice();
  let improved = true, rounds = 0;
  while (improved && rounds < 30) {
    improved = false; rounds++;
    for (const c of classNames) {
      const S = slots[c];
      for (let i=0; i<S.length; i++) for (let j=i+1; j<S.length; j++) {
        const [d1,p1]=S[i], [d2,p2]=S[j];
        const v1=grid[c][d1][p1], v2=grid[c][d2][p2];
        if (v1===v2) continue;
        const before = localCost(c,d1,p1,d2,p2);
        grid[c][d1][p1]=v2; grid[c][d2][p2]=v1;
        const after = localCost(c,d1,p1,d2,p2);
        if (after < before) { improved = true; }
        else { grid[c][d1][p1]=v1; grid[c][d2][p2]=v2; }
      }
    }
  }
  if (violatingSlots().length === 0) return { grid: copyGrid(grid), cost: totalCost() };
  return { grid: bestValid, cost: bestValidCost };
}

// hardCost sahaja (tanpa soft) untuk semakan
function hardErrors(config, grid) {
  const classNames = Object.keys(config.classes);
  const teacherOf = {};
  for (const c of classNames){teacherOf[c]={};for(const [n,code,t] of config.curriculum[c])teacherOf[c][code]=t;}
  const errors = [];
  for (const c of classNames){
    const count = {};
    for (let d=0;d<5;d++) for (let p=0;p<NP;p++){
      const v = grid[c][d][p];
      if (v && v !== "ASSEMBLY") count[v]=(count[v]||0)+1;
      if (v === null) errors.push(`KOSONG ${c} ${DAYS[d]} P${p+1}`);
    }
    for (const [n,code,t,w] of config.curriculum[c]) if ((count[code]||0)!==w) errors.push(`KUOTA ${c} ${code} ${count[code]||0}/${w}`);
  }
  for (let d=0;d<5;d++) for (let p=0;p<NP;p++){
    const seen={};
    for (const c of classNames){
      const v=grid[c][d][p];
      if (!v||v==="ASSEMBLY") continue;
      const t=teacherOf[c][v];
      if (seen[t]) errors.push(`TINDIH ${t} ${DAYS[d]} P${p+1} (${seen[t]} & ${c})`);
      seen[t]=c;
      const u=config.unavailable[t];
      if (u && u[d].includes(p)) errors.push(`PERDANA ${t} ${DAYS[d]} P${p+1} (${c})`);
    }
  }
  for (const c of classNames) for (let d=0;d<5;d++){
    const pos={};
    for (let p=0;p<NP;p++){const v=grid[c][d][p];if(v&&v!=="ASSEMBLY")(pos[v]=pos[v]||[]).push(p);}
    for (const [code,ps] of Object.entries(pos)){
      if (ps.length>2) errors.push(`>2/HARI ${c} ${code} ${DAYS[d]}`);
      if (ps.length===2 && !CONSEC.has(ps[0]+"-"+ps[1])) errors.push(`PISAH ${c} ${code} ${DAYS[d]} P${ps[0]+1},P${ps[1]+1}`);
    }
    for (const [n,code,t,w,cons,noDays,pairFlag] of config.curriculum[c]){
      if (cons==="morning" && pos[code])
        for (const p of pos[code]) if (!CONFIG.morningPeriods.includes(p)) errors.push(`PAGI ${c} ${code} ${DAYS[d]} P${p+1}`);
      if ((noDays||[]).includes(d) && pos[code]) errors.push(`HARI LARANGAN ${c} ${code} ${DAYS[d]}`);
      if (pairFlag && pos[code] && pos[code].length===1) errors.push(`TIDAK BERPASANGAN ${c} ${code} ${DAYS[d]}`);
    }
  }
  return errors;
}

function main(){
  const t0 = Date.now();
  let sol = null, seedUsed = null;
  for (let seed=1; seed<=40; seed++){
    const r = solveSA(CONFIG, seed, 400000);
    if (!r.grid){ console.log(`seed ${seed}: tiada penyelesaian sah, ${Date.now()-t0}ms`); continue; }
    const errs = hardErrors(CONFIG, r.grid);
    console.log(`seed ${seed}: kos ${r.cost}, ralat keras ${errs.length}, ${Date.now()-t0}ms`);
    if (errs.length){ console.log(errs.slice(0,10).join("\n")); continue; }
    sol = r; seedUsed = seed; break;
  }
  if (!sol){ console.log("GAGAL"); process.exit(1); }
  console.log(`\nBERJAYA seed ${seedUsed} (${Date.now()-t0}ms), kos ${sol.cost}`);
  const teacherOf = {};
  for (const c of Object.keys(CONFIG.classes)){teacherOf[c]={};for(const [n,code,t] of CONFIG.curriculum[c])teacherOf[c][code]=t;}
  for (const c of Object.keys(CONFIG.classes)){
    console.log(`\n=== ${c} ===`);
    for (let d=0;d<5;d++){
      console.log(DAYS[d].padEnd(8)+sol.grid[c][d].map(v=>{
        if (v===undefined) return "  --   ";
        if (v==="ASSEMBLY") return "PERHIM ";
        return (v+"("+teacherOf[c][v][0]+")").padEnd(7);
      }).join("|"));
    }
  }
  // beban guru
  console.log("\n=== Beban guru/hari ===");
  for (const t of Object.keys(CONFIG.teachers)){
    const loads=[0,0,0,0,0];
    for (const c of Object.keys(CONFIG.classes)) for (let d=0;d<5;d++) for (let p=0;p<NP;p++){
      const v=sol.grid[c][d][p];
      if (v&&v!=="ASSEMBLY"&&teacherOf[c][v]===t) loads[d]++;
    }
    console.log(t.padEnd(9)+loads.join(" ")+"  jumlah "+loads.reduce((a,b)=>a+b,0));
  }
  require("fs").writeFileSync("/home/user/jadual/solution.json", JSON.stringify({seed:seedUsed, grid:sol.grid}));
}
main();
