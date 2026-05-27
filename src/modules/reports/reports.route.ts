import { Router } from "express";
import { reportsController } from "./reports.controller";
import { requireAuth } from "../../middleware/requireAuth";

const router = Router();

// THO-213: GET /api/v1/reports/transaksi-bulanan?month=YYYY-MM
router.get(
  "/transaksi-bulanan",
  requireAuth,
  reportsController.monthlyTransaksi
);

export default router;
