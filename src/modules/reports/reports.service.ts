import { prisma } from "../../lib/prisma";

export const reportsService = {
  // THO-213: ambil semua transaksi dalam 1 bulan, beserta data tabungan & nasabah.
  findMonthlyTransaksi: async (year: number, month1to12: number) => {
    const start = new Date(Date.UTC(year, month1to12 - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, month1to12, 1, 0, 0, 0));

    return prisma.transaksi.findMany({
      where: { waktu: { gte: start, lt: end } },
      orderBy: { waktu: "asc" },
      include: {
        tabungan: {
          select: {
            nomorRekening: true,
            nasabah: { select: { nik: true, nama: true } },
          },
        },
      },
    });
  },
};
