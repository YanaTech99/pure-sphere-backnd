import express from "express";
import {rolePercantage, getAllRoles , createRoles} from '../controllers/role.controller.js'
import {adminAuth} from "../middleware/adminAuth.js";

const router = express.Router();

router.get("/getRoles", adminAuth,  getAllRoles);
router.post("/RolePercantage", adminAuth , rolePercantage)
router.post("/createRole", adminAuth , createRoles)
export default router;
 