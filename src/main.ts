import "@fontsource/overpass/400.css";
import "@fontsource/overpass/600.css";
import "@fontsource/overpass/800.css";
import "@fontsource/overpass/900.css";
import "./gaya.css";
import type { FeatureCollection, Geometry } from "geojson";
import { geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import dataDaerah from "./data/daerah.json";
import { type Graf, type Penilaian, type TekaTeki, bangunGraf, benihHari, buatTekaTeki, nilai, nomorHari, ruteTerpendek, tersambung } from "./graf";

const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const $$ = <T extends Element = HTMLElement>(s: string) => [...document.querySelectorAll<T>(s)];
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

type Daerah = (typeof dataDaerah.daerah)[number];
const DAERAH: Record<string, Daerah> = Object.fromEntries(dataDaerah.daerah.map((d) => [d.id, d]));
const pendek = (nama: string) => nama.replace(/^Kab\. /, "");

const EMOJI: Record<Penilaian, string> = { rute: "🟩", dekat: "🟨", agak: "🟧", jauh: "🟥" };
const KATA: Record<Penilaian, string> = { rute: "di rute terpendek", dekat: "dekat rute", agak: "agak jauh", jauh: "jauh" };

/* ---------- penyimpanan (aman bila tidak tersedia) ---------- */
const simpan = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* abaikan */
  }
};
function baca<T>(k: string): T | null {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

/* ---------- keadaan ---------- */
type Mode = "harian" | "latihan";
type Keadaan = { mode: Mode; nomor: number; t: TekaTeki; tebakan: number[]; petunjuk: number[]; selesai: "menang" | "kalah" | null };
type Simpanan = { tebakan: string[]; petunjuk: string[]; selesai: Keadaan["selesai"] };
type Statistik = { main: number; menang: number; deret: number; deretTerbaik: number; terakhir: number };

let g: Graf;
let fitur: FeatureCollection<Geometry, { id: string }>;
let k: Keadaan;

const nama = (i: number) => DAERAH[g.ids[i]]?.nama ?? g.ids[i];

function mulai(mode: Mode) {
  if (mode === "harian") {
    const nomor = nomorHari();
    const t = buatTekaTeki(g, benihHari(nomor));
    const s = baca<Simpanan>(`lintas:hari:${nomor}`);
    const ke = (ids: string[] = []) => ids.map((id) => g.indeks.get(id)).filter((x): x is number => x != null);
    k = { mode, nomor, t, tebakan: ke(s?.tebakan), petunjuk: ke(s?.petunjuk), selesai: s?.selesai ?? null };
  } else {
    k = { mode, nomor: 0, t: buatTekaTeki(g, Math.floor(Math.random() * 1e9)), tebakan: [], petunjuk: [], selesai: null };
  }
  $$<HTMLButtonElement>("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  $("[data-pesan]").textContent = "";
  render();
}

function simpanHarian() {
  if (k.mode !== "harian") return;
  simpan(`lintas:hari:${k.nomor}`, { tebakan: k.tebakan.map((i) => g.ids[i]), petunjuk: k.petunjuk.map((i) => g.ids[i]), selesai: k.selesai } satisfies Simpanan);
}

function catatStatistik(menang: boolean) {
  if (k.mode !== "harian") return;
  const s = baca<Statistik>("lintas:stat") ?? { main: 0, menang: 0, deret: 0, deretTerbaik: 0, terakhir: 0 };
  if (s.terakhir === k.nomor) return;
  s.main++;
  if (menang) {
    s.menang++;
    s.deret = s.terakhir === k.nomor - 1 ? s.deret + 1 : 1;
    s.deretTerbaik = Math.max(s.deretTerbaik, s.deret);
  } else s.deret = 0;
  s.terakhir = k.nomor;
  simpan("lintas:stat", s);
}

function tebak(i: number, dariPetunjuk = false) {
  if (k.selesai) return;
  const pesan = $("[data-pesan]");
  if (i === k.t.awal || i === k.t.akhir) return void (pesan.textContent = "Itu titik awal atau tujuan.");
  if (k.tebakan.includes(i)) return void (pesan.textContent = `${nama(i)} sudah ditebak.`);
  pesan.textContent = "";
  k.tebakan.push(i);
  if (dariPetunjuk) k.petunjuk.push(i);
  if (tersambung(g, k.t, k.tebakan)) {
    k.selesai = "menang";
    catatStatistik(true);
  } else if (k.tebakan.length >= k.t.batasTebakan) {
    k.selesai = "kalah";
    catatStatistik(false);
  }
  simpanHarian();
  render();
}

/* ---------- tampilan ---------- */
function render() {
  const { t } = k;
  const awal = DAERAH[g.ids[t.awal]];
  const akhir = DAERAH[g.ids[t.akhir]];
  $("[data-nomor]").textContent = k.mode === "harian" ? `Lintas #${k.nomor}` : "Latihan";
  $("[data-soal]").innerHTML = `Dari <b>${esc(awal.nama)}</b> <span class="panah">→</span> <b>${esc(akhir.nama)}</b>`;
  $("[data-info]").textContent = `${awal.prov === akhir.prov ? awal.prov : `${awal.prov} ke ${akhir.prov}`}, rute terpendek melewati ${t.langkah - 1} wilayah, ${t.batasTebakan} tebakan`;
  $("[data-sisa]").innerHTML = Array.from({ length: t.batasTebakan }, (_, n) => {
    const x = k.tebakan[n];
    return `<i class="${x != null ? `n-${nilai(t, x)}` : "kosong"}"></i>`;
  }).join("");
  $("[data-tebakan]").innerHTML = [...k.tebakan]
    .reverse()
    .map((x) => {
      const p = nilai(t, x);
      return `<li><i class="n-${p}"></i><span class="nama">${esc(nama(x))}</span><span class="ket">${k.petunjuk.includes(x) ? "petunjuk" : KATA[p]}</span></li>`;
    })
    .join("");
  const habis = !!k.selesai;
  $<HTMLInputElement>("#masukan").disabled = habis;
  $<HTMLButtonElement>("#tebak button").disabled = habis;
  $<HTMLButtonElement>("#petunjuk").disabled = habis || k.tebakan.length >= t.batasTebakan - 1;
  gambarPeta();
  gambarSelesai();
  gambarStatistik();
}

function gambarPeta() {
  const wadah = $("#peta");
  const lebar = Math.max(300, wadah.clientWidth);
  const tinggi = Math.round(Math.min(lebar * 0.8, 560));
  const { t } = k;
  const komponen = g.komponen[t.awal];
  // Bingkai: ujung, seluruh wilayah di rute terpendek (tanpa membedakannya), dan tebakan di pulau yang sama.
  const bingkaiIdx = new Set([t.awal, t.akhir, ...k.tebakan.filter((i) => g.komponen[i] === komponen)]);
  t.dariAwal.forEach((d, i) => {
    if (d + t.dariAkhir[i] <= t.langkah + 1) bingkaiIdx.add(i);
  });
  const perId = new Map(fitur.features.map((f) => [f.properties.id, f]));
  const bingkai: FeatureCollection = { type: "FeatureCollection", features: [...bingkaiIdx].map((i) => perId.get(g.ids[i])!).filter(Boolean) };
  const proyeksi = geoMercator().fitExtent(
    [
      [24, 24],
      [lebar - 24, tinggi - 24],
    ],
    bingkai,
  );
  const jalur = geoPath(proyeksi);
  const kelas = (id: string) => {
    const i = g.indeks.get(id);
    if (i == null) return "wilayah";
    if (i === t.awal || i === t.akhir) return "wilayah ujung";
    if (k.tebakan.includes(i)) return `wilayah n-${nilai(t, i)}`;
    if (k.selesai === "kalah" && ruteTerpendek(g, t).includes(i)) return "wilayah jawaban";
    return "wilayah";
  };
  const label = [t.awal, t.akhir, ...k.tebakan, ...(k.selesai === "kalah" ? ruteTerpendek(g, t) : [])]
    .filter((i, n, a) => a.indexOf(i) === n)
    .map((i) => {
      const f = perId.get(g.ids[i]);
      if (!f) return "";
      const [x, y] = jalur.centroid(f);
      if (!Number.isFinite(x) || x < 0 || x > lebar || y < 0 || y > tinggi) return "";
      const ujung = i === t.awal || i === t.akhir;
      return `<text class="nama-peta${ujung ? " ujung" : ""}" x="${x}" y="${ujung ? y - 12 : y + 4}" text-anchor="middle">${esc(pendek(nama(i)))}</text>`;
    })
    .join("");
  // Kota kecil sebagai ujung nyaris tak terlihat, jadi beri penanda di titik tengahnya.
  const penanda = [t.awal, t.akhir]
    .map((i) => {
      const f = perId.get(g.ids[i]);
      if (!f) return "";
      const [x, y] = jalur.centroid(f);
      return Number.isFinite(x) ? `<circle class="penanda-ujung" cx="${x}" cy="${y}" r="6"/>` : "";
    })
    .join("");
  wadah.innerHTML = `<svg viewBox="0 0 ${lebar} ${tinggi}" width="${lebar}" height="${tinggi}">
    ${fitur.features.map((f) => `<path class="${kelas(f.properties.id)}" d="${jalur(f) ?? ""}"/>`).join("")}
    ${penanda}
    ${label}
  </svg>`;
}

function sisaWaktu() {
  const besok = Date.UTC(2026, 9, 19) - 7 * 3_600_000 + nomorHari() * 86_400_000;
  const menit = Math.max(0, Math.round((besok - Date.now()) / 60_000));
  return `${Math.floor(menit / 60)} jam ${menit % 60} menit`;
}

function teksBagikan() {
  const { t } = k;
  const kotak = k.tebakan.map((x) => (k.petunjuk.includes(x) ? "💡" : EMOJI[nilai(t, x)])).join("");
  const skor = k.selesai === "menang" ? `${k.tebakan.length}/${t.batasTebakan}` : `X/${t.batasTebakan}`;
  return `Lintas #${k.nomor} ${skor}\n${nama(t.awal)} → ${nama(t.akhir)}\n${kotak}\nlintas.raffstw.my.id`;
}

function gambarSelesai() {
  const el = $("[data-selesai]");
  if (!k.selesai) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const rute = ruteTerpendek(g, k.t).map(nama);
  const judul = k.selesai === "menang" ? `Tersambung dalam ${k.tebakan.length} tebakan!` : "Belum tersambung.";
  el.innerHTML = `<p class="judul-selesai">${judul}</p>
    <p>Salah satu rute terpendek: ${esc(nama(k.t.awal))} → ${rute.map(esc).join(" → ")} → ${esc(nama(k.t.akhir))}.</p>
    <div class="aksi">
      ${k.mode === "harian" ? `<button type="button" class="tombol utama" data-bagikan>Salin hasil</button>` : ""}
      <button type="button" class="tombol" data-latihan>${k.mode === "harian" ? "Main latihan" : "Teka-teki lain"}</button>
    </div>
    ${k.mode === "harian" ? `<p class="catatan">Teka-teki berikutnya dalam ${sisaWaktu()}.</p>` : ""}`;
}

function gambarStatistik() {
  const s = baca<Statistik>("lintas:stat") ?? { main: 0, menang: 0, deret: 0, deretTerbaik: 0, terakhir: 0 };
  const isi: [string, string][] = [
    ["Dimainkan", String(s.main)],
    ["Menang", s.main ? `${Math.round((s.menang / s.main) * 100)}%` : "—"],
    ["Beruntun", String(s.deret)],
    ["Terbaik", String(s.deretTerbaik)],
  ];
  $("[data-statistik]").innerHTML = isi.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join("");
}

/* ---------- interaksi ---------- */
$("[data-selesai]").addEventListener("click", async (e) => {
  const el = e.target as HTMLElement;
  if (el.closest("[data-latihan]")) mulai("latihan");
  const tombol = el.closest<HTMLButtonElement>("[data-bagikan]");
  if (tombol) {
    try {
      await navigator.clipboard.writeText(teksBagikan());
      tombol.textContent = "Tersalin";
    } catch {
      tombol.textContent = "Gagal menyalin";
    }
    setTimeout(() => (tombol.textContent = "Salin hasil"), 1800);
  }
});
$$<HTMLButtonElement>("[data-mode]").forEach((b) => b.addEventListener("click", () => mulai(b.dataset.mode as Mode)));
$("#petunjuk").addEventListener("click", () => {
  const belum = ruteTerpendek(g, k.t).find((x) => !k.tebakan.includes(x));
  if (belum != null) tebak(belum, true);
});

/* ---------- combobox ---------- */
const masuk = $<HTMLInputElement>("#masukan");
const daftarSaran = $<HTMLUListElement>("#saran");
let saran: number[] = [];
let aktif = -1;
const normal = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^(kabupaten|kab\.?|kota)\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function cari(q: string): number[] {
  const kunci = normal(q);
  if (!kunci) return [];
  return g.ids
    .map((id, i) => {
      const n = normal(DAERAH[id]?.nama ?? id);
      return [i, n === kunci ? 0 : n.startsWith(kunci) ? 1 : n.includes(kunci) ? 2 : 9] as const;
    })
    .filter(([, v]) => v < 9)
    .sort((a, b) => a[1] - b[1] || nama(a[0]).localeCompare(nama(b[0])))
    .slice(0, 8)
    .map(([i]) => i);
}
function tutup() {
  daftarSaran.hidden = true;
  masuk.setAttribute("aria-expanded", "false");
  masuk.removeAttribute("aria-activedescendant");
}
function sorot() {
  $$("#saran [role=option]").forEach((li, n) => li.setAttribute("aria-selected", String(n === aktif)));
  if (aktif >= 0) masuk.setAttribute("aria-activedescendant", `saran-${aktif}`);
}
masuk.addEventListener("input", () => {
  saran = cari(masuk.value);
  aktif = saran.length ? 0 : -1;
  daftarSaran.innerHTML = saran.length
    ? saran.map((i, n) => `<li role="option" id="saran-${n}" data-n="${n}" aria-selected="${n === aktif}"><span>${esc(nama(i))}</span><small>${esc(DAERAH[g.ids[i]]?.prov ?? "")}</small></li>`).join("")
    : `<li aria-disabled="true">Tidak ada yang cocok</li>`;
  daftarSaran.hidden = !masuk.value.trim();
  masuk.setAttribute("aria-expanded", String(!daftarSaran.hidden));
  sorot();
});
masuk.addEventListener("keydown", (e) => {
  if (daftarSaran.hidden || !saran.length) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    aktif = (aktif + (e.key === "ArrowDown" ? 1 : -1) + saran.length) % saran.length;
    sorot();
    e.preventDefault();
  } else if (e.key === "Escape") tutup();
});
masuk.addEventListener("blur", () => setTimeout(tutup, 150));
function kirim(i: number) {
  tebak(i);
  masuk.value = "";
  tutup();
  masuk.focus();
}
daftarSaran.addEventListener("mousedown", (e) => {
  const li = (e.target as HTMLElement).closest<HTMLElement>("[data-n]");
  if (!li) return;
  e.preventDefault();
  kirim(saran[Number(li.dataset.n)]);
});
$("#tebak").addEventListener("submit", (e) => {
  e.preventDefault();
  if (aktif >= 0 && saran[aktif] != null) kirim(saran[aktif]);
  else if (masuk.value.trim()) $("[data-pesan]").textContent = "Pilih nama dari daftar saran.";
});

/* ---------- ukuran layar ---------- */
let lebarTerakhir = 0;
new ResizeObserver(([e]) => {
  const w = Math.round(e.contentRect.width);
  if (!lebarTerakhir) {
    lebarTerakhir = w;
    return;
  }
  if (w === lebarTerakhir || !k) return;
  lebarTerakhir = w;
  gambarPeta();
}).observe(document.querySelector("main")!);

/* ---------- mulai ---------- */
fetch(`${import.meta.env.BASE_URL}data/peta.json`)
  .then((r) => r.json() as Promise<Topology<{ daerah: GeometryCollection<{ id: string }> }>>)
  .then((topo) => {
    g = bangunGraf(topo);
    fitur = feature(topo, topo.objects.daerah) as FeatureCollection<Geometry, { id: string }>;
    mulai("harian");
  })
  .catch(() => {
    $("[data-soal]").textContent = "Peta gagal dimuat. Muat ulang halaman.";
  });
