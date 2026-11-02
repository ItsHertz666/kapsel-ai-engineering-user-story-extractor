# DOKUMEN RANCANGAN SISTEM
## ASISTEN EKSTRAKSI USER STORY & ACCEPTANCE CRITERIA DARI TRANSKRIP RAPAT

**Mata Kuliah:** Kapita Selekta — AI Engineering (Semester Ganjil 2026/2027)  
**Nama Mahasiswa:** Muhammad Athala Romero  
**NIM:** 10231059  
**Program Studi:** Sistem Informasi, Institut Teknologi Kalimantan  
**Kode Peserta (K):** 8  
**Batas Lingkup Minimum K=8:**
- Dokumen Rujukan Minimum: 5 dokumen (`5 + (8 mod 4)`) 
- Kasus Uji Minimum: 14 kasus (`12 + (8 mod 6)`)
- Tool Minimum: 2 tool (`2 + (8 mod 2)`)
- Mode Keluaran Tambahan: Wajib satu mode keluaran ringkas (karena K genap)

---

### Ringkasan Eksekutif
Dokumen ini menyajikan rancangan teknis asisten kecerdasan buatan generatif yang bertugas mengekstrak artefak kebutuhan fungsional perangkat lunak berupa *User Story* (standar INVEST) dan *Acceptance Criteria* (format Gherkin) secara otomatis dari transkrip percakapan rapat informal berbahasa Indonesia. Sistem dibangun di atas arsitektur backend Bun, PostgreSQL, dan Drizzle ORM yang mengintegrasikan model bahasa besar melalui model gateway OpenRouter (`openai/gpt-oss-120b`) dengan parameter suhu deterministik (`temperature: 0`) serta skema kontrak JSON yang ketat. Laporan ini mendokumentasikan alur pemrosesan data, kendali mutu keluaran, pengakuan jujur terhadap *gap* teknis pada lapisan *tool calling* dan *grounding* (RAG) yang belum diimplementasikan, bukti empiris hasil pengujian riil dari evaluasi berulang, serta rencana mitigasi risiko menuju implementasi penuh pada paruh kedua semester.

---

## 1. Persoalan

### 1.1 Konteks dan Pengguna Sasaran
Dalam siklus hidup pengembangan perangkat lunak, tahap elisitasi kebutuhan sering kali dilakukan melalui sesi rapat wawancara atau diskusi kelompok terarah (*focus group discussion*) antara tim pengembang dan pemangku kepentingan (*stakeholders*). Pihak yang mengalami kendala utama dalam alur ini adalah *System Analyst* (SA) dan *Business Analyst* (BA). Peran ini memikul tanggung jawab krusial untuk menyaring, memilah, dan menerjemahkan rekaman percakapan rapat yang panjang dan tidak terstruktur menjadi dokumen spesifikasi kebutuhan fungsional formal yang siap dieksekusi oleh tim pengembang.

### 1.2 Praktik Penyelesaian Saat Ini
Saat ini, proses elisitasi diselesaikan secara konvensional dan manual. Seorang analis mencatat poin-poin penting sembari memandu jalannya rapat, atau merekam keseluruhan sesi pertemuan, mengonversinya menjadi transkrip teks mentah, lalu membaca ulang rekaman kalimat demi kalimat. Dari penelusuran manual tersebut, analis merumuskan User Story satu per satu dan menyusun kriteria keberterimaannya secara bertahap menggunakan editor teks atau manajemen tiket backlog.

