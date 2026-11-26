import assert from "node:assert/strict";
import test from "node:test";
import {buildNationalSummary} from "../dist/national-summary.js";

const totals = [{
  kurum: "Personel Genel Müdürlüğü",
  kadrolar: [{ad: "Zabıt kâtipliği", toplamKomisyon: 170, toplamKisi: 5259, kisi: 892, aciklananKomisyon: 37}],
}];
const result = {
  il: "Kayseri", adliye: "Kayseri", kadro: "Zabıt kâtibi", tarih: "2026-11-26",
  baslik: "Zabıt Kâtibi Sözlü Sınav Sonuçları", kontenjan: 7,
};
const summarize = records => buildNationalSummary(totals, records)[0].kadrolar[0];

test("a new result changes the table, with one count per commission and job", () => {
  assert.equal(summarize([]).aciklananKomisyon, 0);
  assert.equal(summarize([result, {...result, adliye: "Kayseri Adliyesi"}]).kisi, 7);
  const regional = {...result, kaynak: "https://kayseribim.adalet.gov.tr/ilan", kontenjan: 4};
  const data = summarize([result, regional, {...regional, adliye: "Kayseri BİM"}, {
    ...result, il: "Adana", adliye: "Adana", baslik: "Zabıt Kâtibi Başvuru Sonuçları", kontenjan: 55,
  }]);
  assert.equal(data.aciklananKomisyon, 2);
  assert.equal(data.kisi, 11);
  assert.equal(data.toplamKomisyon, 170);
  assert.equal(data.toplamKisi, 5259);
});

test("missing, conflicting, and corrected quotas are handled separately from the commission count", () => {
  const records = [{...result, kontenjan: null}, {...result, kontenjan: 4}, {...result, kontenjan: 7}];
  assert.equal(summarize(records).aciklananKomisyon, 1);
  assert.equal(summarize(records).kisi, null);
  assert.equal(summarize([...records, {...result, tarih: "2026-11-27", kontenjan: 5}]).kisi, 5);
  assert.equal(summarize([{...result, kontenjan: null}]).kisi, null);
});
