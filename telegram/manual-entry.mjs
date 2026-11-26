import {readFile} from "node:fs/promises";
import {cleanTitle, positions, provinces, slug, sourceLink, fold} from "./parse.mjs";
import {mergeRecords, writeAtomic} from "./sync.mjs";

function text(value, name, limit, required = true) {
  const result = cleanTitle(typeof value === "string" ? value : "");
  if ((required && !result) || result.length > limit) {
    throw new Error(name + " alanı boş veya izin verilen uzunluğu aşıyor.");
  }
  return result;
}

export function manualRecord(input) {
  const il = provinces.get(slug(text(input.il, "İl", 80)));
  if (!il) throw new Error("İl, Türkiye'nin 81 ilinden biri olmalı.");
  const adliye = text(input.adliye, "Adliye / komisyon", 160);
  const job = text(input.kadro, "Kadro", 120);
  const kadro = positions.find(([pattern]) => pattern.test(fold(job)))?.[1] ?? job;
  const tarih = text(input.tarih, "İlan tarihi", 10);
  const date = new Date(tarih);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih) || !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== tarih) {
    throw new Error("Geçerli bir ilan tarihi gir (YYYY-AA-GG).");
  }
  const quota = text(input.kontenjan, "Kontenjan", 8, false);
  if (quota && !/^\d+$/.test(quota)) throw new Error("Kontenjan sıfır veya pozitif bir tam sayı olmalı.");
  const link = text(input.kaynak, "Resmî ilan bağlantısı", 2048, false);
  const kaynak = link ? sourceLink(link) : null;
  if (link && !kaynak) throw new Error("Doğrudan resmî adalet.gov.tr ilan bağlantısını gir.");
  const baslik = text(input.baslik, "İlan başlığı", 450, false) || kadro + " duyurusu";
  const row = {il, adliye, kadro, kontenjan: quota ? Number(quota) : null, tarih,
    durum: "aciklandi", baslik, kaynak, manuel: true};
  return row;
}

async function main() {
  const row = manualRecord(JSON.parse(process.env.MANUAL_PAYLOAD ?? "{}"));
  const path = new URL("../dist/kayitlar.json", import.meta.url);
  const current = JSON.parse(await readFile(path, "utf8"));
  const updated = mergeRecords(current, [row]);
  if (JSON.stringify(updated) === JSON.stringify(current)) {
    console.log("Bu duyuru haritada aynı bilgilerle zaten yer alıyor.");
    return;
  }
  await writeAtomic(path, JSON.stringify(updated, null, 2) + "\n");
  console.log("Manuel kayıt işlendi. Toplam kayıt: " + updated.length);
}

if (import.meta.main) await main();
