# Audit Kepatuhan Mata Kuliah: Minggu 1 s.d. Minggu 4
**Mata Kuliah:** Kapita Selekta - AI Engineering (Semester Ganjil 2026/2027)  
**Ruang Lingkup Audit:** Modul Minggu 1 sampai Minggu 4, Silabus/RPS, Panduan Tool, Lampiran A–H  
**Sifat Audit:** Baca-saja terhadap kode sumber, struktur proyek, dan artefak repositori  
**Tanggal Audit:** 2026-10-09  

---

## (a) Ringkasan Angka

| Kategori Status | Jumlah Item | Persentase |
|---|:---:|:---:|
| **Terpenuhi** | 7 | 28% |
| **Sebagian** | 3 | 12% |
| **Belum** | 10 | 40% |
| **Tidak bisa dinilai dari kode (Cek Manual)** | 4 | 16% |
| **Perlu Klarifikasi ke Dosen** | 1 | 4% |
| **Total Item Checklist** | **25** | **100%** |

---

## (b) Tabel Checklist Lengkap

| No | Minggu | Kewajiban / Deliverable / Aturan | Sumber Materi | Status | Bukti di Kode / Proyek | Catatan Evaluasi |
|:---:|:---:|---|---|:---:|---|---|
| 1 | M1 | Menghitung dan mencatat angka lingkup minimum dari kode peserta **K** (dokumen, kasus uji, tool, mode keluaran) | `mahasiswa/02-modul-minggu-01-03.md` (1.3 BUILD) & `mahasiswa/lampiran/B-lembar-tema-proyek.md` (Bagian 1) | **Belum** | *Tidak ditemukan file lembar tema / catatan proses di proyek* | Nilai K mahasiswa belum tercatat di file proyek mana pun, sehingga target minimum dokumen, kasus uji, dan tool belum terdefinisi secara resmi. |
| 2 | M1 | Mengisi tabel pemetaan 3 persoalan tahap READ (tanpa AI) | `mahasiswa/02-modul-minggu-01-03.md` (1.3 READ) | **Belum** | *Tidak ada file deliverable M1* | Belum ada artefak/laporan pengerjaan tahap READ Minggu 1. |
| 3 | M1 | Menjalankan 4 percobaan BREAK dengan prediksi diisi sebelum mencoba | `mahasiswa/02-modul-minggu-01-03.md` (1.3 BREAK) | **Belum** | *Tidak ada file deliverable M1* | Belum ada rekaman eksperimen BREAK M1. |
| 4 | M1 | Merumuskan 3 calon persoalan dari bidang keilmuan sendiri (6 unsur per persoalan) | `mahasiswa/02-modul-minggu-01-03.md` (1.3 BUILD) | **Belum** | *Tidak ada file deliverable M1* | Belum ada dokumen 3 calon tema. Meskipun topik saat ini adalah ekstraksi transkrip rapat, perumusan formal 3 calon belum diarsipkan. |
| 5 | M1 | Menjawab tantangan wajib M1 (contoh nyata AI dipakai untuk persoalan yang salah) | `mahasiswa/02-modul-minggu-01-03.md` (1.3 BUILD) | **Belum** | *Tidak ada file deliverable M1* | Belum ada dokumen jawaban tantangan wajib M1. |
| 6 | M1–M4 | Menyusun dan mengumpulkan `catatan-proses.md` setiap minggu sesuai template Lampiran C (maks. 2 halaman) | `mahasiswa/00-daftar-modul.md` & `mahasiswa/lampiran/C-template-catatan-proses.md` | **Belum** | *Tidak ada file `catatan-proses.md`* | Tidak ditemukan file `catatan-proses.md` untuk M1, M2, M3, maupun M4 di repositori. |
| 7 | M2 | Melakukan pembedahan teks jawaban model ≥5 baris (READ M2) | `mahasiswa/02-modul-minggu-01-03.md` (2.3 READ) | **Belum** | *Tidak ada file deliverable M2* | Belum ada dokumen bedah verifikasi jawaban model. |
| 8 | M2 | Melakukan 6 percobaan BREAK M2 (variasi suhu 0 vs 1, panjang kata, sitasi pasal/halusinasi, uji TIDAK TAHU 5x, needle-in-haystack) | `mahasiswa/02-modul-minggu-01-03.md` (2.3 BREAK) | **Sebagian** | `backend/scripts/eval.ts`, `backend/eval-results/` | Skrip pengujian suhu dan prompt sudah diotomasi di eval.ts, namun 6 eksperimen manual M2 belum dibukukan terpisah. |
| 9 | M2 | Menghitung estimasi biaya masukan/keluaran per pemanggilan dan per 100 pengguna | `mahasiswa/02-modul-minggu-01-03.md` (2.3 BUILD) | **Belum** | *Tidak ada file kalkulasi anggaran* | Belum ada artefak perhitungan rincian token dan proyeksi rupiah/dolar pemakaian. |
| 10 | M2 | Mengumpulkan **Tugas 1: Laporan pengamatan perilaku model** (bobot 5%) | `mahasiswa/00-daftar-modul.md`, `02-modul-minggu-01-03.md` (2.4), `lampiran/H` | **Cek Manual** | *Perlu dicek di LMS / folder tugas mahasiswa* | Tugas resmi bernilai 5% yang dikumpulkan di LMS pada Minggu 2. |
| 11 | M3 | Memiliki repositori pribadi dan file `.gitignore` yang melindungi kredensial | `mahasiswa/lampiran/F-panduan-tool.md` (Bagian 2 & 3) | **Sebagian** | `backend/.gitignore`, `frontend/.gitignore` | File `.gitignore` sudah mengecualikan `.env`, namun folder proyek lokal `project/` saat ini belum diinisialisasi sebagai repositori git (`git status` return fatal not a git repo). Perlu git init dan commit ke private repo. |
| 12 | M3 | API key / kredensial disimpan di luar kode sumber dan tidak di-hardcode | `mahasiswa/02-modul-minggu-01-03.md` (3.1), `lampiran/F` | **Terpenuhi** | `backend/src/services/extractor.ts:L57-62`, `backend/.env` | Kunci dibaca dari `Bun.env.OPENROUTER_API_KEY` dan `Bun.env.OPENROUTER_MODEL`, tidak di-hardcode di kode TypeScript. |
| 13 | M3 | Berhasil melakukan pemanggilan model pertama melalui model gateway dan menyimpan bukti | `mahasiswa/02-modul-minggu-01-03.md` (3.3 & 3.4) | **Terpenuhi** | `backend/src/services/extractor.ts:L52-151`, `backend/src/index.ts:L73-91` | Ekstraksi transkrip berhasil memanggil OpenRouter API melalui model gateway dan menyimpan hasil ke database PostgreSQL. |
| 14 | M3 | Menguji dan membandingkan sedikitnya 2–3 model berbeda pada tugas yang sama | `mahasiswa/02-modul-minggu-01-03.md` (3.3 & 3.4) | **Terpenuhi** | `backend/eval-results/` (`openai/gpt-oss-120b`, log qwen3.8-27b) | Evaluasi tercatat telah menguji model OpenRouter berbeda (termasuk fallback model di extractor.ts). |
| 15 | M3 | Membuat dan memperbarui file `catatan-pemakaian.md` | `mahasiswa/02-modul-minggu-01-03.md` (3.3 BUILD), `lampiran/C` | **Belum** | *File tidak ditemukan di repositori* | File pelacak pemakaian token/biaya berkala belum dibuat. |
| 16 | M3 | Mengikuti Kuis 1 (tertutup, tanpa AI, materi M1–M2) | `mahasiswa/02-modul-minggu-01-03.md` (3.5), `lampiran/H` | **Cek Manual** | *Penilaian kelas tatap muka* | Kuis konsep tatap muka di awal pertemuan M3. |
| 17 | M4 | Menetapkan tema proyek dan mengumpulkan `lembar-tema.md` (Lampiran B) | `mahasiswa/03-modul-minggu-04-06.md` (4.3 BUILD), `lampiran/B` | **Belum** | *File tidak ditemukan di repositori* | Dokumen resmi lembar tema (alasan pemilihan, pengguna sasaran, batas etis, daftar dokumen) belum dibuat. |
| 18 | M4 | Instruksi sistem lengkap pada 6 sumbu (Peran, Konteks, Tugas, Batasan, Contoh, Format) | `mahasiswa/03-modul-minggu-04-06.md` (4.1 Konsep) | **Terpenuhi** | `backend/src/services/extractor.ts:L5-27` | `SYSTEM_PROMPT` memiliki peran (System Analyst), konteks (transkrip rapat informal), tugas (ekstrak kebutuhan fungsional), batasan ketat (out of scope, dilarang halusinasi UI), contoh frasa inti, dan format JSON baku. |
| 19 | M4 | Instruksi sistem terdokumentasi dan memiliki manajemen versi (`instruksi/v1.md` dan `instruksi/CATATAN.md`) | `mahasiswa/03-modul-minggu-04-06.md` (4.3 BUILD) | **Belum** | *Folder `instruksi/` belum ada* | Prompt saat ini langsung diletakkan di dalam kode TypeScript (`extractor.ts`). Belum ada folder terpisah `instruksi/v1.md` dan log perubahan versi `instruksi/CATATAN.md`. |
| 20 | M4 | Model menghasilkan keluaran berformat tetap (JSON skema baku) | `mahasiswa/03-modul-minggu-04-06.md` (Blok B) & `01-spesifikasi-proyek.md` (Lapisan 2) | **Terpenuhi** | `backend/src/services/extractor.ts:L25-45, L153-253` | Format JSON konsisten: `out_of_scope` array, `user_stories` (role, feature, benefit, acceptance criteria Gherkin). |
| 21 | M4 | Parsing model output tangguh terhadap kegagalan / deviasi format (resilience & retry) | `mahasiswa/03-modul-minggu-04-06.md` (4.1 & 5.1) | **Terpenuhi** | `backend/src/services/extractor.ts:L153-200, L283-310` | Pembersihan markdown fence, penanganan JSON substring `{...}`, pembersihan awalan template ("Sebagai", dll), serta perulangan otomatis hingga 3 kali. |
| 22 | M4 | Menguji instruksi pada masukan uji (termasuk kasus batas / masukan yang harus ditolak) | `mahasiswa/03-modul-minggu-04-06.md` (4.3 BUILD) | **Terpenuhi** | `backend/scripts/eval.ts`, `backend/eval-results/` | Pengujian berulang dijalankan dengan keywords uji negatif (out-of-scope leak) dan details (karangan UI). |
| 23 | M4 | Penyimpanan status data dan relasi entitas ke basis data | `mahasiswa/01-spesifikasi-proyek.md` (Lapisan 2) | **Terpenuhi** | `backend/src/db/schema.ts`, `backend/drizzle/` | Tabel `transcripts`, `user_stories`, dan `acceptance_criteria` dengan PostgreSQL Drizzle ORM, status transkrip (queued, processing, completed, failed), dan foreign key cascade. |
| 24 | M4 | Antarmuka Pengguna / Frontend yang terhubung | Modul M4 & spesifikasi proyek umum | **Sebagian** | `project/frontend/` | SvelteKit telah diinisialisasi dengan TailwindCSS dan routing dasar, namun halaman utama (`src/routes/+page.svelte`) masih berupa template bawaan dan belum memanggil API backend. |
| 25 | M4 | Status Pemanggilan Tool Eksternal (Lapisan 2) | `mahasiswa/01-spesifikasi-proyek.md` (Lapisan 2) & `03-modul-minggu-04-06.md` | **Perlu Klarifikasi** | `backend/src/services/extractor.ts` | Di Spesifikasi Proyek (Lapisan 2 Minggu 4–6), ada kriteria: "Sedikitnya satu tool eksternal dipanggil". Namun di modul rinci, materi tool calling baru diajarkan pada Minggu 6. Perlu konfirmasi apakah pada batas Minggu 4 pemanggilan tool sudah wajib ada atau cukup prompt terstruktur & skema output. |

