# Sistem Jadual Waktu PPKI — SK Taman Gembira

Sistem jadual waktu untuk Program Pendidikan Khas Integrasi (PPKI): 3 kelas (1 Kristal, 2 Intan — Tahap 1; 4 Berlian — Tahap 2) dan 5 orang guru (Fazlina, Mukmin, Auni, Wahidah, Hafizah).

## Guna terus

Buka **`index.html`** (atau `Sistem_Jadual_PPKI.html` — fail yang sama) dalam mana-mana pelayar. Tiada internet atau pemasangan diperlukan — semua data dan penjana dibenam dalam satu fail HTML.

- **Jadual Kelas / Jadual Guru** — paparan berwarna mengikut guru + butang Cetak (landskap automatik)
- **Editor** — klik sel untuk tukar subjek; pertindihan ditanda merah secara automatik
- **Tetapan** — tukar guru/subjek/peruntukan/waktu tamat/kekangan, kemudian **⚡ Jana Jadual** untuk bina jadual baharu tanpa pertindihan (untuk guru bertukar atau tahun baharu)
- **Eksport / Import JSON** — simpan dan buka semula kerja anda

## Kekangan yang dijaga penjana

Guru tidak mengajar 2 kelas serentak · slot "tidak tersedia" guru dihormati (cth: jadual aliran perdana Hafizah) · kuota waktu subjek tepat · maksimum 2 waktu subjek sehari dan mesti bersebelahan · PJ/PJK waktu pagi sahaja (sebelum rehat 9.00–9.20) dan tiada pada Isnin · PJ mesti blok 2 waktu berturutan · had beban harian guru · perhimpunan Isnin waktu 1.

## Fail sumber

| Fail | Kegunaan |
|---|---|
| `index.html` / `Sistem_Jadual_PPKI.html` | Aplikasi siap (satu fail) |
| `app.js` | Logik aplikasi + penjana (simulated annealing) |
| `template.html` | Templat HTML/CSS |
| `build.js` | Skrip bina: konfigurasi lalai + gabung templat & app.js → HTML |
| `sa.js` | Solver versi Node.js (untuk jana di luar pelayar) |
| `grid_embed.json`, `solution.json` | Jadual semasa yang dibenamkan |

Bina semula selepas ubah kod: `node sa.js` (jana jadual) kemudian `node build.js`.
