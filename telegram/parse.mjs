import {readFile} from "node:fs/promises";

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
}

const channel = "adaletbakanligilanlari";
const geometry = await readJson("../dist/turkiye.json");
const regions = geometry.features.map(feature => feature.properties.shapeName);
const districtsCatalog = await readJson("./districts.json");
const finalRules = await readJson("./final-results.json");

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
const campaignStart = finalRules.firstDate;
const earlierStage = new RegExp(finalRules.reject);
const announcedStage = new RegExp(finalRules.accept);

function cleanTitle(title) {
  return title.replace(/&(?:nbsp|#160|#x[aA]0);/gi, " ").replace(/\s+/g, " ").trim();
}

function isFinalResult({baslik, tarih, kaynak, telegram, manuel}) {
  if (!baslik || !tarih || tarih < campaignStart) return false;
  const title = fold(cleanTitle(baslik));
  if (earlierStage.test(title)) return false;
  if (manuel === true || announcedStage.test(title)) return true;
  if (!kaynak || !telegram?.endsWith("/" + finalRules.contextPost)) return false;
  const url = new URL(kaynak);
  return finalRules.contextLinks.includes(url.hostname + url.pathname);
}


function provinceFor(authority, domain) {
  const hostKey = domain.split(".")[0].toLowerCase();
  if (courtAliases.has(hostKey)) return courtAliases.get(hostKey);
  const region = slug(authority.replace(/\s+(?:BAM|BİM|BIM|Adliyesi|Adalet Komisyonu)$/iu, ""));
  if (provinces.has(region)) return provinces.get(region);
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
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname.endsWith(".adalet.gov.tr")
        || url.username || url.password || url.port || url.pathname === "/") return null;
    return url.origin + url.pathname;
  } catch {
    return null;
  }
}

function parseBlock(lines, source, post, unmatched) {
  const heading = /^⚖\uFE0F?\s*(.+?)\s*\(([a-z0-9.-]+)\)$/.exec(lines[0]);
  if (!heading || new URL(source).hostname !== heading[2]) return [];
  const adliye = heading[1];
  const il = provinceFor(adliye, heading[2]);
  const dateLine = lines.findIndex(line => line.startsWith("📅"));
  if (dateLine < 2) return [];
  const date = /\b(\d{2})\.(\d{2})\.(\d{4})\b/.exec(lines[dateLine]);
  if (!date) return [];
  const tarih = [date[3], date[2], date[1]].join("-");
  const timestamp = Date.parse(tarih);
  if (tarih < campaignStart || !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== tarih) return [];
  const baslik = cleanTitle(lines.slice(1, dateLine).join(" "));
  const telegram = "https://t.me/" + channel + "/" + post;
  const title = fold(baslik);
  if (!isFinalResult({baslik, tarih, kaynak: source, telegram})) return [];
  const durum = "aciklandi";
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
  const jobs = positions.filter(([pattern]) => pattern.test(title)).map(([, job]) => job);
  const isHiring = /\b(?:personel\s+alim\w*|sozlesmeli\s+personel|kadrolar\w*)\b/.test(title);
  if (!jobs.length && !isHiring) return [];
  if (!il) {
    unmatched?.add(adliye + " (" + heading[2] + ")");
    return [];
  }
  return (jobs.length ? jobs : ["Kadro belirtilmedi"]).map(kadro => ({
    il, adliye, kadro, kontenjan: quotas.get(kadro) ?? null, alinan: null, tarih, durum, baslik,
    kaynak: source, telegram,
  }));
}

function parseMessage(body, links, post, unmatched) {
  let lines = [];
  const records = [];
  for (const raw of body.split("\n")) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (line.startsWith("⚖")) {
      lines = [line];
    } else if (lines.length && line) {
      const marker = /\[\[link:(\d+)\]\]/.exec(line);
      if (marker) {
        records.push(...parseBlock(lines, links[Number(marker[1])], post, unmatched));
        lines = [];
      } else {
        lines.push(line);
      }
    }
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

function canonicalRecords(input) {
  const rows = Array.from(input).filter(isFinalResult).map(row => ({...row, baslik: cleanTitle(row.baslik), durum: "aciklandi"}));
  const identified = new Set(rows.filter(row => row.kadro !== "Kadro belirtilmedi")
    .filter(row => row.kaynak).map(row => new URL(row.kaynak).hostname + new URL(row.kaynak).pathname));
  const groups = new Map();
  const visible = [];
  for (const row of rows) {
    const key = row.kaynak && (new URL(row.kaynak).hostname + new URL(row.kaynak).pathname);
    if (row.kadro === "Kadro belirtilmedi" && identified.has(key)) continue;
    const group = [row.il, slug(row.adliye), row.kadro, row.tarih].join("|");
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(row);
  }
  for (const group of groups.values()) {
    // Some announcements link to both the detailed notice and its separate list.
    const isAttachment = row => /^(?:katip|koruma)\s+nihai\s+basari\s+listesi\b/.test(fold(row.baslik || ""));
    const notices = group.filter(row => !isAttachment(row) && Number.isFinite(row.kontenjan));
    visible.push(...group.filter(row => notices.length !== 1 || !isAttachment(row) || row.kontenjan != null));
  }
  return visible;
}

export {canonicalRecords, cleanTitle, fold, idFor, isFinalResult, parseMessage, positions, postId, provinces, slug, sourceLink};
