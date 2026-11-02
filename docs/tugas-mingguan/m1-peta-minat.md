# TUGAS MINGGU 1: PETA MINAT DAN CALON PERSOALAN
## Blok A · Fondasi: Memahami Mesinnya

**Mata Kuliah:** Kapita Selekta — AI Engineering (Semester Ganjil 2026/2027)  
**Nama Mahasiswa:** Muhammad Athala Romero  
**NIM:** 10231059  
**Program Studi:** Sistem Informasi, Institut Teknologi Kalimantan  
**Kode Peserta (K):** 8 

---

## 1. Kode Peserta K dan Perhitungan Angka Lingkup Minimum

Berdasarkan rumus penurunan lingkup dari kode peserta pada **Lampiran B (Bagian 1)** dengan nilai **K = 8**:

| Unsur Lingkup | Rumus Modul | Perhitungan (K = 8) | Angka Wajib Minimum |
|---|---|---|:---:|
| **Dokumen Rujukan Minimum** | `5 + (K mod 4)` | `5 + (8 mod 4) = 5 + 0` | **5 dokumen** |
| **Kasus Uji Minimum** | `12 + (K mod 6)` | `12 + (8 mod 6) = 12 + 2` | **14 kasus** |
| **Tool Minimum** | `2 + (K mod 2)` | `2 + (8 mod 2) = 2 + 0` | **2 tool** |
| **Mode Keluaran Tambahan** | Wajib jika K genap | `8 mod 2 == 0` (K genap) | **Wajib 1 mode ringkas** |
| **Jumlah Rekan Peer Review** | 2 pada UTS, 2 pada M12 | Sesuai ketentuan umum | **2 rekan** |

---

## 2. Tahap READ — Tiga Persoalan, Satu Peta

### Tabel Pemetaan Disiplin Ilmu
Analisis terhadap tiga contoh persoalan dari modul untuk menentukan batas disiplin ilmu yang tepat:

| # | Persoalan | Disiplin yang Tepat | Alasan Berdasarkan Karakteristik Masalah |
|:---:|---|---|---|
| 1 | Menghitung sisa kuota SKS mahasiswa dari transkrip | **Rekayasa Perangkat Lunak / Basis Data** | Aturannya deterministik dan pasti; cukup diselesaikan dengan kueri SQL atau logika pemrograman biasa tanpa toleransi kesalahan. |
| 2 | Memperkirakan jumlah pengunjung pelabuhan bulan depan dari data 5 tahun | **Machine Learning / Data Science** | Merupakan persoalan prediksi deret waktu (*time-series forecasting*) berbasis pola historis data numerik terstruktur, bukan rekayasa prompt model bahasa. |
| 3 | Meringkas 40 laporan survei lapangan menjadi tabel temuan berformat tetap | **AI Engineering** | Masukan berupa teks bahasa alami semi-terstruktur bervolume menengah yang membutuhkan penafsiran semantik untuk diekstraksi ke skema tetap. |

### Pertanyaan Penutup READ
> **Pertanyaan:** Persoalan nomor berapa yang berubah jawabannya kalau jumlah datanya menjadi 40.000, bukan 40? Jelaskan.

**Jawaban:**
Persoalan **Nomor 3** (meringkas laporan survei).  
- **Penjelasan:** Untuk 40 laporan, pemrosesan dapat dilakukan dengan mengirimkan teks langsung ke model bahasa besar (baik per batch atau beberapa pemanggilan langsung). Namun, jika jumlahnya melonjak menjadi 40.000 laporan, pendekatan AI Engineering naif (mengirim semua teks langsung) akan gagal karena keterbatasan jendela konteks, latensi yang tidak realistis, dan pembengkakan biaya token yang sangat drastis. Persoalan tersebut akan bergeser membutuhkan pipeline Data Engineering terdistribusi, ekstraksi berbasis batch bertingkat, atau klasterisasi/indeksasi sebelum dapat diringkas oleh model.  
- Sebaliknya, Persoalan 1 (kuota SKS) dan Persoalan 2 (prediksi deret waktu) tetap berada di ranah disiplin yang sama (kueri basis data relasional dan model ML prediktif) karena sistem basis data dan algoritma regresi dirancang secara alami untuk menangani puluhan ribu baris data tanpa perubahan paradigma.

---

## 3. Tahap BREAK — Pertanyaan yang Sama, Jawaban yang Berbeda

