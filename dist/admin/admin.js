"use strict";

const date = new Intl.DateTimeFormat("tr-TR", {dateStyle: "medium", timeZone: "UTC"});
const time = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul",
});
const runs = "https://api.github.com/repos/yesnt10/adalettakip/actions/workflows/telegram-pages.yml/runs";
const postPattern = /^https:\/\/t\.me\/adaletbakanligilanlari\/(\d+)$/;

async function readJson(url) {
  const response = await fetch(url, {cache: "no-cache", signal: AbortSignal.timeout(10_000)});
  if (!response.ok) throw new Error("HTTP " + response.status);
  return response.json();
}

async function showLatestRecord() {
  const meta = document.getElementById("telegram-meta");
  const list = document.getElementById("telegram-records");
  try {
    const rows = await readJson("../kayitlar.json");
    const telegram = rows.map(row => ({row, id: Number(postPattern.exec(row.telegram)?.[1] ?? 0)}))
      .filter(entry => entry.id > 0);
    const newest = Math.max(0, ...telegram.map(entry => entry.id));
    const latest = telegram.filter(entry => entry.id === newest);
    meta.textContent = newest ? "Gönderi #" + newest + " · " + latest.length + " sonuç" : "Telegram kaynaklı kayıt bulunamadı.";
    list.replaceChildren(...latest.map(({row}) => {
      const item = document.createElement("li");
      const place = document.createElement("strong");
      place.textContent = row.il === row.adliye ? row.il : row.il + " · " + row.adliye;
      const details = document.createElement("span");
      details.textContent = row.kadro + " · " + date.format(new Date(row.tarih));
      item.append(place, details);
      return item;
    }));
  } catch {
    meta.textContent = "Telegram kaydı şu anda yüklenemedi.";
  }
}

async function showRun(event) {
  const container = document.getElementById(event);
  try {
    const data = await readJson(runs + "?event=" + event + "&per_page=1");
    const run = data.workflow_runs[0];
    if (!run) {
      container.textContent = event === "schedule" ? "GitHub henüz zamanlanmış bir kontrol bildirmedi." : "Henüz elle kontrol başlatılmadı.";
      return;
    }
    const state = run.status !== "completed" ? "Sırada veya çalışıyor" :
      {success: "Başarılı", failure: "Başarısız", cancelled: "İptal edildi"}[run.conclusion] ?? "Tamamlandı";
    const link = document.createElement("a");
    link.href = run.html_url;
    link.textContent = state + " · " + time.format(new Date(run.run_started_at || run.created_at));
    container.replaceChildren(link);
  } catch {
    container.textContent = "GitHub durumu şu anda okunamadı.";
  }
}

async function refresh() {
  const button = document.getElementById("refresh");
  button.disabled = true;
  try {
    await Promise.all([showLatestRecord(), showRun("schedule"), showRun("workflow_dispatch")]);
  } finally {
    button.disabled = false;
  }
}

document.getElementById("refresh").addEventListener("click", refresh);
refresh();
