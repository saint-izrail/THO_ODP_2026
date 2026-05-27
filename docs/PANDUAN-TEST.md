# Panduan Testing — Tabungan Haji API

Dokumen ini menjelaskan cara melakukan testing dari nol sampai semua fitur tervalidasi. Cocok dijalankan setelah `git clone` di mesin baru, atau untuk verifikasi ulang setelah perubahan kode.

---

## 0. Strategi Testing — Penting Dibaca Dulu

**Semua testing di project ini dilakukan lewat HTTP endpoint** — tidak ada framework unit test (Jest/Mocha/Vitest) yang di-setup. Pendekatannya:

| Aspek | Cara test |
|---|---|
| **Logika endpoint** (validasi, response, status code) | Postman / curl ke URL → cek response body + status |
| **Side effect ke database** (data tersimpan, saldo ter-update) | Verifikasi via `psql` query setelah request |
| **Side effect ke response header** (Content-Type, Idempotency-Replayed) | Cek header response di Postman |
| **Middleware (requireAuth)** | Probe endpoint sensitif **tanpa** token vs **dengan** token, lihat selisih response |
| **Migration / struktur DB** | `\dt` di psql, lihat daftar tabel sesuai schema |

Artinya: kalau endpoint kasih response yang benar **dan** state di DB sesuai harapan → fitur dianggap pass. Tidak ada "test internal" untuk fungsi-fungsi private (mis. `generateNomorRekening()` di service) — semuanya tervalidasi tidak langsung lewat endpoint yang memakainya.

**Konsekuensi untuk Anda:**
- Tidak perlu install framework test apa pun.
- Tidak ada perintah `npm test` yang fungsional (script `test` di [package.json](../package.json) hanya placeholder).
- Setiap perubahan kode → cukup restart `npm run dev` → re-run request Postman yang relevan.
- Setiap ticket bisa diverifikasi 1:1 lewat request Postman yang dinamai sesuai ticket (mis. `THO-209 Login (happy 200)`).

---

## 1. Prasyarat

Pastikan terinstall (lihat juga [PANDUAN-KODE.md](PANDUAN-KODE.md) bab "Stack"):

| Tools | Versi | Cek dengan |
|---|---|---|
| Node.js | ≥ 18 | `node -v` |
| npm | ≥ 9 | `npm -v` |
| PostgreSQL | 16 atau 18 | `psql --version` |
| Postman Desktop | terbaru | (cek di Start menu) |

> Kalau `psql` belum kebaca di PowerShell, tambahkan `C:\Program Files\PostgreSQL\18\bin` ke **PATH user** (Start → "Edit environment variables for your account" → Path → New → paste folder bin).

---

## 2. Setup Awal Project (sekali saja)

Dari folder root project (`d:\tabungan_haji-api`):

### 2.1 Install dependencies
```powershell
npm install
```
Akan men-download ~182 package ke folder `node_modules/`. Sekitar 30-60 detik.

