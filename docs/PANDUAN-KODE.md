# Panduan Kode — Tabungan Haji API

Dokumen ini menjelaskan **cara kerja project** untuk orang IT yang paham dasar (HTTP, database, JSON) tapi tidak coding sehari-hari. Targetnya: setelah baca, Anda bisa menjelaskan ke orang lain alur dari "user klik tombol" sampai "data tersimpan di database", dan tahu file mana mengerjakan apa.

> Untuk cara menjalankan/testing → lihat [PANDUAN-TEST.md](PANDUAN-TEST.md).

---

## 1. Apa yang Project Ini Lakukan

Backend API untuk simulasi **Tabungan Haji**. Ada 3 jenis aktor:

| Aktor | Apa yang bisa dilakukan |
|---|---|
| **Calon Nasabah** | Daftar (register), login |
| **Nasabah** | Lihat profil, buka tabungan, setor, lihat saldo & mutasi, estimasi tahun berangkat |
| **Admin/Compliance** | Export laporan bulanan CSV |

API ini hanya **backend** (data + business logic). Tidak ada tampilan UI — semua diakses lewat HTTP request (Postman, curl, atau aplikasi frontend lain).

---

## 2. Stack Teknologi

| Layer | Tools | Fungsi singkat |
|---|---|---|
| **Bahasa** | TypeScript | JavaScript dengan tipe data (lebih aman) |
| **Runtime** | Node.js | Mesin yang menjalankan TypeScript di server |
| **Web framework** | Express 5 | Pustaka untuk handle HTTP request/response |
| **Database** | PostgreSQL 18 | Tempat data di-simpan permanen |
| **ORM** | Prisma | "Translator" antara kode TypeScript ↔ SQL database |
| **Validasi input** | Zod | Pastikan data yang masuk sesuai format |
| **Auth** | jsonwebtoken + bcrypt | JWT untuk token login, bcrypt untuk hash password |
| **Security headers** | helmet | Tambah header HTTP untuk anti-XSS dll |
| **Dev tool** | nodemon + ts-node | Auto-restart server saat kode berubah |

---

## 3. Konsep "Layered Architecture" — Kunci Memahami Project

Setiap fitur (mis. lihat nasabah) lewat 4 file yang punya tanggung jawab berbeda:

```
┌────────────┐    ┌────────────┐    ┌────────────┐    ┌────────────┐
│  Request   │───▶│   ROUTE    │───▶│ CONTROLLER │───▶│  SERVICE   │
│  (HTTP)    │    │ (URL match)│    │(validasi + │    │(query DB)  │
│            │    │            │    │ orchestra) │    │            │
└────────────┘    └────────────┘    └─────┬──────┘    └─────┬──────┘
                                          │                  │
                                          ▼                  ▼
                                    ┌────────────┐    ┌────────────┐
                                    │   SCHEMA   │    │ DATABASE   │
                                    │ (aturan    │    │ via Prisma │
                                    │ input)     │    │            │
                                    └────────────┘    └────────────┘
```

Analogi restoran:
- **Route** = papan menu (tahu URL apa di-handle siapa)
- **Controller** = pelayan (terima pesanan, cek apakah pesanan masuk akal, teruskan ke dapur)
- **Service** = chef (eksekusi kerja sebenarnya — ambil bahan dari kulkas DB)
- **Schema** = standar pesanan (mis. "kopi harus sebut size & sugar level")
- **Database** = kulkas + gudang

**Kenapa dipisah?** Supaya kalau:
- Ganti DB (Postgres → MySQL) — cukup ubah Service.
- Ganti aturan validasi — cukup ubah Schema.
- Tambah otentikasi — cukup tambah Middleware di Route, Controller tidak perlu disentuh.

---

## 4. Struktur Folder

