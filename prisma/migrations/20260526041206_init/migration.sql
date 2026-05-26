-- CreateTable
CREATE TABLE "nasabah" (
    "id" TEXT NOT NULL,
    "nik" VARCHAR(16) NOT NULL,
    "nama" VARCHAR(100) NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "nomor_hp" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nasabah_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tabungan_haji" (
    "id" TEXT NOT NULL,
    "nasabah_id" TEXT NOT NULL,
    "nomor_rekening" VARCHAR(20) NOT NULL,
    "saldo" BIGINT NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'AKTIF',
    "dibuka_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tabungan_haji_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaksi" (
    "id" TEXT NOT NULL,
    "tabungan_id" TEXT NOT NULL,
    "jenis" VARCHAR(20) NOT NULL,
    "nominal" BIGINT NOT NULL,
    "saldo_sebelum" BIGINT NOT NULL,
    "saldo_sesudah" BIGINT NOT NULL,
    "referensi" VARCHAR(50) NOT NULL,
    "metode" VARCHAR(20),
    "waktu" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaksi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nasabah_nik_key" ON "nasabah"("nik");

-- CreateIndex
CREATE UNIQUE INDEX "nasabah_email_key" ON "nasabah"("email");

-- CreateIndex
CREATE UNIQUE INDEX "tabungan_haji_nomor_rekening_key" ON "tabungan_haji"("nomor_rekening");

-- CreateIndex
CREATE UNIQUE INDEX "transaksi_referensi_key" ON "transaksi"("referensi");

-- AddForeignKey
ALTER TABLE "tabungan_haji" ADD CONSTRAINT "tabungan_haji_nasabah_id_fkey" FOREIGN KEY ("nasabah_id") REFERENCES "nasabah"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaksi" ADD CONSTRAINT "transaksi_tabungan_id_fkey" FOREIGN KEY ("tabungan_id") REFERENCES "tabungan_haji"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
