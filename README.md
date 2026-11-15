# Remotion Studio & AI Video Generator (Motion-from-Remotion)

Platform otomasi dan studio pembuatan video motion graphics vertikal (9:16 TikTok / Reels / Shorts) berbasis **Remotion 4**, dilengkapi **Model Context Protocol (MCP)** untuk integrasi AI (Claude / LLM), **In-Studio Web Editor**, **AI Voiceover Generator (ElevenLabs AI & Microsoft Neural Voice)**, serta animasi 3D (Three.js).

---

## 🚀 Ringkasan Perubahan dari Codebase Awal (Initial Template)

Awalnya project ini dibuat dari template dasar Remotion (`npx create-video` dengan komponen demo `HelloWorld`). Berikut adalah seluruh modifikasi dan fitur baru yang telah ditambahkan:

### 1. Model Context Protocol (MCP) Server (`remotion-mcp.js`)
* **Arsitektur MCP Penuh**: Mendukung koneksi via Stdio maupun HTTP/SSE sehingga dapat dikontrol langsung oleh AI (seperti Claude Desktop, Antigravity, Cursor, atau LLM lainnya).
* **Tools MCP yang Tersedia**:
  * `get_root_code`: Membaca seluruh kode animasi, scene, dan naskah di `src/Root.tsx`.
  * `update_root_code`: Mengubah kode video secara realtime dengan **validasi otomatis TypeScript (`tsc --noEmit`)** dan auto-rollback jika terjadi error sintaks.
  * `generate_voiceover`: Menghasilkan voiceover AI manusia dengan kontrol waktu mulai (`start`), jeda, durasi (`dur`), dan kecepatan bicara (`speed` / `rate`) per baris naskah/scene.
  * `get_project_status`: Mendeteksi resolusi, FPS, durasi frame, dan URL preview web.
  * `render_video`: Merender hasil video ke format MP4 (H.264) siap upload.

### 2. In-Studio Web Code Editor Modal
* **Editor Kode Langsung di Browser**: Tombol *Code Editor* di toolbar Remotion Studio untuk membaca dan mengedit file source code (`src/Root.tsx`, `package.json`, dsb) langsung dari browser.
* **Line Numbering & Styling Rapi**: Tampilan gelap (*dark theme*) dengan penomoran baris vertikal rapi (`white-space: pre !important`) tanpa bug wrap horizontal.
* **Fitur Keamanan Kode**: Dilengkapi auto-rollback jika terdapat kesalahan kompilasi saat menyimpan (`Ctrl + S`).

### 3. AI Voiceover Generator Modal (In-Studio)
* **Dua Provider AI Voice**:
  * **ElevenLabs AI (Ultra Realistis)**: Menggunakan model `eleven_multilingual_v2` dengan pilihan voice karakter narator (Adam, Antoni, Rachel, Bella, George) dan integrasi API Key via `.env` atau form input.
  * **Microsoft Neural Voice (Edge TTS)**: Gratis tanpa kuota/kredit dengan suara natural berbahasa Indonesia (`id-ID-ArdiNeural` & `id-ID-GadisNeural`).
* **Sinkronisasi Naskah Otomatis**: Parser cerdas berbasis struktur bracket yang mengekstrak daftar naskah dan timestamp dari array `SCENES` di `src/Root.tsx`.
* **Add/Remove/Edit Naskah Manual**:
  * Tombol `➕ Tambah Baris Naskah Manual` untuk menambahkan scene naskah baru.
  * Tombol Hapus (`×`) di setiap baris naskah.
  * **Label / Badge Scene Interaktif**: Teks judul scene (misal: `1 Hook`, `4 Jarak`, `5 Kesimpulan CTA`) dapat diklik dan diedit langsung.
