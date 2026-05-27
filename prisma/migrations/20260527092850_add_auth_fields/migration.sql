-- AlterTable
ALTER TABLE "nasabah" ADD COLUMN     "password" VARCHAR(255);

-- CreateTable
CREATE TABLE "token_blocklist" (
    "jti" VARCHAR(100) NOT NULL,
    "nasabah_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_blocklist_pkey" PRIMARY KEY ("jti")
);

-- CreateIndex
CREATE INDEX "token_blocklist_expires_at_idx" ON "token_blocklist"("expires_at");
