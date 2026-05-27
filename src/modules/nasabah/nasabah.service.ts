import bcrypt from 'bcrypt';
import { prisma } from '../../lib/prisma';
import type {
  CreateNasabahInput,
  ListNasabahQuery,
  UpdateNasabahInput,
} from './nasabah.schema';

const SAFE_SELECT = {
  id: true,
  nik: true,
  nama: true,
  email: true,
  nomorHp: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const nasabahService = {
  create: async (data: CreateNasabahInput) => {
    const hashed = await bcrypt.hash(data.password, 10);
    return prisma.nasabah.create({
      data: { ...data, password: hashed },
      select: SAFE_SELECT,
    });
  },

  findMany: async ({ page, limit, search }: ListNasabahQuery) => {
    const where = search
      ? {
          OR: [
            { nama: { contains: search, mode: 'insensitive' as const } },
            { nik: { contains: search } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [items, total] = await prisma.$transaction([
      prisma.nasabah.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: SAFE_SELECT,
      }),
      prisma.nasabah.count({ where }),
    ]);

    return { items, total, page, limit };
  },

  findById: (id: string) =>
    prisma.nasabah.findUnique({ where: { id }, select: SAFE_SELECT }),

  update: (id: string, data: UpdateNasabahInput) =>
    prisma.nasabah.update({ where: { id }, data, select: SAFE_SELECT }),

  remove: (id: string) => prisma.nasabah.delete({ where: { id } }),
};