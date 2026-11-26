"use strict";

const byId = id => document.getElementById(id);
const map = byId("map");
const dialog = byId("province-dialog");
const provinceLabel = byId("province-label");
const fmt = new Intl.NumberFormat("tr-TR");
const dateFmt = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeZone: "UTC" });
const shapes = new Map();
const recordsByCity = new Map();
let activeCity;
let restoreKeyboardFocus = false;
let lastPayload;


function element(tag, content, className) {
  const node = document.createElement(tag);
  if (content !== undefined) node.textContent = content;
  if (className) node.className = className;
  return node;
}

function fold(text) {
  return text.toLocaleLowerCase("tr").replaceAll("ı", "i").normalize("NFD").replace(/\p{M}/gu, "");
}

function jobPriority(job) {
  const normalized = fold(job);
  if (/\bzabit\s+kati[bp]/.test(normalized)) return 0;
  if (/\bikm\b|\binfaz\s+ve\s+koruma\b/.test(normalized)) return 1;
  return 2;
}

function hasResult(record) {
  return record.durum === "aciklandi" || record.durum === "sonuc_duyurusu";
}

function isProvinceCenter(record) {
  const place = fold(record.adliye).trim()
    .replace(/\s+(?:adliyesi|bam|bim)$/, "")
    .replace(/\s+merkez$/, "");
  return place === fold(record.il).trim();
}

function provinceColor(records) {
  const results = records.filter(hasResult);
  if (results.some(isProvinceCenter)) return "center";
  return results.length ? "district" : "";
}

function recordCard(record) {
  const card = element("article", undefined, "record");
  const published = hasResult(record);
  card.append(
    element("span", published ? "Nihai sonuç açıklandı" : "Sonuç bekleniyor", published ? "tag" : "tag pending"),
    element("h2", record.adliye), element("p", record.kadro, "job")
  );
  if (record.baslik) card.append(element("p", record.baslik, "announcement-title"));
  const quota = element("dl");
  quota.append(element("dt", "İlanda belirtilen kontenjan"),
    element("dd", record.kontenjan == null ? "Belirtilmedi" : fmt.format(record.kontenjan)));
  card.append(quota);
  if (record.tarih) {
    const stamp = element("time", dateFmt.format(new Date(record.tarih)));
    stamp.dateTime = record.tarih;
    card.append(stamp);
  }
  if (record.kaynak) {
    const url = new URL(record.kaynak);
    if (url.protocol === "https:" || url.protocol === "http:") {
      const line = element("p");
      const link = element("a", "Resmî ilan bağlantısı");
      link.href = url.href;
      line.append(link);
      card.append(line);
    }
  }
  return card;
}

function selectCity(name, keyboard) {
  const records = recordsByCity.get(name);
  if (!records?.length || dialog.open) return;
  provinceLabel.hidden = true;
  activeCity = name;
  const path = shapes.get(name);
  restoreKeyboardFocus = keyboard;
  if (!keyboard) path.blur();
  path.classList.add("selected");
  path.setAttribute("aria-expanded", "true");
  updateDialog(name);
  dialog.showModal();
  dialog.scrollTop = 0;
}

function updateDialog(name) {
  const records = recordsByCity.get(name) ?? [];
  byId("city").textContent = name;
  byId("city-summary").textContent = fmt.format(records.length) + " kayıt";
  byId("records").replaceChildren(...records.toSorted((a, b) => jobPriority(a.kadro) - jobPriority(b.kadro)).map(recordCard));
}