---

## (c) Daftar Celah (Gap) Terpenting

Berikut adalah urutan celah implementasi dari yang paling kritikal untuk pemenuhan berkas penilaian dosen, beserta estimasi usahanya:

### 1. Ketiadaan Dokumen Wajib: `lembar-tema.md` & Angka Lingkup K (Prioritas: Sangat Tinggi)
- **Deskripsi:** Minggu 4 merupakan batas penguncian tema. Lembar tema (Lampiran B) berisi justifikasi mengapa persoalan ini membutuhkan AI, siapa penggunanya, batas etis sistem, dan perhitungan lingkup K. Ketiadaan lembar ini membuat seluruh dasar pengujian proyek tidak memiliki acuan resmi.
- **Tindakan Perbaikan:** Salin template dari `mahasiswa/lampiran/B-lembar-tema-proyek.md` ke file `lembar-tema.md` (atau di folder docs), isi data diri, nomor K, serta latar belakang sistem ekstraktor transkrip rapat.
- **Estimasi Usaha:** Sedang (1–2 jam penulisan konseptual).

### 2. Ketiadaan Berkas `catatan-proses.md` Mingguan (Prioritas: Sangat Tinggi)
- **Deskripsi:** Catatan proses bernilai **25% dari bobot luaran mingguan** dan 6% sikap/profesionalisme (Lampiran H). Tanpa file ini, dosen menganggap pengerjaan tidak dapat ditelusuri atau dinilai nol pada komponen proses.
- **Tindakan Perbaikan:** Susun `catatan-proses.md` untuk Minggu 1, 2, 3, dan 4 mengikuti template `mahasiswa/lampiran/C-template-catatan-proses.md`. Cantumkan eksperimen READ/BREAK yang sudah dilakukan, prompt yang digunakan, serta evaluasi hasil.
- **Estimasi Usaha:** Sedang (2–3 jam).