### 1.3 Alasan Ketidakmemadaian Cara Konvensional
Pendekatan manual tersebut menghadapi tiga kendala pokok yang menghambat produktivitas dan kualitas rekayasa perangkat lunak:
1. **Inefisiensi Waktu dan Beban Kognitif:** Satu sesi rapat elisitasi berdurasi satu jam menghasilkan ribuan kata percakapan mentah. Analis membutuhkan waktu berjam-jam hanya untuk menyisir teks demi memisahkan kebutuhan teknis esensial dari diskusi periferal dan obrolan santai.
2. **Risiko Informasi Terlewat (*Human Error*):** Percakapan manusia bersifat dinamis dan sering kali memuat kesepakatan implisit atau batasan cakupan (*out-of-scope*) yang tersebar di berbagai bagian percakapan. Analis manusia sangat rentan melewatkan butir kesepakatan kritis saat harus menyaring teks bervolume besar di bawah tekanan tenggat waktu proyek.
3. **Inkonsistensi Format Artefak:** User Story yang disusun secara terburu-buru sering kali melanggar prinsip INVEST (*Independent, Negotiable, Valuable, Estimable, Small, Testable*), dan Acceptance Criteria kerap kali tidak diformulasikan dalam sintaks baku Gherkin (*Given-When-Then*). Inkonsistensi format ini menimbulkan multitafsir, memperlambat proses estimasi sprint, dan memicu friksi komunikasi antara tim pengembang dengan tim *Quality Assurance* (QA).

---

## 2. Mengapa AI Generatif

### 2.1 Kebutuhan Pemrosesan Bahasa Alami Tidak Terstruktur
Masukan utama dalam persoalan ini adalah transkrip percakapan rapat informal berbahasa Indonesia. Teks percakapan manusia memiliki sifat inheren yang sangat tidak terstruktur: dipenuhi ragam bahasa lisan, basa-basi pembuka, interupsi antarpeserta, perdebatan alternatif solusi, serta penggunaan istilah teknis yang bercampur dengan analogi lepas. Persoalan semacam ini **secara fundamental tidak dapat diselesaikan menggunakan basis data relasional biasa, formulir terstruktur, maupun aturan berbasis ekspresi reguler (Regex/IF-ELSE)**. Pendekatan berbasis aturan deterministik memerlukan pola sintaksis yang pasti dan kaku, sementara bahasa alami rapat memiliki variasi semantik yang tak terbatas untuk menyatakan maksud kebutuhan yang sama.

### 2.2 Peran Semantik Model Bahasa Besar
Model bahasa besar (*Large Language Model*) berperan sebagai mesin penafsir semantik (*semantic parser*) yang fleksibel namun terarah. Model mampu membaca keseluruhan aliran konteks transkrip, mengabaikan percakapan yang tidak relevan dengan sistem, mengidentifikasi peran pengguna (*role*), mengekstrak kemampuan fungsional yang diinginkan (*feature*), menyimpulkan nilai bisnis yang mendasarinya (*benefit*), serta memproyeksikan skenario operasional ke dalam struktur logika Gherkin (*Given-When-Then*). Kemampuan penalaran kontekstual ini menjembatani jurang antara bahasa alami manusia yang cair dan kebutuhan dokumentasi rekayasa perangkat lunak yang presisi.

### 2.3 Batasan AI dan Keharusan Keterlibatan Manusia (*Human-in-the-Loop*)
Meskipun AI generatif unggul dalam pemilahan bahasa dan restrukturisasi teks, model bahasa pada hakikatnya bekerja atas dasar probabilitas kelanjutan token yang masuk akal (*plausible*), bukan atas dasar verifikasi kebenaran faktual atau pertimbangan bisnis strategis. Model tidak memiliki akuntabilitas organisasi apabila terjadi kesalahan interpretasi fungsional. Oleh karena itu, arsitektur sistem ini secara sadar menempatkan AI hanya sebagai asisten pembuat draf awal (*draft generator*). Analis manusia **tetap mutlak dilibatkan secara aktif (*human-in-the-loop*)** untuk memvalidasi, mengoreksi, dan memberikan persetujuan (*approval*) terhadap setiap draf User Story sebelum artefak tersebut disahkan ke dalam repositori backlog proyek.

---

## 3. Rancangan Sistem

### 3.1 Alur Pemrosesan End-to-End
Sistem dirancang dengan arsitektur berorientasi layanan yang menghubungkan antarmuka klien, server backend berbasis runtime Bun, basis data relasional PostgreSQL, dan model gateway OpenRouter. 

