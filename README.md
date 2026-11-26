# Adalet Alım Haritası

Türkiye'nin 81 ilinde adliye duyurularını ve duyurularda belirtilen kontenjanları gösterir. Harita GitHub Pages üzerinden sunulur.

GitHub Actions herkese açık [Telegram kanalını](https://t.me/s/adaletbakanligilanlari) beş dakikada bir kontrol eder. Kanalda paylaşılan resmî adliye duyuruları aşamaya ve kadroya göre elenmeden aktarılır. İl eşleşmesi bulunamayan kurum duyuruları haritanın altındaki bölümde listelenir. Resmî ilan bağlantısı kullanıcıya gösterilir. Otomatik kontrol adliye sayfalarına bağlanmaz.

Yeni geçerli kayıtlar `dist/kayitlar.json` dosyasına eklenir. Türkiye geneli tablosu bu kayıtlardan güncel komisyon ve bilinen kontenjan sayılarını hesaplar. Ülke geneli hedefleri `dist/turkiye-ozeti.json` içinde tutulur. Harita içeriği değiştiğinde otomatik yayınlanır. Zamanlama yoğunlukta gecikebilir. GitHub, 60 gün etkinlik görmeyen açık depolarda zamanlamayı durdurabilir. Gerektiğinde Actions sekmesinde **Telegram ve harita** akışını yeniden etkinleştirin.

Elle kontrol için GitHub Actions ekranında **Run workflow** seçeneğini ya da GitHub CLI ile oturum açtıktan sonra Windows'ta **Telegram Kontrol.cmd** dosyasını kullanın.

## Yerel kullanım

Node.js 24 veya üzeriyle `npm ci`, `npm test` ve `npm run sync` komutlarını çalıştırabilirsiniz. Yerel önizleme için proje klasöründe `python -m http.server 8000 --directory dist` çalıştırıp [haritayı açın](http://localhost:8000).

İl sınırları [geoBoundaries TUR ADM1](https://www.geoboundaries.org/api/current/gbOpen/TUR/ADM1/) basitleştirilmiş OpenStreetMap verisidir (CC BY-SA 2.0). İl ve ilçe eşleşmeleri [Open Admin Data Türkiye](https://github.com/open-admin-data/turkey-administrative-divisions) verisini kullanır (CC BY 4.0).