```
tabungan_haji-api/
├── .env                          # Konfigurasi (DATABASE_URL, JWT_SECRET, dll) — JANGAN commit
├── package.json                  # Daftar library + script (npm run dev/build/start)
├── tsconfig.json                 # Setting TypeScript compiler
├── prisma.config.ts              # Konfigurasi Prisma (lokasi schema, dll)
│
├── prisma/
│   ├── schema.prisma             # ★ Definisi semua tabel database
│   └── migrations/               # Riwayat perubahan struktur DB (auto-generated)
│       ├── 20260526041206_init/
│       ├── 20260527090023_add_idempotency_key/
│       └── 20260527092850_add_auth_fields/
│
├── postman/                      # Koleksi Postman untuk testing
│   ├── tabungan-haji.postman_collection.json
│   └── tabungan-haji.postman_environment.json
│
├── scripts/
│   └── update-postman.py         # Helper auto-generate request Postman
│
├── docs/                         # Dokumentasi (file ini ada di sini)
│
└── src/                          # ★ Semua kode aplikasi ada di sini
    ├── index.ts                  # Entry point — server start dari file ini
    ├── lib/
    │   └── prisma.ts             # Setting koneksi DB (singleton)
    ├── generated/
    │   └── prisma/               # Auto-generated oleh Prisba (JANGAN edit manual)
    ├── middleware/
    │   └── requireAuth.ts        # Middleware verifikasi JWT (THO-210)
    └── modules/                  # Setiap modul = satu domain bisnis
        ├── auth/                 # Login + logout
        ├── nasabah/              # CRUD data nasabah
        ├── tabungan-haji/        # Buka rekening, setor, mutasi, estimasi
        └── reports/              # Export CSV
```

Tiap modul punya 4 file:
- `*.schema.ts` — aturan validasi (Zod)
- `*.service.ts` — query DB
- `*.controller.ts` — handler HTTP
- `*.route.ts` — daftar URL endpoint

---

## 5. Alur Hidup 1 Request — Contoh Konkret

Ambil contoh: nasabah login.

### Request masuk
```
POST http://localhost:3000/api/v1/auth/login
Content-Type: application/json
{
  "email": "ahmad.fauzi@example.com",
  "password": "Password123!"
}
```

### Yang terjadi di server (langkah demi langkah)

1. **[src/index.ts](../src/index.ts)** — request masuk ke app Express.
   - Middleware `cors()` dijalankan (izinkan request dari domain mana saja).
   - Middleware `helmet()` dijalankan (tambah security headers).
   - Middleware `express.json()` dijalankan (baca body JSON jadi object JS).
   - Router cocokin URL: `/api/v1/auth/login` → diarahkan ke [src/modules/auth/auth.route.ts](../src/modules/auth/auth.route.ts).

2. **[src/modules/auth/auth.route.ts](../src/modules/auth/auth.route.ts)** — match `POST /login` → panggil `authController.login`.

3. **[src/modules/auth/auth.controller.ts](../src/modules/auth/auth.controller.ts) → `login()`**
   - Ambil body, validasi pakai `LoginSchema` (dari [auth.schema.ts](../src/modules/auth/auth.schema.ts)).
     - Kalau email/password kosong/format salah → balas 422 langsung.
   - Panggil `authService.findByEmail(email)` untuk ambil row nasabah dari DB.
   - Kalau tidak ada → balas 401 "Email atau password salah" (pesan generik biar tidak bocor info).
   - Panggil `authService.verifyPassword(plaintext, hashedDariDB)` → bcrypt compare.
   - Kalau cocok → panggil `authService.issueToken(user)` → bikin JWT.
   - Kirim response 200 dengan token + user info.

4. **[src/modules/auth/auth.service.ts](../src/modules/auth/auth.service.ts)**
   - `findByEmail` → `prisma.nasabah.findUnique({ where: { email } })` → Prisma terjemahkan jadi SQL `SELECT * FROM nasabah WHERE email = $1` → hasil row balik ke JS object.
   - `verifyPassword` → bcrypt.compare (cek password plaintext sama dengan hash di DB).
   - `issueToken` → bikin JWT pakai library `jsonwebtoken`, isi: `sub` (user id), `email`, `nama`, `jti` (id unik token), `exp` (kapan expired).

