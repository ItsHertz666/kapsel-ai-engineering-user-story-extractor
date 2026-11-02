# Asisten Ekstraksi User Story & Acceptance Criteria dari Transkrip Rapat

Repositori ini memuat implementasi proyek mata kuliah **Kapita Selekta: AI Engineering** (Semester Ganjil 2026/2027). Sistem ini bertugas mengekstrak artefak kebutuhan perangkat lunak berupa *User Story* (sesuai prinsip INVEST) dan *Acceptance Criteria* (format Gherkin: *Given-When-Then*) secara otomatis dari transkrip percakapan rapat informal berbahasa Indonesia.

---

## Identitas Mahasiswa

- **Nama Mahasiswa:** Muhammad Athala Romero
- **NIM:** 10231059
- **Program Studi:** Sistem Informasi
- **Instansi:** Institut Teknologi Kalimantan (ITK)
- **Mata Kuliah:** Kapita Selekta — AI Engineering (2 SKS)
- **Dosen Pengampu:** Aidil Saputra Kirsan, S.ST., M.Tr.Kom.
- **Kode Peserta:** K = 8

---

## Status Proyek Sebenarnya (Audit Jujur)

Berdasarkan kondisi kode sumber yang sebenarnya ada di repositori:

### Fitur yang Sudah Berfungsi
1. **Skema Basis Data Relasional:** Didefinisikan menggunakan Drizzle ORM pada PostgreSQL (`transcripts`, `user_stories`, `acceptance_criteria`) lengkap dengan relasi dan status enum.
2. **Backend API Berbasis Bun:** Menyediakan endpoint HTTP untuk membuat transkrip (`POST /api/transcripts`), memproses ekstraksi (`POST /api/transcripts/:id/process`), dan mengambil hasil relasional (`GET /api/transcripts/:id`).
3. **Ekstraksi LLM via OpenRouter:** Pemanggilan model `openai/gpt-oss-120b` (dengan opsi fallback model dan pengaturan temperature deterministik) disertai prompt terstruktur untuk memisahkan kebutuhan inti dari percakapan santai.
4. **Validasi & Pembersihan Output:** Fungsi `parseModelOutput` menghapus markdown code fences, mengekstrak substring kurung kurawal `{...}`, membersihkan awalan template ("Sebagai/Saya ingin/Agar"), dan memicu *retry loop* hingga 3 kali jika parsing gagal.
5. **Ketahanan Jaringan:** Mekanisme penanganan status HTTP 429, 502, dan 503 dengan jeda eksponensial (3s, 6s, 12s) serta pemanggilan model cadangan (*fallback*).
6. **Penyimpanan Transaksional Atomik:** Seluruh operasi penghapusan cerita lama, penyimpanan cerita baru, kriteria keberterimaan terurut, dan pembaruan status transkrip dibungkus dalam `db.transaction`.
7. **Skrip Evaluasi Otomatis:** Skrip `backend/scripts/eval.ts` untuk menguji konsistensi ekstraksi berulang (multi-run) terhadap transkrip uji dan mencatat metrik ke format JSON, CSV, dan Markdown.

### Fitur yang Belum Ada / Belum Terhubung
1. **Lapisan 3 (Grounding / RAG):** Belum ada dokumen rujukan, chunking, embedding, vector store, maupun logika penolakan `"TIDAK DITEMUKAN DI RUJUKAN"`.
2. **Lapisan 4 (Tool Calling Sungguhan):** Tidak ada definisi fungsi terdaftar (`tools`/`tool_calls`) yang dipanggil secara otonom oleh model. Pemanggilan OpenRouter saat ini murni berupa REST API call biasa.
3. **Logika Agentic & Titik Persetujuan Manusia:** Belum ada loop nalar-tindak mandiri, state machine, batas langkah, maupun antarmuka persetujuan (*human-in-the-loop*) sebelum data disahkan.
4. **Pemrosesan Asinkron Sungguhan:** Pemrosesan ekstraksi di endpoint `POST /api/transcripts/:id/process` saat ini berjalan **SINKRON** (klien menunggu hingga panggilan model selesai). Status `'queued'` pada database hanya penanda pasif tanpa worker/queue riil.
5. **Frontend yang Tersambung:** Direktori `project/frontend/` masih berupa scaffolding awal SvelteKit bawaan. Belum ada antarmuka upload transkrip, daftar transkrip, maupun review cerita, meskipun konfigurasi proxy `/api` sudah disiapkan di `vite.config.ts`.

---

## Diagram Arsitektur (ASCII)

