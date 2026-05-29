# Flowchart Sistem — Tabungan Haji API

Dokumen ini berisi diagram alur sistem dalam format **Mermaid**.
Untuk melihat render-nya: buka di GitHub, atau di VSCode pakai ekstensi *Markdown Preview Mermaid Support*.

Stack: **Express 5 + TypeScript + Prisma 6 + PostgreSQL + Zod + JWT**.

---

## 1. Arsitektur Berlapis (Layered Architecture)

Tiap request mengalir lewat lapisan yang sama: Route → (Auth) → Controller (validasi) → Service (logika + DB) → Prisma → PostgreSQL.

```mermaid
flowchart TD
    Client["Client (Postman / Frontend)"]

    subgraph App["Express App (src/index.ts)"]
        MW["Global Middleware<br/>cors · helmet · express.json<br/>BigInt.toJSON patch"]
        Health["GET /health"]
        subgraph Routers["Routers /api/v1"]
            R_Auth["auth.route"]
            R_Nasabah["nasabah.route"]
            R_Tab["tabungan-haji.route"]
            R_Rep["reports.route"]
        end
        Auth["Middleware requireAuth<br/>(verifikasi JWT + cek blocklist)"]
        subgraph Controllers["Controllers (validasi Zod + HTTP envelope)"]
            C["controller.method"]
        end
        subgraph Services["Services (logika bisnis + akses data)"]
            S["service.method"]
        end
    end

    Prisma["Prisma Client"]
    DB[("PostgreSQL")]

    Client --> MW
    MW --> Health
    MW --> Routers
    R_Auth --> Auth
    R_Nasabah --> Auth
    R_Tab --> Auth
    R_Rep --> Auth
    Auth --> C
    Routers -. "endpoint publik<br/>(login, register)" .-> C
    C --> S
    S --> Prisma
    Prisma --> DB
    DB --> Prisma --> S --> C --> Client
```

---

## 2. Peta Endpoint & Proteksi

```mermaid
flowchart LR
    subgraph Public["🔓 Publik (tanpa token)"]
        P1["GET /health"]
        P2["POST /api/v1/auth/login"]
        P3["POST /api/v1/nasabah  (register)"]
    end

    subgraph Protected["🔒 Butuh JWT (requireAuth)"]
        A1["POST /api/v1/auth/logout"]
        N1["GET /api/v1/nasabah"]
        N2["GET /api/v1/nasabah/:id"]
        N3["PATCH /api/v1/nasabah/:id"]
        N4["DELETE /api/v1/nasabah/:id"]
        T1["POST /api/v1/tabungan-haji  (buka rekening)"]
        T2["GET /api/v1/tabungan-haji/:id  (detail saldo)"]
        T3["POST /api/v1/tabungan-haji/:id/setor  (+ Idempotency-Key)"]
        T4["GET /api/v1/tabungan-haji/:id/mutasi"]
        T5["GET /api/v1/tabungan-haji/:id/estimasi"]
        Rp["GET /api/v1/reports/transaksi-bulanan?month=YYYY-MM"]
    end
```

---

## 3. Lifecycle Request Umum (jalur ter-proteksi)

Pola yang dipakai semua controller: validasi dulu, baru sentuh DB, lalu map error → HTTP.

```mermaid
flowchart TD
    Start([Request masuk]) --> CORS["cors + helmet + json parse"]
    CORS --> IsProtected{"Route butuh auth?"}

    IsProtected -- "Tidak (publik)" --> Validate
    IsProtected -- "Ya" --> AuthMW["requireAuth"]

    AuthMW --> HasBearer{"Header Bearer ada?"}
    HasBearer -- Tidak --> E401a["401 UNAUTHORIZED"]
    HasBearer -- Ya --> VerifyJWT{"jwt.verify valid?"}
    VerifyJWT -- "Expired" --> E401b["401 TOKEN_EXPIRED"]
    VerifyJWT -- "Invalid" --> E401c["401 INVALID_TOKEN"]
    VerifyJWT -- Valid --> Blocklist{"jti ada di<br/>token_blocklist?"}
    Blocklist -- Ya --> E401d["401 TOKEN_REVOKED"]
    Blocklist -- Tidak --> AttachUser["req.user = payload"] --> Validate

    Validate{"Validasi Zod<br/>(params / query / body)"}
    Validate -- Gagal --> E422["422 VALIDATION_ERROR<br/>+ details.fieldErrors"]
    Validate -- Lolos --> Service["Panggil Service → Prisma → DB"]

    Service --> Outcome{"Hasil?"}
    Outcome -- "Sukses" --> OK["2xx { data, error:null, meta }"]
    Outcome -- "Tidak ditemukan (P2025/null)" --> E404["404 NOT_FOUND"]
    Outcome -- "Duplikat unik (P2002)" --> E409["409 DUPLICATE_ENTRY"]
    Outcome -- "FK constraint (P2003)" --> E409b["409 CONSTRAINT_VIOLATION"]
    Outcome -- "Error lain" --> Next["next(err) → handler default Express"]
```

> Semua response sukses & error memakai envelope konsisten: `{ data, error, meta:{ timestamp } }`.

---

## 4. Flow Autentikasi (Login → Pakai Token → Logout)

