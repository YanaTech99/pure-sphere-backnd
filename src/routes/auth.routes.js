import express from "express";
import {
    sendOtp,
    verifyOtp,
    logout
} from "../controllers/auth.controller.js";
import { updateProfile } from "../controllers/user.controller.js";


import { validatePhone } from "../middleware/validatePhone.js";

const router = express.Router();

// 1️⃣ Send OTP
router.post("/send-otp", validatePhone, sendOtp);

// 2️⃣ Verify OTP
router.post("/verify-otp", validatePhone, verifyOtp);

router.post("/logout", logout);

router.put("/update-profile/:userId", updateProfile);


export default router;