5. Response sampai ke client (Postman).

### Visual

```
Postman                Express                Prisma           PostgreSQL
   │                      │                      │                  │
   │── POST /login ──────▶│                      │                  │
   │                      │                      │                  │
   │                      ├─validasi Zod         │                  │
   │                      │  (kalau gagal 422)   │                  │
   │                      │                      │                  │
   │                      ├─find nasabah────────▶│── SELECT ───────▶│
   │                      │                      │◀─── row ─────────│
   │                      │                      │                  │
   │                      ├─bcrypt.compare       │                  │
   │                      │  (CPU work)          │                  │
   │                      │                      │                  │
   │                      ├─JWT sign             │                  │
   │                      │                      │                  │
   │◀──── 200 + token ────│                      │                  │
```

---

## 6. Database — Apa yang Ada di Mana

File **[prisma/schema.prisma](../prisma/schema.prisma)** adalah "sumber kebenaran" tentang struktur tabel. Setiap `model X { ... }` = satu tabel.

### Tabel utama

| Tabel | Isi | Relasi |
|---|---|---|
| `nasabah` | Profil + password (hashed) | 1 nasabah punya banyak `tabungan_haji` |
| `tabungan_haji` | Rekening (nomor, saldo, status) | 1 tabungan punya banyak `transaksi` |
| `transaksi` | History mutasi (setoran, penarikan) | Foreign key ke `tabungan_haji` |
| `idempotency_keys` | Cache response setor untuk anti-double-charge | Standalone |
| `token_blocklist` | JWT yang sudah di-logout | Standalone |

### Konvensi naming
- Di kode (TypeScript) pakai `camelCase`: `nomorRekening`, `nasabahId`, `saldoSebelum`.
- Di DB pakai `snake_case`: `nomor_rekening`, `nasabah_id`, `saldo_sebelum`.
- Prisma yang menerjemahkan (lewat `@map("...")` di schema).

### Migration
Tiap kali struktur DB berubah, kita bikin "migration" — file SQL ber-versi yang tersimpan di [prisma/migrations/](../prisma/migrations/).
- Saat `npx prisma migrate dev` → Prisma compare schema baru vs lama, bikin file SQL, apply ke DB.
- Saat deploy production → `npx prisma migrate deploy` (apply file SQL yang sudah ada, tidak generate).

**Mengapa pakai migration?** Supaya struktur DB di laptop developer, di server staging, dan di production selalu identik. Bukan manual `CREATE TABLE` di tiap mesin.

---

## 7. Penjelasan Tiap Modul

### 7.1 Modul `auth/` (login & logout)

**Tujuan:** verifikasi identitas pengguna, beri "tiket" (JWT) untuk akses endpoint lain.

**File-file:**
- `auth.route.ts` — daftar route: `POST /login` (public), `POST /logout` (butuh JWT).
- `auth.controller.ts` — validasi body login + handle response.
- `auth.service.ts` — query DB (cari nasabah by email), bcrypt verify, sign JWT, simpan ke blocklist.
- `auth.schema.ts` — aturan validasi: email valid + password tidak kosong.

**Konsep JWT (JSON Web Token):**
- Setelah login sukses, server bikin token berisi data user yang sudah di-"tandatangani" pakai secret key.
- Token ini dikirim client di setiap request berikutnya di header `Authorization: Bearer <token>`.
- Server verify tanda tangan → tahu user mana yang lagi request (tanpa harus query DB tiap kali).
- Token ada masa kedaluwarsa (`exp`) — di sini 1 hari.

