/**
 * Graf ketetanggaan kabupaten/kota dari topologi peta (dua wilayah bertetangga bila berbagi garis batas),
 * beserta logika permainan: rute terpendek, penilaian tebakan, teka-teki harian, dan pemeriksa kemenangan.
 */
import { neighbors } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";

export type Graf = {
  ids: string[];
  indeks: Map<string, number>;
  tetangga: number[][];
  komponen: number[]; // nomor komponen terhubung per simpul
  ukuranKomponen: number[];
};

export function bangunGraf(topo: Topology<{ daerah: GeometryCollection<{ id: string }> }>): Graf {
  const geo = topo.objects.daerah.geometries;
  const ids = geo.map((g) => (g.properties as { id: string }).id);
  const tetangga = neighbors(geo as never) as number[][];
  const komponen = new Array<number>(ids.length).fill(-1);
  const ukuranKomponen: number[] = [];
  for (let i = 0; i < ids.length; i++) {
    if (komponen[i] >= 0) continue;
    const k = ukuranKomponen.length;
    let n = 0;
    const antre = [i];
    komponen[i] = k;
    while (antre.length) {
      const u = antre.pop()!;
      n++;
      for (const v of tetangga[u])
        if (komponen[v] < 0) {
          komponen[v] = k;
          antre.push(v);
        }
    }
    ukuranKomponen.push(n);
  }
  return { ids, indeks: new Map(ids.map((id, i) => [id, i])), tetangga, komponen, ukuranKomponen };
}

/** Jarak (jumlah langkah) dari satu simpul ke semua simpul; Infinity bila tidak terhubung. */
export function bfs(g: Graf, awal: number): number[] {
  const jarak = new Array<number>(g.ids.length).fill(Infinity);
  jarak[awal] = 0;
  const antre = [awal];
  for (let h = 0; h < antre.length; h++) {
    const u = antre[h];
    for (const v of g.tetangga[u])
      if (jarak[v] === Infinity) {
        jarak[v] = jarak[u] + 1;
        antre.push(v);
      }
  }
  return jarak;
}

export type Penilaian = "rute" | "dekat" | "agak" | "jauh";

export type TekaTeki = {
  awal: number;
  akhir: number;
  dariAwal: number[];
  dariAkhir: number[];
  /** Jumlah langkah rute terpendek; wilayah antara = langkah - 1. */
  langkah: number;
  batasTebakan: number;
};

export function siapkan(g: Graf, awal: number, akhir: number): TekaTeki {
  const dariAwal = bfs(g, awal);
  const dariAkhir = bfs(g, akhir);
  const langkah = dariAwal[akhir];
  return { awal, akhir, dariAwal, dariAkhir, langkah, batasTebakan: langkah - 1 + 4 };
}

/**
 * Seberapa jauh sebuah wilayah dari rute terpendek: 0 berarti ada di salah satu rute terpendek.
 * Penyimpangan dihitung sebagai tambahan langkah bila rute dipaksa melewati wilayah itu.
 */
export function nilai(t: TekaTeki, x: number): Penilaian {
  const simpang = t.dariAwal[x] + t.dariAkhir[x] - t.langkah;
  if (!Number.isFinite(simpang)) return "jauh";
  return simpang === 0 ? "rute" : simpang <= 2 ? "dekat" : simpang <= 4 ? "agak" : "jauh";
}

/** Menang bila wilayah yang sudah ditebak menyambungkan awal dan akhir. */
export function tersambung(g: Graf, t: TekaTeki, tebakan: Iterable<number>): boolean {
  const boleh = new Set([...tebakan, t.awal, t.akhir]);
  const lihat = new Set([t.awal]);
  const antre = [t.awal];
  while (antre.length) {
    const u = antre.pop()!;
    if (u === t.akhir) return true;
    for (const v of g.tetangga[u])
      if (boleh.has(v) && !lihat.has(v)) {
        lihat.add(v);
        antre.push(v);
      }
  }
  return false;
}

/** Salah satu rute terpendek (tanpa ujungnya), dipilih dengan urutan tetangga yang tetap. */
export function ruteTerpendek(g: Graf, t: TekaTeki): number[] {
  const rute: number[] = [];
  let u = t.awal;
  while (t.dariAkhir[u] > 1) {
    u = g.tetangga[u].filter((v) => t.dariAwal[v] === t.dariAwal[u] + 1 && t.dariAkhir[v] === t.dariAkhir[u] - 1).sort((a, b) => a - b)[0];
    rute.push(u);
  }
  return rute;
}

/** Semua wilayah yang ada di salah satu rute terpendek (untuk petunjuk). */
export const semuaRute = (t: TekaTeki) =>
  t.dariAwal.map((_, i) => i).filter((i) => i !== t.awal && i !== t.akhir && t.dariAwal[i] + t.dariAkhir[i] === t.langkah);

/* ---------- teka-teki dengan benih ---------- */
export function mulberry32(benih: number) {
  let a = benih >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rute antara 4 dan 8 langkah (3–7 wilayah antara) di daratan yang cukup besar. */
export function buatTekaTeki(g: Graf, benih: number): TekaTeki {
  const acak = mulberry32(benih);
  const calonAwal = g.ids.map((_, i) => i).filter((i) => g.ukuranKomponen[g.komponen[i]] >= 30);
  for (let coba = 0; coba < 200; coba++) {
    const awal = calonAwal[Math.floor(acak() * calonAwal.length)];
    const jarak = bfs(g, awal);
    const calonAkhir = jarak.map((d, i) => [d, i] as const).filter(([d]) => d >= 4 && d <= 8);
    if (!calonAkhir.length) continue;
    const [, akhir] = calonAkhir[Math.floor(acak() * calonAkhir.length)];
    return siapkan(g, awal, akhir);
  }
  throw new Error("Gagal membuat teka-teki");
}

export const HARI_PERTAMA = Date.UTC(2026, 9, 19);
/** Nomor teka-teki harian (mulai 1) menurut tanggal WIB. */
export const nomorHari = (ms = Date.now()) => Math.floor((ms + 7 * 3_600_000 - HARI_PERTAMA) / 86_400_000) + 1;
export const benihHari = (n: number) => 20261019 + n * 7919;
