import { z } from "zod";

export const TabunganHajiIdParamSchema = z.object({
  id: z.string().uuid("ID harus berupa UUID yang valid"),
});

// THO-205: Buka rekening
export const CreateTabunganSchema = z.object({
  nasabahId: z.string().uuid("nasabahId harus berupa UUID yang valid"),
});
export type CreateTabunganInput = z.infer<typeof CreateTabunganSchema>;

// THO-206: Setor saldo (minimum Rp 100.000)
export const SetorSchema = z.object({
  nominal: z.coerce
    .number()
    .int("Nominal harus bilangan bulat")
    .positive("Nominal harus positif")
    .min(100000, "Minimum setoran Rp 100.000"),
  metode: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .optional(),
});
export type SetorInput = z.infer<typeof SetorSchema>;

// THO-208: Mutasi
export const ListMutasiQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  jenis: z.string().trim().min(1).max(20).optional(),
});
export type ListMutasiQuery = z.infer<typeof ListMutasiQuerySchema>;
