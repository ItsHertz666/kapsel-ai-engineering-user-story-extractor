# CATATAN PROSES — MINGGU 1

Nama / NIM / K : Muhammad Athala Romero / 10231059 / 8
Tanggal        : [ATHALA ISI: tanggal pengerjaan retrospektif / tanggal pengisian]
Waktu yang saya habiskan minggu ini : [ATHALA ISI: perkiraan jam yang dihabiskan, misal 6] jam

---

## 1. Yang saya kerjakan minggu ini
Minggu ini saya memetakan batas disiplin ilmu AI Engineering dibandingkan Rekayasa Perangkat Lunak dan Data Science, serta menghitung batas lingkup proyek semester berdasarkan nilai K = 8. Saya merumuskan tiga calon persoalan Sistem Informasi dan menetapkan Asisten Ekstraksi User Story & Acceptance Criteria (Gherkin) dari transkrip rapat sebagai fokus utama. Selain itu, saya melakukan pengujian awal terhadap model bahasa untuk mengamati fenomena variasi jawaban dan halusinasi faktual. Sesuai modul, belum ada produk kode yang dibangun pada minggu pertama ini.

## 2. Tahap READ
Yang saya amati :
Masalah rekayasa perangkat lunak tradisional bersifat deterministik (seperti pengecekan kuota SKS), sedangkan persoalan AI Engineering terletak pada penafsiran data bahasa alami semi-terstruktur bervolume menengah menjadi struktur baku.

Yang mengejutkan saya :
[ATHALA ISI: apa yang mengejutkan Anda saat membaca modul / memahami batas AI Engineering vs SE/DS, atau tulis apa yang sudah Anda duga sebelumnya dan mengapa dugaan itu tepat]

## 3. Tahap BREAK
| # | Percobaan | Prediksi saya | Hasil sebenarnya | Prediksi tepat? |
|---|---|---|---|---|
| 1 | Pertanyaan faktual sempit (prinsip INVEST) diajukan 3 kali di sesi baru | Substansi jawaban konsisten benar, namun susunan kalimat dan contoh sedikit bervariasi | Ketiga sesi menjawab kepanjangan INVEST dengan benar, namun format perincian dan panjang kalimat berbeda tiap sesi | ya |
| 2 | Pertanyaan tentang peristiwa bulan lalu (pembaruan sistem akademik kampus) | Model menolak/menyatakan data terbatas cut-off kecuali ada browsing aktif | Model menyatakan basis pengetahuan terbatas cut-off dan menyarankan cek pengumuman resmi | ya |
| 3 | Pertanyaan dokumen internal kampus yang tidak terbit (SOP seleksi asisten lab SI ITK) | Model menolak karena dokumen privat internal dan tidak ada di web | Model mengarang klausul SOP umum yang terdengar sangat meyakinkan dan formal padahal fiktif | tidak |
| 4 | Pertanyaan tokoh fiktif yang dikarang namanya (Prof. Bambang Suryonoto penemu framework SI-ITK) | Model mendeteksi nama tidak ada di literatur dan menyatakan tidak kenal | Model mengalami halusinasi (*confabulation*), mengarang biografi akademisi lengkap tanpa tahu dirinya tidak tahu | tidak |

Prediksi saya yang paling MELESET : nomor [ATHALA ISI: misal 4 (atau 3)]
Apa yang salah dari cara saya berpikir sebelumnya :
[ATHALA ISI: refleksi singkat mengapa sebelumnya Anda mengira model akan menolak menjawab, misalnya mengira model punya mekanisme verifikasi eksistensi fakta di dunia nyata sebelum menjawab]

## 4. Tahap FIX
Tahap FIX dimulai Minggu 4, tidak ada pada minggu ini.

## 5. Tahap BUILD
Yang berhasil :
Berhasil merumuskan tiga alternatif persoalan sistem informasi lengkap 6 unsur, menghitung angka lingkup minimum untuk K = 8 (5 dokumen, 14 kasus uji, 2 tool, 1 mode ringkas), serta menetapkan tema Asisten Ekstraksi User Story & Gherkin sebagai proyek semester.

Yang tidak berhasil :
[ATHALA ISI: apa yang sempat membingungkan atau belum tuntas saat memetakan calon persoalan, misal sempat kesulitan menentukan batasan apakah ekstraksi transkrip rapat murni AI Engineering atau butuh NLP konvensional]

