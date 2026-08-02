const fs = require('fs');
const grid = JSON.parse(fs.readFileSync('/home/user/jadual/grid_embed.json','utf8'));

const config = {
  meta: {
    school: 'SEKOLAH KEBANGSAAN TAMAN GEMBIRA',
    program: 'JALAN HILIR 2, TELOK GADONG, 41100 KLANG SELANGOR',
    tahun: '2026',
  },
  days: ['Isnin','Selasa','Rabu','Khamis','Jumaat'],
  periods: [
    {start:'7.30',end:'8.00'},{start:'8.00',end:'8.30'},{start:'8.30',end:'9.00'},
    {start:'9.20',end:'9.50'},{start:'9.50',end:'10.20'},{start:'10.20',end:'10.50'},
    {start:'10.50',end:'11.20'},{start:'11.20',end:'11.50'},{start:'11.50',end:'12.20'}
  ],
  extraPeriods: [{start:'12.20',end:'12.50'}],
  rehatAfter: 2,
  rehatLabel: 'REHAT 9.00 – 9.20',
  assembly: {day:0, period:0},
  morningPeriods: [0,1,2],
  maxPerDay: 7,
  adminPin: '191989',
  teachers: [
    {name:'Fazlina', color:'#AFD8F5'},
    {name:'Mukmin',  color:'#FAF0A8'},
    {name:'Auni',    color:'#B5E6C8'},
    {name:'Wahidah', color:'#F6B3B6'},
    {name:'Hafizah', color:'#EFC9EA'},
  ],
  classes: [
    {name:'1 KRISTAL', tahap:1, periodsPerDay:[8,8,8,8,7]},
    {name:'2 INTAN',   tahap:1, periodsPerDay:[8,8,8,8,7]},
    {name:'4 BERLIAN', tahap:2, periodsPerDay:[9,9,8,9,7]},
  ],
  curriculum: {
    '1 KRISTAL': [
      {name:'Bahasa Melayu',code:'BM',teacher:'Fazlina',waktu:4,morning:false},
      {name:'Matematik',code:'MT',teacher:'Fazlina',waktu:3,morning:false},
      {name:'Bahasa Inggeris',code:'BI',teacher:'Fazlina',waktu:3,morning:false},
      {name:'Pengurusan Diri',code:'PD',teacher:'Auni',waktu:6,morning:false},
      {name:'Kemahiran Manipulatif',code:'KM',teacher:'Auni',waktu:6,morning:false},
      {name:'Pendidikan Islam',code:'PI',teacher:'Hafizah',waktu:5,morning:false},
      {name:'Pendidikan Jasmani',code:'PJ',teacher:'Fazlina',waktu:4,morning:true,pair:true,noDays:[0]},
      {name:'Pendidikan Seni',code:'PSV',teacher:'Auni',waktu:4,morning:false},
      {name:'Pendidikan Muzik',code:'MZ',teacher:'Auni',waktu:3,morning:false},
    ],
    '2 INTAN': [
      {name:'Bahasa Melayu',code:'BM',teacher:'Wahidah',waktu:4,morning:false},
      {name:'Matematik',code:'MT',teacher:'Wahidah',waktu:3,morning:false},
      {name:'Bahasa Inggeris',code:'BI',teacher:'Wahidah',waktu:3,morning:false},
      {name:'Pengurusan Diri',code:'PD',teacher:'Wahidah',waktu:6,morning:false},
      {name:'Kemahiran Manipulatif',code:'KM',teacher:'Wahidah',waktu:6,morning:false},
      {name:'Pendidikan Islam',code:'PI',teacher:'Hafizah',waktu:5,morning:false},
      {name:'Pendidikan Jasmani',code:'PJ',teacher:'Mukmin',waktu:4,morning:true,pair:true,noDays:[0]},
      {name:'Pendidikan Seni',code:'PSV',teacher:'Auni',waktu:4,morning:false},
      {name:'Pendidikan Muzik',code:'MZ',teacher:'Auni',waktu:3,morning:false},
    ],
    '4 BERLIAN': [
      {name:'Bahasa Melayu',code:'BM',teacher:'Mukmin',waktu:5,morning:false},
      {name:'Matematik',code:'MT',teacher:'Mukmin',waktu:4,morning:false},
      {name:'Bahasa Inggeris',code:'BI',teacher:'Mukmin',waktu:4,morning:false},
      {name:'Pengurusan Diri',code:'PD',teacher:'Auni',waktu:2,morning:false},
      {name:'Kemahiran Manipulatif',code:'KM',teacher:'Fazlina',waktu:3,morning:false},
      {name:'Pendidikan Islam',code:'PI',teacher:'Hafizah',waktu:5,morning:false},
      {name:'Pendidikan Jasmani Kesihatan',code:'PJK',teacher:'Mukmin',waktu:3,morning:true,noDays:[0]},
      {name:'Pendidikan Seni',code:'PS',teacher:'Fazlina',waktu:2,morning:false},
      {name:'Pendidikan Muzik',code:'MZ',teacher:'Fazlina',waktu:2,morning:false},
      {name:'Pend. Teknologi Maklumat & Komunikasi',code:'TMK',teacher:'Mukmin',waktu:2,morning:false},
      {name:'Kemahiran Hidup Asas',code:'KH',teacher:'Fazlina',waktu:5,morning:false},
      {name:'Pend. Sains, Sosial & Alam Sekitar',code:'PSSAS',teacher:'Mukmin',waktu:4,morning:false},
    ],
  },
  unavailable: {
    Hafizah: [[0,3,4],[0,1,3,4,7,8],[3,4,5,6,7,8],[0,1,2,3,7,8],[0,1,6,7]],
  },
  perdanaNotes: {
    Hafizah: [
      [0,3,4,'PI 6 BES (9.00–10.00)'],[0,9,9,'PI 4 BIJAK (12.20–1.20)'],
      [1,0,1,'TASMIK 4 BES (7.30–8.30)'],[1,3,4,'PI 3 BIJAK (9.00–10.00)'],[1,7,8,'TASMIK 4 BIJ (11.20–12.20)'],[1,9,9,'PI 6 BES (12.20–1.20)'],
      [2,3,4,'TASMIK 4 BES (9.00–10.00)'],[2,5,6,'PI 4 BIJAK (10.20–11.20)'],[2,7,8,'TASMIK 1 BIJ (11.20–12.20)'],
      [3,0,1,'PI 6 BES (7.30–8.30)'],[3,2,3,'PI 4 BIJAK (8.30–9.30)'],[3,7,8,'PI 3 BIJAK (11.20–12.20)'],
      [4,0,1,'TASMIK 2 BIJ (7.30–8.30)'],[4,6,7,'PI 3 BIJAK (10.50–11.50)'],
    ],
  },
  perdanaExtra: {
    Hafizah: ['Isnin 12.50–1.20: PI 4 BIJAK (sambungan)','Selasa 12.50–1.20: PI 6 BES (sambungan)'],
  },
};

const state = { config, grid };
const app = fs.readFileSync('/home/user/jadual/app.js','utf8');
let html = fs.readFileSync('/home/user/jadual/template.html','utf8');
html = html.replace('/*__STATE__*/null', JSON.stringify(state));
html = html.replace('/*__APP__*/', () => app);
fs.writeFileSync('/home/user/jadual/Sistem_Jadual_PPKI.html', html);
console.log('OK', (html.length/1024).toFixed(1)+'KB');
