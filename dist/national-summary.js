const earlierStage = /\b(?:uygulamali|uygulama|klavye|basvuru|boy[\s-]*kilo|kura)\b|\b(?:girmeye|katilmaya)\s+hak\b|\bkatilacak(?:lar|\s+adaylar)\b|\b(?:sozlu\s+sinava|mulakata)\s+(?:cagri\w*|davet|katilacak)\b/;
const resultTitle = /\bnihai\s+(?:basari|sonuc\w*|sinav)\b|\b(?:sozlu\s+sinav|mulakat|yerlestirme|sinav|alim)\w*\b.{0,110}\bsonuc\w*\b|\bsonuc\s+sorgulama\b/;
const knownIstanbulResults = new Set([
  "istanbul.adalet.gov.tr/sozlesmeli-zabit-katipligi-genel-mezuniyet-sozlu-sinavina-iliskin-duyuru",
  "istanbul.adalet.gov.tr/sozlesmeli-zabit-katipligi-oncelikli-mezuniyet-sozlu-sinavina-iliskin-duyuru",
]);

function fold(text) {
  return text.toLocaleLowerCase("tr").replaceAll("ı", "i").normalize("NFD").replace(/\p{M}/gu, "").trim();
}

function jobKey(name) {
  return fold(name).replace(/\bkatipligi\b/, "katibi")
    .replace(/^destek personeli \(hizmetli\)$/, "hizmetli")
    .replace(/^koruma ve guvenlik gorevlisi$/, "koruma ve guvenlik");
}

function isPublishedResult(record) {
  const title = fold(record.baslik ?? "");
  if (earlierStage.test(title)) return false;
  if (resultTitle.test(title)) return true;
  if (record.telegram !== "https://t.me/adaletbakanligilanlari/3713" || !URL.canParse(record.kaynak)) return false;
  const source = new URL(record.kaynak);
  return knownIstanbulResults.has(source.hostname + source.pathname);
}

function commissionKey(record) {
  const host = URL.canParse(record.kaynak) ? new URL(record.kaynak).hostname : "";
  const regionalAuthority = /^([a-z0-9]+(?:bam|bim))\.adalet\.gov\.tr$/.exec(host)?.[1];
  const name = fold(record.adliye).replace(/\.adalet\.gov\.tr$/, "")
    .replace(/\s+(?:adliyesi|adalet komisyonu)$/, "")
    .replace(/\s+merkez$/, "")
    .replace(/\bbolge adliye mahkemesi\b/, "bam")
    .replace(/\bbolge idare mahkemesi\b/, "bim");
  return fold(record.il) + "|" + (regionalAuthority ?? name.replace(/[^a-z0-9]/g, ""));
}

export function buildNationalSummary(totals, records) {
  const byJob = new Map();
  for (const record of records) {
    if (!record.il || !isPublishedResult(record)) continue;
    const job = jobKey(record.kadro);
    if (!byJob.has(job)) byJob.set(job, new Map());
    const commissions = byJob.get(job);
    const key = commissionKey(record);
    if (!commissions.has(key)) commissions.set(key, {date: "", quotas: new Set()});
    if (!Number.isSafeInteger(record.kontenjan) || record.kontenjan < 0) continue;
    const entry = commissions.get(key);
    const date = record.tarih ?? "";
    if (date < entry.date) continue;
    if (date > entry.date) {
      entry.date = date;
      entry.quotas.clear();
    }
    entry.quotas.add(record.kontenjan);
  }

  return totals.map(group => ({
    ...group,
    kadrolar: group.kadrolar.map(row => {
      const commissions = byJob.get(jobKey(row.ad)) ?? new Map();
      const aciklananKomisyon = commissions.size;
      let kisi = null;
      for (const {quotas} of commissions.values()) {
        if (quotas.size === 1) kisi = (kisi ?? 0) + quotas.values().next().value;
      }
      return {
        ...row,
        aciklananKomisyon,
        kisi: aciklananKomisyon ? kisi : 0,
        yuzde: Math.round(100 * aciklananKomisyon / row.toplamKomisyon),
      };
    }),
  }));
}