Keputusan rancangan yang saya ambil minggu ini, beserta alasannya :
| Keputusan | Alternatif yang saya tolak | Alasan memilih |
|---|---|---|
| Memilih calon persoalan 1: Ekstraksi User Story & Gherkin dari transkrip rapat informal | Calon 2 (Audit SOP internal) dan Calon 3 (Klasifikasi tiket helpdesk) | Masukan bahasa alami transkrip rapat sangat cair dan tidak terstruktur (mustahil ditangani aturan deterministik), sementara keluarannya menuntut transformasi semantik ke format baku rekayasa perangkat lunak (INVEST & Gherkin). |

## 6. Tantangan wajib
Hasil :
Telah menemukan dan menganalisis contoh nyata penggunaan AI generatif yang salah di lingkungan kampus: penggunaan chatbot LLM untuk pengecekan prasyarat kelulusan mata kuliah dan perhitungan sisa SKS. Persoalan ini deterministik berbasis aturan kurikulum, sehingga seharusnya menggunakan kueri basis data SQL / logika pemrograman SIAKAD yang 100% akurat, cepat, dan tanpa biaya token maupun risiko halusinasi.

Bila tidak tercapai — apa yang sudah dicoba dan mengapa gagal :
[ATHALA ISI: tulis "Tantangan tercapai penuh" atau catatan bila ada aspek yang ingin ditambahkan]

## 7. Penggunaan AI minggu ini
| # | Untuk apa | Prompt (ringkas / pola Lampiran A) | Yang saya UBAH dari hasilnya | Bagaimana saya verifikasi |
|---|---|---|---|---|
| 1 | Eksplorasi skenario BREAK (uji tokoh fiktif dan SOP internal) | Ajukan pertanyaan langsung ke chat interface mengenai biografi Prof. Bambang Suryonoto penemu framework SI-ITK | Mengabaikan karangan biografi palsu dari model dan mencatat perilakunya sebagai bukti halusinasi model | Menelusuri database direktori dosen dan arsip resmi kampus ITK |
| 2 | Menyusun draf pemetaan calon persoalan Sistem Informasi | [ATHALA ISI: prompt yang Anda gunakan untuk brainstorming calon topik, misal: "Beri 3 ide topik proyek AI Engineering untuk mahasiswa SI"] | [ATHALA ISI: apa yang Anda ubah atau sesuaikan dari saran AI agar relevan dengan minat dan kasus nyata Anda] | Memeriksa ketersediaan data transkrip simulasi dan keterkaitan dengan kurikulum rekayasa kebutuhan perangkat lunak |

Satu hal yang AI berikan dan ternyata KELIRU minggu ini :
Model mengarang biografi lengkap seorang akademisi fiktif secara sangat meyakinkan seolah-olah tokoh tersebut benar-benar ada di dunia nyata (halusinasi total pada tahap BREAK nomor 4).

Bagian karya minggu ini yang paling sulit saya jelaskan bila ditanya :
[ATHALA ISI: bagian mana dari analisis minggu 1 yang paling menantang dijelaskan jika ditanya dosen, misal: menjelaskan batas tegas kapan sebuah pipeline transkrip rapat beralih dari sekadar parsing teks biasa menjadi murni persoalan AI Engineering]

## 8. Pemakaian dan biaya
| Kegiatan | Model | Perkiraan token | Perkiraan biaya |
|---|---|---|---|
| Pengujian awal perilaku LLM via antarmuka web (tahap BREAK) | Web Chat Interface | ~3.000 token | Rp 0 (antarmuka gratis / belum ada API Gateway berbayar) |
| Pemanggilan API sistem backend | Belum ada pemanggilan API | 0 token | Rp 0 |

Total minggu ini : Rp 0
Total kumulatif  : Rp 0

## 9. Daftar periksa mandiri
- [ ] Kode peserta K dicatat dan seluruh angka lingkup dihitung
- [ ] Tabel READ terisi lengkap dengan alasan
- [ ] Empat baris BREAK punya kolom prediksi terisi **sebelum** percobaan
- [ ] Tiga calon persoalan terisi lengkap enam unsur
- [ ] Tantangan wajib terjawab
- [ ] Catatan proses ditulis memakai template Lampiran C

## 10. Yang macet dan rencana minggu depan
Yang masih macet :
[ATHALA ISI: apa kendala teknis atau pemahaman yang dirasakan di minggu 1, misal: pemahaman mendalam tentang bagaimana parameter token, temperature, dan jendela konteks memengaruhi stabilitas ekstraksi]

Apa yang sudah saya coba untuk mengatasinya :
[ATHALA ISI: apa yang sudah Anda baca atau cari tahu untuk memahami hal tersebut]

Rencana konkret minggu depan :
Mempelajari materi Minggu 2 mengenai anatomi model bahasa (token, context window, temperature, logprobs), mencoba mengestimasi perhitungan biaya per transkrip, serta menyiapkan transkrip simulasi awal.