Percobaan eksplorasi perilaku awal model bahasa besar menggunakan antarmuka percakapan (LLM Chat Interface) dengan contoh topik seputar Sistem Informasi / kurikulum kampus:

| # | Skenario Percobaan | Prediksi Anda | Hasil Sebenarnya |
|:---:|---|---|---|
| 1 | Ajukan satu pertanyaan faktual sempit tentang bidang Anda ke model, tiga kali, di percakapan **baru** tiap kali (misal: "Apa kepanjangan dan prinsip utama INVEST dalam User Story?") | Model akan memberikan substansi jawaban yang sama (makna akronim tidak berubah), tetapi struktur kalimat dan pemilihan contoh kata akan sedikit bervariasi antar sesi. | Tepat. Ketiga sesi menjawab kepanjangan INVEST dengan benar, namun penyusunan daftar penjelasan dan panjang kalimat penjelas berbeda di tiap percakapan baru. |
| 2 | Ajukan pertanyaan tentang peristiwa yang terjadi bulan lalu (misal: pengumuman pembaruan sistem akademik kampus atau regulasi teknologi terkini bulan lalu) | Model akan menolak atau menyatakan tidak memiliki informasi terkini karena adanya batasan tanggal pemotongan pengetahuan (*knowledge cut-off*), kecuali jika memiliki fitur web browsing aktif. | Model menyatakan bahwa basis pengetahuannya terbatas hingga batas cut-off pelatihan dan tidak memiliki data peristiwa real-time bulan lalu, menyarankan untuk memeriksa pengumuman resmi. |
| 3 | Ajukan pertanyaan tentang dokumen internal kampus Anda yang tidak pernah dipublikasikan (misal: "Sebutkan klausul pasal 4 SOP internal seleksi asisten laboratorium SI ITK tahun ini") | Model akan menolak menjawab karena dokumen bersifat privat internal dan tidak pernah diunggah secara publik ke internet. | Model berusaha menjawab secara normatif dengan menebak struktur SOP umum yang terdengar sangat meyakinkan dan formal, meskipun klausul pasal yang disebutkan sepenuhnya fiktif dan bukan isi SOP asli. |
| 4 | Tanya hal yang jawabannya tidak ada, misalnya biografi tokoh yang Anda karang namanya (misal: "Siapakah Prof. Bambang Suryonoto penemu framework arsitektur enterprise SI-ITK?") | Model akan mendeteksi bahwa nama tersebut tidak ada dalam catatan sejarah atau database literatur dan menyatakan tidak mengenalnya. | Model mengalami halusinasi (*confabulation*): model justru mengarang narasi biografi lengkap yang meyakinkan, menyebutkan bahwa tokoh tersebut adalah akademisi pakar sistem informasi terkemuka, padahal nama dan framework tersebut sepenuhnya karangan. |

### Analisis Perbedaan Nomor 3 dan Nomor 4
> **Pertanyaan:** Pada nomor mana model **tidak tahu bahwa ia tidak tahu**? Jelaskan bedanya.

**Jawaban:**
Model **tidak tahu bahwa ia tidak tahu** terutama tampak pada **Nomor 4** (dan sebagian Nomor 3).  
- **Perbedaan Mendasar:**
  - Pada **Nomor 3** (dokumen internal yang tidak terbit), model mengenali pola kata "SOP", "seleksi asisten", dan "laboratorium", lalu mencoba merangkai kalimat prosedural yang terdengar masuk akal berdasarkan pola dokumen organisasi sejenis yang pernah dipelajarinya.
  - Pada **Nomor 4** (tokoh fiktif karangan), model sama sekali **tidak memiliki mekanisme verifikasi eksistensi faktual**. Mekanisme autoregresif LLM bekerja semata-mata dengan memprediksi token berikutnya yang paling masuk akal (*plausible continuation*) dari sebuah pertanyaan biografis akademik. Karena format pertanyaannya mengasumsikan sang tokoh ada, model langsung mengarang pencapaian dan latar belakang tanpa menyadari ketiadaan entitas tersebut di dunia nyata. Ini menunjukkan bahwa kelancaran bahasa (*fluency*) tidak sama dengan kebenaran faktual (*truthfulness*).

---

## 4. Tahap BUILD — Peta Persoalan Pribadi

### Calon Persoalan 1: Asisten Ekstraksi Kebutuhan Fungsional (User Story & Gherkin) dari Transkrip Rapat *(Tema Terpilih)*

