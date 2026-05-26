import { prisma } from '../../lib/prisma';
// Kita ambil tipe data yang benar dari file schema, bukan controller
import type {
  CreateNasabahInput,
  ListNasabahQuery,
  UpdateNasabahInput,
} from './nasabah.schema';

export const nasabahService = {
  // Pastikan nama tipe datanya menggunakan huruf besar sesuai yang ada di schema (CreateNasabahInput)
  create: (data: CreateNasabahInput) => prisma.nasabah.create({ data }),

  // List nasabah dengan pagination + opsional pencarian by nama/nik/email
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
      }),
      prisma.nasabah.count({ where }),
    ]);

    return { items, total, page, limit };
  },

  findById: (id: string) => prisma.nasabah.findUnique({ where: { id } }),

  update: (id: string, data: UpdateNasabahInput) =>
    prisma.nasabah.update({ where: { id }, data }),

  remove: (id: string) => prisma.nasabah.delete({ where: { id } }),
};