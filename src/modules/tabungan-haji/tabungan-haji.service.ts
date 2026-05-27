import { prisma } from "../../lib/prisma";
import type {
  CreateTabunganInput,
  ListMutasiQuery,
  SetorInput,
} from "./tabungan-haji.schema";

const NOMOR_REKENING_PREFIX = "TH-";
const NOMOR_REKENING_PAD = 10;

async function generateNomorRekening(): Promise<string> {
  // Ambil nomor terbesar lalu +1. Cukup untuk skala demo (tidak race-safe high-concurrency).
  const last = await prisma.tabunganHaji.findFirst({
    orderBy: { nomorRekening: "desc" },
    select: { nomorRekening: true },
  });

  let nextSeq = 1;
  if (last) {
    const numericPart = last.nomorRekening.replace(NOMOR_REKENING_PREFIX, "");
    const parsed = parseInt(numericPart, 10);
    if (!Number.isNaN(parsed)) nextSeq = parsed + 1;
  }

  return NOMOR_REKENING_PREFIX + String(nextSeq).padStart(NOMOR_REKENING_PAD, "0");
}

export const tabunganHajiService = {
  // THO-205: cek nasabah & cek tabungan aktif
  findNasabahById: (id: string) =>
    prisma.nasabah.findUnique({ where: { id } }),

  findActiveTabunganByNasabah: (nasabahId: string) =>
    prisma.tabunganHaji.findFirst({
      where: { nasabahId, status: "AKTIF" },
    }),

  createTabungan: async ({ nasabahId }: CreateTabunganInput) => {
    const nomorRekening = await generateNomorRekening();
    return prisma.tabunganHaji.create({
      data: {
        nasabahId,
        nomorRekening,
        saldo: 0n,
        status: "AKTIF",
      },
    });
  },

  // THO-207: detail tabungan + nasabah
  findById: (id: string) =>
    prisma.tabunganHaji.findUnique({
      where: { id },
      include: {
        nasabah: {
          select: { id: true, nik: true, nama: true, email: true, nomorHp: true },
        },
      },
    }),

  // THO-206: setor dengan transaction + idempotency
  findIdempotencyKey: (key: string, endpoint: string) =>
    prisma.idempotencyKey.findFirst({ where: { key, endpoint } }),

  setor: async (
    tabunganId: string,
    { nominal, metode }: SetorInput,
    idempotencyKey: string,
    endpoint: string
  ) => {
    return prisma.$transaction(async (tx) => {
      // Lock baris tabungan untuk hindari double-spend / race
      const rows = await tx.$queryRaw<
        Array<{ id: string; saldo: bigint }>
      >`SELECT id, saldo FROM tabungan_haji WHERE id = ${tabunganId} FOR UPDATE`;

      const current = rows[0];
      if (!current) return { kind: "NOT_FOUND" as const };

      const saldoSebelum = current.saldo;
      const saldoSesudah = saldoSebelum + BigInt(nominal);

      const referensi = "SETOR-" + Date.now() + "-" + idempotencyKey.slice(0, 8);

      const transaksi = await tx.transaksi.create({
        data: {
          tabunganId,
          jenis: "SETORAN",
          nominal: BigInt(nominal),
          saldoSebelum,
          saldoSesudah,
          referensi,
          metode: metode ?? null,
        },
      });

      await tx.tabunganHaji.update({
        where: { id: tabunganId },
        data: { saldo: saldoSesudah },
      });

      const responseBody = {
        message: "Setoran berhasil",
        transaksi: {
          ...transaksi,
          nominal: transaksi.nominal.toString(),
          saldoSebelum: transaksi.saldoSebelum.toString(),
          saldoSesudah: transaksi.saldoSesudah.toString(),
        },
      };

      await tx.idempotencyKey.create({
        data: {
          key: idempotencyKey,
          endpoint,
          statusCode: 201,
          response: responseBody,
        },
      });

      return { kind: "OK" as const, statusCode: 201, body: responseBody };
    });
  },

  // THO-208: mutasi
  findMutasi: async (
    tabunganId: string,
    { page, limit, jenis }: ListMutasiQuery
  ) => {
    const where = {
      tabunganId,
      ...(jenis ? { jenis } : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.transaksi.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { waktu: "desc" },
      }),
      prisma.transaksi.count({ where }),
    ]);

    return { items, total, page, limit };
  },

  // THO-212: estimasi tahun berangkat haji
  // Asumsi:
  //   - Target setoran porsi haji  : TARGET_PORSI_RP (default 25jt)
  //   - Antrian rata-rata di Indo  : ANTRIAN_TAHUN (default 10 tahun)
  //   - Rata-rata setoran/bulan dihitung dari history SETORAN nasabah (window 6 bulan terakhir).
  estimasiTahunBerangkat: async (tabunganId: string) => {
    const TARGET_PORSI_RP = 25_000_000n;
    const ANTRIAN_TAHUN = 10;

    const tabungan = await prisma.tabunganHaji.findUnique({
      where: { id: tabunganId },
    });
    if (!tabungan) return { kind: "NOT_FOUND" as const };

    const saldo = tabungan.saldo;
    const sudahCukup = saldo >= TARGET_PORSI_RP;
    const tahunSekarang = new Date().getFullYear();

    if (sudahCukup) {
      return {
        kind: "OK" as const,
        body: {
          tabunganId,
          saldoSekarang: saldo.toString(),
          targetPorsi: TARGET_PORSI_RP.toString(),
          sudahMencapaiTarget: true,
          rataRataSetoranBulanan: null,
          bulanDibutuhkan: 0,
          tahunMencapaiTarget: tahunSekarang,
          antrianTahun: ANTRIAN_TAHUN,
          estimasiTahunBerangkat: tahunSekarang + ANTRIAN_TAHUN,
          catatan:
            "Saldo sudah memenuhi target porsi haji. Estimasi tahun berangkat = tahun ini + antrian.",
        },
      };
    }

    const enamBulanLalu = new Date();
    enamBulanLalu.setMonth(enamBulanLalu.getMonth() - 6);
    const setoran = await prisma.transaksi.findMany({
      where: {
        tabunganId,
        jenis: "SETORAN",
        waktu: { gte: enamBulanLalu },
      },
      select: { nominal: true },
    });

    if (setoran.length === 0) {
      return {
        kind: "OK" as const,
        body: {
          tabunganId,
          saldoSekarang: saldo.toString(),
          targetPorsi: TARGET_PORSI_RP.toString(),
          sudahMencapaiTarget: false,
          rataRataSetoranBulanan: null,
          bulanDibutuhkan: null,
          tahunMencapaiTarget: null,
          antrianTahun: ANTRIAN_TAHUN,
          estimasiTahunBerangkat: null,
          catatan:
            "Tidak ada history setoran 6 bulan terakhir — estimasi tidak bisa dihitung.",
        },
      };
    }

    const totalSetoran = setoran.reduce((acc, t) => acc + t.nominal, 0n);
    // Pembagi tetap 6 (rata-rata per bulan window 6 bulan)
    const rataPerBulan = totalSetoran / 6n;
    const sisa = TARGET_PORSI_RP - saldo;
    const bulanDibutuhkan =
      rataPerBulan > 0n
        ? Number((sisa + rataPerBulan - 1n) / rataPerBulan) // ceil
        : null;
    const tahunMencapai =
      bulanDibutuhkan !== null
        ? tahunSekarang + Math.ceil(bulanDibutuhkan / 12)
        : null;
    const estimasi = tahunMencapai !== null ? tahunMencapai + ANTRIAN_TAHUN : null;

    return {
      kind: "OK" as const,
      body: {
        tabunganId,
        saldoSekarang: saldo.toString(),
        targetPorsi: TARGET_PORSI_RP.toString(),
        sudahMencapaiTarget: false,
        rataRataSetoranBulanan: rataPerBulan.toString(),
        bulanDibutuhkan,
        tahunMencapaiTarget: tahunMencapai,
        antrianTahun: ANTRIAN_TAHUN,
        estimasiTahunBerangkat: estimasi,
        catatan:
          rataPerBulan === 0n
            ? "Rata-rata setoran 0 — estimasi tidak bisa dihitung."
            : `Berdasarkan rata-rata setoran ${rataPerBulan.toString()} per bulan.`,
      },
    };
  },
};
