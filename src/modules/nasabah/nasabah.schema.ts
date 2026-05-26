import { z } from 'zod';

export const CreateNasabahSchema = z.object({
  nik: z
    .string()
    .length(16, "NIK harus tepat 16 digit")
    .regex(/^\d+$/, "NIK harus angka"),
  nama: z
    .string()
    .min(3, "Nama minimal 3 karakter")
    .max(100),
  email: z
    .string()
    .email("Format email tidak valid")
    .max(150),
  nomorHp: z
    .string()
    .regex(/^08\d{8,11}$/, "Nomor HP harus format 08xxxxxxxxxx (10-13 digit)"),
});

export type CreateNasabahInput = z.infer<typeof CreateNasabahSchema>;

// NIK tidak ikut karena bersifat identitas permanen (tidak boleh diubah)
export const UpdateNasabahSchema = z
  .object({
    nama: z.string().min(3, "Nama minimal 3 karakter").max(100).optional(),
    email: z.string().email("Format email tidak valid").max(150).optional(),
    nomorHp: z
      .string()
      .regex(/^08\d{8,11}$/, "Nomor HP harus format 08xxxxxxxxxx (10-13 digit)")
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Setidaknya satu field harus diisi untuk update",
  });

export type UpdateNasabahInput = z.infer<typeof UpdateNasabahSchema>;

export const NasabahIdParamSchema = z.object({
  id: z.string().uuid("ID harus berupa UUID yang valid"),
});

export const ListNasabahQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().trim().min(1).optional(),
});

export type ListNasabahQuery = z.infer<typeof ListNasabahQuerySchema>;