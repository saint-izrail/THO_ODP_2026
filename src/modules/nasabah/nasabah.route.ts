import { Router } from "express";
import { nasabahController } from './nasabah.controller';

const router = Router();

// GET     /          -> list nasabah (pagination + search)
// GET     /:id       -> detail nasabah by id
// POST    /          -> create nasabah
// PATCH   /:id       -> update nasabah
// DELETE  /:id       -> hapus nasabah
router.get("/", nasabahController.list);
router.get("/:id", nasabahController.detail);
router.post("/", nasabahController.create);
router.patch("/:id", nasabahController.update);
router.delete("/:id", nasabahController.remove);

export default router;