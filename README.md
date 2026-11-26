# Adalet Alım Haritası

Türkiye'nin 81 ilinde adliye nihai sonuçlarını ve duyurularda belirtilen kontenjanları gösterir. Harita GitHub Pages üzerinden sunulur.

GitHub Actions herkese açık [Telegram kanalını](https://t.me/s/adaletbakanligilanlari) beş dakikada bir kontrol eder. Duyuru başlıklarından yalnızca sonuç turuna ait nihai sonuçlar ve sözlü sınav sonuçları alınır. Sınava çağrılar ve uygulama sınavı sonuçları dışarıda kalır. Resmî ilan bağlantısı kullanıcıya gösterilir. Otomatik kontrol adliye sayfalarına bağlanmaz.

Yeni geçerli kayıtlar `dist/kayitlar.json` dosyasına eklenir. Harita içeriği değiştiğinde otomatik yayınlanır. Zamanlama yoğunlukta gecikebilir. GitHub, 60 gün etkinlik görmeyen açık depolarda zamanlamayı durdurabilir. Gerektiğinde Actions sekmesinde **Telegram ve harita** akışını yeniden etkinleştirin.

Elle kontrol için GitHub Actions ekranında **Run workflow** seçeneğini ya da GitHub CLI ile oturum açtıktan sonra Windows'ta **Telegram Kontrol.cmd** dosyasını kullanın.

## Yerel kullanım

Node.js 24 veya üzeriyle `npm ci`, `npm test` ve `npm run sync` komutlarını çalıştırabilirsiniz. Yerel önizleme için proje klasöründe `python -m http.server 8000 --directory dist` çalıştırıp [haritayı açın](http://localhost:8000).

İl sınırları [geoBoundaries TUR ADM1](https://www.geoboundaries.org/api/current/gbOpen/TUR/ADM1/) basitleştirilmiş OpenStreetMap verisidir (CC BY-SA 2.0). İl ve ilçe eşleşmeleri [Open Admin Data Türkiye](https://github.com/open-admin-data/turkey-administrative-divisions) verisini kullanır (CC BY 4.0).

## Yönetim

Haritadaki **Yönetim** bağlantısı, en son Telegram duyurusunu ve GitHub kontrol durumunu gösterir. **Manuel kayıt ekle** düğmesi, yalnızca depoya yazma yetkisi olanların çalıştırabildiği bir GitHub Actions formunu açar. **Run workflow** seçeneğinden il, komisyon, kadro ve ilan tarihini girin. Başlık, kontenjan ve resmî bağlantı isteğe bağlıdır. Tarih YYYY-AA-GG biçimindedir.

Aynı resmî ilan ve kadro tekrar girildiğinde mevcut kayıt güncellenir. Başarılı değişiklikler haritaya yayınlanır.