```text
[ Pengguna / System Analyst ]
               │
               ▼ (HTTP REST)
┌────────────────────────────────────────────────────────┐
│                   Backend (Bun.serve)                  │
│                                                        │
│  POST /api/transcripts         ──> Simpan transkrip    │
│  POST /api/transcripts/:id/process                     │
│    │                                                   │
│    ├──> Extractor Service                              │
│    │      │                                            │
│    │      ▼ (HTTP POST, temp: 0, retry 429/502/503)   │
│    │    [ OpenRouter API: openai/gpt-oss-120b ]        │
│    │      │                                            │
│    │      ▼ (JSON mentah)                              │
│    │    parseModelOutput (Sanitasi fences, substring,  │
│    │                      regex strip prefix, retry 3x)│
│    │                                                   │
│    └──> db.transaction (Atomik)                        │
│           ├── Hapus user_stories lama                 │
│           ├── Insert user_stories (status: draft)     │
│           ├── Insert acceptance_criteria (Gherkin)    │
│           └── Update transcripts (status: completed)  │
│                                                        │
│  GET  /api/transcripts/:id     ──> Ambil data relasi   │
└───────────────────────┬────────────────────────────────┘
                        │ (Drizzle ORM)
                        ▼
             [ PostgreSQL Database ]
```

---

## Tech Stack

- **Runtime & Package Manager:** Bun (v1.x)
- **Backend Framework:** Bun native HTTP server (`Bun.serve`)
- **Database & ORM:** PostgreSQL, Drizzle ORM (`drizzle-orm`), Drizzle Kit (`drizzle-kit`)
- **Database Driver:** `postgres` (postgres.js)
- **LLM Gateway:** OpenRouter API (`openai/gpt-oss-120b`)
- **Frontend Framework:** SvelteKit + Vite + TailwindCSS (tahap scaffolding)
- **Bahasa:** TypeScript

---

## Struktur Folder

```text
Kapsel/
├── docs/                     # Dokumentasi perancangan, audit, dan tugas perkuliahan
│   ├── audit-minggu-1-4.md
│   ├── rancangan-sistem.md
│   ├── status-proyek-2026-11-02.md
│   ├── pengumpulan-lms/      # Riwayat arsip pengumpulan mingguan
│   └── tugas-mingguan/       # Draf tugas mingguan
├── project/
│   ├── backend/              # Server API & modul pemrosesan LLM
│   │   ├── drizzle/          # Berkas migrasi skema SQL (Drizzle Kit)
│   │   ├── eval-results/     # Log hasil uji evaluasi multi-run (CSV, JSON, MD)
│   │   ├── scripts/          # Skrip evaluasi performa dan stabilitas ekstraksi
│   │   └── src/              # Kode sumber backend (db, schema, service, routes)
│   └── frontend/             # Antarmuka web pengguna (SvelteKit scaffold)
│       └── src/              # Route dan komponen antarmuka
├── .gitignore                # Aturan pengabaian berkas repositori git
├── README.md                 # Dokumentasi utama proyek
└── ...
```

---

## Prasyarat Lingkungan

