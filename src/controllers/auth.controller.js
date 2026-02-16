import db from "../models/index.js";
import { QueryTypes } from "sequelize";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { replaceNullWithBlank } from "../utils/responseHelper.js";
import { JWT_SECRET, JWT_EXPIRATION } from "../config/config.js";
/* SEND OTP */
export const sendOtp = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { phone, otp, password } = req.body;

    /* ===================== ADMIN LOGIN ===================== */
    if (phone && password) {
      const admins = await db.sequelize.query(
        `SELECT * FROM admins WHERE mobile = :phone AND status = 1 LIMIT 1`,
        {
          replacements: { phone },
          type: QueryTypes.SELECT,
        }
      );
      if (!admins.length) {
        return res.status(401).json({
          success: false,
          message: "Invalid admin credentials",
        });
      }
      const admin = admins[0];
      const match = await bcrypt.compare(password, admin.password);
      if (!match) {
        return res.status(401).json({
          success: false,
          message: "Invalid admin credentials",
        });
      }
      const token = jwt.sign(
        { id: admin.id, role: "admin" },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );
      return res.json({
        success: true,
        role: "admin",
        token,
        admin: {
          id: admin.id,
          name: admin.name,
          mobile: admin.mobile,
          role: admin.role,
        },
      });
    }

    /* ===================== USER OTP SEND ===================== */
    if (phone && !otp) {
      const generatedOtp = Math.floor(100000 + Math.random() * 900000);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      await db.sequelize.query(
        `INSERT INTO user_otps (mobile, otp, expires_at)
         VALUES (:mobile, :otp, :expires_at)`,
        {
          replacements: { mobile: phone, otp: generatedOtp, expires_at: expiresAt },
          type: QueryTypes.INSERT,
          transaction,
        }
      );

      await transaction.commit();

      console.log("OTP:", generatedOtp); // dev only

      return res.json({
        success: true,
        role: "user",
        message: "OTP sent successfully",
        otp: generatedOtp
      });
    }

    /* ===================== USER OTP VERIFY ===================== */
    if (phone && otp) {
      const otpData = await db.sequelize.query(
        `SELECT * FROM user_otps WHERE mobile = :mobile ORDER BY id DESC LIMIT 1`,
        {
          replacements: { mobile: phone },
          type: QueryTypes.SELECT,
          transaction,
        }
      );

      if (!otpData.length || otpData[0].otp != otp) { 
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Invalid OTP",
        });
      }  
      if (new Date(otpData[0].expires_at) < new Date()) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "OTP expired",
        });
      }
      let users = await db.sequelize.query(
        `SELECT * FROM users WHERE mobile = :mobile LIMIT 1`,
        {
          replacements: { mobile: phone },
          type: QueryTypes.SELECT,
          transaction,
        }
      );
      if (!users.length) {
        const [insertId] = await db.sequelize.query(
          `INSERT INTO users (mobile, is_verified, status, created_at, updated_at)
           VALUES (:mobile, 1, 1, NOW(), NOW())`,
          {
            replacements: { mobile: phone },
            type: QueryTypes.INSERT,
            transaction,
          }
        );
        users = await db.sequelize.query(
          `SELECT * FROM users WHERE id = :id LIMIT 1`,
          {
            replacements: { id: insertId },
            type: QueryTypes.SELECT,
            transaction,
          }
        );
      }
      const user = users[0];
      const token = jwt.sign(
        { id: user.id, role: "user" },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );
      await db.sequelize.query(
        `DELETE FROM user_otps WHERE mobile = :mobile`,
        {
          replacements: { mobile: phone },
          type: QueryTypes.DELETE,
          transaction,
        }
      );
      await transaction.commit();
      return res.json({
        success: true,
        role: "user",
        token,
        user,
      });
    }
    return res.status(400).json({
      success: false,
      message: "Invalid request data",
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Login Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
/* VERIFY OTP */
export const verifyOtp = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: "Phone and OTP required" });
    }

    // 1️⃣ Fetch latest OTP
    const otpData = await db.sequelize.query(
      `SELECT * FROM user_otps WHERE mobile = :mobile ORDER BY id DESC LIMIT 1`,
      { replacements: { mobile: phone }, type: QueryTypes.SELECT, transaction }
    );

    if (!otpData.length) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: "OTP not found" });
    }

    const latestOtp = otpData[0];

    if (latestOtp.otp !== otp) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    if (new Date(latestOtp.expires_at) < new Date()) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: "OTP expired" });
    }

    // 2️⃣ Fetch or create user
    let users = await db.sequelize.query(
      `SELECT u.id, u.mobile, u.is_verified, u.status, up.gender, up.dob, up.height, up.weight, up.profile_image
       FROM users u
       LEFT JOIN user_profiles up ON u.id = up.user_id
       WHERE u.mobile = :mobile
       LIMIT 1`,
      { replacements: { mobile: phone }, type: QueryTypes.SELECT, transaction }
    );

    if (!users.length) {
      // Create user
      const [insertId] = await db.sequelize.query(
        `INSERT INTO users (mobile, is_verified, status, created_at, updated_at)
         VALUES (:mobile, 1, 1, NOW(), NOW())`,
        { replacements: { mobile: phone }, type: QueryTypes.INSERT, transaction }
      );

      users = await db.sequelize.query(
        `SELECT u.id, u.mobile, u.is_verified, u.status, up.gender, up.dob, up.height, up.weight, up.profile_image
         FROM users u
         LEFT JOIN user_profiles up ON u.id = up.user_id
         WHERE u.id = :id
         LIMIT 1`,
        { replacements: { id: insertId }, type: QueryTypes.SELECT, transaction }
      );
    } else {
      // Update existing user
      await db.sequelize.query(
        `UPDATE users SET is_verified = 1, last_login = NOW(), updated_at = NOW()
         WHERE mobile = :mobile`,
        { replacements: { mobile: phone }, type: QueryTypes.UPDATE, transaction }
      );

      users = await db.sequelize.query(
        `SELECT u.id,u.name,u.email, u.mobile, u.is_verified, u.status, up.gender, up.dob, up.height, up.weight, up.profile_image
         FROM users u
         LEFT JOIN user_profiles up ON u.id = up.user_id
         WHERE u.mobile = :mobile
         LIMIT 1`,
        { replacements: { mobile: phone }, type: QueryTypes.SELECT, transaction }
      );
    }

    const user = users[0];

    // 3️⃣ Generate JWT token
    const token = jwt.sign(
      { id: user.id, mobile: user.mobile },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRATION }
    );

    // 4️⃣ Save token in DB
    await db.sequelize.query(
      `UPDATE users SET current_token = :token WHERE id = :id`,
      { replacements: { token, id: user.id }, type: QueryTypes.UPDATE, transaction }
    );

    // 5️⃣ Delete OTP
    await db.sequelize.query(
      `DELETE FROM user_otps WHERE mobile = :mobile`,
      { replacements: { mobile: phone }, type: QueryTypes.DELETE, transaction }
    );

    // 6️⃣ Commit transaction
    await transaction.commit();

    // 7️⃣ Response
    return res.json({
      success: true,
      message: "OTP verified successfully",
      token,
      user: replaceNullWithBlank(user), // now includes user profile fields
    });

  } catch (error) {
    await transaction.rollback();
    console.error("Verify OTP Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};


/* LOGOUT */
export const logout = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(400).json({
        success: false,
        message: "No token provided"
      });
    }

    await db.sequelize.query(
      `INSERT INTO blacklisted_tokens (token, created_at)
       VALUES (:token, NOW())`,
      {
        replacements: { token },
        type: QueryTypes.INSERT
      }
    );

    return res.json({
      success: true,
      message: "Logged out successfully"
    });
  } catch (error) {
    console.error("Logout Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};