| Unsur | Uraian Lengkap |
|---|---|
| **Siapa yang mengalaminya** | *System Analyst* (SA) dan *Business Analyst* (BA) dalam tim pengembang perangkat lunak yang bertugas mendokumentasikan kebutuhan pengguna dari sesi rapat wawancara/elisitasi. |
| **Bagaimana persoalan itu diselesaikan sekarang** | Analis mencatat poin secara manual saat memandu rapat atau merekam percakapan, membaca ulang transkrip teks kalimat demi kalimat, lalu mengetik draf User Story dan Acceptance Criteria satu per satu di dokumen atau backlog board. |
| **Mengapa cara sekarang tidak memadai** | Memakan waktu berjam-jam untuk transkrip panjang; rentan kesalahan manusia di mana batasan penting atau fitur tertunda terlewat; serta sering menghasilkan format yang tidak konsisten (melanggar kaidah INVEST atau format Gherkin). |
| **Apa yang menjadi bukti bahwa sistem berhasil** | Sistem mampu mengonversi transkrip mentah menjadi daftar User Story modular (satu peran per cerita) beserta Acceptance Criteria berformat Gherkin (*Given-When-Then*), dengan daftar fitur tertunda teridentifikasi di medan `out_of_scope` tanpa halusinasi elemen antarmuka palsu. |
| **Sumber dokumen apa yang Anda miliki dan sah dipakai** | Kumpulan transkrip teks percakapan rapat simulasi dan nyata berbahasa Indonesia (tanpa data pribadi/sensitif), panduan penulisan User Story berbasis prinsip INVEST, dan standar sintaks Gherkin. |
| **Satu alasan mengapa AI mungkin bukan jawabannya** | Model bahasa bekerja berdasarkan probabilitas token yang masuk akal (*plausible*) dan tidak memiliki pemahaman bisnis absolut; jika transkrip memuat kesepakatan ambigu, model berisiko salah menafsirkan prioritas arsitektur sistem sehingga validasi manusia (*human-in-the-loop*) tetap mutlak dibutuhkan. |

---

### Calon Persoalan 2: Asisten Audit Kepatuhan Dokumen Standar Operasional Prosedur (SOP) Internal Layanan SI

| Unsur | Uraian Lengkap |
|---|---|
| **Siapa yang mengalaminya** | Tim Penjaminan Mutu / Auditor Tata Kelola SI di lingkungan unit layanan institusi atau kampus. |
| **Bagaimana persoalan itu diselesaikan sekarang** | Membaca dokumen laporan pelaksanaan kegiatan secara manual, kemudian membandingkan pasal demi pasal dengan dokumen standar ISO/SOP unit kerja. |
| **Mengapa cara sekarang tidak memadai** | Proses audit memakan waktu berminggu-minggu; sulit melacak deviasi prosedur minor pada lampiran kerja yang berjumlah puluhan halaman. |
| **Apa yang menjadi bukti bahwa sistem berhasil** | Sistem mampu memetakan pasal SOP dengan laporan kegiatan dan menandai secara objektif bukti temuan (*evidence*) atau potensi ketidaksesuaian (*non-conformity*). |
| **Sumber dokumen apa yang Anda miliki dan sah dipakai** | Kumpulan dokumen SOP layanan akademik/laboratorium publik institusi dan laporan evaluasi publik non-rahasia. |
| **Satu alasan mengapa AI mungkin bukan jawabannya** | Kesimpulan audit membutuhkan kepastian regulasi hukum dan bukti verifikasi fisik; halusinasi pasal oleh model dapat berakibat fatal pada legitimasi audit institusi. |

---

### Calon Persoalan 3: Peringkas Keluhan Layanan Helpdesk Mahasiswa Menjadi Tiket Isu Terklasifikasi

