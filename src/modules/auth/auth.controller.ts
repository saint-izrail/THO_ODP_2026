import type { Request, Response, NextFunction } from "express";
import { LoginSchema } from "./auth.schema";
import { authService } from "./auth.service";

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

export const authController = {
  // THO-209: POST /api/v1/auth/login
  async login(req: Request, res: Response, next: NextFunction) {
    const parsed = LoginSchema.safeParse(req.body);
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
      const nasabah = await authService.findByEmail(parsed.data.email);
      // Gunakan pesan generik (tidak bocorkan ada/tidaknya akun)
      if (!nasabah || !nasabah.password) {
        return err(res, 401, "INVALID_CREDENTIALS", "Email atau password salah");
      }

      const ok = await authService.verifyPassword(
        parsed.data.password,
        nasabah.password
      );
      if (!ok) {
        return err(res, 401, "INVALID_CREDENTIALS", "Email atau password salah");
      }

      const { token, expiresAt } = authService.issueToken({
        id: nasabah.id,
        email: nasabah.email,
        nama: nasabah.nama,
      });

      return res.status(200).json({
        data: {
          message: "Login berhasil",
          token,
          tokenType: "Bearer",
          expiresAt: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
          user: {
            id: nasabah.id,
            nama: nasabah.nama,
            email: nasabah.email,
          },
        },
        error: null,
        meta: { timestamp: ts() },
      });
    } catch (e: any) {
      next(e);
    }
  },

  // THO-211: POST /api/v1/auth/logout (butuh requireAuth)
  async logout(req: Request, res: Response, next: NextFunction) {
    if (!req.jwtJti || !req.jwtExp || !req.user) {
      return err(res, 401, "UNAUTHORIZED", "Tidak ter-autentikasi");
    }
    try {
      await authService.blocklistToken(req.jwtJti, req.jwtExp, req.user.id);
      return res.status(200).json({
        data: { message: "Logout berhasil, token sudah di-revoke" },
        error: null,
        meta: { timestamp: ts() },
      });
    } catch (e: any) {
      if (e.code === "P2002") {
        return res.status(200).json({
          data: { message: "Token sudah di-revoke sebelumnya" },
          error: null,
          meta: { timestamp: ts() },
        });
      }
      next(e);
    }
  },
};