Sebelum menjalankan proyek, pastikan perangkat Anda telah terpasang:
- [Bun](https://bun.sh/) (v1.1 atau lebih baru)
- [PostgreSQL](https://www.postgresql.org/) (v14 atau lebih baru) yang sedang aktif
- Akun dan API Key [OpenRouter](https://openrouter.ai/)

---

## Langkah Menjalankan Proyek dari Nol

### 1. Persiapan Basis Data
Buat basis data baru di PostgreSQL menggunakan terminal `psql` atau GUI (seperti pgAdmin / DBeaver):
```sql
CREATE DATABASE kapsel_db;
```

### 2. Konfigurasi Environment Backend
Masuk ke direktori backend, buat salinan `.env` dari `.env.example`, lalu sesuaikan kredensial Anda:
```bash
cd project/backend
cp .env.example .env
```
Isi konfigurasi pada file `project/backend/.env`:
- `DATABASE_URL`: URL koneksi basis data Anda (contoh: `postgresql://postgres:PASSWORD@localhost:5432/kapsel_db`)
- `OPENROUTER_API_KEY`: API Key OpenRouter Anda (`sk-or-v1-...`)
- `OPENROUTER_MODEL`: Model yang digunakan (default: `openai/gpt-oss-120b`)
- `OPENROUTER_TEMPERATURE`: Suhu sampling (default: `0`)
- `PORT`: Port server backend (default: `3000`)

### 3. Instalasi Dependensi & Migrasi Database
Jalankan instalasi paket dan terapkan migrasi skema database menggunakan Bun:
```bash
# Di dalam direktori project/backend
bun install

# Terapkan skema database menggunakan Drizzle Kit
bunx drizzle-kit push
```

### 4. Menjalankan Server Backend
Jalankan server dalam mode pengembangan:
```bash
bun run dev
```
Server akan aktif di `http://localhost:3000`.

---

## Contoh Pemanggilan Endpoint (PowerShell / curl.exe)

> **Catatan Windows PowerShell:** Gunakan perintah `curl.exe` agar tidak tertukar dengan alias `Invoke-WebRequest`.

### 1. Menyimpan Transkrip Baru
```powershell
curl.exe -X POST http://localhost:3000/api/transcripts `
  -H "Content-Type: application/json" `
  -d '{\"raw_text\": \"Rapat membahas sistem klinik. Dokter ingin melihat riwayat rekam medis pasien agar diagnosis tepat. Staf administrasi ingin mencatat antrean pasien agar ruang tunggu tertib.\", \"original_filename\": \"rapat-klinik-01.txt\"}'
```
Respons:
```json
{"id": 1, "status": "queued"}
```

### 2. Memproses Ekstraksi Transkrip (Sinkron)
```powershell
curl.exe -X POST http://localhost:3000/api/transcripts/1/process
```
Respons setelah proses LLM selesai:
```json
{"id": 1, "status": "completed", "user_stories_count": 2}
```

### 3. Mengambil Hasil Ekstraksi
```powershell
curl.exe -X GET http://localhost:3000/api/transcripts/1
```

---

## Cara Menjalankan Skrip Evaluasi

Skrip `eval.ts` digunakan untuk menjalankan pengujian berulang terhadap transkrip yang telah ada di database untuk mengukur konsistensi output dan mendeteksi potensi kebocoran topik di luar cakupan (*out-of-scope*).

Perintah dasar:
```bash
# Di dalam direktori project/backend
bun run eval <transcriptId> [jumlahRun] [--label "nama"] [--temperature <angka>] [--keywords "a,b,c"] [--details "x,y,z"]
```

Contoh eksekusi:
```bash
bun run eval 1 5 --label "uji-klinik" --temperature 0 --keywords "whatsapp,pembayaran" --details "tombol,dialog"
```
Hasil evaluasi akan otomatis disimpan di folder `project/backend/eval-results/` dalam tiga format:
- `<timestamp>_<label>-runs.json`: Data mentah seluruh iterasi run.
- `<timestamp>_<label>-runs.csv`: Rekap tabular metrik per run.
- `<timestamp>_<label>-summary.md`: Ringkasan statistik (rata-rata durasi, jumlah story, persentase kebocoran).

---

## Daftar Dokumen pada `docs/`

- **[docs/rancangan-sistem.md](docs/rancangan-sistem.md):** Dokumen rancangan sistem komprehensif yang disusun untuk UTS, mencakup latar belakang persoalan, kendali output, rencana tool & grounding, serta hasil pengujian awal.
- **[docs/status-proyek-2026-11-02.md](docs/status-proyek-2026-11-02.md):** Laporan audit kode dan gap analysis independen per 2 November 2026 yang membandingkan kondisi riil kode dengan spesifikasi materi dosen (K=8).
- **[docs/audit-minggu-1-4.md](docs/audit-minggu-1-4.md):** Catatan evaluasi dan audit mandiri progres pengerjaan pada rentang Minggu 1 hingga Minggu 4.
- **[docs/tugas-mingguan/m1-peta-minat.md](docs/tugas-mingguan/m1-peta-minat.md):** Analisis pemetaan minat dan eksplorasi calon topik persoalan AI Engineering untuk bidang Sistem Informasi.
- **[docs/pengumpulan-lms/](docs/pengumpulan-lms/):** Direktori penampung berkas tugas mingguan untuk LMS, mencakup catatan proses retrospektif, artefak, dan bukti tangkapan layar.

---

## Catatan Keamanan & Integritas Data

1. **Kerahasiaan API Key:** Berkas `.env` telah diabaikan melalui `.gitignore`. Jangan pernah memasukkan API Key OpenRouter atau kredensial database ke dalam commit repositori git. Jika token terlanjur terekspos, segera cabut (*revoke*) token melalui dashboard OpenRouter dan buat token baru.
2. **Karakteristik Data Uji:** Seluruh transkrip percakapan rapat yang digunakan dalam pengujian dan evaluasi repositori ini merupakan data simulasi sintetis dan tidak memuat informasi pribadi (*Personally Identifiable Information* / PII) dari individu atau institusi nyata.
