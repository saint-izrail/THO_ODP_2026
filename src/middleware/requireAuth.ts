import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";

export interface AuthUser {
  id: string;
  email: string;
  nama: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      jwtJti?: string;
      jwtExp?: number;
    }
  }
}

const ts = () => new Date().toISOString();

function authError(res: Response, code: string, message: string, status = 401) {
  return res.status(status).json({
    data: null,
    error: { code, message },
    meta: { timestamp: ts() },
  });
}

// THO-210: Middleware requireAuth.
// Verifikasi JWT dari header `Authorization: Bearer <token>`, cek blocklist (THO-211),
// lalu attach payload user ke `req.user`. 401 kalau tidak valid.
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const header = req.header("Authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return authError(
      res,
      "UNAUTHORIZED",
      "Header Authorization Bearer wajib"
    );
  }

  const token = header.slice(7).trim();
  if (!token) {
    return authError(res, "UNAUTHORIZED", "Token kosong");
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return authError(
      res,
      "SERVER_MISCONFIGURED",
      "JWT_SECRET belum di-set",
      500
    );
  }

  let payload: jwt.JwtPayload;
  try {
    const decoded = jwt.verify(token, secret);
    if (typeof decoded === "string") {
      return authError(res, "INVALID_TOKEN", "Format token tidak valid");
    }
    payload = decoded;
  } catch (e: any) {
    if (e.name === "TokenExpiredError") {
      return authError(res, "TOKEN_EXPIRED", "Token sudah kedaluwarsa");
    }
    return authError(res, "INVALID_TOKEN", "Token tidak valid");
  }

  if (!payload.jti || !payload.sub) {
    return authError(res, "INVALID_TOKEN", "Token tidak lengkap (jti/sub)");
  }

  // Cek blocklist (token sudah di-logout)
  const blocked = await prisma.tokenBlocklist.findUnique({
    where: { jti: payload.jti },
  });
  if (blocked) {
    return authError(res, "TOKEN_REVOKED", "Token sudah di-logout");
  }

  req.user = {
    id: payload.sub,
    email: (payload as any).email,
    nama: (payload as any).nama,
  };
  req.jwtJti = payload.jti;
  if (payload.exp) req.jwtExp = payload.exp;
  next();
}
