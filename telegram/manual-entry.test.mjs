import assert from "node:assert/strict";
import test from "node:test";
import {manualRecord} from "./manual-entry.mjs";
import {mergeRecords} from "./sync.mjs";

const input = {
  il: "zonguldak", adliye: "Karadeniz Ereğli", kadro: "Zabıt katipliği",
  tarih: "2026-11-26", kontenjan: "4", baslik: "Atama için gerekli belgeler",
};

test("manual final results are retained during Telegram refresh and can receive the official link", () => {
  const manual = manualRecord(input);
  const initial = mergeRecords([], [manual]);
  assert.equal(initial.length, 1);
  assert.deepEqual(mergeRecords(initial, [manual]), initial);
  const automatic = {...manual, manuel: undefined, baslik: "Nihai başarı listesi",
    kaynak: "https://karadenizeregli.adalet.gov.tr/sonuc", kontenjan: 5,
    telegram: "https://t.me/adaletbakanligilanlari/4000"};
  const merged = mergeRecords(initial, [automatic]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].kontenjan, 4);
  assert.equal(merged[0].kaynak, automatic.kaynak);
  assert.equal(merged[0].telegram, automatic.telegram);
  assert.deepEqual(mergeRecords(merged, [automatic]), merged);
});

test("manual submissions validate the province, date, quota, source and result stage", () => {
  for (const fields of [
    {il: "Unknown"}, {tarih: "2026-11-31"}, {kontenjan: "-1"},
    {kaynak: "https://example.com/sonuc"}, {baslik: "Zabıt Kâtibi Uygulama Sınav Sonuçları"},
  ]) {
    assert.throws(() => manualRecord({...input, ...fields}));
  }
  assert.equal(manualRecord({...input, kontenjan: ""}).kontenjan, null);
});
