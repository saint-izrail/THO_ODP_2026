import { Router } from "express";
import { authController } from "./auth.controller";
import { requireAuth } from "../../middleware/requireAuth";

const router = Router();

// THO-209 POST /login   -> login + return JWT
// THO-211 POST /logout  -> blocklist token (requireAuth)
router.post("/login", authController.login);
router.post("/logout", requireAuth, authController.logout);

export default router;
