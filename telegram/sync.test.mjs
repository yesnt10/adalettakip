import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {idFor} from "./parse.mjs";
import {collectUpdates, mergeRecords, parsePreview} from "./sync.mjs";

const channel = "adaletbakanligilanlari";
const url = "https://karadenizeregli.adalet.gov.tr/";
const card = (id, body = "") =>
  '<div class="tgme_widget_message" data-post="' + channel + "/" + id + '">' +
  '<div class="tgme_widget_message_text">' + body + "</div></div>";
const notice = (title, path) =>
  '⚖️ <b>Karadeniz Ereğli</b> <code>(karadenizeregli.adalet.gov.tr)</code><br>' +
  title + '<br>📅 26.11.2026<br>• ⚖️ Zabıt Kâtibi: 4 kişi<br>' +
  '<a href="' + url + path + '">Duyuruyu Aç</a><br>';

test("grouped posts keep announcements from both stages and map Karadeniz Ereğli to Zonguldak", () => {
  const content = notice("Zabıt Kâtibi Uygulama Sınav Sonuçları", "uygulama") +
    notice("Zabıt Kâtibi ve İnfaz ve Koruma Memuru Nihai Başarı Listesi", "sonuc");
  const result = parsePreview(card(3880, content));
  assert.deepEqual(result.postIds, [3880]);
  assert.deepEqual(result.rows.map(({il, kadro, kontenjan}) => [il, kadro, kontenjan]), [
    ["Zonguldak", "Zabıt kâtibi", 4], ["Zonguldak", "Zabıt kâtibi", 4], ["Zonguldak", "İnfaz ve koruma memuru", null],
  ]);
});

test("checks every recent page until the saved Telegram checkpoint", async () => {
  const cursors = [];
  const result = await collectUpdates(3880, async before => {
    cursors.push(before);
    const html = before
      ? card(3880, notice("Zabıt Kâtibi Nihai Sonuç", "sonuc-eski")) + card(3879)
      : card(3882, notice("Zabıt Kâtibi Nihai Sonuç", "sonuc-yeni")) + card(3881) +
        '<a class="tme_messages_more" data-before="3881"></a>';
    return parsePreview(html);
  });
  assert.deepEqual(cursors, [null, 3881]);
  assert.equal(result.newest, 3882);
  assert.equal(result.incoming.length, 2);
});

test("a temporary Telegram failure leaves the checkpoint available for retry", async () => {
  await assert.rejects(collectUpdates(3880, async before => {
    if (before) throw new Error("Telegram HTTP 429");
    return parsePreview(card(3882) + '<a class="tme_messages_more" data-before="3882"></a>');
  }), /Telegram HTTP 429/);
});

test("published records are valid and re-reading a result is idempotent", async () => {
  const data = JSON.parse(await readFile(new URL("../dist/kayitlar.json", import.meta.url)));
  assert.ok(data.length >= 208);
  assert.ok(data.every(row => row.adliye && row.baslik));
  assert.equal(new Set(data.map(idFor)).size, data.length);
  assert.ok(data.some(row => row.il === "Aksaray"));
  assert.ok(data.some(row => row.il === "İstanbul" && row.tarih === "2026-11-09"));
  const synced = parsePreview(card(3880, notice("Zabıt Kâtibi Nihai Sonuç", "sonuc"))).rows;
  const updated = mergeRecords([], synced);
  assert.deepEqual(mergeRecords(updated, synced), updated);
});

test("accepts Adana BİM application results and keeps ministry notices without an assigned province", () => {
  const adana = '⚖️ Adana BİM (adanabim.adalet.gov.tr)<br>Sözleşmeli Şoför ve Aşçı Sınavları Başvuru Sonuçları' +
    '<br>📅 26.11.2026<br><a href="http://adanabim.adalet.gov.tr/basvuru">Duyuruyu Aç</a>';
  const ministry = '🏛️ Ceza ve Tevkifevleri Genel Müdürlüğü (cte.adalet.gov.tr)<br>Personel yerleştirme sonuçları' +
    '<br>📅 19.11.2026<br><a href="https://cte.adalet.gov.tr/yerlestirme">Duyuruyu Aç</a>';
  const {rows} = parsePreview(card(3879, adana + "<br>" + ministry));
  assert.deepEqual(rows.map(({il, adliye, kadro}) => [il, adliye, kadro]), [
    ["Adana", "Adana BİM", "Aşçı"],
    ["Adana", "Adana BİM", "Şoför"],
    [null, "Ceza ve Tevkifevleri Genel Müdürlüğü", "Kadro belirtilmedi"],
  ]);
  assert.equal(mergeRecords([], rows).length, 3);
});

test("keeps official links even when the post has no standard heading", () => {
  const content = 'Sınava katılacak adayların listesi<br><a href="https://adanabim.adalet.gov.tr/liste">İlan</a>';
  const {rows} = parsePreview(card(3880, content));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].il, "Adana");
  assert.equal(rows[0].baslik, "Sınava katılacak adayların listesi");
});
