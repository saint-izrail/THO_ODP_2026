import { Router } from "express";
import { tabunganHajiController } from "./tabungan-haji.controller";
import { requireAuth } from "../../middleware/requireAuth";

const router = Router();

// Semua endpoint butuh authentication (THO-210)
router.use(requireAuth);

// THO-205  POST   /                -> buka rekening
//          GET    /saya            -> tabungan aktif milik nasabah yang login
// THO-207  GET    /:id             -> detail saldo & tabungan
// THO-206  POST   /:id/setor       -> setor saldo (Idempotency-Key wajib)
// THO-208  GET    /:id/mutasi      -> history mutasi (pagination + filter jenis)
// THO-212  GET    /:id/estimasi    -> estimasi tahun berangkat haji
router.post("/", tabunganHajiController.create);
// PENTING: /saya harus didaftarkan SEBELUM /:id agar tidak tertangkap sebagai id
router.get("/saya", tabunganHajiController.saya);
router.get("/:id", tabunganHajiController.detail);
router.post("/:id/setor", tabunganHajiController.setor);
router.get("/:id/mutasi", tabunganHajiController.listMutasi);
router.get("/:id/estimasi", tabunganHajiController.estimasi);

export default router;
