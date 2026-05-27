import { z } from "zod";

// THO-213: month format YYYY-MM
export const MonthlyReportQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Format month harus YYYY-MM (mis. 2026-05)"),
});
export type MonthlyReportQuery = z.infer<typeof MonthlyReportQuerySchema>;
