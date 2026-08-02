// ===== Jadual PPKI — Penjana Jadual (solver v2: MRV + dedupe + restarts) =====

const DAYS = ["Isnin", "Selasa", "Rabu", "Khamis", "Jumaat"];

const PERIODS = [
  { id: 1, start: "7.30", end: "8.00" },
  { id: 2, start: "8.00", end: "8.30" },
  { id: 3, start: "8.30", end: "9.00" },
  { id: 4, start: "9.20", end: "9.50" },
  { id: 5, start: "9.50", end: "10.20" },
  { id: 6, start: "10.20", end: "10.50" },
  { id: 7, start: "10.50", end: "11.20" },
  { id: 8, start: "11.20", end: "11.50" },
  { id: 9, start: "11.50", end: "12.20" },
];
const CONSEC = new Set(["0-1", "1-2", "3-4", "4-5", "5-6", "6-7", "7-8"]);

// Tahap 1: Isnin-Khamis pulang 11.50 (P1-P8), Jumaat 11.20 (P1-P7)
// Tahap 2: Isnin/Selasa/Khamis pulang 12.20 (P1-P9), Rabu 11.50 (P1-P8), Jumaat 11.20 (P1-P7)
const T1 = [[0,1,2,3,4,5,6,7],[0,1,2,3,4,5,6,7],[0,1,2,3,4,5,6,7],[0,1,2,3,4,5,6,7],[0,1,2,3,4,5,6]];
const T2 = [[0,1,2,3,4,5,6,7,8],[0,1,2,3,4,5,6,7,8],[0,1,2,3,4,5,6,7],[0,1,2,3,4,5,6,7,8],[0,1,2,3,4,5,6]];

const CONFIG = {
  teachers: { Fazlina:{color:"#4FB3E8"}, Mukmin:{color:"#FFF200"}, Auni:{color:"#00A651"}, Wahidah:{color:"#ED1C24"}, Hafizah:{color:"#D97BC7"} },
  classes: {
    "1 KRISTAL": { tahap: 1, sessions: T1 },
    "2 INTAN":   { tahap: 1, sessions: T1 },
    "4 BERLIAN": { tahap: 2, sessions: T2 },
  },
  assembly: { day: 0, period: 0, label: "PERHIMPUNAN" },
  curriculum: {
    "1 KRISTAL": [
      ["Bahasa Melayu","BM","Fazlina",4,null],
      ["Matematik","MT","Fazlina",3,null],
      ["Bahasa Inggeris","BI","Fazlina",3,null],
      ["Pengurusan Diri","PD","Auni",6,null],
      ["Kemahiran Manipulatif","KM","Auni",6,null],
      ["Pendidikan Islam","PI","Hafizah",5,null],
      ["Pendidikan Jasmani","PJ","Fazlina",4,"morning"],
      ["Pendidikan Seni","PSV","Auni",4,null],
      ["Pendidikan Muzik","MZ","Auni",3,null],
    ],
    "2 INTAN": [
      ["Bahasa Melayu","BM","Wahidah",4,null],
      ["Matematik","MT","Wahidah",3,null],
      ["Bahasa Inggeris","BI","Wahidah",3,null],
      ["Pengurusan Diri","PD","Wahidah",6,null],
      ["Kemahiran Manipulatif","KM","Wahidah",6,null],
      ["Pendidikan Islam","PI","Hafizah",5,null],
      ["Pendidikan Jasmani","PJ","Mukmin",4,"morning"],
      ["Pendidikan Seni","PSV","Auni",4,null],
      ["Pendidikan Muzik","MZ","Auni",3,null],
    ],
    "4 BERLIAN": [
      ["Bahasa Melayu","BM","Mukmin",5,null],
      ["Matematik","MT","Mukmin",4,null],
      ["Bahasa Inggeris","BI","Mukmin",4,null],
      ["Pengurusan Diri","PD","Auni",2,null],
      ["Kemahiran Manipulatif","KM","Fazlina",3,null],
      ["Pendidikan Islam","PI","Hafizah",5,null],
      ["Pendidikan Jasmani Kesihatan","PJK","Mukmin",3,"morning"],
      ["Pendidikan Seni","PS","Fazlina",2,null],
      ["Pendidikan Muzik","MZ","Fazlina",2,null],
      ["Pend. Teknologi Maklumat","TMK","Mukmin",2,null],
      ["Kemahiran Hidup Asas","KH","Fazlina",5,null],
      ["Pend. Sains, Sosial & Alam Sekitar","PSSAS","Mukmin",4,null],
    ],
  },
  // Slot guru TIDAK tersedia (jadual perdana Hafizah, dalam idx grid PPKI 0..8)
  unavailable: {
    Hafizah: [
      [0,3,4],        // Isnin: perhimpunan; PI 6 BES 9.00-10.00
      [0,1,3,4,7,8],  // Selasa: TASMIK 4BES 7.30-8.30; PI 3BIJAK 9.00-10.00; TASMIK 4BIJ 11.20-12.20
      [3,4,5,6,7,8],  // Rabu: TASMIK 4BES 9.00-10.00; PI 4BIJAK 10.20-11.20; TASMIK 1BIJ 11.20-12.20
      [0,1,2,3,7,8],  // Khamis: PI 6BES 7.30-8.30; PI 4BIJAK 8.30-9.30; PI 3BIJAK 11.20-12.20
      [0,1,6,7],      // Jumaat: TASMIK 2BIJ 7.30-8.30; PI 3BIJAK 10.50-11.50
    ],
  },
  maxPerDayPerTeacher: 7,
  morningPeriods: [0,1,2],
};

