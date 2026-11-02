# Ringkasan Evaluasi Ekstraksi

- **Waktu Evaluasi**: 2026-09-28T05:37:34.915Z
- **Label**: klinik-temp1
- **Model**: openai/gpt-oss-120b
- **Temperature**: 1
- **Transcript Sumber ID**: 20
- **Keywords (Scope Filter)**: whatsapp, notifikasi, h-1, booking, pembayaran, bayar, websocket, polling
- **Details (UI/Tech Filter)**: tombol, formulir, dashboard, halaman, sms, email

## 1. Statistik Agregat

| Metrik | Nilai |
|---|---|
| Total Run | 5 |
| Run Berhasil | 5 |
| Run Gagal | 0 |
| Jumlah Story (Min / Rata-rata / Maks) | 6 / 8.00 / 9 |
| Distribusi Jumlah Story | 6 story: 1 run, 8 story: 2 run, 9 story: 2 run |
| Rata-rata AC per Story | 1.50 |
| Run dengan Kebocoran Keywords (%) | 0/5 (0.0%) |
| Run dengan Awalan Template (%) | 0/5 (0.0%) |
| Durasi Rata-rata / Maksimal (ms) | 38044 ms / 49570 ms |

## 2. Tabel Ringkas Hasil Run

| Run | Transcript ID | Status | Durasi (ms) | Jumlah Story | AC / Story | Awalan Template? | Kebocoran Keywords? | AC dg Details |
|---|---|---|---|---|---|---|---|---|
| 1 | 36 | completed | 34176 | 8 | 2,3,1,2,1,1,1,1 | Tidak | Tidak | 6 |
| 2 | 37 | completed | 49570 | 9 | 3,3,2,2,2,2,2,2,2 | Tidak | Tidak | 8 |
| 3 | 38 | completed | 39198 | 9 | 1,2,1,1,1,1,1,1,1 | Tidak | Tidak | 6 |
| 4 | 39 | completed | 29558 | 6 | 2,2,1,1,2,1 | Tidak | Tidak | 7 |
| 5 | 40 | completed | 37719 | 8 | 2,1,1,1,1,1,1,1 | Tidak | Tidak | 5 |

> **Catatan Penting**:
> Deteksi keywords dan details merupakan **heuristik berbasis pencocokan kata kunci**, bukan penilaian makna semantik yang mutlak. Hasil evaluasi tetap perlu ditinjau secara manual untuk memastikan konteks dan akurasi yang sebenarnya.