| Unsur | Uraian Lengkap |
|---|---|
| **Siapa yang mengalaminya** | Staf pengelola Helpdesk TI / Layanan Akademik kampus yang menerima ratusan tiket aduan mahasiswa per minggu. |
| **Bagaimana persoalan itu diselesaikan sekarang** | Staf membaca satu per satu pesan keluhan di portal helpdesk, lalu mengelompokkan kategori (jaringan, akun SIAKAD, fasilitas) dan menentukan prioritas penanganan secara manual. |
| **Mengapa cara sekarang tidak memadai** | Penumpukan tiket saat masa registrasi/KRS; penentuan urgensi tiket menjadi subjektif dan lambat diteruskan ke teknisi terkait. |
| **Apa yang menjadi bukti bahwa sistem berhasil** | Sistem mampu mengekstrak inti persoalan dari narasi keluhan mahasiswa yang panjang dan mengklasifikasikannya ke kategori baku helpdesk serta level urgensi secara konsisten. |
| **Sumber dokumen apa yang Anda miliki dan sah dipakai** | Rekaman riwayat tiket aduan helpdesk publik yang telah disensor dari data identitas pribadi (PVI). |
| **Satu alasan mengapa AI mungkin bukan jawabannya** | Sebagian besar tiket sebenarnya berpola sederhana dan berulang; persoalan perutean tiket rutin sering kali lebih efisien dan murah diselesaikan dengan pemetaan kata kunci atau aturan kategori statis tanpa biaya pemanggilan API model bahasa. |

---

### Perurutan Calon dan Alasan Pemilihan Tema
1. **Peringkat 1 (Dipilih):** Asisten Ekstraksi User Story dan Acceptance Criteria dari Transkrip Rapat.
2. **Peringkat 2:** Asisten Audit Kepatuhan Dokumen Standar Operasional Prosedur (SOP) Layanan SI.
3. **Peringkat 3:** Peringkas Keluhan Layanan Helpdesk Mahasiswa Menjadi Tiket Isu Terklasifikasi.

**Alasan Memilih dan Mempertahankan Calon Persoalan 1 Sampai Minggu 16:**  
Persoalan Nomor 1 merupakan representasi paling tepat dari disiplin AI Engineering untuk mahasiswa Sistem Informasi. Masukan berupa transkrip percakapan rapat adalah data bahasa alami yang sangat cair dan tidak terstruktur (mustahil ditangani aturan deterministik), sementara keluarannya menuntut transformasi semantik ke dalam struktur rekayasa perangkat lunak formal (INVEST dan Gherkin). Kasus ini memiliki kriteria evaluasi keberhasilan yang jelas, batas lingkup yang dapat dikendalikan secara bertahap, serta langsung menjawab kebutuhan nyata pada fase analisis perancangan sistem.

---

## 5. Tantangan Wajib Minggu 1

> **Tantangan:** Temukan satu contoh nyata di kampus atau bidang Anda tempat AI generatif sedang dipakai untuk persoalan yang salah. Jelaskan mengapa ia salah dan apa yang seharusnya dipakai.

**Kasus Nyata yang Diamati:**  
Penggunaan chatbot berbasis LLM untuk **pengecekan prasyarat kelulusan mata kuliah dan kalkulasi sisa SKS mahasiswa** pada portal informasi akademik.

**Mengapa Ini Salah:**  
Aturan prasyarat mata kuliah, akumulasi nilai, dan batas SKS adalah persoalan yang sepenuhnya **deterministik dan berbasis aturan baku (*rule-based*)**. Dalam kurikulum akademik, prasyarat kelulusan diatur oleh tabel relasi matematis yang pasti (misal: "Lulus Struktur Data dengan nilai minimal C"). Ketika persoalan ini diserahkan kepada LLM tanpa grounding kueri basis data langsung, model rentan berhalusinasi menyatakan seorang mahasiswa sudah memenuhi syarat hanya karena susunan kalimatnya terdengar meyakinkan. Kesalahan informasi pada domain ini berisiko merugikan masa studi mahasiswa secara fatal.

**Apa yang Seharusnya Dipakai:**  
Sistem seharusnya menggunakan **kueri basis data relasional (SQL) atau modul logika pemrograman biasa** pada Sistem Informasi Akademik (SIAKAD). Logika kondisional sederhana (`IF grade >= 'C' AND sks_total >= 144`) jauh lebih murah, berlatensi milidetik, tidak membutuhkan biaya token API, dan memberikan jaminan akurasi 100% tanpa risiko halusinasi.

---

## 6. Daftar Periksa Mandiri — Minggu 1

- [x] Kode peserta K dicatat (K = 8) dan seluruh angka lingkup dihitung
- [x] Tabel READ terisi lengkap dengan alasan dan pertanyaan penutup terjawab
- [x] Empat baris BREAK punya kolom prediksi terisi sebelum percobaan serta analisis pembeda
- [x] Tiga calon persoalan terisi lengkap enam unsur
- [x] Tantangan wajib terjawab dengan contoh nyata dan solusi yang tepat
- [x] Kerangka tugas disusun sesuai panduan modul M1
