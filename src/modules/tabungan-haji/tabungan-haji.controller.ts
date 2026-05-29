import type { Request, Response, NextFunction } from "express";
import {
  CreateTabunganSchema,
  ListMutasiQuerySchema,
  SetorSchema,
  TabunganHajiIdParamSchema,
} from "./tabungan-haji.schema";
import { tabunganHajiService } from "./tabungan-haji.service";

const ts = () => new Date().toISOString();

const err = (
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown
) =>
  res.status(status).json({
    data: null,
    error: { code, message, ...(details ? { details } : {}) },
    meta: { timestamp: ts() },
  });

export const tabunganHajiController = {
  // THO-205: POST /
  async create(req: Request, res: Response, next: NextFunction) {
    const parsed = CreateTabunganSchema.safeParse(req.body);
    if (!parsed.success) {
      return err(
        res,
        422,
        "VALIDATION_ERROR",
        "Validasi input gagal",
        parsed.error.flatten().fieldErrors
      );
    }

    try {
      const nasabah = await tabunganHajiService.findNasabahById(
        parsed.data.nasabahId
      );
      if (!nasabah) {
        return err(
          res,
          403,
          "NASABAH_NOT_REGISTERED",
          "Nasabah belum terdaftar, tidak diizinkan membuka rekening"
        );
      }

      const existing = await tabunganHajiService.findActiveTabunganByNasabah(
        parsed.data.nasabahId
      );
      if (existing) {
        return err(
          res,
          409,
          "DUPLICATE_TABUNGAN",
          "Nasabah sudah memiliki tabungan aktif"
        );
      }

      const tabungan = await tabunganHajiService.createTabungan(parsed.data);

      return res.status(201).json({
        data: { message: "Tabungan haji berhasil dibuka", tabungan },
        error: null,
        meta: { timestamp: ts() },
      });
    } catch (e: any) {
      if (e.code === "P2002") {
        return err(
          res,
          409,
          "DUPLICATE_TABUNGAN",
          "Nomor rekening sudah terdaftar"
        );
      }
      next(e);
    }
  },

  // GET /saya — tabungan aktif milik nasabah yang sedang login (req.user dari requireAuth)
  async saya(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      return err(res, 401, "UNAUTHORIZED", "Tidak ter-autentikasi");
    }
    try {
      const tabungan = await tabunganHajiService.findActiveTabunganByNasabah(
        req.user.id
      );
      // data null = nasabah belum punya tabungan aktif (bukan error)
      return res.status(200).json({
        data: tabungan,
        error: null,
        meta: { timestamp: ts() },
      });
    } catch (e: any) {
      next(e);
    }
  },

  // THO-207: GET /:id
  async detail(req: Request, res: Response, next: NextFunction) {
    const parsed = TabunganHajiIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      return err(
        res,
        422,
        "VALIDATION_ERROR",
        "Validasi param gagal",
        parsed.error.flatten().fieldErrors
      );
    }

    try {
      const tabungan = await tabunganHajiService.findById(parsed.data.id);
      if (!tabungan) {
        return err(res, 404, "NOT_FOUND", "Tabungan haji tidak ditemukan");
      }

      return res.status(200).json({
        data: tabungan,
        error: null,
        meta: { timestamp: ts() },
      });
    } catch (e: any) {
      next(e);
    }
  },

  // THO-206: POST /:id/setor
  async setor(req: Request, res: Response, next: NextFunction) {
    const idempotencyKey = req.header("Idempotency-Key");
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 100) {
      return err(
        res,
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Header 'Idempotency-Key' wajib (8-100 karakter)"
      );
    }

    const parsedParam = TabunganHajiIdParamSchema.safeParse(req.params);
    if (!parsedParam.success) {
      return err(
        res,
        422,
        "VALIDATION_ERROR",
        "Validasi param gagal",
        parsedParam.error.flatten().fieldErrors
      );
    }

    const parsedBody = SetorSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return err(
        res,
        422,
        "VALIDATION_ERROR",
        "Validasi input gagal",
        parsedBody.error.flatten().fieldErrors
      );
    }

    const endpoint = `POST /api/v1/tabungan-haji/${parsedParam.data.id}/setor`;

    try {
      // Replay check
      const existing = await tabunganHajiService.findIdempotencyKey(
        idempotencyKey,
        endpoint
      );
      if (existing) {
        res.setHeader("Idempotency-Replayed", "true");
        return res.status(existing.statusCode).json({
          data: existing.response,
          error: null,
          meta: { timestamp: ts() },
        });
      }

      const result = await tabunganHajiService.setor(
        parsedParam.data.id,
        parsedBody.data,
        idempotencyKey,
        endpoint
      );

      if (result.kind === "NOT_FOUND") {
        return err(res, 404, "NOT_FOUND", "Tabungan haji tidak ditemukan");
      }

      return res.status(result.statusCode).json({
        data: result.body,
        error: null,
        meta: { timestamp: ts() },
      });
    } catch (e: any) {
      // Race: dua request paralel dengan key yang sama → P2002 di idempotency_keys
      if (e.code === "P2002" && e.meta?.target?.includes?.("key")) {
        const existing = await tabunganHajiService.findIdempotencyKey(
          idempotencyKey,
          endpoint
        );
        if (existing) {
          res.setHeader("Idempotency-Replayed", "true");
          return res.status(existing.statusCode).json({
            data: existing.response,
            error: null,
            meta: { timestamp: ts() },
          });
        }
      }
      next(e);
    }
  },

  // THO-212: GET /:id/estimasi
  async estimasi(req: Request, res: Response, next: NextFunction) {
    const parsed = TabunganHajiIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      return err(
        res,
        422,
        "VALIDATION_ERROR",
        "Validasi param gagal",
        parsed.error.flatten().fieldErrors
      );
    }

    try {
      const result = await tabunganHajiService.estimasiTahunBerangkat(
        parsed.data.id
      );
      if (result.kind === "NOT_FOUND") {
        return err(res, 404, "NOT_FOUND", "Tabungan haji tidak ditemukan");
      }
      return res.status(200).json({
        data: result.body,
        error: null,
        meta: { timestamp: ts() },
      });
    } catch (e: any) {
      next(e);
    }
  },

  // THO-208: GET /:id/mutasi
  async listMutasi(req: Request, res: Response, next: NextFunction) {
    const parsedParam = TabunganHajiIdParamSchema.safeParse(req.params);
    if (!parsedParam.success) {
      return err(
        res,
        422,
        "VALIDATION_ERROR",
        "Validasi param gagal",
        parsedParam.error.flatten().fieldErrors
      );
    }

    const parsedQuery = ListMutasiQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return err(
        res,
        422,
        "VALIDATION_ERROR",
        "Validasi query gagal",
        parsedQuery.error.flatten().fieldErrors
      );
    }

    try {
      const tabungan = await tabunganHajiService.findById(parsedParam.data.id);
      if (!tabungan) {
        return err(res, 404, "NOT_FOUND", "Tabungan haji tidak ditemukan");
      }

      const { items, total, page, limit } = await tabunganHajiService.findMutasi(
        parsedParam.data.id,
        parsedQuery.data
      );

      return res.status(200).json({
        data: items,
        error: null,
        meta: {
          timestamp: ts(),
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        },
      });
    } catch (e: any) {
      next(e);
    }
  },
};