Alur pemrosesan data berjalan sebagai berikut:
1. Pengguna atau analis mengirimkan teks transkrip percakapan rapat melalui permintaan HTTP `POST /api/transcripts`.
2. Backend menerima muatan data, melakukan validasi payload awal, dan menyimpannya ke dalam tabel `transcripts` di PostgreSQL dengan status awal `queued`.
3. Pengguna memicu pemrosesan ekstraksi melalui endpoint `POST /api/transcripts/:id/process`. Server segera memperbarui status transkrip menjadi `processing` untuk mencegah eksekusi ganda.
4. Modul `extractor` mengambil teks mentah transkrip, menyusun pesan sistem terstruktur (`SYSTEM_PROMPT`), dan melakukan pemanggilan asinkron ke model gateway OpenRouter (`openai/gpt-oss-120b`) dengan parameter suhu deterministik (`temperature: 0`).
5. Respons keluaran mentah dari model diterima dan dialirkan ke fungsi validasi `parseModelOutput`. Fungsi ini membersihkan format teks, memvalidasi integritas struktur JSON, dan memicu mekanisme *retry loop* otomatis hingga 3 kali percobaan apabila keluaran model tidak sesuai skema kontrak.
6. Setelah data tervalidasi, backend membuka transaksi atomik basis data: menghapus rekaman lama jika ada, menyisipkan butir User Story ke tabel `user_stories` dengan status `draft`, menyisipkan butir Acceptance Criteria ke tabel `acceptance_criteria` dengan nomor urut `sort_order`, memperbarui kolom `raw_ai_output` dengan data ekstrasi mentah, serta memperbarui status transkrip menjadi `completed`.
7. Seluruh hasil ekstraksi terstruktur yang telah tersimpan dapat diakses secara relasional melalui endpoint `GET /api/transcripts/:id`.

### 3.2 Diagram Alur Sistem
```
[Pengguna / SA] 
       │ 1. POST /api/transcripts (raw_text)
       ▼
[Backend: Bun + Drizzle ORM] ──(Simpan)──► [PostgreSQL: transcripts (status: queued)]
       │
       │ 2. POST /api/transcripts/:id/process (Update: processing)
       ▼
[Extractor Service] ──(API Call: System Prompt + Temp 0)──► [OpenRouter: gpt-oss-120b]
       │                                                              │
       │ 3. JSON Output Mentah ◄──────────────────────────────────────┘
       ▼
[Validasi & Retry: parseModelOutput (max 3x)]
       │
       │ 4. Transaksi Atomik DB
       ▼
[PostgreSQL] ──► Insert `user_stories` (status: draft) + `raw_ai_output`
             ──► Insert `acceptance_criteria` (Gherkin: given, when, then)
             ──► Update `transcripts` (status: completed)
```

---

## 4. Kendali Output

### 4.1 Skema Kontrak JSON
Untuk menjamin bahwa keluaran model bahasa besar dapat diperlakukan sebagai komponen komputasi yang terprediksi oleh sistem hilir, keluaran model dikunci menggunakan kontrak skema JSON terstruktur (`ExtractorOutput`):

```json
{
  "out_of_scope": ["string"],
  "user_stories": [
    {
      "role": "string",
      "feature": "string",
      "benefit": "string",
      "acceptance_criteria": [
        {
          "given": "string",
          "when": "string",
          "then": "string"
        }
      ]
    }
  ]
}
```

### 4.2 Nilai Sah dan Batasan Semantik
1. **Array `out_of_scope`:** Berisi daftar ringkas fitur atau topik yang dalam percakapan dinyatakan ditunda, belum menjadi prioritas sprint, atau disepakati berada di luar cakupan sistem. Model diwajibkan mengidentifikasi dan mengisi medan ini terlebih dahulu sebagai pembatas negatif sebelum merumuskan kebutuhan fungsional.
2. **Medan `role`, `feature`, dan `benefit`:** Setiap medan wajib berupa string bersih yang hanya memuat frasa inti, tanpa menyertakan kata pengantar template seperti "Sebagai", "Saya ingin", "Aku ingin", "Agar", maupun "Supaya". Ketentuan ini menjaga modularitas data saat ditampilkan pada antarmuka pengguna.
3. **Satu Peran per User Story:** Sistem melarang penggabungan dua peran dalam satu User Story. Jika dua peran terlibat dalam satu alur kerja yang sama (misalnya karyawan mengajukan dan atasan menyetujui), model diwajibkan memecahnya menjadi dua User Story terpisah.
4. **Struktur `acceptance_criteria`:** Setiap User Story wajib memiliki 1 hingga 4 butir kriteria keberterimaan dalam format objek Gherkin murni (`given`, `when`, `then`). Seluruh skenario dilarang keras mengarang elemen antarmuka spesifik (seperti nama tombol atau formulir) maupun teknologi detail (seperti GPS) yang tidak disebutkan di transkrip.

