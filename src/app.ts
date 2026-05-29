import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import nasabahRoutes from "./modules/nasabah/nasabah.route";
import tabunganHajiRoutes from "./modules/tabungan-haji/tabungan-haji.route";
import authRoutes from "./modules/auth/auth.route";
import reportsRoutes from "./modules/reports/reports.route";

// Prisma mengembalikan BigInt untuk kolom saldo/nominal — JSON.stringify default
// tidak support BigInt, jadi serialisasikan sebagai string.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (this: bigint) {
  return this.toString();
};

// App Express terkonfigurasi, TANPA listen — dipakai server lokal (index.ts)
// maupun handler serverless Vercel (api/index.ts).
export const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "tabungan-haji-api",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/nasabah", nasabahRoutes);
app.use("/api/v1/tabungan-haji", tabunganHajiRoutes);
app.use("/api/v1/reports", reportsRoutes);

export default app;
