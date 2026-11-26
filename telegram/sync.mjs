import {readFile, rename, rm, writeFile} from "node:fs/promises";
import {load} from "cheerio";
import {canonicalRecords, idFor, parseMessage, postId, slug, sourceLink} from "./parse.mjs";

const channel = "adaletbakanligilanlari";
const preview = "https://t.me/s/" + channel;
const dataPath = new URL("../dist/kayitlar.json", import.meta.url);
const cursorPath = new URL("./cursor.txt", import.meta.url);

export function parsePreview(html) {
  const $ = load(html);
  const postIds = [];
  const rows = [];
  const unmatched = new Set();
  for (const card of $(".tgme_widget_message[data-post]")) {
    const [name, rawId] = $(card).attr("data-post").split("/");
    if (name.toLowerCase() !== channel || !/^[1-9]\d*$/.test(rawId ?? "")) continue;
    const id = Number(rawId);
    postIds.push(id);
    const body = $(card).find(".tgme_widget_message_text").first();
    const links = [];
    body.find("br").replaceWith("\n");
    for (const anchor of body.find("a[href]")) {
      const link = sourceLink($(anchor).attr("href"));
      if (link) $(anchor).replaceWith("[[link:" + (links.push(link) - 1) + "]]");
    }
    rows.push(...parseMessage(body.text(), links, id, unmatched));
  }
  if (!postIds.length) throw new Error("Telegram önizlemesinde gönderi bulunamadı.");
  const older = Number($(".tme_messages_more[data-before]").attr("data-before")) || null;
  return {postIds, rows, older, unmatched};
}

async function downloadPreview(before) {
  const url = new URL(preview);
  if (before) url.searchParams.set("before", String(before));
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: {"User-Agent": "AdaletTakip/1.0", Accept: "text/html"},
  });
  if (!response.ok) throw new Error("Telegram HTTP " + response.status);
  return parsePreview(await response.text());
}

export async function collectUpdates(checkpoint, readPreview = downloadPreview) {
  let before = null;
  let newest = checkpoint;
  const incoming = [];
  const unmatched = new Set();
  for (let page = 0; page < 16; page++) {
    const result = await readPreview(before);
    const oldest = Math.min(...result.postIds);
    newest = Math.max(newest, ...result.postIds);
    incoming.push(...result.rows.filter(row => postId(row) >= checkpoint));
    for (const authority of result.unmatched) unmatched.add(authority);
    if (oldest <= checkpoint || !result.older) return {incoming, newest, unmatched};
    if (result.older > oldest || (before && result.older >= before)) break;
    before = result.older;
  }
  throw new Error("Telegram geçmişi tamamlanamadı. Son kayıt noktası korunuyor.");
}

function samePlaceAndJob(a, b) {
  return a.il === b.il && slug(a.adliye) === slug(b.adliye) && slug(a.kadro) === slug(b.kadro) && a.tarih === b.tarih;
}

export function mergeRecords(current, incoming) {
  if (!incoming.length) return current;
  const rows = new Map(current.map(row => [idFor(row), row]));
  for (const row of incoming.toSorted((a, b) => postId(a) - postId(b))) {
    const key = idFor(row);
    let matchedKey = key;
    if (!rows.has(key)) {
      const matches = [...rows].filter(([, candidate]) =>
        (candidate.manuel || row.manuel) && (!candidate.kaynak || !row.kaynak) && samePlaceAndJob(candidate, row));
      if (matches.length === 1) matchedKey = matches[0][0];
    }
    const prior = rows.get(matchedKey);
    if (prior && !row.manuel && postId(prior) > postId(row)) continue;
    const {alinan: ignored, ...published} = row;
    const updated = {
      ...prior, ...published,
      kontenjan: published.kontenjan ?? prior?.kontenjan ?? null,
      kaynak: published.kaynak ?? prior?.kaynak ?? null,
    };
    if (prior?.manuel && !row.manuel) {
      Object.assign(updated, prior, {kaynak: updated.kaynak, kontenjan: prior.kontenjan ?? updated.kontenjan});
      updated.telegram = row.telegram;
    }
    if (row.manuel && prior && Object.keys(updated).every(field => field === "manuel" || updated[field] === prior[field])) {
      continue;
    }
    if (matchedKey !== idFor(updated)) rows.delete(matchedKey);
    rows.set(idFor(updated), updated);
  }
  return canonicalRecords(rows.values());
}

export async function writeAtomic(path, content) {
  const pending = new URL(path.href + "." + process.pid + ".tmp");
  try {
    await writeFile(pending, content, "utf8");
    await rename(pending, path);
  } finally {
    await rm(pending, {force: true});
  }
}

async function main() {
  const checkpoint = Number(await readFile(cursorPath, "utf8"));
  if (!Number.isSafeInteger(checkpoint) || checkpoint <= 0) {
    throw new Error("Telegram kayıt noktası geçersiz.");
  }
  const current = JSON.parse(await readFile(dataPath, "utf8"));
  const {incoming, newest, unmatched} = await collectUpdates(checkpoint);
  const updated = mergeRecords(current, incoming);
  if (JSON.stringify(updated) !== JSON.stringify(current)) {
    await writeAtomic(dataPath, JSON.stringify(updated, null, 2) + "\n");
  }
  if (newest > checkpoint) await writeAtomic(cursorPath, newest + "\n");
  console.log("Telegram son gönderi: " + newest + " | Haritadaki toplam kayıt: " + updated.length);
  if (unmatched.size) console.warn("İli doğrulanamayan komisyonlar:", ...unmatched);
}

if (import.meta.main) await main();
