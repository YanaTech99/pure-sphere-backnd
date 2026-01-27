import db from "../models/index.js";
import { QueryTypes } from "sequelize";
export const userlist = async (req, res) => {
  try {
    const users = await db.sequelize.query(
      `
      SELECT 
        u.id,
        u.name,
        u.mobile,
        u.email,
        u.status,
        u.created_at
      FROM users u
      ORDER BY u.id DESC
      `,
      { type: QueryTypes.SELECT }
    );

    return res.json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error("User List Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};