### 4.3 Penanganan Keluaran Tidak Valid (*Fault Tolerance*)
Implementasi pada `backend/src/services/extractor.ts` menerapkan pertahanan berlapis untuk menangani deviasi keluaran model:
- **Pembersihan Fences dan Isolasi Objek:** Fungsi `parseModelOutput` menghapus penanda markdown code fences (\`\`\`json) dan mengekstrak substring antara kurung kurawal pembuka `{` pertama dan kurung kurawal penutup `}` terakhir. Hal ini mengisolasi objek JSON dari teks basa-basi yang kerap diselipkan model.
- **Pembersihan Awalan Otomatis:** Ekspresi reguler *case-insensitive* memangkas sisa-sisa awalan template secara otomatis jika model masih menghasilkan kata "Sebagai", "Saya ingin", atau "Agar".
- **Mekanisme Perulangan (*Retry Loop*):** Apabila parsing JSON gagal atau struktur array tidak memenuhi syarat, server tidak langsung memutus proses, melainkan mencatat galat dan mengulangi pemanggilan ke model hingga 3 kali percobaan.
- **Keterbatasan Penanganan Saat Ini:** Jika model terputus di tengah token sebelum menutup kurung kurawal atau tetap mengembalikan respons malformed setelah 3 kali percobaan, sistem menandai transkrip dengan status `failed`, merekam 300 karakter pertama respons galat ke database, dan melempar eksepsi.

---

## 5. Tool

### 5.1 Kondisi Implementasi Saat Ini
Pada implementasi yang berjalan saat ini, sistem melakukan interaksi eksternal melalui pemanggilan protokol HTTP langsung ke antarmuka pemrograman aplikasi OpenRouter (`https://openrouter.ai/api/v1/chat/completions`) menggunakan fungsi `fetch` bawaan runtime Bun.

### 5.2 Analisis Kritis terhadap Definisi Tool
Berdasarkan modul pembelajaran Minggu 6 dan Blok D (Sistem Agentic), **pemanggilan API ke OpenRouter saat ini belum memenuhi kriteria *Tool Calling* / *Function Calling* yang sesungguhnya**. Dalam paradigma AI Engineering, sebuah *tool* didefinisikan sebagai fungsi eksternal terdaftar yang deskripsi skemanya diberikan kepada model bahasa, di mana model secara otonom menentukan kapan harus memanggil fungsi tersebut, memilih alat yang tepat, dan merumuskan argumen keluarannya untuk dieksekusi oleh lingkungan aplikasi. Pemanggilan tunggal dari backend ke OpenRouter yang ada saat ini murni merupakan pemanggilan sistem ke penyedia model (*model gateway call*), bukan orkestrasi pemanggilan alat oleh agen AI.

### 5.3 Rencana Pembangunan Tool (Blok D: Minggu 10–13)
Untuk memenuhi ketentuan lingkup minimum kode peserta $K=8$ yaitu **2 tool eksternal**, sistem direncanakan mengintegrasikan dua alat interaktif:
1. **Tool 1: *Backlog Issue Exporter* (Integrasi Jira/GitLab API):** Alat yang dipanggil oleh agen untuk menerbitkan User Story dan kriteria Gherkin yang telah disetujui menjadi tiket isu pada sistem pelacak tugas tim.
2. **Tool 2: *Project Glossary & Domain Term Checker*:** Alat verifikasi kamus domain proyek yang memeriksa apakah istilah teknis yang diekstrak selaras dengan glosarium resmi organisasi.

Tindakan penulisan ke repositori backlog eksternal (Tool 1) dikategorikan sebagai aksi berkonsentrasi tinggi dan memiliki dampak permanen, sehingga **wajib melewati gerbang otorisasi dan persetujuan manual manusia (*human-in-the-loop confirmation*)** sebelum dieksekusi.

---

## 6. Grounding

### 6.1 Pengakuan Keterbatasan (*Gap Analysis*)
Diakui secara terbuka dan objektif bahwa aplikasi saat ini **BELUM memiliki lapisan *Grounding* maupun arsitektur *Retrieval-Augmented Generation* (RAG)**. Ekstraksi kebutuhan yang berjalan sekarang murni mengandalkan *in-context prompt engineering* dan penalaran langsung model bahasa terhadap teks transkrip yang dimasukkan ke dalam jendela konteks tanpa basis dokumen acuan eksternal.

### 6.2 Rencana Pembangunan Lapisan RAG (Minggu 7–9)
Untuk memenuhi batas lingkup minimum kode peserta $K=8$ yaitu **5 dokumen rujukan**, pengembangan lapisan RAG akan direalisasikan melalui tahapan terstruktur:
1. **Pengadaan Dokumen Acuan:** Menghimpun 5 dokumen standar baku: buku panduan penulisan User Story berbasis prinsip INVEST, pedoman formal penulisan Acceptance Criteria sintaks Gherkin industri, kamus istilah rekayasa perangkat lunak, template dokumen spesifikasi kebutuhan perangkat lunak (SRS IEEE), dan pedoman batasan arsitektur sistem.
2. **Strategi Pemotongan (*Chunking*):** Menerapkan pemotongan berbasis batas semantik aturan dan bab dokumen (bukan pemotongan ukuran karakter kaku), disertai tumpang tindih (*overlap*) sebesar 10–15% guna mencegah pemutusan kaidah penulisan di tengah klausa kalimat.
3. **Mekanisme *Retrieval* dan Penolakan Berdasar:** Sistem akan memanfaatkan pencarian vektor kemiripan (*vector similarity search*). Ketika model memvalidasi draf User Story, hasil pencarian chunk rujukan disertakan sebagai konteks pembuktian. Jika suatu rancangan cerita tidak memiliki dasar pemenuhan kriteria dalam dokumen acuan atau transkrip, model diinstruksikan memberikan vonis penolakan tegas: `TIDAK DITEMUKAN DI RUJUKAN`, guna mengeliminasi halusinasi persetujuan.

---

## 7. Bukti Sejauh Ini

Evaluasi keandalan sistem telah diuji secara empiris menggunakan skrip evaluasi otomatis (`backend/scripts/eval.ts`) terhadap basis data transkrip riil, dijalankan berurutan sebanyak 5 kali run per sesi evaluasi dengan model `openai/gpt-oss-120b`. Seluruh angka di bawah ini merujuk langsung pada laporan pengujian yang tersimpan di direktori `backend/eval-results/`:

### 7.1 Keberhasilan Nyata: Transkrip Alur Klinik (Uji `klinik-temp1`)
Berdasarkan berkas ringkasan `20260928_133734_klinik-temp1-summary.md` (Transkrip ID 20, 5 run berhasil):
- **Stabilitas Cakupan:** Sistem mencatatkan **0% kebocoran kata kunci *out-of-scope*** (0 dari 5 run) terhadap filter kata kunci terlarang (`whatsapp`, `notifikasi`, `h-1`, `booking`, `pembayaran`, `bayar`, `websocket`, `polling`). Fitur-fitur yang disepakati ditunda dalam rapat klinik sepenuhnya berhasil diabaikan dari cerita pengguna.
- **Kepatuhan Format Template:** Sistem mencatatkan **0% awalan template** (0 dari 5 run), membuktikan efektivitas regex sanitasi dan instruksi frasa inti.
- **Modularitas Cerita:** Model menghasilkan rata-rata 8.00 User Story per run (rentang 6 hingga 9 cerita) dengan rata-rata 1.50 Acceptance Criteria per cerita, berhasil memisahkan peran antara dokter, perawat, dan staf administrasi ke dalam cerita yang berdiri sendiri.

### 7.2 Kegagalan Nyata yang Ditemukan Sendiri: Transkrip Perpustakaan (Uji `perpus-v3-temp0`)
Berdasarkan berkas ringkasan `20260928_140444_perpus-v3-temp0-summary.md` dan data tabular `20260928_140444_perpus-v3-temp0-runs.csv` (Transkrip ID 19, 5 run berhasil, `temperature: 0`):
- **Tingkat Kegagalan Kebocoran Cakupan:** Ditemukan **kebocoran kata kunci *out-of-scope* sebesar 60.0% (3 dari 5 run)** meskipun parameter suhu telah disetel ke angka nol (`temperature: 0`).
- **Rincian Kasus Kegagalan:** Dalam skenario transkrip rapat perpustakaan, para peserta rapat menyepakati bahwa fitur pemesanan dan reservasi buku ditunda ke fase rilis berikutnya. Model dengan tepat mencatat `"fitur reservasi buku"` di dalam array `out_of_scope`. Namun, saat merumuskan skenario Acceptance Criteria, kata terlarang tetap bocor dan muncul di teks kriteria:
  - *Run 3:* Kata *"pesan"* bocor pada Story 3 AC 2 klausa `then`.
  - *Run 4:* Kata *"pesan"* bocor pada Story 1 AC 2 klausa `then`.
  - *Run 5:* Kata *"reservasi"*, *"dipesan"*, dan *"pesan"* bocor sekaligus pada Story 4 AC 1 (klausa `given`) dan Story 4 AC 3 (klausa `given` dan `then`).
- **Analisis Akar Masalah (*Root Cause*):** Instruksi negatif pada prompt sistem (*"TIDAK BOLEH disebut sebagai langkah apa pun di dalam Acceptance Criteria"*) terbukti tidak memadai untuk mengendalikan pembentukan kalimat dinamis pada LLM secara konsisten. Ketika model menyusun alur pengujian Gherkin yang mengalir, konsep yang berkaitan dengan pemesanan tetap muncul secara laten. Hal ini membuktikan bahwa pembatasan berbasis instruksi prompt semata membutuhkan lapisan pengaman tambahan berupa filter pasca-pemrosesan deterministik atau validasi berbasis grounding dokumen.

---

## 8. Risiko dan Rencana

### 8.1 Analisis Risiko Sistem Saat Ini
1. **Halusinasi Detail Desain Antarmuka (*UI Fabrication*):** Model terkadang masih mengarang elemen antarmuka grafis spesifik (seperti kata *"tombol"*, *"formulir"*, atau *"dashboard"*) di dalam Acceptance Criteria, padahal detail visual tersebut sama sekali tidak dibicarakan dalam percakapan transkrip.
2. **Inkonsistensi Non-Deterministik Antar-Run:** Meskipun dieksekusi dengan `temperature: 0`, sistem masih memperlihatkan variasi minor pada perumusan kalimat kriteria dan kepatuhan batasan cakupan (seperti terlihat pada kasus kegagalan 60% kebocoran kata kunci perpustakaan).
3. **Ketiadaan Evaluasi Kepatuhan Objektif:** Tanpa adanya lapisan RAG, sistem belum memiliki mekanisme independen untuk memverifikasi apakah User Story yang dihasilkan benar-benar memenuhi seluruh dimensi prinsip INVEST.

### 8.2 Rencana Pengembangan Paruh Kedua (Minggu 9 s.d. Minggu 16)
Penyempurnaan sistem akan dipusatkan pada pencapaian seluruh kriteria kematangan produk:
- **Minggu 9 (Fondasi RAG):** Membangun modul retrieval berbasis dokumen rujukan (5 dokumen sesuai target $K=8$) untuk memvalidasi kepatuhan format INVEST dan kaidah penulisan Gherkin sebelum disimpan ke basis data.
- **Minggu 10–13 (Blok D — Sistem Agentic):** Mengimplementasikan integrasi 2 tool eksternal nyata (*Backlog Issue Exporter* dan *Glossary Validator*) serta menyematkan titik kendali konfirmasi manusia (*human-in-the-loop*) pada setiap tindakan modifikasi sistem.
- **Minggu 14–16 (Blok E — Kematangan dan Pertanggungjawaban):** Menyusun set uji komprehensif minimal 14 kasus uji (`12 + (8 mod 6)`), menghitung metrik evaluasi presisi dan *recall* ekstraksi secara kuantitatif, mengukur latensi serta estimasi biaya operasional riil per 100 pengguna, dan menyusun laporan evaluasi etika profesi yang komprehensif.