**Konsep blocklist:**
- JWT sebenarnya stateless (server tidak simpan apa-apa). Tapi kalau user logout, kita perlu "batalkan" token sebelum expired.
- Solusi: simpan `jti` (token ID) di tabel `token_blocklist`.
- Setiap request yang verify JWT juga cek apakah jti ada di blocklist → kalau ada, tolak.

### 7.2 Modul `nasabah/` (CRUD nasabah)

**Tujuan:** kelola data identitas calon haji.

**File:**
- `nasabah.schema.ts` — aturan input (NIK 16 digit, email valid, HP `08xxxxxxxxxx`, password min 8 char).
- `nasabah.service.ts` — query Prisma. Penting: pakai `SAFE_SELECT` (tidak include `password`) supaya password hash tidak pernah bocor di response.
- `nasabah.controller.ts` — handle 5 endpoint (create, list+search, detail, update, delete).
- `nasabah.route.ts` — `POST /` public (self-register), sisanya butuh JWT.

**Hal yang sering bikin bingung:**
- Saat **create**, password di-hash dengan bcrypt sebelum simpan (10 rounds).
- Saat **read** (list/detail), password tidak pernah dikirim balik — karena `select` di service tidak include kolom `password`.
- Error `P2002` dari Prisma = unique constraint violation (mis. NIK / email duplikat) → controller terjemahkan jadi HTTP 409.

### 7.3 Modul `tabungan-haji/` (rekening + transaksi)

**Tujuan:** core business logic — buka rekening, setor, lihat mutasi, estimasi.

**5 endpoint:**

| Endpoint | Ticket | Logika |
|---|---|---|
| `POST /` | THO-205 | Cek nasabah ada → cek belum punya tabungan aktif → generate nomor sequential → insert |
| `GET /:id` | THO-207 | Find by id, include nasabah |
| `POST /:id/setor` | THO-206 | Cek idempotency key → DB transaction (`SELECT FOR UPDATE` + insert transaksi + update saldo + simpan response) |
| `GET /:id/mutasi` | THO-208 | Find transaksi by tabunganId, pagination + filter `jenis` |
| `GET /:id/estimasi` | THO-212 | Hitung berdasarkan saldo & rata-rata setoran 6 bln terakhir |

**Konsep penting di setor (THO-206):**

```
┌─────────────────────────────────────────────┐
│  TRANSACTION (atomik — semua sukses / batal)│
│                                             │
│  1. SELECT saldo FROM tabungan WHERE id     │
│     FOR UPDATE  ←── lock row, anti race     │
│                                             │
│  2. INSERT INTO transaksi (...)             │
│                                             │
│  3. UPDATE tabungan SET saldo = saldo + n   │
│                                             │
│  4. INSERT INTO idempotency_keys            │
│     (key, response_body, status_code)       │
│                                             │
└─────────────────────────────────────────────┘
```

Kenapa harus atomic? Bayangin step 2 sukses (transaksi tercatat) tapi step 3 gagal (saldo tidak ter-update). Itu data tidak konsisten. Transaction memastikan kalau salah satu step gagal, semua di-rollback.

**Konsep Idempotency-Key:**
- Client kirim UUID di header `Idempotency-Key`.
- Server cek di tabel `idempotency_keys`: apakah key ini sudah pernah dipakai untuk endpoint ini?
  - **Belum** → eksekusi setor seperti biasa, lalu simpan response.
  - **Sudah** → langsung return response yang sama (tidak setor lagi).
- Gunanya: kalau client retry karena network timeout, transaksi tidak dobel.

### 7.4 Modul `reports/` (export CSV)

**Tujuan:** admin export semua transaksi 1 bulan jadi CSV untuk laporan/audit.

**Endpoint:**
- `GET /reports/transaksi-bulanan?month=2026-05`

