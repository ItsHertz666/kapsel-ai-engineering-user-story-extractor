# Ringkasan Evaluasi Ekstraksi

- **Waktu Evaluasi**: 2026-09-28T06:04:44.545Z
- **Label**: perpus-v3-temp0
- **Model**: openai/gpt-oss-120b
- **Temperature**: 0
- **Transcript Sumber ID**: 19
- **Keywords (Scope Filter)**: kategori, reservasi, dipesan, pesan, memesan, tiga detik, 3 detik
- **Details (UI/Tech Filter)**: tombol, formulir, dashboard, notifikasi, email

## 1. Statistik Agregat

| Metrik | Nilai |
|---|---|
| Total Run | 5 |
| Run Berhasil | 5 |
| Run Gagal | 0 |
| Jumlah Story (Min / Rata-rata / Maks) | 5 / 5.00 / 5 |
| Distribusi Jumlah Story | 5 story: 5 run |
| Rata-rata AC per Story | 1.32 |
| Run dengan Kebocoran Keywords (%) | 3/5 (60.0%) |
| Run dengan Awalan Template (%) | 0/5 (0.0%) |
| Durasi Rata-rata / Maksimal (ms) | 30665 ms / 40216 ms |

## 2. Tabel Ringkas Hasil Run

| Run | Transcript ID | Status | Durasi (ms) | Jumlah Story | AC / Story | Awalan Template? | Kebocoran Keywords? | AC dg Details |
|---|---|---|---|---|---|---|---|---|
| 1 | 41 | completed | 26064 | 5 | 1,1,2,1,1 | Tidak | Tidak | 2 |
| 2 | 42 | completed | 31282 | 5 | 1,1,2,1,1 | Tidak | Tidak | 1 |
| 3 | 43 | completed | 27752 | 5 | 1,1,2,1,1 | Tidak | Ya (pesan) | 1 |
| 4 | 44 | completed | 28009 | 5 | 2,1,2,2,1 | Tidak | Ya (pesan) | 3 |
| 5 | 45 | completed | 40216 | 5 | 1,1,1,3,1 | Tidak | Ya (reservasi, dipesan, pesan) | 0 |

> **Catatan Penting**:
> Deteksi keywords dan details merupakan **heuristik berbasis pencocokan kata kunci**, bukan penilaian makna semantik yang mutlak. Hasil evaluasi tetap perlu ditinjau secara manual untuk memastikan konteks dan akurasi yang sebenarnya.