function mulberry32(a){return function(){a|=0;a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
function shuffled(arr,rnd){const a=arr.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function splitBlocks(n){const b=[];while(n>=2){b.push(2);n-=2;}if(n===1)b.push(1);return b;}

function solve(config, seed, maxNodes = 200000) {
  const rnd = mulberry32(seed);
  const classNames = Object.keys(config.classes);
  const P = PERIODS.length;

  const grid = {};
  for (const c of classNames) {
    grid[c] = DAYS.map((_, d) => {
      const row = new Array(P).fill(undefined);
      for (const p of config.classes[c].sessions[d]) row[p] = null;
      return row;
    });
    grid[c][config.assembly.day][config.assembly.period] = "ASSEMBLY";
  }
  const teacherBusy = {};
  for (const t of Object.keys(config.teachers)) {
    teacherBusy[t] = DAYS.map(() => new Array(P).fill(false));
    const un = config.unavailable[t];
    if (un) for (let d = 0; d < 5; d++) for (const p of un[d]) teacherBusy[t][d][p] = true;
    teacherBusy[t][config.assembly.day][config.assembly.period] = true;
  }
  const dayLoad = {};
  for (const t of Object.keys(config.teachers)) dayLoad[t] = [0,0,0,0,0];

  let blocks = [];
  for (const c of classNames)
    for (const [name, code, teacher, waktu, constraint] of config.curriculum[c])
      for (const size of splitBlocks(waktu))
        blocks.push({ cls: c, name, code, teacher, size, constraint, sig: `${c}|${code}|${size}`, placed: null });

  const subjDay = {};
  let nodes = 0;

  function placementsFor(b) {
    const out = [];
    const allowed = b.constraint === "morning" ? config.morningPeriods : null;
    // dedupe blok serupa: hari mesti > hari blok serupa yang telah diletak
    let minDay = -1;
    for (const o of blocks) if (o.sig === b.sig && o.placed) minDay = Math.max(minDay, o.placed[0]);
    for (let d = minDay + 1; d < 5; d++) {
      if (subjDay[`${b.cls}|${b.code}|${d}`]) continue;
      if (dayLoad[b.teacher][d] + b.size > config.maxPerDayPerTeacher) continue;
      const row = grid[b.cls][d];
      for (let p = 0; p < P; p++) {
        if (row[p] !== null) continue;
        if (allowed && !allowed.includes(p)) continue;
        if (teacherBusy[b.teacher][d][p]) continue;
        if (b.size === 2) {
          const q = p + 1;
          if (!CONSEC.has(`${p}-${q}`) || row[q] !== null) continue;
          if (allowed && !allowed.includes(q)) continue;
          if (teacherBusy[b.teacher][d][q]) continue;
        }
        out.push([d, p]);
      }
    }
    return out;
  }

  function apply(b, d, p, on) {
    const cells = b.size === 2 ? [p, p + 1] : [p];
    for (const q of cells) {
      grid[b.cls][d][q] = on ? { code: b.code, teacher: b.teacher } : null;
      teacherBusy[b.teacher][d][q] = on;
    }
    dayLoad[b.teacher][d] += on ? b.size : -b.size;
    if (on) subjDay[`${b.cls}|${b.code}|${d}`] = true; else delete subjDay[`${b.cls}|${b.code}|${d}`];
    b.placed = on ? [d, p] : null;
  }

  function bt() {
    if (++nodes > maxNodes) throw "LIMIT";
    // MRV: pilih blok belum diletak dgn pilihan paling sedikit (satu wakil per sig)
    let best = null, bestOpts = null;
    const seen = new Set();
    for (const b of blocks) {
      if (b.placed) continue;
      if (seen.has(b.sig)) continue;
      seen.add(b.sig);
      const opts = placementsFor(b);
      if (opts.length === 0) return false;
      if (!best || opts.length < bestOpts.length) { best = b; bestOpts = opts; if (opts.length === 1) break; }
    }
    if (!best) return true;
    for (const [d, p] of shuffled(bestOpts, rnd)) {
      apply(best, d, p, true);
      if (bt()) return true;
      apply(best, d, p, false);
    }
    return false;
  }

  try { if (bt()) return { grid, dayLoad, nodes }; } catch (e) { if (e !== "LIMIT") throw e; }
  return null;
}

function validate(config, grid) {
  const errors = [];
  const classNames = Object.keys(config.classes);
  const P = PERIODS.length;
  for (const c of classNames)
    for (let d = 0; d < 5; d++)
      for (let p = 0; p < P; p++)
        if (grid[c][d][p] === null) errors.push(`KOSONG: ${c} ${DAYS[d]} P${p+1}`);
  for (const c of classNames) {
    const count = {};
    for (let d = 0; d < 5; d++)
      for (const v of grid[c][d]) if (v && v !== "ASSEMBLY") count[v.code] = (count[v.code]||0)+1;
    for (const [name, code, t, waktu] of config.curriculum[c])
      if ((count[code]||0) !== waktu) errors.push(`KUOTA: ${c} ${code} = ${count[code]||0}/${waktu}`);
  }
  for (let d = 0; d < 5; d++)
    for (let p = 0; p < P; p++) {
      const busy = {};
      for (const c of classNames) {
        const v = grid[c][d][p];
        if (v && v !== "ASSEMBLY") {
          if (busy[v.teacher]) errors.push(`TINDIH: ${v.teacher} ${DAYS[d]} P${p+1}`);
          busy[v.teacher] = c;
          const un = config.unavailable[v.teacher];
          if (un && un[d].includes(p)) errors.push(`PERDANA: ${v.teacher} ${DAYS[d]} P${p+1} (${c})`);
        }
      }
    }
  for (const c of classNames)
    for (let d = 0; d < 5; d++) {
      const pos = {};
      grid[c][d].forEach((v, p) => { if (v && v !== "ASSEMBLY") (pos[v.code]=pos[v.code]||[]).push(p); });
      for (const [code, ps] of Object.entries(pos)) {
        if (ps.length > 2) errors.push(`>2/HARI: ${c} ${code} ${DAYS[d]}`);
        if (ps.length === 2 && !CONSEC.has(`${ps[0]}-${ps[1]}`)) errors.push(`PISAH: ${c} ${code} ${DAYS[d]}`);
      }
    }
  return errors;
}

function main() {
  const t0 = Date.now();
  let best = null, seedUsed = null;
  for (let seed = 1; seed <= 200; seed++) {
    const res = solve(CONFIG, seed);
    if (res) { best = res; seedUsed = seed; break; }
  }
  if (!best) { console.log("TIADA PENYELESAIAN (200 seed)"); process.exit(1); }
  const errors = validate(CONFIG, best.grid);
  console.log(`SEED ${seedUsed}, ${best.nodes} nod, ${Date.now()-t0}ms`);
  console.log(errors.length ? "RALAT:\n" + errors.join("\n") : "SAH: tiada ralat");
  for (const c of Object.keys(CONFIG.classes)) {
    console.log(`\n=== ${c} ===`);
    for (let d = 0; d < 5; d++) {
      console.log(DAYS[d].padEnd(8) + best.grid[c][d].map(v => {
        if (v === undefined) return "  --   ";
        if (v === "ASSEMBLY") return "PERHIM ";
        return `${v.code}(${v.teacher[0]})`.padEnd(7);
      }).join("|"));
    }
  }
  console.log("\n=== Beban guru/hari ===");
  for (const [t, loads] of Object.entries(best.dayLoad))
    console.log(t.padEnd(9) + loads.join(" ") + "  jumlah " + loads.reduce((a,b)=>a+b,0));
  require("fs").writeFileSync("/home/user/jadual/solution.json", JSON.stringify({ seed: seedUsed, grid: best.grid }));
}
main();
