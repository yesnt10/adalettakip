import {readFile} from "node:fs/promises";

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
}

const channel = "adaletbakanligilanlari";
const geometry = await readJson("../dist/turkiye.json");
const regions = geometry.features.map(feature => feature.properties.shapeName);
const districtsCatalog = await readJson("./districts.json");

function fold(text) {
  return text.toLocaleLowerCase("tr").replaceAll("ı", "i").normalize("NFKD").replace(/\p{M}/gu, "");
}

const slug = text => fold(text).replace(/[^a-z0-9]/g, "");
const provinces = new Map(regions.map(name => [slug(name), name]));
const districtProvinces = new Map();
for (const [district, province] of districtsCatalog) {
  const key = slug(district);
  const name = provinces.get(slug(province));
  if (name) districtProvinces.set(key, new Set([...(districtProvinces.get(key) ?? []), name]));
}
const courtAliases = new Map(Object.entries({
  karadenizeregli: "Zonguldak", kdzeregli: "Zonguldak", konyaeregli: "Konya", eregli: "Konya",
  ankarabati: "Ankara", istanbulanadolu: "İstanbul", istanbulcaglayan: "İstanbul",
  istanbulbakirkoy: "İstanbul", istanbulbuyukcekmece: "İstanbul", istanbulkucukcekmece: "İstanbul",
  gebze: "Kocaeli", bolvadin: "Afyonkarahisar", afyon: "Afyonkarahisar",
  maras: "Kahramanmaraş",
}));

function cleanTitle(title) {
  return title.replace(/&(?:nbsp|#160|#x[aA]0);/gi, " ").replace(/\s+/g, " ").trim();
}

function provinceFor(authority, domain) {
  const hostKey = domain.split(".")[0].toLowerCase();
  if (courtAliases.has(hostKey)) return courtAliases.get(hostKey);
  const region = slug(authority.replace(/\s+(?:BAM|BİM|BIM|Adliyesi|Adalet Komisyonu)$/iu, ""));
  if (provinces.has(region)) return provinces.get(region);
  const hostProvince = provinces.get(hostKey.replace(/(?:bam|bim)$/, ""));
  if (hostProvince) return hostProvince;
  const matches = districtProvinces.get(region) ?? districtProvinces.get(hostKey);
  return matches?.size === 1 ? [...matches][0] : null;
}

const positions = [
  [/\bzabit\s+kati[bp]|^katip\s+nihai\b/, "Zabıt kâtibi"], [/\bmu(?:b|bb)asir/, "Mübaşir"],
  [/\basci\b/, "Aşçı"], [/\bhizmetli\b/, "Hizmetli"], [/\bsofor\b/, "Şoför"],
  [/\bkoruma ve guvenlik\b|^koruma\s+nihai\b/, "Koruma ve güvenlik"], [/\bicra\s+kati[bp]/, "İcra kâtibi"],
  [/\bteknisyen\b/, "Teknisyen"], [/\bhemsire\b/, "Hemşire"],
  [/\b(?:cezaevi|ceza infaz kurumu)\s+kati[bp]/, "Cezaevi kâtibi"],
  [/\b(?:saglik memuru|saglik teknikeri)\b/, "Sağlık personeli"],
  [/\b(?:psikolog|pedagog)\b/, "Psikolog / pedagog"],
  [/\bsosyal calismaci\b/, "Sosyal çalışmacı"],
  [/\binfaz ve koruma\b/, "İnfaz ve koruma memuru"],
];

function sourceLink(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || !/(?:^|\.)adalet\.gov\.tr$/.test(url.hostname)
        || url.username || url.password || url.port || url.pathname === "/") return null;
    return url.origin + url.pathname;
  } catch {
    return null;
  }
}

function parseHeading(line) {
  const heading = /^(.+?)\s+\(([a-z0-9.-]+)\)$/iu.exec(line);
  if (!heading || !/(?:^|\.)adalet\.gov\.tr$/i.test(heading[2])) return null;
  return {
    adliye: heading[1].replace(/^[^\p{L}\p{N}]+/u, ""),
    domain: heading[2].toLowerCase(),
  };
}

function parseBlock(lines, source, post, postDate, unmatched, fallbackTitle) {
  const domain = new URL(source).hostname;
  const heading = lines.length ? parseHeading(lines[0]) : null;
  const adliye = heading?.adliye || domain;
  const il = provinceFor(adliye, domain);
  if (!il) unmatched?.add(adliye + " (" + domain + ")");
  const dateLine = lines.findIndex(line => line.startsWith("📅"));
  const date = dateLine > 0 ? /\b(\d{2})\.(\d{2})\.(\d{4})\b/.exec(lines[dateLine]) : null;
  const isoDate = date ? [date[3], date[2], date[1]].join("-") : "";
  const timestamp = Date.parse(isoDate);
  const tarih = Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === isoDate ? isoDate : postDate;
  const baslik = cleanTitle(lines.slice(1, dateLine < 0 ? undefined : dateLine).join(" ")) ||
    fallbackTitle || "Adliye duyurusu";
  const telegram = "https://t.me/" + channel + "/" + post;
  const title = fold(baslik);
  const quotas = new Map();
  for (const line of lines.slice(dateLine + 1)) {
    const entry = /^(.*?)\s*:\s*(\d+)\s+kisi\b/.exec(fold(line));
    if (!entry) continue;
    const position = positions.find(([pattern]) => pattern.test(entry[1]));
    if (!position) continue;
    const job = position[1];
    const number = Number(entry[2]);
    quotas.set(job, quotas.has(job) && quotas.get(job) !== number ? null : number);
  }
  const jobs = new Set(positions.filter(([pattern]) => pattern.test(title)).map(([, job]) => job));
  for (const job of quotas.keys()) jobs.add(job);
  return (jobs.size ? [...jobs] : ["Kadro belirtilmedi"]).map(kadro => ({
    il, adliye, kadro, kontenjan: quotas.get(kadro) ?? null, tarih, durum: "aciklandi", baslik,
    kaynak: source, telegram,
  }));
}

function parseMessage(body, links, post, unmatched, postDate = null) {
  const lines = body.split("\n").map(cleanTitle).filter(Boolean);
  const fallbackTitle = lines.find(line => /^\p{L}/u.test(line) && !parseHeading(line));
  const records = [];
  let block = [];
  for (const line of lines) {
    const heading = parseHeading(line);
    if (heading) {
      block = [line];
      continue;
    }
    const markers = [...line.matchAll(/\[\[link:(\d+)\]\]/g)];
    if (!markers.length) {
      if (block.length) block.push(line);
      continue;
    }
    for (const [, index] of markers) {
      const source = links[Number(index)];
      if (!source) continue;
      const matches = block.length && parseHeading(block[0]).domain === new URL(source).hostname;
      records.push(...parseBlock(matches ? block : [], source, post, postDate, unmatched, fallbackTitle));
    }
    block = [];
  }
  return records;
}

function postId(row) {
  return Number(row.telegram?.split("/").at(-1)) || 0;
}

function idFor(row) {
  if (!row.kaynak) return [row.il, row.adliye, row.kadro, row.tarih].join("|");
  const url = new URL(row.kaynak);
  return url.hostname + url.pathname.replace(/\/$/, "") + "|" + row.kadro;
}

export {cleanTitle, fold, idFor, parseMessage, positions, postId, provinces, slug, sourceLink};
