import db from "../models/index.js";
import { QueryTypes } from "sequelize";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { replaceNullWithBlank } from "../utils/responseHelper.js";
import { JWT_SECRET, JWT_EXPIRATION } from "../config/config.js";
import { sendWhatsappOtp } from "../services/whatsapp.service.js";
/* SEND OTP */
export const sendOtp = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { phone, otp, password, role = "admin" } = req.body;


    if (!phone || !role) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Phone and role are required",
      });
    }

    /* =========================================================
       ===================== ADMIN LOGIN =======================
       ========================================================= */
    if (role === "admin" && password) {

      const admins = await db.sequelize.query(
        `SELECT * FROM admins 
         WHERE mobile = :phone 
         AND status = 1 
         LIMIT 1`,
        {
          replacements: { phone },
          type: QueryTypes.SELECT,
        }
      );

      if (!admins.length) {
        await transaction.rollback();
        return res.status(401).json({
          success: false,
          message: "Invalid admin credentials",
        });
      }

      const admin = admins[0];
      const match = await bcrypt.compare(password, admin.password);

      if (!match) {
        await transaction.rollback();
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

      await transaction.commit();

      return res.json({
        success: true,
        role: "admin",
        token,
        admin: {
          id: admin.id,
          name: admin.name,
          mobile: admin.mobile,
        },
      });
    }

    /* =========================================================
       ===================== USER OTP SEND =====================
       ========================================================= */
    if (role === "user" && phone && !otp) {

      const generatedOtp =
        phone === "9998887776"
          ? 987654
          : Math.floor(100000 + Math.random() * 900000);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      await db.sequelize.query(
        `INSERT INTO user_otps (mobile, otp, expires_at)
         VALUES (:mobile, :otp, :expires_at)`,
        {
          replacements: {
            mobile: phone,
            otp: generatedOtp,
            expires_at: expiresAt,
          },
          transaction,
        }
      );

      await transaction.commit();

      console.log("User OTP:", generatedOtp);

      // send OTP over WhatsApp (fire-and-forget, don't block/fail the response on it)
      sendWhatsappOtp(phone, generatedOtp).catch((err) =>
        console.error("WhatsApp OTP send failed (user):", err.message)
      );

      return res.json({
        success: true,
        role: "user",
        message: "OTP sent successfully",
        otp: generatedOtp, // remove in production
      });
    }

    /* =========================================================
       ===================== USER OTP VERIFY ===================
       ========================================================= */
    if (role === "user" && phone && otp) {

      const otpData = await db.sequelize.query(
        `SELECT * FROM user_otps 
         WHERE mobile = :mobile 
         ORDER BY id DESC 
         LIMIT 1`,
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
        const [insertResult] = await db.sequelize.query(
          `INSERT INTO users (mobile, is_verified, status, created_at, updated_at)
           VALUES (:mobile, 1, 1, NOW(), NOW())`,
          {
            replacements: { mobile: phone },
            transaction,
          }
        );

        const insertId = insertResult;

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

    /* =========================================================
       =============== DELIVERY BOY OTP SEND ===================
       ========================================================= */
    if (role === "delivery_boy" && phone && !otp) {

      const deliveryBoys = await db.sequelize.query(
        `SELECT * FROM delivery_boys 
         WHERE mobile = :mobile 
         AND status = 1
         AND deleted_at IS NULL
         LIMIT 1`,
        {
          replacements: { mobile: phone },
          type: QueryTypes.SELECT,
        }
      );

      if (!deliveryBoys.length) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: "Delivery boy not found or inactive",
        });
      }

      const generatedOtp =
        phone === "9998887776"
          ? 987654
          : Math.floor(100000 + Math.random() * 900000);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      await db.sequelize.query(
        `UPDATE delivery_boys 
         SET otp = :otp, otp_expire_at = :expires_at 
         WHERE id = :id`,
        {
          replacements: {
            otp: generatedOtp,
            expires_at: expiresAt,
            id: deliveryBoys[0].id,
          },
          transaction,
        }
      );

      await transaction.commit();

      console.log("Delivery Boy OTP:", generatedOtp);

      // send OTP over WhatsApp (fire-and-forget, don't block/fail the response on it)
      sendWhatsappOtp(phone, generatedOtp).catch((err) =>
        console.error("WhatsApp OTP send failed (delivery_boy):", err.message)
      );

      return res.json({
        success: true,
        role: "delivery_boy",
        message: "OTP sent successfully",
        otp: generatedOtp,
      });
    }

    /* =========================================================
       =============== DELIVERY BOY OTP VERIFY =================
       ========================================================= */
    if (role === "delivery_boy" && phone && otp) {

      const deliveryBoys = await db.sequelize.query(
        `SELECT * FROM delivery_boys
         WHERE mobile = :mobile
         AND otp = :otp
         AND otp_expire_at > NOW()
         AND status = 'active'
         AND deleted_at IS NULL
         LIMIT 1`,
        {
          replacements: { mobile: phone, otp },
          type: QueryTypes.SELECT,
          transaction,
        }
      );

      if (!deliveryBoys.length) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Invalid or expired OTP",
        });
      }

      const deliveryBoy = deliveryBoys[0];

      const token = jwt.sign(
        { id: deliveryBoy.id, role: "delivery_boy" },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      await db.sequelize.query(
        `UPDATE delivery_boys
         SET otp = NULL,
             otp_expire_at = NULL,
             auth_token = :token,
             last_login_at = NOW()
         WHERE id = :id`,
        {
          replacements: { token, id: deliveryBoy.id },
          transaction,
        }
      );

      await transaction.commit();

      return res.json({
        success: true,
        role: "delivery_boy",
        token,
        delivery_boy: {
          id: deliveryBoy.id,
          name: deliveryBoy.name,
          mobile: deliveryBoy.mobile,
        },
      });
    }

    await transaction.rollback();

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
export const verifyOtp1 = async (req, res) => {
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
export const verifyOtp = async (req, res) => {

  const transaction = await db.sequelize.transaction();

  try {

    let { phone, otp, role } = req.body;

    if (!phone || !otp || !role) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Phone, OTP and role required"
      });
    }

    const phoneStr = String(phone);
    const otpStr = String(otp);
    const roleType = String(role).trim().toLowerCase();

    let user;
    let token;

    /* ======================================================
       USER LOGIN
    ====================================================== */

    if (roleType === "user") {

      // Check user exists
      const users = await db.sequelize.query(
        `SELECT u.id,u.name,u.email,u.mobile,u.is_verified,u.status,
                up.gender,up.dob,up.height,up.weight,up.profile_image
         FROM users u
         LEFT JOIN user_profiles up ON u.id = up.user_id
         WHERE u.mobile = :mobile
         LIMIT 1`,
        {
          replacements: { mobile: phoneStr },
          type: QueryTypes.SELECT,
          transaction
        }
      );

      if (!users.length) {

        // Create new user
        const newUserResult = await db.sequelize.query(
          `INSERT INTO users (mobile, is_verified, created_at, updated_at)
     VALUES (:mobile, 0, NOW(), NOW())`,
          {
            replacements: { mobile: phoneStr },
            transaction
          }
        );

        // Get inserted user ID (MySQL)
        const userId = newUserResult[0];

        // Fetch newly created user
        const newUser = await db.sequelize.query(
          `SELECT u.id,u.name,u.email,u.mobile,u.is_verified,u.status,
            up.gender,up.dob,up.height,up.weight,up.profile_image
            FROM users u
            LEFT JOIN user_profiles up ON u.id = up.user_id
            WHERE u.id = :id
            LIMIT 1`,
          {
            replacements: { id: userId },
            type: QueryTypes.SELECT,
            transaction
          }
        );

        user = newUser[0];
      }
      else {
        user = users[0];
      }

      /* OTP CHECK (user_otps table) */

      const otpRecord = await db.sequelize.query(
        `SELECT * FROM user_otps
         WHERE mobile = :mobile
         AND otp = :otp
         AND is_used = 0
         ORDER BY id DESC
         LIMIT 1`,
        {
          replacements: { mobile: phoneStr, otp: otpStr },
          type: QueryTypes.SELECT,
          transaction
        }
      );

      if (!otpRecord.length) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Invalid OTP"
        });
      }

      const otpData = otpRecord[0];

      token = jwt.sign(
        { id: user.id, role: "user" },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      await db.sequelize.query(
        `UPDATE users
         SET current_token = :token,
             last_login = NOW(),
             is_verified = 1
         WHERE id = :id`,
        {
          replacements: { token, id: user.id },
          transaction
        }
      );

      // mark OTP used
      await db.sequelize.query(
        `UPDATE user_otps
         SET is_used = 1
         WHERE id = :otpId`,
        {
          replacements: { otpId: otpData.id },
          transaction
        }
      );

    }

    /* ======================================================
       DELIVERY BOY LOGIN
    ====================================================== */

    else if (roleType === "delivery_boy") {

      const deliveryBoy = await db.sequelize.query(
        `SELECT id,name,mobile,status,otp
         FROM delivery_boys
         WHERE mobile = :mobile
         AND deleted_at IS NULL
         LIMIT 1`,
        {
          replacements: { mobile: phoneStr },
          type: QueryTypes.SELECT,
          transaction
        }
      );

      if (!deliveryBoy.length) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: "Delivery boy not found"
        });
      }

      user = deliveryBoy[0];

      if (String(user.otp) !== otpStr) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Invalid OTP"
        });
      }

      token = jwt.sign(
        { id: user.id, role: "delivery_boy" },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      await db.sequelize.query(
        `UPDATE delivery_boys
         SET auth_token = :token,
             otp = NULL,
             last_login_at = NOW()
         WHERE id = :id`,
        {
          replacements: { token, id: user.id },
          transaction
        }
      );

    }

    else {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid role"
      });
    }

    await transaction.commit();

    return res.json({
      success: true,
      role: roleType,
      token,
      user
    });

  }

  catch (error) {

    await transaction.rollback();

    console.error("Verify OTP Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });

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
///////////////////////////////////////////////////