```mermaid
sequenceDiagram
    actor U as Client
    participant API as Express API
    participant Auth as authService
    participant DB as PostgreSQL

    Note over U,DB: LOGIN (THO-209)
    U->>API: POST /auth/login { email, password }
    API->>API: Validasi Zod
    API->>Auth: findByEmail(email)
    Auth->>DB: SELECT nasabah WHERE email
    DB-->>Auth: nasabah (atau null)
    alt nasabah null / tanpa password
        API-->>U: 401 INVALID_CREDENTIALS (pesan generik)
    else password cocok (bcrypt.compare)
        API->>Auth: issueToken() — JWT HS256 (sub, jti, exp)
        API-->>U: 200 { token, tokenType:"Bearer", user }
    end

    Note over U,DB: AKSES ENDPOINT TER-PROTEKSI (THO-210)
    U->>API: GET /nasabah  (Authorization: Bearer <token>)
    API->>API: requireAuth → jwt.verify
    API->>DB: cek token_blocklist by jti
    alt token valid & tidak di-blocklist
        API-->>U: 200 data
    else
        API-->>U: 401
    end

    Note over U,DB: LOGOUT (THO-211)
    U->>API: POST /auth/logout (Bearer)
    API->>Auth: blocklistToken(jti, exp)
    Auth->>DB: INSERT token_blocklist
    API-->>U: 200 "token di-revoke"
    Note right of DB: token yg sama dipakai lagi → 401 TOKEN_REVOKED
```

---

## 5. Flow Setor Saldo (THO-206) — Idempotency + DB Transaction

Endpoint paling kompleks. Pakai **Idempotency-Key** (anti dobel-setor) + **transaksi DB** dengan **row lock `FOR UPDATE`** (anti race / double-spend).

```mermaid
flowchart TD
    Start([POST /tabungan-haji/:id/setor]) --> Key{"Header Idempotency-Key<br/>ada & 8-100 char?"}
    Key -- Tidak --> E400["400 IDEMPOTENCY_KEY_REQUIRED"]
    Key -- Ya --> VParam{"Validasi :id (UUID)"}
    VParam -- Gagal --> E422a["422 VALIDATION_ERROR"]
    VParam -- Lolos --> VBody{"Validasi body { nominal, metode }"}
    VBody -- Gagal --> E422b["422 VALIDATION_ERROR"]
    VBody -- Lolos --> Replay{"Key sudah pernah dipakai?<br/>(cek idempotency_keys)"}

    Replay -- "Ya (replay)" --> ReplayResp["Kembalikan response tersimpan<br/>header Idempotency-Replayed: true"]
    Replay -- Tidak --> TX[["BEGIN TRANSACTION"]]

    subgraph TXBlock["Prisma $transaction (atomic)"]
        TX --> Lock["SELECT ... FOR UPDATE<br/>(kunci baris tabungan)"]
        Lock --> Found{"Tabungan ada?"}
        Found -- Tidak --> Rollback["return NOT_FOUND → rollback"]
        Found -- Ya --> Calc["saldoSesudah = saldoSebelum + nominal"]
        Calc --> InsT["INSERT transaksi (jenis=SETORAN)"]
        InsT --> UpdT["UPDATE tabungan.saldo"]
        UpdT --> InsK["INSERT idempotency_keys (simpan response)"]
        InsK --> Commit[["COMMIT"]]
    end

    Rollback --> E404["404 NOT_FOUND"]
    Commit --> OK["201 { transaksi, saldo terbaru }"]

    InsK -. "race: 2 request key sama → P2002" .-> RaceCheck["Ambil response yg sudah tersimpan<br/>→ kembalikan sebagai replay"]
    RaceCheck --> ReplayResp
```

---

## 6. Flow Buka Rekening (THO-205)

```mermaid
flowchart TD
    Start([POST /tabungan-haji]) --> Auth["requireAuth"] --> V{"Validasi nasabahId (UUID)"}
    V -- Gagal --> E422["422 VALIDATION_ERROR"]
    V -- Lolos --> CekNasabah{"Nasabah terdaftar?"}
    CekNasabah -- Tidak --> E403["403 NASABAH_NOT_REGISTERED"]
    CekNasabah -- Ya --> CekAktif{"Sudah punya tabungan AKTIF?"}
    CekAktif -- Ya --> E409["409 DUPLICATE_TABUNGAN"]
    CekAktif -- Tidak --> Gen["Generate nomor rekening (TH-000000000N)"]
    Gen --> Create["INSERT tabungan_haji (saldo=0, status=AKTIF)"]
    Create --> OK["201 { tabungan }"]
```

---

## 7. Model Data (ERD)

```mermaid
erDiagram
    NASABAH ||--o{ TABUNGAN_HAJI : "punya"
    TABUNGAN_HAJI ||--o{ TRANSAKSI : "mencatat"

    NASABAH {
        uuid id PK
        string nik UK "16 digit"
        string nama
        string email UK
        string nomor_hp
        string password "bcrypt hash, nullable"
        datetime created_at
        datetime updated_at
    }
    TABUNGAN_HAJI {
        uuid id PK
        uuid nasabah_id FK
        string nomor_rekening UK
        bigint saldo "default 0"
        string status "AKTIF / ..."
        datetime dibuka_at
    }
    TRANSAKSI {
        uuid id PK
        uuid tabungan_id FK
        string jenis "SETORAN / ..."
        bigint nominal
        bigint saldo_sebelum
        bigint saldo_sesudah
        string referensi UK
        string metode "nullable"
        datetime waktu
    }
    IDEMPOTENCY_KEYS {
        string key PK
        string endpoint
        int status_code
        json response
        datetime created_at
    }
    TOKEN_BLOCKLIST {
        string jti PK
        uuid nasabah_id "nullable"
        datetime expires_at
        datetime created_at
    }
```

> `IDEMPOTENCY_KEYS` & `TOKEN_BLOCKLIST` berdiri sendiri (tidak ada FK formal ke nasabah) — dipakai sebagai mekanisme idempotensi setoran dan revoke token JWT.
