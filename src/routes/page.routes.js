import express from "express";
import { getPageBySlug,pagesedit,faqaddedit,Faqsdetail } from "../controllers/page.controller.js";

const router = express.Router();

// GET /pages/:slug
router.get("/:slug", getPageBySlug);

// PUT /pages/edit/:id
router.put("/pageedit/:id", pagesedit);
// POST /faq/addedit
router.post("/faqaddedit", faqaddedit);
// GET /faq/detail/:id
router.get("/faq/detail/:id", Faqsdetail);

export default router;
