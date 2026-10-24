import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bangunGraf, bfs, buatTekaTeki, benihHari, nilai, nomorHari, ruteTerpendek, semuaRute, siapkan, tersambung } from "./graf";

const topo = JSON.parse(readFileSync(new URL("../public/data/peta.json", import.meta.url), "utf8"));
const g = bangunGraf(topo);
const i = (id: string) => g.indeks.get(id)!;
const tetanggaDari = (id: string) => g.tetangga[i(id)].map((n) => g.ids[n]);

describe("graf ketetanggaan", () => {
  it("tetangga yang sudah diketahui", () => {
    expect(tetanggaDari("kota-yogyakarta")).toEqual(expect.arrayContaining(["kab-sleman", "kab-bantul"]));
    expect(tetanggaDari("kota-bandung")).toEqual(expect.arrayContaining(["kab-bandung"]));
    expect(tetanggaDari("kab-sleman")).toContain("kota-yogyakarta");
  });

  it("ketetanggaan simetris", () => {
    g.tetangga.forEach((daftar, u) => daftar.forEach((v) => expect(g.tetangga[v]).toContain(u)));
  });

  it("Jawa dan Sumatra adalah daratan berbeda", () => {
    expect(g.komponen[i("kota-bandung")]).not.toBe(g.komponen[i("kota-medan")]);
    expect(g.komponen[i("kota-bandung")]).toBe(g.komponen[i("kab-banyuwangi")]);
    expect(bfs(g, i("kota-bandung"))[i("kota-medan")]).toBe(Infinity);
  });
});

describe("permainan", () => {
  const t = siapkan(g, i("kota-yogyakarta"), i("kab-wonosobo"));

  it("rute terpendek sambung-menyambung dan memenangkan permainan", () => {
    const rute = ruteTerpendek(g, t);
    expect(rute).toHaveLength(t.langkah - 1);
    expect(rute.every((x) => nilai(t, x) === "rute")).toBe(true);
    expect(tersambung(g, t, rute)).toBe(true);
    expect(tersambung(g, t, rute.slice(1))).toBe(false);
  });

  it("wilayah di luar rute dinilai menurut penyimpangannya", () => {
    expect(nilai(t, i("kota-medan"))).toBe("jauh");
    const semua = new Set(semuaRute(t));
    const luar = g.tetangga[t.awal].find((x) => !semua.has(x) && x !== t.akhir);
    if (luar != null) expect(nilai(t, luar)).not.toBe("rute");
  });

  it("teka-teki harian deterministik dan dalam rentang panjang yang wajar", () => {
    for (let n = 1; n <= 30; n++) {
      const a = buatTekaTeki(g, benihHari(n));
      const b = buatTekaTeki(g, benihHari(n));
      expect([a.awal, a.akhir]).toEqual([b.awal, b.akhir]);
      expect(a.langkah).toBeGreaterThanOrEqual(4);
      expect(a.langkah).toBeLessThanOrEqual(8);
      expect(a.batasTebakan).toBe(a.langkah - 1 + 4);
    }
  });

  it("nomor hari mulai 1 pada 19 Oktober 2026 WIB", () => {
    expect(nomorHari(Date.UTC(2026, 9, 18, 17, 0))).toBe(1); // 00.00 WIB 19 Okt
    expect(nomorHari(Date.UTC(2026, 9, 19, 16, 59))).toBe(1);
    expect(nomorHari(Date.UTC(2026, 9, 19, 17, 0))).toBe(2);
  });
});