### 3. Folder Proyek Belum Menjadi Repositori Git Pribadi (Prioritas: Tinggi)
- **Deskripsi:** Lampiran F (Panduan Tool) mewajibkan proyek disimpan dalam private repository dengan `.gitignore` aktif sejak Minggu 3. Folder `project/` saat ini belum memiliki folder `.git`.
- **Tindakan Perbaikan:** Jalankan `git init` di folder `project/`, pastikan file `.env` diabaikan oleh `.gitignore`, buat commit awal, dan hubungkan ke remote repository privat (GitHub/GitLab).
- **Estimasi Usaha:** Kecil (10–15 menit).

### 4. Manajemen Versi Instruksi Sistem (`instruksi/v1.md` dan `instruksi/CATATAN.md`) (Prioritas: Sedang)
- **Deskripsi:** Modul Minggu 4 mewajibkan instruksi sistem diperlakukan seperti kode: disimpan di file terpisah (`instruksi/v1.md`, `v2.md`) dengan tabel catatan perubahan di `instruksi/CATATAN.md`. Saat ini prompt masih disematkan langsung di dalam kode TypeScript (`extractor.ts`).
- **Tindakan Perbaikan:** Buat direktori `instruksi/`, ekstrak riwayat prompt (v1 awal, v2 dengan pembersihan frasa, v3 dengan penambahan `out_of_scope`), dan catat alasan perubahan serta dampaknya pada pengujian.
- **Estimasi Usaha:** Kecil (30–45 menit).