**Yang dilakukan:**
1. Validasi format `month` (regex `YYYY-MM`).
2. Query transaksi WHERE waktu antara awal bulan dan awal bulan depan (UTC).
3. Include nama nasabah dan nomor rekening lewat join.
4. Format jadi CSV (manual, tidak pakai library — datanya sederhana).
5. Set header response:
   - `Content-Type: text/csv` — biar browser tahu ini file CSV.
   - `Content-Disposition: attachment; filename="transaksi-2026-05.csv"` — biar browser auto-download.

### 7.5 Middleware `requireAuth.ts` (THO-210)

**Tujuan:** "satpam" yang dipasang di depan endpoint sensitif.

**Yang dilakukan tiap request:**

```
┌─ Ada header `Authorization: Bearer ...` ? ─── tidak ──▶ 401 UNAUTHORIZED
│                                                                      
│  ya                                                                  
▼                                                                      
JWT.verify(token, JWT_SECRET) ──── gagal ──▶ 401 INVALID_TOKEN          
                              ──── expired ──▶ 401 TOKEN_EXPIRED         
│                                                                      
│  sukses → dapat payload                                              
▼                                                                      
Cek `payload.jti` di token_blocklist ─── ada ──▶ 401 TOKEN_REVOKED      
│                                                                      
│  tidak ada                                                            
▼                                                                      
Set req.user = { id, email, nama }                                     
Lanjut ke controller (next())                                          
```

Cara pakainya: tinggal pasang di route, mis:
```ts
router.use(requireAuth);          // semua route di bawah ini wajib auth
// atau
router.get("/protected", requireAuth, handler);  // hanya satu endpoint
```

---

## 8. Konvensi Response — Pola yang Konsisten

Semua endpoint balas JSON dengan struktur sama:

**Sukses:**
```json
{
  "data": { ... },          // hasil operasi
  "error": null,
  "meta": {
    "timestamp": "2026-05-27T09:00:00Z",
    "pagination": { ... }   // optional, di list endpoint
  }
}
```

**Gagal:**
```json
{
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validasi input gagal",
    "details": { ... }     // optional, detail per-field
  },
  "meta": { "timestamp": "..." }
}
```

**Daftar `error.code` standar:**

| Code | HTTP | Kapan muncul |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Input tidak sesuai aturan Zod |
| `NOT_FOUND` | 404 | Resource tidak ada di DB |
| `UNAUTHORIZED` | 401 | Tidak kirim/salah Bearer token |
| `INVALID_TOKEN` | 401 | JWT malformed atau signature salah |
| `TOKEN_EXPIRED` | 401 | JWT sudah lewat `exp` |
| `TOKEN_REVOKED` | 401 | JWT ada di blocklist (sudah logout) |
| `INVALID_CREDENTIALS` | 401 | Login salah email/password |
| `DUPLICATE_TABUNGAN` | 409 | Nasabah sudah punya tabungan aktif |
| `DUPLICATE_ENTRY` | 409 | NIK/email/nomor rekening duplikat |
| `NASABAH_NOT_REGISTERED` | 403 | Coba buka rekening tapi nasabah tidak terdaftar |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | Endpoint setor tanpa header Idempotency-Key |

Pola konsisten ini bikin frontend / consumer API gampang handle response — mereka cukup:
1. Cek `response.error === null` → sukses.
2. Atau `response.error.code` → tampilkan pesan sesuai code.

---

## 9. Hal Teknis yang Biasanya Bikin Heran

### "BigInt.toJSON" di src/index.ts
Kolom saldo/nominal pakai tipe `BigInt` di DB (karena angka rupiah bisa besar sekali). Tapi JavaScript native `JSON.stringify` tidak bisa serialize BigInt. Solusinya: 1 baris polyfill yang bilang "kalau ada BigInt, convert ke string". Itu kenapa `saldo` di response berupa `"2050000"` (string), bukan `2050000` (number).

### "Prisma client" di src/generated/prisma/
Bukan ditulis manual — auto-generated oleh `npx prisma generate` setiap kali schema berubah. Folder ini di-gitignore. Kalau di-delete, tinggal `prisma generate` lagi.

