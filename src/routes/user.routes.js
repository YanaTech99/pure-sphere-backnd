import express from "express";
import { dailydietslist,dailydietsadd,plateslist,platesadd,updateProfile, getProfile,userlist,useraddressAdd,useraddressList,plansadd,planslist,plandetail,baneersadd,bannerslist,blogsadd,blogslist } from "../controllers/user.controller.js";
import { uploadProfile } from "../middleware/upload.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { adminKeyMiddleware } from "../middleware/admin.middleware.js";
import { uploadBanner } from "../middleware/uploadbanner.js";
import { uploadBlogs } from "../middleware/uploadblogs.js";
import { uploadPlates } from "../middleware/uploadplates.js";
import { uploadDailyDiets } from "../middleware/uploaddailydiets.js";

const router = express.Router();
// Update profile
router.put(
  "/update-profile",
  authMiddleware,
  uploadProfile.single("profile_image"),
  updateProfile
);
// Get profile
router.get(
  "/profile",
  authMiddleware,
  getProfile
);
// Admin: Get user list
router.get("/userlist", userlist);
// Add user address
router.post("/address", authMiddleware, useraddressAdd);
// List user addresses
router.get("/addresses", authMiddleware, useraddressList);
// Add plans
router.post("/plans", plansadd);
// List plans
router.get("/planslist", planslist);
// Plan detail
router.get("/plandetail/:id", plandetail);

router.post(
  "/banner/add",
  uploadBanner.single("image"),
  baneersadd
);

// List banners
router.get("/bannerslist", bannerslist);
router.get("/bannerslist/:id", bannerslist);

router.post(
  "/blogs/add",
  uploadBlogs.single("image"),
  blogsadd
);

router.post(
  "/plates/add",
  uploadPlates.single("image"),
  platesadd
);

router.post(
  "/dailydiets_add",
  uploadDailyDiets.single("image"),
  dailydietsadd
);
// List daily diets
router.get("/dailydietslist", dailydietslist);
// List plates
router.get("/plateslist", plateslist);
// router.get("/plateslist/:id", plateslist);
// List blogs
router.get("/blogslist", blogslist);
router.get("/blogslist/:id", blogslist);
export default router;
