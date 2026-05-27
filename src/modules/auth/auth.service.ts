import bcrypt from "bcrypt";
import jwt, { type SignOptions } from "jsonwebtoken";
import { randomUUID } from "crypto";
import { prisma } from "../../lib/prisma";

export const authService = {
  findByEmail: (email: string) =>
    prisma.nasabah.findUnique({ where: { email } }),

  verifyPassword: (plain: string, hashed: string) =>
    bcrypt.compare(plain, hashed),

  issueToken: (nasabah: { id: string; email: string; nama: string }) => {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET tidak di-set");
    const expiresIn = (process.env.JWT_EXPIRES_IN || "1d") as SignOptions["expiresIn"];
    const jti = randomUUID();

    const token = jwt.sign(
      { email: nasabah.email, nama: nasabah.nama },
      secret,
      {
        algorithm: "HS256",
        expiresIn,
        subject: nasabah.id,
        jwtid: jti,
      }
    );
    const decoded = jwt.decode(token) as { exp?: number };
    return { token, jti, expiresAt: decoded.exp ?? null };
  },

  blocklistToken: (jti: string, expSeconds: number, nasabahId?: string) =>
    prisma.tokenBlocklist.create({
      data: {
        jti,
        nasabahId: nasabahId ?? null,
        expiresAt: new Date(expSeconds * 1000),
      },
    }),

  isBlocked: (jti: string) =>
    prisma.tokenBlocklist.findUnique({ where: { jti } }),
};
