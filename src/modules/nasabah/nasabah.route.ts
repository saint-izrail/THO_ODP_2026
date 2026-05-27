import { Router } from "express";
import { nasabahController } from './nasabah.controller';
import { requireAuth } from "../../middleware/requireAuth";

const router = Router();

// POST   /        -> register nasabah (PUBLIC)
// GET    /        -> list (auth)
// GET    /:id     -> detail (auth)
// PATCH  /:id     -> update (auth)
// DELETE /:id     -> hapus (auth)
router.post("/", nasabahController.create);
router.get("/", requireAuth, nasabahController.list);
router.get("/:id", requireAuth, nasabahController.detail);
router.patch("/:id", requireAuth, nasabahController.update);
router.delete("/:id", requireAuth, nasabahController.remove);

export default router;