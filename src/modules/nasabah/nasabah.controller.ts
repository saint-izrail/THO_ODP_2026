import type { Request, Response, NextFunction } from "express";
import {
  CreateNasabahSchema,
  ListNasabahQuerySchema,
  NasabahIdParamSchema,
  UpdateNasabahSchema,
} from "./nasabah.schema";
import { nasabahService } from "./nasabah.service";

export const nasabahController = {
  async create(req: Request, res: Response, next: NextFunction) {
    // 1. Validasi Input Menggunakan Zod
    const parsed = CreateNasabahSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(422).json({
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "Validasi input gagal",
          details: parsed.error.flatten().fieldErrors
        },
        meta: {
          timestamp: new Date().toISOString()
        }
      });
    }

    // 2. Eksekusi ke Service Database
    try {
      const nasabah = await nasabahService.create(parsed.data);

      return res.status(201).json({
        data: {
          message: "Nasabah created successfully",
          nasabah
        },
        error: null,
        meta: {
          timestamp: new Date().toISOString()
        }
      });

    } catch (err: any) { // <-- Ditambahkan : any agar TypeScript mengizinkan akses ke properti error di bawah
      // 3. Error Handling Khusus Data Duplikat (Unique Constraint dari Prisma)
      if (err.code === "P2002") {
        const target = (err.meta?.target as string[])?. [0] ?? "field";

        return res.status(409).json({
          data: null,
          error: {
            code: "DUPLICATE_ENTRY",
            message: `${target} sudah terdaftar`
          },
          meta: {
            timestamp: new Date().toISOString()
          }
        });
      }

      // Jika error lainnya (misal database mati), lempar ke global error handler Express
      next(err);
    }
  },

  async list(req: Request, res: Response, next: NextFunction) {
    // 1. Validasi Query Parameter
    const parsed = ListNasabahQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      return res.status(422).json({
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "Validasi query gagal",
          details: parsed.error.flatten().fieldErrors,
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    }

    // 2. Eksekusi ke Service Database
    try {
      const { items, total, page, limit } = await nasabahService.findMany(parsed.data);

      return res.status(200).json({
        data: items,
        error: null,
        meta: {
          timestamp: new Date().toISOString(),
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        },
      });
    } catch (err: any) {
      next(err);
    }
  },

  async detail(req: Request, res: Response, next: NextFunction) {
    // 1. Validasi Param ID
    const parsed = NasabahIdParamSchema.safeParse(req.params);

    if (!parsed.success) {
      return res.status(422).json({
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "Validasi param gagal",
          details: parsed.error.flatten().fieldErrors,
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    }

    // 2. Eksekusi ke Service Database
    try {
      const nasabah = await nasabahService.findById(parsed.data.id);

      if (!nasabah) {
        return res.status(404).json({
          data: null,
          error: {
            code: "NOT_FOUND",
            message: "Nasabah tidak ditemukan",
          },
          meta: {
            timestamp: new Date().toISOString(),
          },
        });
      }

      return res.status(200).json({
        data: nasabah,
        error: null,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err: any) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    // 1. Validasi Param ID
    const parsedParam = NasabahIdParamSchema.safeParse(req.params);

    if (!parsedParam.success) {
      return res.status(422).json({
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "Validasi param gagal",
          details: parsedParam.error.flatten().fieldErrors,
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    }

    // 2. Validasi Body
    const parsedBody = UpdateNasabahSchema.safeParse(req.body);

    if (!parsedBody.success) {
      return res.status(422).json({
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "Validasi input gagal",
          details: parsedBody.error.flatten().fieldErrors,
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    }

    // 3. Eksekusi ke Service Database
    try {
      const nasabah = await nasabahService.update(parsedParam.data.id, parsedBody.data);

      return res.status(200).json({
        data: {
          message: "Nasabah updated successfully",
          nasabah,
        },
        error: null,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err: any) {
      // Data Duplikat (Unique Constraint dari Prisma)
      if (err.code === "P2002") {
        const target = (err.meta?.target as string[])?.[0] ?? "field";

        return res.status(409).json({
          data: null,
          error: {
            code: "DUPLICATE_ENTRY",
            message: `${target} sudah terdaftar`,
          },
          meta: {
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Record tidak ditemukan saat update (Prisma P2025)
      if (err.code === "P2025") {
        return res.status(404).json({
          data: null,
          error: {
            code: "NOT_FOUND",
            message: "Nasabah tidak ditemukan",
          },
          meta: {
            timestamp: new Date().toISOString(),
          },
        });
      }

      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    // 1. Validasi Param ID
    const parsed = NasabahIdParamSchema.safeParse(req.params);

    if (!parsed.success) {
      return res.status(422).json({
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "Validasi param gagal",
          details: parsed.error.flatten().fieldErrors,
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    }

    // 2. Eksekusi ke Service Database
    try {
      await nasabahService.remove(parsed.data.id);

      return res.status(200).json({
        data: {
          message: "Nasabah deleted successfully",
        },
        error: null,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err: any) {
      // Record tidak ditemukan saat delete (Prisma P2025)
      if (err.code === "P2025") {
        return res.status(404).json({
          data: null,
          error: {
            code: "NOT_FOUND",
            message: "Nasabah tidak ditemukan",
          },
          meta: {
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Foreign key constraint (mis. nasabah masih punya tabungan aktif)
      if (err.code === "P2003") {
        return res.status(409).json({
          data: null,
          error: {
            code: "CONSTRAINT_VIOLATION",
            message: "Nasabah tidak bisa dihapus karena masih memiliki tabungan terkait",
          },
          meta: {
            timestamp: new Date().toISOString(),
          },
        });
      }

      next(err);
    }
  },
};