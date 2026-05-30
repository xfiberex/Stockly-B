import { Router } from "express";
import { authController } from "@/modules/auth/auth.controller";
import { requireAuth } from "@/shared/middlewares/auth.middleware";
import { validate } from "@/shared/middlewares/validate.middleware";
import { authStrictLimiter, authRegisterLimiter } from "@/shared/middlewares/rateLimiter.middleware";
import {
    registerSchema,
    loginSchema,
    emailSchema,
    verifyEmailSchema,
    resetPasswordSchema,
    updateProfileSchema,
    updatePasswordSchema,
} from "@/modules/auth/auth.validator";

const router = Router();

router.post("/register", authRegisterLimiter, validate(registerSchema), authController.register);
router.post("/verify-email", validate(verifyEmailSchema), authController.verifyEmail);
router.post("/resend-verification", authRegisterLimiter, validate(emailSchema), authController.resendVerification);
router.post("/login", authStrictLimiter, validate(loginSchema), authController.login);
router.post("/logout", authController.logout);
router.get("/me", requireAuth, authController.me);
router.post("/refresh", authController.refresh);
router.post("/forgot-password", authStrictLimiter, validate(emailSchema), authController.forgotPassword);
router.post("/reset-password", authStrictLimiter, validate(resetPasswordSchema), authController.resetPassword);
router.put("/me", requireAuth, validate(updateProfileSchema), authController.updateProfile);
router.patch("/me/password", requireAuth, validate(updatePasswordSchema), authController.updatePassword);

export default router;