* **Kontrol Kecepatan Bicara Fleksibel**:
  * **Per-Row Speed Control**: Setiap baris naskah memiliki input kecepatan sendiri (`Speed [ 10 ] %`), memungkinkan narasi hook dibuat lebih cepat (+20%) dan scene penjelasan lebih santai (+10%).
  * **Global Default Speed**: Kontrol kecepatan global di bagian atas yang otomatis menyesuaikan seluruh baris.
  * **Layout Proporsional**: Tinggi kotak teks naskah disesuaikan (`80px`) agar sejajar presisi dengan kotak kontrol waktu dan kecepatan di sampingnya.
* **Audio Mixing & Normalisasi**: Menggunakan FFmpeg dan script Python untuk memotong, mengatur jeda, menyesuaikan tempo (`atempo`), normalisasi volume ke puncak `-0.96`, dan menyimpan output ke `public/voiceover.mp3`.

### 4. Perbaikan Kompatibilitas Render Audio (`@remotion/media`)
* Memperbaiki error render `<Html5Audio> is not supported in @remotion/web-renderer` dengan mengalihkan import komponen `Audio` dari `"remotion"` ke `"@remotion/media"`.
* Verifikasi render CLI berhasil penuh (`npx remotion render out/video.mp4`).

### 5. Template Video Motion Graphics Vertikal (`src/Root.tsx`)
* **Format Vertikal**: Resolusi 1080x1920 (9:16), 30 FPS, durasi 60 detik (1800 frames).
* **Animasi 3D Three.js**: Integrasi `@react-three/fiber` dan `three` untuk visual 3D (seperti objek planet Mars, lighting, partikel bintang).
* **Kinetic Typography & Spring Physics**: Menggunakan Google Fonts (`Poppins` & `Inter`), spring transitions (`damping`, `stiffness`), dan pseudo-random generator deterministik (`rng`) agar konsisten di setiap frame render.

### 6. AI Agent Knowledge Base & Remotion Skills (`.agents/skills/`)
* Koleksi lengkap panduan & referensi teknis video Remotion:
  * `remotion-best-practices`: Panduan utama arsitektur video Remotion.
  * `remotion-captions`: Transkripsi audio, format SRT, dan animasi subtitle kata demi kata.
  * `remotion-markup`: Efek visual, transisi, kinetic text highlights, SFX, dan 3D.
  * `remotion-maps`: Animasi peta dinamis (Mapbox, MapLibre, MapTiler, Cesium 3D).
  * `remotion-render`: Optimasi render, transparent video, dan konfigurasi server.

---

## 🛠 Panduan Menjalankan Project

### 1. Menjalankan Remotion Studio
```bash
npm run dev
```
Buka preview di browser melalui: `http://localhost:3000` atau domain server Anda.

### 2. Merender Video ke File MP4
```bash
npx remotion render MarsVideo out/video.mp4
```

### 3. Menggunakan MCP Server di Claude Desktop / Client AI
Tambahkan konfigurasi berikut ke file konfigurasi MCP Anda (misalnya `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "remotion-video-creator": {
      "command": "node",
      "args": ["/root/studio-hw/remotion-mcp.js"]
    }
  }
}
```

Atau hubungkan melalui HTTP/SSE:
* **Endpoint SSE**: `http://localhost:3001/sse`
* **Endpoint Messages**: `http://localhost:3001/messages`

---

## ⚙️ Variabel Lingkungan (`.env`)

```env
ELEVENLABS_API_KEY=sk_your_elevenlabs_api_key_here
```

---

## 📁 Struktur Direktori Utama

```text
├── .agents/skills/       # Dokumentasi & Best Practices AI Agent untuk Remotion
├── public/
│   ├── voiceover.mp3     # File audio voiceover hasil generate AI
│   └── ...
├── src/
│   ├── Root.tsx          # Komposisi utama video vertikal 9:16 & scene animasi
│   └── index.ts          # Entry point Remotion
├── remotion-mcp.js       # Server Model Context Protocol (MCP) untuk AI
├── package.json          # Dependensi project Remotion & Three.js
└── README.md             # Dokumentasi project
```

---

## 📄 Lisensi
Sesuai dengan ketentuan lisensi [Remotion](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).