### 5. Ketiadaan File `catatan-pemakaian.md` (Prioritas: Sedang)
- **Deskripsi:** Modul Minggu 3 mewajibkan pencatatan konsumsi token dan perkiraan biaya sejak pemanggilan pertama untuk bahan laporan evaluasi biaya di akhir semester.
- **Tindakan Perbaikan:** Buat file `catatan-pemakaian.md` yang merangkum tanggal pengujian, model yang dipanggil (`openai/gpt-oss-120b`, `qwen`, dll.), jumlah run evaluasi (misal 5 run per sesi eval), dan estimasi biaya.
- **Estimasi Usaha:** Kecil (20–30 menit).

---

## (d) Daftar "Perlu Klarifikasi ke Dosen"

1. **Kewajiban Tool Calling di Akhir Minggu 4 vs Minggu 6:**
   - *Rujukan:* Pada file `01-spesifikasi-proyek.md` bagian Lapisan 2 (Minggu 4–6), tercantum kriteria *"Sedikitnya satu tool eksternal dipanggil dan hasilnya dipakai dalam jawaban"*. Namun pada silabus dan jadwal mingguan (`00-daftar-modul.md` & `03-modul-minggu-04-06.md`), materi pemanggilan tool (Function / Tool Calling) baru dibahas secara spesifik pada **Minggu 6**.
   - *Poin Klarifikasi:* Apakah deliverable akhir Minggu 4 hanya mencakup penguncian tema, prompt terstruktur berversi, skema keluaran JSON, dan evaluasi ketahanan format; ataukah prototipe pemanggilan tool eksternal sudah harus terintegrasi sejak Minggu 4?
