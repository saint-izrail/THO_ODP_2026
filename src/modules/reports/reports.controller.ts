import type { Request, Response, NextFunction } from "express";
import { MonthlyReportQuerySchema } from "./reports.schema";
import { reportsService } from "./reports.service";

const ts = () => new Date().toISOString();

const CSV_HEADERS = [
  "waktu",
  "nomor_rekening",
  "nik",
  "nama",
  "jenis",
  "nominal",
  "saldo_sebelum",
  "saldo_sesudah",
  "referensi",
  "metode",
] as const;

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export const reportsController = {
  // THO-213: GET /api/v1/reports/transaksi-bulanan?month=YYYY-MM
  async monthlyTransaksi(req: Request, res: Response, next: NextFunction) {
    const parsed = MonthlyReportQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(422).json({
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "Validasi query gagal",
          details: parsed.error.flatten().fieldErrors,
        },
        meta: { timestamp: ts() },
      });
    }

    const [yearStr, monthStr] = parsed.data.month.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    try {
      const transaksi = await reportsService.findMonthlyTransaksi(year, month);

      const lines: string[] = [];
      lines.push(CSV_HEADERS.join(","));
      for (const t of transaksi) {
        lines.push(
          [
            t.waktu.toISOString(),
            t.tabungan.nomorRekening,
            t.tabungan.nasabah.nik,
            t.tabungan.nasabah.nama,
            t.jenis,
            t.nominal.toString(),
            t.saldoSebelum.toString(),
            t.saldoSesudah.toString(),
            t.referensi,
            t.metode,
          ]
            .map(csvEscape)
            .join(",")
        );
      }
      const csv = lines.join("\n") + "\n";

      const filename = `transaksi-${parsed.data.month}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("X-Report-Rows", String(transaksi.length));
      return res.status(200).send(csv);
    } catch (e: any) {
      next(e);
    }
  },
};