### 2.2 Siapkan file `.env`
File `.env` sudah ada (ter-commit ke local). Cek isinya — minimal harus punya:
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/tabungan_haji?schema=public"
PORT=3000
NODE_ENV=development
JWT_SECRET="change-me-in-production"
JWT_EXPIRES_IN="1d"
```
Sesuaikan `DATABASE_URL` kalau password Postgres Anda berbeda.

### 2.3 Bikin database
```powershell
psql -U postgres -h localhost -c "CREATE DATABASE tabungan_haji;"
```
Diminta password Postgres → masukkan.

Cek:
```powershell
psql -U postgres -h localhost -c "\l" | Select-String tabungan_haji
```
Harus muncul satu baris yang ada nama `tabungan_haji`.

### 2.4 Apply migration & generate Prisma client
```powershell
npx prisma migrate deploy
npx prisma generate
```
- `migrate deploy` = jalankan semua file SQL di [prisma/migrations/](../prisma/migrations/) untuk bikin tabel di database.
- `generate` = bikin "Prisma client" (kode TypeScript yang dipakai aplikasi untuk query DB) di [src/generated/prisma/](../src/generated/prisma/).

Setelah ini, di database Anda akan ada tabel:
- `nasabah`, `tabungan_haji`, `transaksi`
- `idempotency_keys` (untuk anti-double-charge di endpoint setor)
- `token_blocklist` (untuk logout JWT)
- `_prisma_migrations` (internal Prisma, jangan disentuh)

---

## 3. Menjalankan Server

```powershell
npm run dev
```

Output yang benar:
```
[nodemon] starting `ts-node src/index.ts`
Example app listening on port 3000
```

Cek server hidup di browser atau PowerShell baru:
```powershell
Invoke-RestMethod http://localhost:3000/health
```
Harus return `status=ok`.

**Biarkan terminal ini jalan terus** selama testing. Setiap kode yang diubah, nodemon auto-reload.

---

## 4. Setup Postman

### 4.1 Import collection + environment
1. Buka Postman.
2. Klik **Import** (kiri atas, di samping "New").
3. Drag dua file dari folder `postman/`:
   - `tabungan-haji.postman_collection.json`
   - `tabungan-haji.postman_environment.json`
4. Klik **Import**.

### 4.2 Aktifkan environment
- Pojok kanan atas → dropdown **"Tabungan Haji - Local"**.
- Klik ikon mata 👁 untuk lihat isi env variables — ada `baseUrl`, `nasabahId`, `tabunganId`, `idempotencyKey`, `token`, dst.

### 4.3 Struktur collection
Folder yang akan dipakai (urutkan dari atas ke bawah saat testing):
```
Tabungan Haji API
├── Health         (1 req)   — sanity check
├── Auth           (8 req)   — THO-209 login, THO-210 probe, THO-211 logout
├── Nasabah        (9 req)   — CRUD nasabah
├── Tabungan Haji  (16 req)  — THO-205..208 + THO-212
└── Reports        (3 req)   — THO-213 export CSV
```

---

## 5. Test Sequence — End to End

### 5.1 Health check
Folder **Health → GET /health** → klik **Send** → 200 OK, body `{status:"ok", ...}`.

### 5.2 Bikin nasabah baru (modul Nasabah)
Folder **Nasabah → Create Nasabah** → Send.
- Status: **201**.
- Test script otomatis menyimpan `nasabahId` ke environment (cek di env panel).
- Body request bisa diubah dulu (NIK harus 16 digit, email unik, `password` minimal 8 karakter).

### 5.3 Login (modul Auth)
Folder **Auth → THO-209 Login (happy 200)** → Send.

Default body memakai akun seed `ahmad.fauzi@example.com` / `Password123!`. **Test script otomatis menyimpan `token` ke environment.**

Cek hasil:
- Status 200.
- Body `data.token` adalah JWT (mulai dengan `eyJ...`).
- Body `data.user` punya `id, nama, email`.
- Env var `token` di Postman sudah ter-isi.

### 5.4 Validasi token bekerja (THO-210)
Sebelum lanjut, run dua negative case dari folder **Auth**:

| Request | Expected | Yang dites |
|---|---|---|
| `THO-210 Probe - Tanpa Token (401)` | 401 `UNAUTHORIZED` | Endpoint sensitif menolak akses tanpa Bearer token |
| `THO-210 Probe - Token Invalid (401)` | 401 `INVALID_TOKEN` | JWT yang malformed ditolak |

### 5.5 Buka rekening tabungan (THO-205)
Folder **Tabungan Haji → THO-205 Buka Rekening (happy 201)** → Send.

> ⚠️ Body memakai `{{nasabahId}}` (otomatis dari step 5.2). Kalau Anda belum jalankan Create Nasabah dulu, set manual di env (`nasabahId` = UUID nasabah yang belum punya tabungan).

Status: 201. Test script auto-simpan `tabunganId` ke env.

**Negative case**:
- `THO-205 Buka Rekening - Duplikat (409)` → user yang sudah punya tabungan aktif tidak boleh buat lagi.
- `THO-205 Buka Rekening - Nasabah Belum Daftar (403)` → pakai UUID `00000000-...` yang tidak ada.
- `THO-205 Buka Rekening - Validasi (422)` → body `nasabahId: "bukan-uuid"`.

### 5.6 Lihat detail tabungan (THO-207)
Folder **Tabungan Haji → THO-207 Detail Tabungan (200)** → Send.
- Status 200.
- Body `data.saldo` (string "0" karena baru dibuat), `data.status` = "AKTIF", `data.nasabah` ter-include.

Negative: `THO-207 Detail - Not Found (404)`, `THO-207 Detail - Invalid UUID (422)`.

### 5.7 Setor saldo + idempotency (THO-206)
Ini test paling kompleks. Jalankan 2 request berurutan:

1. **`THO-206 Setor (201)`** → pre-request script auto-generate UUID baru sebagai `Idempotency-Key`. Send.
   - Status 201. Saldo nasabah bertambah 250,000.
   - Lihat header response: tidak ada `Idempotency-Replayed`.

2. **`THO-206 Setor - Replay (201 + Idempotency-Replayed)`** → langsung Send (tanpa edit). Postman pakai env `idempotencyKey` yang sama dari step 1.
   - Status 201.
   - Header response: `Idempotency-Replayed: true` ← bukti idempotency bekerja.
   - **Saldo TIDAK bertambah** — server kembalikan response lama yang tersimpan di table `idempotency_keys`.

Verifikasi via psql (di terminal lain):
```powershell
psql -U postgres -d tabungan_haji -c "SELECT nomor_rekening, saldo FROM tabungan_haji; SELECT COUNT(*) FROM transaksi;"
```
Saldo = 250,000 dan transaksi = 1 (bukan 2!).

Negative case:
- `THO-206 Setor - Minimum 100rb (422)` → nominal 50,000 → 422 dengan pesan "Minimum setoran Rp 100.000".
- `THO-206 Setor - Tanpa Idempotency-Key (400)` → 400 `IDEMPOTENCY_KEY_REQUIRED`.

### 5.8 Lihat mutasi (THO-208)
Folder **Tabungan Haji → THO-208 Mutasi - List All (200)** → Send.
- Status 200, `data` array berisi transaksi.
- `meta.pagination` punya `total`, `totalPages`, dst.

Variasi:
- `THO-208 Mutasi - Filter Jenis=SETORAN` → semua item jenis SETORAN.
- `THO-208 Mutasi - Pagination (limit=1)` → maksimal 1 item per page.

### 5.9 Estimasi tahun berangkat (THO-212)
Folder **Tabungan Haji → THO-212 Estimasi (200)** → Send.

Response berisi:
- `saldoSekarang` (string)
- `targetPorsi` = "25000000" (Rp 25 juta)
- `rataRataSetoranBulanan` (dari 6 bulan terakhir)
- `bulanDibutuhkan` (ceiling)
- `tahunMencapaiTarget`
- `antrianTahun` = 10
- `estimasiTahunBerangkat`

> Kalau nasabah baru saja setor 250rb sekali, rata-rata = 41,666/bln (250rb/6 bln). Estimasi tahun akan jauh sekali (~50+ tahun) karena sample setoran masih sedikit.

### 5.10 Export laporan bulanan CSV (THO-213)
Folder **Reports → THO-213 Export CSV Bulanan (200)** → Send.

Query: `month=2026-05` (bulan dengan transaksi).

Hasil:
- Status 200.
- Header `Content-Type: text/csv; charset=utf-8`.
- Header `Content-Disposition: attachment; filename="transaksi-2026-05.csv"`.
- Body: header CSV + baris-baris transaksi.

Untuk **save sebagai file** di Postman: klik dropdown di sebelah tombol **Send** → **Send and Download** → pilih lokasi.

### 5.11 Logout (THO-211)
Folder **Auth → THO-211 Logout (200)** → Send.
- Status 200, pesan "Logout berhasil, token sudah di-revoke".

Lalu **`THO-211 Logout Effect - Token Revoked (401)`** → Send.
- Status 401 dengan `error.code = TOKEN_REVOKED`.
- Bukti bahwa blocklist berfungsi — token bekas logout tidak bisa dipakai lagi meskipun belum expired.

> Setelah test ini, kalau mau lanjut testing, **login ulang** (step 5.3) supaya `token` di-env ter-refresh.

---

## 6. Collection Runner — Test Sekaligus

Untuk test semua sekaligus (lebih cepat):

1. Klik nama collection **"Tabungan Haji API"** di sidebar.
2. Klik tombol **Run** (atau ikon arrow).
3. Pilih folder dan urutan request. **Saran urutan**:
   ```
   Health → GET /health
   Nasabah → Create Nasabah  (auto-save nasabahId)
   Auth → THO-209 Login (happy 200)  (auto-save token)
   Tabungan Haji → semua request (urutan default)
   Reports → semua request
   Auth → THO-211 Logout
   Auth → THO-211 Logout Effect
   ```
4. Klik **Run Tabungan Haji API**.
5. Semua test akan jalan otomatis. Lihat tab **Test Results** untuk lihat PASS/FAIL.

> Catatan: kalau test "Buka Rekening duplikat" jalan duluan sebelum yang happy, ia akan fail. Pastikan urutan benar.

---

## 7. Reset Database (kalau perlu fresh)

Untuk balikkan state ke kosong (cuma tabel, tidak ada data):

```powershell
psql -U postgres -d tabungan_haji -c "TRUNCATE token_blocklist, idempotency_keys, transaksi, tabungan_haji, nasabah RESTART IDENTITY CASCADE;"
```

> ⚠️ Ini hapus SEMUA data nasabah/tabungan/transaksi. Skema/tabel tidak hilang.

Setelah reset, jalankan ulang flow dari step 5.2.

---

## 8. Troubleshooting

| Gejala | Penyebab umum | Solusi |
|---|---|---|
| `Cannot GET /api/v1/...` | Server jalan tapi route belum di-load (nodemon stuck) | Stop terminal `npm run dev`, jalankan ulang |
| `EPERM: operation not permitted` saat `prisma generate` | DLL Prisma di-lock server yang sedang jalan | Stop server dulu, `prisma generate`, baru run lagi |
| `Environment variable not found: DATABASE_URL` | `.env` belum dibuat atau salah lokasi | Pastikan `.env` ada di root project |
| Login return 401 padahal password benar | Password belum di-hash di DB (nasabah seed lama) | Set password manual via psql + bcrypt (lihat skrip di history) |
| `401 TOKEN_REVOKED` saat tidak logout | Token lama masih dipakai padahal sudah di-blocklist | Login ulang untuk dapat token baru |
| `429` atau koneksi DB error | PostgreSQL service mati | `Get-Service postgresql*` → kalau Stopped, `Start-Service postgresql-x64-18` |

---

## 9. Endpoint Reference (cheat-sheet)

| Method | Path | Auth | Ticket | Catatan |
|---|---|---|---|---|
| GET | `/health` | — | — | Sanity check |
| POST | `/api/v1/auth/login` | — | THO-209 | Body: `email`, `password` |
| POST | `/api/v1/auth/logout` | ✅ Bearer | THO-211 | Blocklist token |
| POST | `/api/v1/nasabah` | — | (existing) | Self-register, `password` wajib |
| GET | `/api/v1/nasabah` | ✅ | (existing) | Pagination + search |
| GET | `/api/v1/nasabah/:id` | ✅ | THO-202 | Detail |
| PATCH | `/api/v1/nasabah/:id` | ✅ | THO-203 | Update partial |
| DELETE | `/api/v1/nasabah/:id` | ✅ | THO-204 | Hapus |
| POST | `/api/v1/tabungan-haji` | ✅ | THO-205 | Body: `nasabahId` |
| GET | `/api/v1/tabungan-haji/:id` | ✅ | THO-207 | Detail saldo + nasabah |
| POST | `/api/v1/tabungan-haji/:id/setor` | ✅ | THO-206 | Header `Idempotency-Key` wajib |
| GET | `/api/v1/tabungan-haji/:id/mutasi` | ✅ | THO-208 | Pagination + filter `jenis` |
| GET | `/api/v1/tabungan-haji/:id/estimasi` | ✅ | THO-212 | Estimasi tahun berangkat |
| GET | `/api/v1/reports/transaksi-bulanan` | ✅ | THO-213 | Query `month=YYYY-MM` → CSV |

---

## 10. Coverage Matrix — Semua Fitur Tervalidasi?

Tabel di bawah konfirmasi bahwa **setiap fitur / fungsi internal di project bisa diverifikasi lewat minimal satu request HTTP**. Tidak ada kode yang "tersembunyi" dari testing.

### 10.1 Fitur per ticket

| Ticket | Fitur | Endpoint yang men-test | Postman request | File terkait |
|---|---|---|---|---|
| (existing) | Create nasabah (register) | `POST /api/v1/nasabah` | Nasabah → Create Nasabah | [nasabah.controller.ts:11](../src/modules/nasabah/nasabah.controller.ts#L11) |
| (existing) | List + search nasabah | `GET /api/v1/nasabah` | Nasabah → List Nasabah | [nasabah.controller.ts:66](../src/modules/nasabah/nasabah.controller.ts#L66) |
| THO-202 | Detail nasabah | `GET /api/v1/nasabah/:id` | Nasabah → Detail Nasabah by Id | [nasabah.controller.ts:106](../src/modules/nasabah/nasabah.controller.ts#L106) |
| THO-203 | Update nasabah | `PATCH /api/v1/nasabah/:id` | Nasabah → Update Nasabah | [nasabah.controller.ts:153](../src/modules/nasabah/nasabah.controller.ts#L153) |
| THO-204 | Hapus nasabah | `DELETE /api/v1/nasabah/:id` | Nasabah → Delete Nasabah | [nasabah.controller.ts:237](../src/modules/nasabah/nasabah.controller.ts#L237) |
| THO-205 | Buka rekening | `POST /api/v1/tabungan-haji` | Tabungan Haji → THO-205 (4 req) | [tabungan-haji.controller.ts:27](../src/modules/tabungan-haji/tabungan-haji.controller.ts#L27) |
| THO-206 | Setor (idempotent + DB tx) | `POST /api/v1/tabungan-haji/:id/setor` | Tabungan Haji → THO-206 (4 req) | [tabungan-haji.controller.ts:107](../src/modules/tabungan-haji/tabungan-haji.controller.ts#L107) |
| THO-207 | Lihat saldo & detail | `GET /api/v1/tabungan-haji/:id` | Tabungan Haji → THO-207 (3 req) | [tabungan-haji.controller.ts:80](../src/modules/tabungan-haji/tabungan-haji.controller.ts#L80) |
| THO-208 | Mutasi transaksi | `GET /api/v1/tabungan-haji/:id/mutasi` | Tabungan Haji → THO-208 (3 req) | [tabungan-haji.controller.ts:222](../src/modules/tabungan-haji/tabungan-haji.controller.ts#L222) |
| THO-209 | Login JWT | `POST /api/v1/auth/login` | Auth → THO-209 (4 req) | [auth.controller.ts:22](../src/modules/auth/auth.controller.ts#L22) |
| THO-210 | Middleware `requireAuth` | (semua endpoint protected) | Auth → THO-210 Probe (2 req) | [requireAuth.ts](../src/middleware/requireAuth.ts) |
| THO-211 | Logout (blocklist) | `POST /api/v1/auth/logout` | Auth → THO-211 (2 req) | [auth.controller.ts:75](../src/modules/auth/auth.controller.ts#L75) |
| THO-212 | Estimasi tahun berangkat | `GET /api/v1/tabungan-haji/:id/estimasi` | Tabungan Haji → THO-212 (2 req) | [tabungan-haji.controller.ts:188](../src/modules/tabungan-haji/tabungan-haji.controller.ts#L188) |
| THO-213 | Export CSV bulanan | `GET /api/v1/reports/transaksi-bulanan` | Reports → THO-213 (3 req) | [reports.controller.ts](../src/modules/reports/reports.controller.ts) |

### 10.2 Fungsi internal yang ter-test secara implisit

Komponen di bawah ini tidak punya endpoint sendiri, tapi terbukti bekerja karena endpoint yang memakainya menghasilkan response yang benar.

| Komponen | Tervalidasi lewat | Bukti |
|---|---|---|
| **bcrypt hash password** (di [nasabah.service.ts:21](../src/modules/nasabah/nasabah.service.ts#L21)) | Create Nasabah → Login | Kalau hash gagal, login pasti 401 |
| **bcrypt compare password** (di [auth.service.ts:11](../src/modules/auth/auth.service.ts#L11)) | THO-209 Login happy 200 vs Wrong Password 401 | Selisih response = compare bekerja |
| **JWT sign (HS256, jti, exp)** ([auth.service.ts:14](../src/modules/auth/auth.service.ts#L14)) | THO-209 Login → response berisi token `eyJ...` | Token bisa di-decode di jwt.io |
| **JWT verify** ([requireAuth.ts:55](../src/middleware/requireAuth.ts#L55)) | THO-210 Probe Token Invalid (401 INVALID_TOKEN) | Token rusak ditolak |
| **JWT expiry handling** ([requireAuth.ts:67](../src/middleware/requireAuth.ts#L67)) | (Manual: tunggu 1 hari ATAU set `JWT_EXPIRES_IN=5s`, login, tunggu 6 detik, akses → `TOKEN_EXPIRED`) | Tidak ter-cover di Postman default — case manual |
| **Blocklist insert** ([auth.service.ts:33](../src/modules/auth/auth.service.ts#L33)) | THO-211 Logout 200 → row baru di `token_blocklist` | Cek via `SELECT FROM token_blocklist` |
| **Blocklist check** ([requireAuth.ts:79](../src/middleware/requireAuth.ts#L79)) | THO-211 Logout Effect → 401 TOKEN_REVOKED | Token bekas logout otomatis ditolak |
| **Sequential nomor rekening** ([tabungan-haji.service.ts:12](../src/modules/tabungan-haji/tabungan-haji.service.ts#L12)) | THO-205 happy → response `nomorRekening` = "TH-0000000001", request kedua "TH-0000000002" | Sequential counter bekerja |
| **DB transaction + SELECT FOR UPDATE** ([tabungan-haji.service.ts:65](../src/modules/tabungan-haji/tabungan-haji.service.ts#L65)) | THO-206 happy → saldo bertambah persis nominal | Atomicity terbukti |
| **Idempotency replay** ([tabungan-haji.controller.ts:154](../src/modules/tabungan-haji/tabungan-haji.controller.ts#L154)) | THO-206 Replay → 201 + header `Idempotency-Replayed: true`, saldo tidak naik 2x | Diverifikasi via psql |
| **BigInt → string serialization** ([index.ts:10](../src/index.ts#L10)) | Setiap response yang punya `saldo`/`nominal` | Field `saldo` di response berupa string `"2050000"` |
| **Zod validation 422** (semua schema) | Negative case di setiap folder | `error.code = VALIDATION_ERROR` muncul di response |
| **Prisma error mapping (P2002, P2025, P2003)** | THO-205 Duplikat (P2002→409), Delete tidak ada (P2025→404) | HTTP code sesuai |
| **CORS + Helmet headers** ([index.ts:17-18](../src/index.ts#L17-L18)) | Response header semua endpoint | `Access-Control-Allow-Origin: *`, `X-Frame-Options: SAMEORIGIN`, dll |
| **Migration applied** ([prisma/migrations/](../prisma/migrations/)) | `\dt` di psql | 6 tabel ada: `nasabah`, `tabungan_haji`, `transaksi`, `idempotency_keys`, `token_blocklist`, `_prisma_migrations` |

### 10.3 Hal yang TIDAK ter-cover di Postman default

Ini limitasi black-box testing — kasus berikut butuh manual atau load test:

| Skenario | Kenapa tidak ter-cover | Cara test manual |
|---|---|---|
| Race condition setor paralel (key sama) | Postman serial, bukan paralel | Pakai `Apache JMeter` / `wrk` kirim 50 request bareng, cek hanya 1 transaksi tercatat |
| JWT expiry | Default expiry 1 hari (terlalu lama) | Set `JWT_EXPIRES_IN=5s` di `.env`, login, tunggu 6 detik, akses endpoint → harus 401 TOKEN_EXPIRED |
| Password hash robustness | Bcrypt sudah library trusted | (skip) |
| DB connection drop / retry | Tidak ada retry logic | Stop service postgres saat request → expect 500 |
| Concurrent buka rekening (nomor rekening race) | Counter `SELECT MAX + 1` tidak race-safe | (known limitation, akan jadi issue di high concurrency) |

---

## 11. Daftar Dokumen Project

Saat ini ada 2 dokumen di folder [docs/](.):

| Dokumen | Untuk siapa | Isi singkat |
|---|---|---|
| **[PANDUAN-TEST.md](PANDUAN-TEST.md)** (file ini) | QA / dev yang mau test | Setup → run server → test sequence Postman → matrix coverage |
| **[PANDUAN-KODE.md](PANDUAN-KODE.md)** | IT non-coder yang mau paham arsitektur | Stack, layered architecture, struktur folder, alur request, glossary |

Dokumen lain di project (bukan di `docs/`):
- [prisma/schema.prisma](../prisma/schema.prisma) — sumber kebenaran struktur DB (ada komentar di tiap model)
- [postman/](../postman/) — koleksi Postman + environment (bukan dokumen tapi spec API yang executable)
- `.env` — konfigurasi runtime (jangan commit ke git!)

> Belum ada README.md di root project. Kalau mau dibuat, isinya bisa cukup ringkasan + link ke kedua panduan di atas.