### "ts-node" vs "tsc" vs "node"
- `npm run dev` → `nodemon` jalan `ts-node` → langsung eksekusi `.ts` (lambat tapi otomatis reload saat berubah).
- `npm run build` → `tsc` (TypeScript compiler) → compile `.ts` ke `.js` di folder `dist/`.
- `npm run start` → `node dist/index.js` → jalankan hasil compile (production).

### Kenapa pakai TypeScript bukan JavaScript biasa?
TypeScript = JavaScript + tipe data. Saat coding, IDE bisa kasih warning kalau Anda salah ketik nama field atau salah pakai tipe. Bug ke-catch sebelum jalan, bukan setelahnya.

### Mengapa folder `src/generated/prisma/` di-gitignore?
Karena auto-generated. Tiap mesin yang clone project tinggal `npx prisma generate` untuk re-create. Tidak perlu commit (akan bikin git diff besar tiap update Prisma).

---

## 10. Glossary Singkat

| Istilah | Artinya |
|---|---|
| **API** | Application Programming Interface — kontrak komunikasi antar program |
| **REST** | Gaya API yang pakai HTTP method (GET/POST/PATCH/DELETE) + URL semantik |
| **JWT** | JSON Web Token — string ter-tanda tangani untuk auth |
| **bcrypt** | Algoritma hash 1-arah untuk password (slow by design, anti brute-force) |
| **ORM** | Object Relational Mapper — translate kode jadi SQL (Prisma di sini) |
| **Migration** | File SQL yang mendokumentasikan perubahan struktur DB versi per versi |
| **Endpoint** | Satu URL + method (mis. `GET /api/v1/nasabah/:id`) |
| **Payload** | Body request/response, biasanya JSON |
| **Idempotent** | Operasi yang kalau dipanggil 2x hasilnya sama dengan 1x |
| **Transaction (DB)** | Sekumpulan operasi yang atomic — semua sukses atau semua batal |
| **Singleton** | Pattern: hanya 1 instance objek yang shared (mis. koneksi DB di `lib/prisma.ts`) |
| **Middleware** | Fungsi yang berjalan di antara request masuk dan controller, untuk hal lintas-modul (auth, logging, cors) |

---

## 11. Kemana Mencari Saat Ada Bug

| Gejala | Cek file ini |
|---|---|
| Endpoint tidak dikenali (404 Cannot GET) | `src/index.ts` (apakah route ter-mount), `src/modules/<x>/<x>.route.ts` |
| Validasi terlalu ketat/longgar | `src/modules/<x>/<x>.schema.ts` |
| Response field salah | `src/modules/<x>/<x>.controller.ts` |
| Query DB salah / lambat | `src/modules/<x>/<x>.service.ts` |
| Tabel/kolom bermasalah | `prisma/schema.prisma` + apakah migration sudah jalan |
| Auth selalu 401 | `src/middleware/requireAuth.ts`, `.env` (JWT_SECRET) |
| BigInt error di response | `src/index.ts` (polyfill `BigInt.prototype.toJSON`) |

---

## 12. Untuk Belajar Lebih Dalam (Opsional)

Topik yang nanti perlu Anda pelajari kalau mau lanjut explore:

- **Express middleware chain** — bagaimana request lewat banyak fungsi berurutan.
- **Prisma relations & include** — query JOIN antar tabel.
- **DB transaction & isolation level** — kapan butuh `SERIALIZABLE` vs `READ COMMITTED`.
- **JWT security** — kenapa secret harus panjang, kenapa pakai HS256 vs RS256.
- **Zod refinement** — validasi yang butuh logic complex (mis. password match confirmation).
- **Rate limiting & helmet config** — security hardening untuk production.

Untuk semua ini, dokumentasi resmi (Express, Prisma, Zod, jsonwebtoken) sangat readable bahkan untuk non-coder. Tinggal Google nama library + "docs".
