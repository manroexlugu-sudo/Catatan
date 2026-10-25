# PANDUAN LENGKAP MEMBANGUN APK ANDROID: CATATAN BY ISWANDI

Aplikasi **CATATAN BY ISWANDI** dirancang khusus menggunakan arsitektur web modern yang 100% responsif terhadap layar ponsel Android, mendukung penyimpanan lokal IndexedDB yang persisten tanpa butuh internet, ramah sentuhan, dan siap dikemas menjadi file APK Android mandiri.

---

## METODE 1: MENGGUNAKAN CAPACITOR (STANDAR RESMI INDUSTRI)

Metode ini membungkus aplikasi menjadi proyek Android native resmi dengan Gradle, siap di-build menjadi APK Debug maupun Release.

### Langkah 1: Build Aset Web
Pastikan dependensi terpasang dan aplikasi telah dikompilasi ke folder `dist`:
```bash
npm install
npm run build
```

### Langkah 2: Tambahkan Capacitor Android Platform
Instal modul Capacitor core, CLI, dan platform Android:
```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Catatan by Iswandi" com.iswandi.catatanikan --web-dir dist
npx cap add android
npx cap sync
```

### Langkah 3: Konfigurasi Izin Android (Kamera & Media)
Buka file `android/app/src/main/AndroidManifest.xml`, pastikan izin kamera dan penyimpanan tersedia di dalam tag `<manifest>`:
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
```

### Langkah 4: Membangun File APK

#### A. Membangun APK Debug (Untuk Pengujian di HP):
Jalankan perintah langsung dari terminal:
```bash
cd android
./gradlew assembleDebug
```
File APK debug akan dihasilkan di lokasi:
`android/app/build/outputs/apk/debug/app-debug.apk`

Anda dapat langsung memasang file `app-debug.apk` ke HP Android Anda menggunakan kabel data atau mengirimkannya lewat WhatsApp / Telegram / Google Drive.

#### B. Membangun APK Release (Siap Distribusi / Google Play Store):
1. Buka folder proyek di Android Studio:
   ```bash
   npx cap open android
   ```
2. Di Android Studio, klik menu **Build** > **Generate Signed Bundle / APK**.
3. Pilih **APK**, klik **Next**.
4. Pilih atau buat file Keystore (kunci tanda tangan digital), masukkan password dan alias.
5. Pilih varian build **Release**, centang V1 (Jar Signature) dan V2 (Full APK Signature).
6. Klik **Finish**. File APK release yang telah ditandatangani akan berada di:
   `android/app/release/app-release.apk`

---

## METODE 2: MENGGUNAKAN ANDROID WEBVIEW NATIVE (KOTLIN)

Jika Anda ingin membungkus aplikasi ke dalam aplikasi native Android murni tanpa Capacitor:

1. Buat proyek baru di **Android Studio** dengan template **Empty Views Activity** (Kotlin).
2. Tambahkan izin internet dan kamera di `AndroidManifest.xml`.
3. Di `activity_main.xml`, tambahkan komponen `WebView`:
   ```xml
   <WebView
       android:id="@+id/webView"
       android:layout_width="match_parent"
       android:layout_height="match_parent" />
   ```
4. Di `MainActivity.kt`:
   ```kotlin
   val webView = findViewById<WebView>(R.id.webView)
   webView.settings.javaScriptEnabled = true
   webView.settings.domStorageEnabled = true // Wajib untuk IndexedDB
   webView.settings.databaseEnabled = true
   webView.settings.allowFileAccess = true
   webView.settings.allowContentAccess = true
   webView.webChromeClient = object : WebChromeClient() {
       // Tangani pemilih file/kamera
   }
   webView.loadUrl("file:///android_asset/index.html") // atau URL hosting Anda
   ```
5. Salin isi folder `dist/` ke folder `android/app/src/main/assets/`.
6. Klik **Build APK** di Android Studio.

---

## METODE 3: INSTALASI INSTAN PWA DI HP ANDROID (TANPA PC)

Aplikasi telah dilengkapi Web App Manifest dan Service Worker compliant:
1. Buka URL aplikasi di Google Chrome pada ponsel Android Anda.
2. Klik tombol emas **"Pasang APK/App"** di bilah atas aplikasi, ATAU ketuk menu titik tiga di Google Chrome lalu pilih **"Tambahkan ke Layar Utama" (Add to Home screen)** / **"Instal Aplikasi"**.
3. Aplikasi akan langsung terpasang di menu aplikasi ponsel dengan ikon Catatan Iswandi, berjalan fullscreen tanpa bilah browser, dan berfungsi offline.