function drawMap(features) {
  for (const feature of features) {
    const name = feature.properties.shapeName;
    const rings = feature.geometry.type === "Polygon" ? feature.geometry.coordinates : feature.geometry.coordinates.flat();
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const d = rings.map(ring => ring.map(([lon, lat], index) => {
      const x = 23 + (lon - 25.5) * 48;
      const y = 28 + (42.2 - lat) * 65;
      return (index ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
    }).join("") + "Z").join("");
    path.setAttribute("d", d);
    path.setAttribute("fill-rule", "evenodd");
    path.setAttribute("class", "city");
    path.addEventListener("pointerenter", event => {
      if (event.pointerType === "touch") return;
      provinceLabel.textContent = name;
      provinceLabel.hidden = false;
      positionLabel(event);
    });
    path.addEventListener("pointermove", positionLabel);
    path.addEventListener("pointerleave", () => { provinceLabel.hidden = true; });
    path.addEventListener("click", event => selectCity(name, event.detail === 0));
    path.addEventListener("keydown", event => {
      if (recordsByCity.has(name) && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        selectCity(name, true);
      }
    });
    shapes.set(name, path);
    map.append(path);
  }
}

function positionLabel(event) {
  if (provinceLabel.hidden) return;
  const gap = 12;
  const maxX = document.documentElement.clientWidth - provinceLabel.offsetWidth - gap;
  const above = event.clientY - provinceLabel.offsetHeight - gap;
  provinceLabel.style.left = Math.max(gap, Math.min(event.clientX + gap, maxX)) + "px";
  provinceLabel.style.top = (above >= gap ? above : event.clientY + gap) + "px";
}

async function readJson(url) {
  const response = await fetch(url, {cache: "no-cache"});
  if (!response.ok) throw new Error(url + ": " + response.status);
  return response.json();
}

function nationalGroup({kurum, kisaltma, kadrolar}) {
  const group = element("section", undefined, "national-group");
  group.append(element("h2", kurum + " (" + kisaltma + ")"));
  for (const row of kadrolar.toSorted((a, b) => jobPriority(a.ad) - jobPriority(b.ad))) {
    const card = element("div", undefined, "national-row");
    const heading = element("div", undefined, "national-row-title");
    heading.append(element("h3", row.ad), element("strong", "%" + fmt.format(row.yuzde)));
    const progress = element("progress");
    progress.max = row.toplamKomisyon;
    progress.value = row.aciklananKomisyon;
    progress.setAttribute("aria-label", row.ad + " komisyon ilerlemesi");
    const counts = element("div", undefined, "national-counts");
    counts.append(
      element("span", fmt.format(row.aciklananKomisyon) + " / " + fmt.format(row.toplamKomisyon) + " komisyon"),
      element("span", fmt.format(row.kisi) + " / " + fmt.format(row.toplamKisi) + " kişi")
    );
    card.append(heading, progress, counts);
    group.append(card);
  }
  return group;
}

async function loadNationalSummary() {
  const content = byId("national-records");
  try {
    const groups = await readJson("turkiye-ozeti.json");
    const priority = group => Math.min(...group.kadrolar.map(row => jobPriority(row.ad)));
    content.replaceChildren(...groups.toSorted((a, b) => priority(a) - priority(b)).map(nationalGroup));
  } catch {
    content.replaceChildren(element("p", "Türkiye geneli özeti yüklenemedi.", "national-status"));
  }
}

function updateRecords(records) {
  const payload = JSON.stringify(records);
  if (payload === lastPayload) return;
  lastPayload = payload;
  recordsByCity.clear();
  for (const record of records) {
    if (!recordsByCity.has(record.il)) recordsByCity.set(record.il, []);
    recordsByCity.get(record.il).push(record);
  }
  for (const [name, path] of shapes) {
    const rows = recordsByCity.get(name) ?? [];
    const color = provinceColor(rows);
    path.classList.toggle("center", color === "center");
    path.classList.toggle("district", color === "district");
    if (rows.length) {
      path.setAttribute("role", "button");
      path.setAttribute("tabindex", "0");
      path.setAttribute("aria-label", name);
      path.setAttribute("aria-expanded", String(name === activeCity));
      path.setAttribute("aria-haspopup", "dialog");
    } else {
      for (const attr of ["role", "tabindex", "aria-label", "aria-expanded", "aria-haspopup"]) path.removeAttribute(attr);
    }
  }
  if (activeCity) updateDialog(activeCity);
}

async function refreshRecords() {
  try {
    const records = await readJson("kayitlar.json");
    updateRecords(records);
    byId("error").hidden = true;
  } catch {
    byId("error").textContent = "Duyurular yenilenemedi. Otomatik olarak tekrar denenecek.";
    byId("error").hidden = false;
  } finally {
    setTimeout(refreshRecords, 30000);
  }
}

async function start() {
  const geometry = await readJson("turkiye.json");
  drawMap(geometry.features);
  const box = map.getBBox();
  const margin = 5;
  map.setAttribute("viewBox", [box.x - margin, box.y - margin, box.width + 2 * margin, box.height + 2 * margin].join(" "));
  await refreshRecords();
}

dialog.addEventListener("close", () => {
  const path = shapes.get(activeCity);
  path.classList.remove("selected");
  path.setAttribute("aria-expanded", "false");
  if (restoreKeyboardFocus) path.focus();
  activeCity = undefined;
});

dialog.addEventListener("click", event => {
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) {
    dialog.close();
  }
});

loadNationalSummary();
start().catch(error => {
  console.error(error);
  byId("error").textContent = "Harita verisi yüklenemedi. Sayfayı yenileyip tekrar dene.";
  byId("error").hidden = false;
});
