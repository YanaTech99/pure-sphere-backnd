import db from "../models/index.js";
import { QueryTypes } from "sequelize";
import { replaceNullWithBlank } from "../utils/responseHelper.js";
import crypto from "crypto";
import Razorpay from "razorpay";



const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/////////////////////////////////////////////
export const dashboard = async (req, res) => {
  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const baseUrl = `${protocol}://${req.get("host")}/`;
    const userId = req.user.id;
    const { fcm_token } = req.body;

    // update fcm token if provided
    if (fcm_token) {
      await db.sequelize.query(
        "UPDATE users SET fcm_token = ? WHERE id = ?",
        {
          replacements: [fcm_token, userId]
        }
      );
    }

    const [banners] = await db.sequelize.query(
      "SELECT id, title, image, type, link, position, status FROM banners WHERE type = 'header' AND status = 1"
    );

    const [plates] = await db.sequelize.query(
      "SELECT id, name, description, price_per_week, duration, image FROM plates WHERE status = 1"
    );

    const [settings] = await db.sequelize.query(
      "SELECT notification_enabled, dark_mode, language, instagram_link, facebook_link, youtube_link, twitter_link FROM user_settings",
    );

    const bannerData = banners.map(banner => ({
      ...banner,
      image: banner.image ? baseUrl + banner.image : null
    }));

    const plateData = plates.map(plate => ({
      ...plate,
      image: plate.image ? baseUrl + "uploads/plates/" + plate.image : null
    }));

    res.json({
      success: true,
      message: "Data Get Successfully",
      banners: bannerData,
      plates: plateData,
      settings: settings[0] || {}
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Server error"
    });
  }
};
//////////////////////////
export const updateProfile = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const userId = req.user?.id; // from authMiddleware
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const { name, email, gender, dob, height, weight } = req.body;
    const profile_image = req.file
      ? `/uploads/profile/${req.file.filename}`
      : undefined;
    /* ================= USERS TABLE ================= */
    const userFields = {};
    if (name !== undefined) userFields.name = name;
    if (email !== undefined) {
      // Check duplicate email
      const existingUser = await db.sequelize.query(
        `SELECT id FROM users WHERE email = :email AND id != :user_id LIMIT 1`,
        {
          replacements: { email, user_id: userId },
          type: QueryTypes.SELECT,
        }
      );

      if (existingUser.length > 0) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: "Email is already taken",
        });
      }
      userFields.email = email;
    }
    if (Object.keys(userFields).length > 0) {
      await db.sequelize.query(
        `
        UPDATE users
        SET ${Object.keys(userFields)
          .map((k) => `${k} = :${k}`)
          .join(", ")},
        updated_at = NOW()
        WHERE id = :user_id
        `,
        {
          replacements: { ...userFields, user_id: userId },
          transaction: t,
          type: QueryTypes.UPDATE,
        }
      );
    }
    /* ================= USER_PROFILES TABLE ================= */
    const profileFields = {};
    if (gender !== undefined) profileFields.gender = gender;
    if (dob !== undefined) profileFields.dob = dob;
    if (height !== undefined) profileFields.height = height;
    if (weight !== undefined) profileFields.weight = weight;
    if (profile_image !== undefined)
      profileFields.profile_image = profile_image;
    if (Object.keys(profileFields).length > 0) {
      await db.sequelize.query(
        `
        INSERT INTO user_profiles (user_id, ${Object.keys(profileFields).join(", ")})
        VALUES (:user_id, ${Object.keys(profileFields)
          .map((k) => `:${k}`)
          .join(", ")})
        ON DUPLICATE KEY UPDATE
        ${Object.keys(profileFields)
          .map((k) => `${k} = VALUES(${k})`)
          .join(", ")}
        `,
        {
          replacements: { user_id: userId, ...profileFields },
          transaction: t,
          type: QueryTypes.INSERT,
        }
      );
    }
    await t.commit();
    return res.json({
      success: true,
      message: "Profile updated successfully",
      data: { ...userFields, ...profileFields },
    });
  } catch (error) {
    await t.rollback();
    console.error("Update Profile Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
export const getProfile = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const baseUrl = `${protocol}://${req.get("host")}/`;
     const baseUrl_plates = `${req.protocol}://${req.get("host")}/uploads/plates/`;

    const rows = await db.sequelize.query(
      `
      SELECT 
        u.id,
        u.name,
        u.mobile,
        u.email,

        upf.gender,
        upf.dob,
        upf.height,
        upf.weight,
        upf.profile_image,

        -- ACTIVE USER PLAN
        up.id AS user_plan_id,
        up.plan_id,
        up.plan_data,
        up.time_slot,
        up.start_date,
        up.end_date,
        up.status AS user_plan_status,

        -- PLATE DATA
        pl.id AS plate_id,
        pl.name AS plate_name,
        pl.description AS plate_description,
        pl.price_per_week,
        pl.duration,
        pl.image AS plate_image

      FROM users u
      LEFT JOIN user_profiles upf ON u.id = upf.user_id

      -- Latest Active Plan
      LEFT JOIN user_plans up 
        ON up.id = (
          SELECT MAX(id)
          FROM user_plans
          WHERE user_id = u.id
          AND status = 1
        )

      -- Plate from plan_data->category_id
      LEFT JOIN plates pl 
        ON pl.id = JSON_UNQUOTE(JSON_EXTRACT(up.plan_data, '$.category_id'))

      WHERE u.id = :user_id
      LIMIT 1
      `,
      {
        replacements: { user_id: userId },
        type: QueryTypes.SELECT,
      }
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    const r = rows[0];
    const user = {
      id: r.id,
      name: r.name,
      mobile: r.mobile,
      email: r.email,
      gender: r.gender,
      dob: r.dob,
      height: r.height,
      weight: r.weight,
      profile_image: r.profile_image
        ? baseUrl + r.profile_image
        : "https://lh3.googleusercontent.com/proxy/R9dXqanxVP2kpX9iSZxr3LsxIAfQhpkR6GbJW0EENe9zMmPYJUiuslNRReZJIT5n1wmExGlEEgh2v4T7i2gxgU505LP5XxTZmjpSQnjDvoDbzCPy6WXaZg7NJwssL7KT1DZ88VpIYdUcZnNmmw",

      active_plan: r.user_plan_id
        ? {
            id: r.user_plan_id,
            plan_id: r.plan_id,
            time_slot: r.time_slot,
            start_date: r.start_date,
            end_date: r.end_date,
            status: r.user_plan_status,
             plan_data: r.plan_data
        ? JSON.parse(r.plan_data)
        : null,
            plate: r.plate_id
              ? {
                  id: r.plate_id,
                  name: r.plate_name,
                  description: r.plate_description,
                  price_per_week: r.price_per_week,
                  duration: r.duration,
                  image: r.plate_image
                    ? baseUrl_plates + r.plate_image
                    : "https://lh3.googleusercontent.com/proxy/R9dXqanxVP2kpX9iSZxr3LsxIAfQhpkR6GbJW0EENe9zMmPYJUiuslNRReZJIT5n1wmExGlEEgh2v4T7i2gxgU505LP5XxTZmjpSQnjDvoDbzCPy6WXaZg7NJwssL7KT1DZ88VpIYdUcZnNmmw",
                }
              : null,
          }
        : null,
    };
    return res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("Get Profile Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
//////////////////////////////////
// const DEFAULT_IMAGE = `data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBwgHBgkIBwgKCgkLDRYPDQwMDRsUFRAWIB0iIiAdHx8kKDQsJCYxJx8fLT0tMTU3Ojo6Iys/RD84QzQ5OjcBCgoKDQwNGg8PGjclHyU3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3N//AABEIAJQApQMBIgACEQEDEQH/...`;
export const userlist = async (req, res) => {
  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const baseUrl = `${protocol}://${req.get("host")}/`;
    const rows = await db.sequelize.query(
      `
      SELECT 
          u.id AS user_id,
          u.name,
          u.mobile,
          u.email,
          u.status,
          DATE_FORMAT(u.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
          DATE_FORMAT(u.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
          up.profile_image,
          up.gender,
          up.dob,
          up.height,
          up.weight,
          ua.id AS address_id,
          ua.type,
          ua.address,
          ua.city,
          ua.state,
          ua.pincode,
          ua.is_default,
          DATE_FORMAT(ua.created_at, '%Y-%m-%d %H:%i:%s') AS address_created_at,
          hp.id AS health_id,
          hp.files AS health_file,
          DATE_FORMAT(hp.created_at, '%Y-%m-%d %H:%i:%s') AS health_created_at, 
          -- Latest User Plan
          upn.id AS user_plan_id,
          upn.transaction_id,
          upn.plan_id,
          upn.plan_data,
          upn.time_slot,
          upn.start_date,
          upn.end_date,
          upn.status AS user_plan_status,
          DATE_FORMAT(upn.created_at, '%Y-%m-%d %H:%i:%s') AS user_plan_created_at,

          -- Plan Table
          p.id AS plan_main_id,
          p.title AS plan_title,
          p.description AS plan_description,
          p.duration_days,
          p.price AS plan_price,
          p.category_id,
          p.status AS plan_status,

          -- Plate Table
          pl.id AS plate_id,
          pl.name AS plate_name,
          pl.description AS plate_description,
          pl.price_per_week,
          pl.duration AS plate_duration,
          pl.image AS plate_image,
          pl.status AS plate_status

      FROM users u
      LEFT JOIN user_profiles up ON up.user_id = u.id
      LEFT JOIN user_addresses ua ON ua.user_id = u.id
      LEFT JOIN health_profiles hp ON hp.user_id = u.id

      LEFT JOIN user_plans upn 
          ON upn.user_id = u.id 
          AND upn.id = (
              SELECT MAX(id) 
              FROM user_plans 
              WHERE user_id = u.id
          )

      LEFT JOIN plans p ON p.id = upn.plan_id
      LEFT JOIN plates pl ON pl.id = p.category_id

      ORDER BY u.id DESC
      `,
      {
        type: QueryTypes.SELECT
      }
    );

    const usersMap = {};

    for (const row of rows) {

      if (!usersMap[row.user_id]) {
        usersMap[row.user_id] = {
          id: row.user_id,
          name: row.name,
          mobile: row.mobile,
          email: row.email,
          status: row.status,
          created_at: row.created_at,
          updated_at: row.updated_at,

          profile_image: row.profile_image
            ? `${baseUrl}${row.profile_image}`
            : `${baseUrl}/uploads/Default.jpg`,

          gender: row.gender,
          dob: row.dob,
          height: row.height,
          weight: row.weight,

          address: null,
          health_profiles: [],
          user_plan: null
        };
      }

      // Address
      if (row.address_id && !usersMap[row.user_id].address) {
        usersMap[row.user_id].address = {
          id: row.address_id,
          type: row.type,
          address: row.address,
          city: row.city,
          state: row.state,
          pincode: row.pincode,
          is_default: row.is_default,
          created_at: row.address_created_at
        };
      }

      // Health Profiles
      if (row.health_id) {
        usersMap[row.user_id].health_profiles.push({
          id: row.health_id,
          file: row.health_file
            ? `${baseUrl}/${row.health_file}`
            : null,
          created_at: row.health_created_at
        });
      }

      // User Plan + Plan + Plate (Single Object)
      if (row.user_plan_id && !usersMap[row.user_id].user_plan) {

        usersMap[row.user_id].user_plan = {
          id: row.user_plan_id,
          transaction_id: row.transaction_id,
          time_slot: row.time_slot,
          start_date: row.start_date,
          end_date: row.end_date,
          status: row.user_plan_status,
          created_at: row.user_plan_created_at,
          plan_data: row.plan_data ? JSON.parse(row.plan_data) : null,

          plan: row.plan_main_id ? {
            id: row.plan_main_id,
            title: row.plan_title,
            description: row.plan_description,
            duration_days: row.duration_days,
            price: row.plan_price,
            category_id: row.category_id,
            status: row.plan_status
          } : null,

          plate: row.plate_id ? {
            id: row.plate_id,
            name: row.plate_name,
            description: row.plate_description,
            price_per_week: row.price_per_week,
            duration: row.plate_duration,
            status: row.plate_status,
            image: row.plate_image
              ? `${baseUrl}/${row.plate_image}`
              : null
          } : null
        };

      }
    }

    return res.json({
      success: true,
      data: Object.values(usersMap)
    });

  } catch (error) {
    console.error("User List Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

//////////////////////////////
export const useraddressAdd = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const { type = "home", address, city, state, pincode, is_default = 0 } = req.body;
    if (!address || !city || !state || !pincode) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }
    /* 🔹 Count addresses */
    const addressCount = await db.sequelize.query(
      `SELECT COUNT(*) as total FROM user_addresses WHERE user_id = :user_id`,
      {
        replacements: { user_id: userId },
        type: QueryTypes.SELECT,
        transaction,
      }
    );
    const totalAddresses = addressCount[0].total;
    /* 🔹 If new default → remove old default */
    if (is_default == 1) {
      await db.sequelize.query(
        `UPDATE user_addresses SET is_default = 0 WHERE user_id = :user_id`,
        {
          replacements: { user_id: userId },
          type: QueryTypes.UPDATE,
          transaction,
        }
      );
    }
    /* 🔹 Insert address */
    const [insertId] = await db.sequelize.query(
      `INSERT INTO user_addresses 
       (user_id, type, address, city, state, pincode, is_default, created_at)
       VALUES 
       (:user_id, :type, :address, :city, :state, :pincode, :is_default, NOW())`,
      {
        replacements: {
          user_id: userId,
          type,
          address,
          city,
          state,
          pincode,
          is_default: totalAddresses === 0 ? 1 : is_default,
        },
        type: QueryTypes.INSERT,
        transaction,
      }
    );
    await transaction.commit();
    return res.json({
      success: true,
      message: "Address added successfully",
      address_id: insertId,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Add Address Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
export const useraddressList = async (req, res) => {  
 try {
    const userId = req.user.id;
    const addresses = await db.sequelize.query(
      `  SELECT 
        id,
        type,
        address,
        city,
        state,
        pincode,
        is_default,
        created_at
      FROM user_addresses 
      WHERE user_id = :userId
      ORDER BY id DESC
      `,
      {
        type: QueryTypes.SELECT,
        replacements: { userId },
      }
    );
    return res.json({
      success: true,
      data: addresses,
    });
  } catch (error) {
    console.error("List Address Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
////////////////////////////////////
export const plansadd = async (req, res) => {
   try {
    const {
      id,
      title,
      description,
      duration_days,
      price,
      plan_type,
      category_id,
      status
    } = req.body;
    // 🔹 Validation
    if (!title || !duration_days || !price) {
      return res.status(400).json({
        success: false,
        message: "title, duration_days and price are required"
      });
    }
    // ===============================
    // 🔥 EDIT PLAN
    // ===============================
    if (id) {
      await db.sequelize.query(
        `
        UPDATE plans
        SET
          title = :title,
          description = :description,
          duration_days = :duration_days,
          price = :price,
          plan_type = :plan_type,
          category_id = :category_id,
          status = :status,
          updated_at = NOW()
        WHERE id = :id
        `,
        {
          replacements: {
            id,
            title,
            description: description || "",
            duration_days,
            plan_type: plan_type,
            category_id,
            price,
            status: status ?? 1
          },
          type: QueryTypes.UPDATE
        }
      );
      return res.json({
        success: true,
        message: "Plan updated successfully"
      });
    }
    // ===============================
    // 🔥 ADD PLAN
    // ===============================
    await db.sequelize.query(
      `
      INSERT INTO plans
      (title, description, duration_days,plan_type, price, status, created_at)
      VALUES
      (:title, :description, :duration_days,:plan_type, :price, :status, NOW())
      `,
      {
        replacements: {
          title,
          description: description || "",
          duration_days,
          plan_type,
          price,
          status: status ?? 1
        },
        type: QueryTypes.INSERT
      }
    );
    return res.json({
      success: true,
      message: "Plan added successfully"
    });
  } catch (error) {
    console.error("Plans Add/Edit Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};
//////////////////////////
export const planslist = async (req, res) => {  
  try {
    const plans = await db.sequelize.query(
      `
      SELECT 
        p.id, 
        p.title,
        p.description,
        p.duration_days,
        p.plan_type,
        p.category_id,
        pl.name AS plate_name,
        p.price,
        p.status,
        p.created_at,
        p.updated_at
      FROM plans p
      LEFT JOIN plates pl ON p.category_id = pl.id
      ORDER BY p.id DESC
      `,
      {
        type: QueryTypes.SELECT
      }
    );

    return res.json({
      success: true,
      data: plans,
    });

  } catch (error) {
    console.error("List Plans Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
/////////////////////////////////////////
export const plandetail = async (req, res) => {  
 try {
    const { id } = req.params;  
    const plans = await db.sequelize.query(
      `
      SELECT 
        id, 
        title,
        description,
        duration_days,
        plan_type,
        category_id,
        price,
        status,
        created_at,
        updated_at
      FROM plans
      WHERE id = :id
      LIMIT 1
      `,
      { 
        type: QueryTypes.SELECT,
        replacements: { id }
      }
    );
    if (plans.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });
    }
    const plan = plans[0];
    return res.json({
      success: true,
      data: plan,
    });
  } catch (error) {
    console.error("Plan Detail Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
///////////////////////////////////////////////////
export const baneersadd = async (req, res) => {
  try {
    const { id, title, link, status, type } = req.body;
    // 🔹 Image path
    const image = req.file
      ? `uploads/banners/${req.file.filename}`
      : null;
    if (!title || (!image && !id)) {
      return res.status(400).json({
        success: false,
        message: "title and image are required"
      });
    }
    // ===============================
    // 🔥 EDIT BANNER
    // ===============================
    if (id) {
      await db.sequelize.query(
        `
        UPDATE banners
        SET
          title = :title,
          link = :link,
          type = :type,
          status = :status,
          ${image ? "image = :image," : ""}
          updated_at = NOW()
        WHERE id = :id
        `,
        {
          replacements: {
            id,
            title,
            image,
            type,
            link,
            status: status ?? 1
          },
          type: QueryTypes.UPDATE
        }
      );
      return res.json({
        success: true,
        message: "Banner updated successfully"
      });
    }
    // ===============================
    // 🔥 ADD BANNER
    // ===============================
    await db.sequelize.query(
      `
      INSERT INTO banners (title, image, link, type, status, created_at)
      VALUES (:title, :image, :link, :type, :status, NOW())
      `,
      {
        replacements: {
          title,
          image,
          type,
          link,
          status: status ?? 1
        },
        type: QueryTypes.INSERT
      }
    );
    return res.json({
      success: true,
      message: "Banner added successfully"
    });

  } catch (error) {
    console.error("Banners Add/Edit Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};
///////////////////////////////////
export const bannerslist = async (req, res) => {
  try {
    const { id } = req.params;      // /banners/:id
    const { type } = req.query;     // /banners?type=home
    let query = `
      SELECT 
        id,
        title,
        image,
        link,
        type,
        status,
        created_at,
        updated_at
      FROM banners
      WHERE 1=1
    `;
    // 🔹 Filter by id
    if (id) {
      query += ` AND id = :id`;
    }
    // 🔹 Filter by type
    if (type) {
      query += ` AND type = :type`;
    }
    query += ` ORDER BY id DESC`;
    const banners = await db.sequelize.query(query, {
      type: QueryTypes.SELECT,
      replacements: {
        ...(id && { id }),
        ...(type && { type }),
      },
    });
    // 🔹 Base URL for image
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const baseUrl = `${protocol}://${req.get("host")}/`;
    banners.forEach(banner => {
      banner.image = banner.image
        ? `${baseUrl}/${banner.image}`
        : null;
    });
    return res.json({
      success: true,
      data: id ? banners[0] || null : banners,
    });
  } catch (error) {
    console.error("List Banners Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
////////////////////////////////////////
export const blogsadd = async (req, res) => {
  try {
    // ✅ SAFE destructuring
    const {
      id = null,
      title,
      content,
      type,
      image,
      status
    } = req.body || {};
    console.log("BODY:", req.body);
    console.log("FILE:", req.file);
    // 🔹 Validation
    if (!title || !content || !type) {
      return res.status(400).json({
        success: false,
        message: "title, content and type are required",
      });
    }
    if (!["image", "video"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "type must be image or video",
      });
    }
    let finalImageUrl = null;
    // 🔹 IMAGE BLOG
    if (type === "image") {
      if (req.file) {
        finalImageUrl = `uploads/blogs/${req.file.filename}`;
      } else if (!id) {
        return res.status(400).json({
          success: false,
          message: "Image is required for image blog",
        });
      }
    }
    // 🔹 VIDEO BLOG
    if (type === "video" && !image) {
      return res.status(400).json({
        success: false,
        message: "Video link is required",
      });
    }
    // ===============================
    // 🔥 EDIT BLOG
    // ===============================
    if (id) {
      await db.sequelize.query(
        `
        UPDATE blogs
        SET
          title = :title,
          content = :content,
          type = :type,
          image = :image,
          status = :status,
          updated_at = NOW()
        WHERE id = :id
        `,
        {
          replacements: {
            id,
            title,
            content,
            type,
            image: type === "image" ? finalImageUrl : image,
            status: status ?? 1,
          },
          type: QueryTypes.UPDATE,
        }
      );
      return res.json({
        success: true,
        message: "Blog updated successfully",
      });
    }
    // ===============================
    // 🔥 ADD BLOG
    // ===============================
    await db.sequelize.query(
      `
      INSERT INTO blogs
      (title, content, image, type, status, created_at)
      VALUES
      (:title, :content, :image, :type, :status, NOW())
      `,
      {
        replacements: {
          title,
          content,
          type,
          image: type === "image" ? finalImageUrl : image,
          status: status ?? 1,
        },
        type: QueryTypes.INSERT,
      }
    );
    return res.json({
      success: true,
      message: "Blog added successfully",
    });
  } catch (error) {
    console.error("Blogs Add/Edit Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
////////////////////////////////////////
export const blogslist = async (req, res) => {
  try {
    const { id } = req.params;
    let query = `
      SELECT 
        id,
        title,
        content,
        image,
        type,
        status,
        created_at,
        updated_at
      FROM blogs
    `;
    const replacements = {};
    if (id) {
      query += ` WHERE id = :id `;
      replacements.id = id;
    }
    query += ` ORDER BY id DESC `;
    const blogs = await db.sequelize.query(query, {
      replacements,
      type: QueryTypes.SELECT,
    });
    if (id && blogs.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Blog not found",
      });
    }
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const baseUrl = `${protocol}://${req.get("host")}/`;
    const formattedBlogs = blogs.map((blog) => ({
      ...blog,
      image:
        blog.type === "image" && blog.image
          ? `${baseUrl}/${blog.image}`
          : blog.image,
    }));
    return res.json({
      success: true,
      message: id
        ? "Blog fetched successfully"
        : "Blogs fetched successfully",
      data: id ? formattedBlogs[0] : formattedBlogs,
    });
  } catch (error) {
    console.error("List Blogs Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
////////////////////////////
export const platesadd = async (req, res) => {
  try {
    const {
      id, // edit ke liye optional
      name,
      description,
      price_per_week,
      status,
    } = req.body;
    const image = req.file ? req.file.filename : null;
    // 🔹 Validation
    if (!name || !price_per_week) {
      return res.status(400).json({
        success: false,
        message: "Name and price_per_week are required",
      });
    }
    // ===============================
    // 🔥 EDIT PLATE
    // ===============================
    if (id) {
      let imageQuery = "";
      if (image) {
        imageQuery = ", image = :image";
      }
      await db.sequelize.query(
        `
        UPDATE plates 
        SET
          name = :name,
          description = :description,
          price_per_week = :price_per_week,
          status = :status
          ${imageQuery}
        WHERE id = :id
        `,
        {
          replacements: {
            id,
            name,
            description: description || "",
            price_per_week,
            status: status ?? 1,
            image,
          },
          type: QueryTypes.UPDATE,
        }
      );
      return res.json({
        success: true,
        message: "Plate updated successfully",
      });
    }
    // ===============================
    // 🔥 ADD PLATE
    // ===============================
    await db.sequelize.query(
      `
      INSERT INTO plates
      (name, description, price_per_week, image, status, created_at)
      VALUES
      (:name, :description, :price_per_week, :image, :status, NOW())
      `,
      {
        replacements: {
          name,
          description: description || "",
          price_per_week,
          image,
          status: status ?? 1,
        },
        type: QueryTypes.INSERT,
      }
    );
    return res.json({
      success: true,
      message: "Plate added successfully",
    });
  } catch (error) {
    console.error("Plates Add/Edit Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
/////////////////////////////////////
export const plateslist = async (req, res) => {
  try {
    const { id } = req.params;

    let query = `
      SELECT 
        id,
        name,
        description,
        price_per_week,
        duration,
        image,
        status,
        created_at,
        updated_at
      FROM plates
    `;

    if (id) {
      query += ` WHERE id = :id `;
    }

    query += ` ORDER BY id DESC`;

    const plates = await db.sequelize.query(query, {
      replacements: id ? { id } : {},
      type: QueryTypes.SELECT,
    });

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const baseUrlFinal = `${protocol}://${req.get("host")}`;
    const baseUrl = `${baseUrlFinal}/uploads/plates`;

    const formattedPlates = plates.map((plate) => ({
      ...plate,
      image: plate.image ? `${baseUrl}/${plate.image}` : null,
    }));

 
    if (id && formattedPlates.length > 0) {
      const plateId = id;
      const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
      const today = days[new Date().getDay()];
      const dailyDiets = await db.sequelize.query(
        `
        SELECT 
          id,
          plate_id,
          day_name,
          meal_type,
          item_name,
          image,
          description,
          created_at,
          updated_at
        FROM daily_diets
        WHERE plate_id = :plate_id
          AND TRIM(day_name) = :today
        ORDER BY id DESC
        `,
        {
          replacements: {
            plate_id: plateId,
            today: today
          },
          type: QueryTypes.SELECT,
        }
      );
      const baseDietUrl = `${req.protocol}://${req.get("host")}/uploads/daily_diets`;
      const formattedDiets = dailyDiets.map((diet) => ({
        ...diet,
        image: diet.image ? `${baseDietUrl}/${diet.image}` : null,
      }));
      // plate ke andar daily_diets attach karo
      formattedPlates[0].today_diets = formattedDiets;
    }
    return res.json({
      success: true,
      message: "Plates fetched successfully",
      data: id ? formattedPlates[0] || null : formattedPlates,
    });
  } catch (error) {
    console.error("List Plates Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
///////////////////////////
export const dailydietsadd = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const {
      plate_id,
      meal_type,
      item_name,
      description,
      status
    } = req.body;

    const image = req.file ? req.file.filename : null;

    if (!plate_id || !meal_type || !item_name) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "plate_id, meal_type and item_name are required",
      });
    }

    /* ===============================
       🔥 ADD DAILY DIET
    =============================== */

    const [insertId] = await db.sequelize.query(
      `
      INSERT INTO daily_diets
      (plate_id, meal_type, item_name, image, description, status, created_at)
      VALUES
      (:plate_id, :meal_type, :item_name, :image, :description, :status, NOW())
      `,
      {
        replacements: {
          plate_id,
          meal_type,
          item_name,
          image,
          description: description || "",
          status: status || 1
        },
        type: QueryTypes.INSERT,
        transaction
      }
    );

    const dailyDietId = insertId;

    /* ======================================================
       🚀 AUTO CREATE ORDERS FOR ACTIVE USERS
    ====================================================== */

    const today = new Date();
    const todayDate = today.toISOString().split("T")[0];

    // Get active user plans
    const activePlans = await db.sequelize.query(
      `
      SELECT id, user_id, plan_data, start_date, end_date, time_slot
      FROM user_plans
      WHERE status = 1
      `,
      {
        type: QueryTypes.SELECT,
        transaction
      }
    );

  for (const plan of activePlans) {

  //  
  const start = new Date(plan.start_date);
  const end = new Date(plan.end_date);

  if (today < start || today > end) continue;

  const existingOrder = await db.sequelize.query(
    `SELECT id FROM orders
     WHERE user_plan_id = ?
     AND DATE(order_date) = ?`,
    {
      replacements: [plan.id, todayDate],
      type: QueryTypes.SELECT,
      transaction
    }
  );
  if (!existingOrder.length) {
    await db.sequelize.query(
      `
      INSERT INTO orders
      (user_plan_id, user_id, plate_id, daily_diet_id, order_date, time_slot, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW())
      `,
      {
        replacements: [
          plan.id,
          plan.user_id,
          plate_id,
          dailyDietId,
          todayDate,
          plan.time_slot
        ],
        type: QueryTypes.INSERT,
        transaction
      }
    );
  }
}
  await transaction.commit(); 
    return res.json({
      success: true,
      message: "Daily diet added and orders created successfully"
    });

  } catch (error) {
    await transaction.rollback();
    console.error("Daily Diet Add Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
export const dailydietsadd_old = async (req, res) => {
  try {
    const {
      id, // edit ke liye optional
      plate_id,
      day_name,
      meal_type,
      item_name,
      description,
      status
    } = req.body;
    const image = req.file ? req.file.filename : null;
    // 🔹 Validation
    if (!plate_id  || !meal_type || !item_name) {
      return res.status(400).json({
        success: false,
        message: "plate_id, day_name, meal_type and item_name are required",
      });
    }
    // ===============================
    // 🔥 EDIT DAILY DIET
    // ===============================
    if (id) {
      let imageQuery = "";
      if (image) {
        imageQuery = ", image = :image";
      }
      await db.sequelize.query(
        `
        UPDATE daily_diets
        SET
          plate_id = :plate_id,
          day_name = :day_name,
          meal_type = :meal_type,
          item_name = :item_name
          ${imageQuery},
          description = :description,
          status=:status,
          updated_at = NOW()
        WHERE id = :id
        `,
        {
          replacements: {
            id,
            plate_id,
            day_name,
            meal_type,
            item_name,
            image,
            description: description || "",
            status
          },
          type: QueryTypes.UPDATE,
        }
      );
      return res.json({
        success: true,
        message: "Daily diet updated successfully",
      });
    }
    // ===============================
    // 🔥 ADD DAILY DIET
    // ===============================
    await db.sequelize.query(
      `
      INSERT INTO daily_diets
      (plate_id, day_name, meal_type, item_name, image, description, created_at)
      VALUES
      (:plate_id, :day_name, :meal_type, :item_name, :image, :description, NOW())
      `,
      {
        replacements: {
          plate_id,
          day_name,
          meal_type,
          item_name,
          image,
          description: req.body.description || "",
        },
        type: QueryTypes.INSERT,
      }
    );
    return res.json({
      success: true,
      message: "Daily diet added successfully",
    });
  } catch (error) {
    console.error("Daily Diet Add/Edit Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
/////////////////////////////////////
export const dailydietslist = async (req, res) => {
  try {
    const { id } = req.params;
    let query = `
      SELECT
        id,
        plate_id,
        day_name,
        meal_type,
        item_name,
        image,
        description,
        status,
        created_at,
        updated_at
      FROM daily_diets
    `;

    if (id) {
      query += ` WHERE id = :id `;
    }
    query += ` ORDER BY id DESC`;
    const dailyDiets = await db.sequelize.query(query, {
      replacements: id ? { id } : {},
      type: QueryTypes.SELECT,
    });
    const baseDietUrl = `${req.protocol}://${req.get("host")}/uploads/daily_diets`;
    const formattedDiets = dailyDiets.map((diet) => ({
      ...diet,
      image: diet.image ? `${baseDietUrl}/${diet.image}` : null,
    }));
    return res.json({
      success: true,
      message: "Daily diets fetched successfully",
      data: id ? formattedDiets[0] || null : formattedDiets
    });
  } catch (error) {
    console.error("List Daily Diets Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
/////////////////////////////////////
export const getnotifications = async (req, res) => {
  try {
    const { user_id } = req.query; // user_id from query
    let query = `
      SELECT 
        n.id,
        n.title,
        n.message,
        n.is_read,
        n.created_at,
        u.name AS user_name,
        u.mobile AS mobile_number
      FROM notifications n
      LEFT JOIN users u ON u.id = n.user_id
    `;
    // Agar user_id aaya hai to filter lagao
    if (user_id) {
      query += ` WHERE n.user_id = :user_id `;
    }
    query += ` ORDER BY n.id DESC`;
    const notifications = await db.sequelize.query(query, {
      replacements: { user_id },
      type: QueryTypes.SELECT,
    });

    return res.json({
      success: true,
      data: notifications,
    });
  } catch (error) {
    console.error("Get Notifications Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
///////////////////
export const markAllRead = async (req, res) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: "user_id is required",
      });
    }
    await db.sequelize.query(
      `
      UPDATE notifications
      SET is_read = 1
      WHERE user_id = :user_id
      `,
      {
        replacements: { user_id },
        type: QueryTypes.UPDATE,
      }
    );
    return res.json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error) {
    console.error("Mark Read Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
/////////////////////////////////////
export const addhealthprofile = async (req, res) => {
  try {
    const user_id = req.user?.id;

    if (!user_id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const filePath = req.file ? req.file.path : null;
    await db.sequelize.query(
      `
      INSERT INTO health_profiles (user_id, files, created_at)
      VALUES (:user_id, :files, NOW())
      `,
      {
        replacements: {
          user_id,
          files: filePath,
        },
        type: QueryTypes.INSERT,
      }
    );
    return res.json({
      success: true,
      message: "Health profile added successfully",
      file: filePath,
    });
  } catch (error) {
    console.error("Add Health Profile Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
////////////////////////////////////////////////////
export const healthprofilelist = async (req, res) => {
  try {
    const user_id = req.user?.id;
    if (!user_id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const profiles = await db.sequelize.query(
      `
      SELECT id, user_id, files, created_at
      FROM health_profiles
      WHERE user_id = :user_id
      ORDER BY id DESC
      `,
      {
        replacements: { user_id },
        type: QueryTypes.SELECT,
      }
    );
    // Base URL
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const baseUrl = `${protocol}://${req.get("host")}/`;
    const data = profiles.map((item) => ({
      ...item,
      file_url: item.files ? `${baseUrl}/${item.files}` : null,
    }));
    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Health Profile List Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
//////////////////////////////////////////////////
export const gettransactions = async (req, res) => {
  try {
    const { user_id } = req.params;
    let query = `
      SELECT 
        t.transaction_id,
        t.plan_id AS transaction_plan_id,
        t.user_id,
        t.amount,
        t.payment_gateway,
        t.gateway_transaction_id,
        t.payment_type,
        t.payment_method,
        t.status,
        t.paid_at,
        u.name AS user_name,
        u.mobile AS user_mobile,
        -- PLAN DATA
        p.id AS plan_id,
        p.title AS plan_title,
        p.description AS plan_description,
        p.duration_days,
        p.price AS plan_price,
        p.category_id,
        p.created_at AS plan_created_at,
        -- PLATE DATA
        pl.id AS plate_id,
        pl.name AS plate_name,
        pl.description AS plate_description,
        pl.price_per_week,
        pl.duration,
        pl.image,
        -- LATEST ACTIVE USER PLAN
        up.id AS user_plan_id,
        up.time_slot,
        up.start_date,
        up.end_date,
        up.status AS user_plan_status,
        up.created_at AS user_plan_created_at
      FROM payment_transactions t
      LEFT JOIN users u ON u.id = t.user_id
      LEFT JOIN plans p ON p.id = t.plan_id
      LEFT JOIN plates pl ON pl.id = p.category_id
      LEFT JOIN user_plans up 
        ON up.id = (
          SELECT MAX(id)
          FROM user_plans
          WHERE transaction_id COLLATE utf8mb4_unicode_ci 
                = t.gateway_transaction_id COLLATE utf8mb4_unicode_ci
          AND status = 1
        )
    `;
    if (user_id) {
      query += ` WHERE t.user_id = :user_id `;
    }
    query += ` ORDER BY t.transaction_id DESC`;
    const rows = await db.sequelize.query(query, {
      replacements: { user_id },
      type: QueryTypes.SELECT,
    });
    const transactions = rows.map((r) => ({
      transaction_id: r.transaction_id,
      plan_id: r.transaction_plan_id,
      user_id: r.user_id,
      amount: r.amount,
      payment_gateway: r.payment_gateway,
      gateway_transaction_id: r.gateway_transaction_id,
      payment_type: r.payment_type,
      payment_method: r.payment_method,
      status: r.status,
      paid_at: r.paid_at,
      user_name: r.user_name,
      user_mobile: r.user_mobile,
      plan: r.plan_id
        ? {
            id: r.plan_id,
            title: r.plan_title,
            description: r.plan_description,
            duration_days: r.duration_days,
            price: r.plan_price,
            category_id: r.category_id,
            created_at: r.plan_created_at,
            active_plan: r.user_plan_id
              ? {
                  id: r.user_plan_id,
                  time_slot: r.time_slot,
                  start_date: r.start_date,
                  end_date: r.end_date,
                  status: r.user_plan_status,
                  created_at: r.user_plan_created_at,
                }
              : null,
          }
        : null,
      plate: r.plate_id
        ? {
            id: r.plate_id,
            name: r.plate_name,
            description: r.plate_description,
            price_per_week: r.price_per_week,
            duration: r.duration,
            image: r.image,
          }
        : null,
    }));
    return res.json({
      success: true,
      count: transactions.length,
      data: transactions,
    });
  } catch (error) {
    console.error("Get Transactions Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
///////////////////////////////
export const verifyPayment = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const user_id = req.user?.id;
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    console.log("Verify Payment Body:", req.body);
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Payment details missing",
      });
    }

    /* ======================================================
       1️⃣ VERIFY SIGNATURE
    ====================================================== */
    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");
    if (expectedSignature !== razorpay_signature) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Payment verification failed",
      });
    }
    /* ======================================================
       2️⃣ CHECK IF TRANSACTION ALREADY EXISTS (IMPORTANT)
    ====================================================== */
   const existingTransaction = await db.sequelize.query(
  `SELECT transaction_id 
   FROM payment_transactions
   WHERE transaction_reference = :razorpay_payment_id
   LIMIT 1`,
  {
    replacements: { razorpay_payment_id },
    type: QueryTypes.SELECT,
    transaction
  }
);

    if (existingTransaction.length) {
      await transaction.commit();
      return res.json({
        success: true,
        message: "Payment already verified"
      });
    }

    /* ======================================================
       3️⃣ FETCH PAYMENT FROM RAZORPAY
    ====================================================== */
    const payment = await razorpay.payments.fetch(razorpay_payment_id);

    if (payment.status !== "captured") {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Payment not captured",
      });
    }

    /* ======================================================
       4️⃣ GET USER PLAN USING RAZORPAY ORDER ID
    ====================================================== */
    const planResult = await db.sequelize.query(
      `SELECT id, plan_id
       FROM user_plans
       WHERE transaction_id = :order_id
       LIMIT 1`,
      {
        replacements: { order_id: razorpay_order_id },
        type: QueryTypes.SELECT,
        transaction
      }
    );

    if (!planResult.length) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "User plan not found",
      });
    }

    const planRow = planResult[0];

    /* ======================================================
       5️⃣ INSERT INTO PAYMENT TRANSACTIONS
    ====================================================== */
    await db.sequelize.query(
      `
      INSERT INTO payment_transactions
      (
        transaction_reference,
        transaction_id,
        user_id,
        plan_id,
        payment_gateway,
        gateway_transaction_id,
        amount,
        payment_type,
        payment_method,
        status,
        gateway_response,
        paid_at,
        created_at
      )
      VALUES
      (
        :transaction_reference,
        :transaction_id,
        :user_id,
        :plan_id,
        'razorpay',
        :gateway_transaction_id,
        :amount,
        'plan',
        :payment_method,
        'success',
        :gateway_response,
        FROM_UNIXTIME(:paid_at),
        NOW()
      )
      `,
      {
        replacements: {
          transaction_reference: razorpay_payment_id, // ✅ UNIQUE SAFE
          transaction_id: razorpay_payment_id,
          user_id,
          plan_id: planRow.plan_id,
          gateway_transaction_id: payment.id,
          amount: payment.amount / 100,
          payment_method: payment.method,
          gateway_response: JSON.stringify(payment),
          paid_at: payment.created_at,
        },
        type: QueryTypes.INSERT,
        transaction
      }
    );

    /* ======================================================
       6️⃣ UPDATE USER PLAN STATUS
    ====================================================== */
    await db.sequelize.query(
      `
      UPDATE user_plans
      SET transaction_id = :payment_id,
          status = 1
      WHERE transaction_id = :order_id
      `,
      {
        replacements: {
          payment_id: razorpay_payment_id,
          order_id: razorpay_order_id,
        },
        type: QueryTypes.UPDATE,
        transaction
      }
    );
    await transaction.commit();
    return res.json({
      success: true,
      message: "Payment verified and stored successfully",
    });

  } catch (error) {
    await transaction.rollback();
    console.error("Verify Payment Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
/////////////////////////////////////////////////////////
export const orderplace = async (req, res) => {
  try {
    const user_id = req.user?.id;

    if (!user_id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const { plan_id, time_slot } = req.body;
    if (!plan_id) {
      return res.status(400).json({
        success: false,
        message: "plan_id is required",
      });
    }
    const planResult = await db.sequelize.query(
      `
      SELECT id, title, description, duration_days, plan_type, price,category_id
      FROM plans
      WHERE id = :plan_id AND status = 1
      `,
      {
        replacements: { plan_id },
        type: QueryTypes.SELECT,
      }
    );
    if (!planResult.length) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });
    }
    const plan = planResult[0];
    // 2️⃣ Create Razorpay order
    const razorOrder = await razorpay.orders.create({
      amount: plan.price * 100,
      currency: "INR",
      receipt: `user_${user_id}_plan_${plan.id}`,
      notes: {
        user_id,
        plan_id,
      },
    });
    // 3️⃣ Dates
    const start_date = new Date();
    const end_date = new Date();
    end_date.setDate(start_date.getDate() + plan.duration_days);
    // 4️⃣ Save order in DB
    await db.sequelize.query(
      `
      INSERT INTO user_plans
      (user_id, transaction_id, plan_id, time_slot, plan_data, start_date, end_date, status, created_at)
      VALUES
      (:user_id, :transaction_id, :plan_id, :time_slot, :plan_data, :start_date, :end_date, 1, NOW())
      `,
      {
        replacements: {
          user_id,
          transaction_id: razorOrder.id, // order_id save
          plan_id,
          time_slot,
          plan_data: JSON.stringify(plan),
          start_date,
          end_date,
        },
        type: QueryTypes.INSERT,
      }
    );
    return res.json({
      success: true,
      message: "Order created successfully",
      order_id: razorOrder.id,
      amount: razorOrder.amount,
      currency: razorOrder.currency,
      receipt: razorOrder.receipt,
      RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("Order Place Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
/////////////////////////////////////////
export const mealshistory = async (req, res) => {
  try {
    const userId = req.user?.id;
    console.log("data get "+userId);
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const baseUrlFinal = `${protocol}://${req.get("host")}`;
    const baseUrl = `${baseUrlFinal}/uploads/daily_diets/`;
    const rows = await db.sequelize.query(
      `
      SELECT 
        up.id AS user_plan_id,
        up.start_date,
        up.end_date,
        p.id AS plan_id,
        p.title AS plan_title,
        p.category_id,
        dd.id AS diet_id,
        dd.day_name,
        dd.meal_type,
        dd.item_name,
        dd.image,
        dd.description,
        dd.created_at
      FROM user_plans up
      INNER JOIN plans p ON p.id = up.plan_id
      INNER JOIN daily_diets dd 
        ON dd.plate_id = p.category_id
      WHERE up.user_id = :user_id
      AND up.status = 1
      AND CURDATE() BETWEEN up.start_date AND up.end_date
      ORDER BY dd.created_at DESC
      `,
      {
        replacements: { user_id: userId },
        type: QueryTypes.SELECT,
      }
    );
    if (!rows.length) {
      return res.json({
        success: true,
        message: "No meals found",
        data: [],
      });
    }
    const meals = rows.map((r) => ({
  diet_id: r.diet_id,
  day_name: r.day_name,
  meal_type: r.meal_type,
  item_name: r.item_name,
  description: r.description,
  image: r.image ? baseUrl + r.image : null,
  created_at: r.created_at
    ? new Date(r.created_at).toISOString().split("T")[0]
    : null,
}));
    return res.json({
      success: true,
      today: new Date().toISOString().split("T")[0],
      data: meals,
    });
  } catch (error) {
    console.error("Meals History Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
/////////////////////////////////////////////////////
export const deliveryboysadd = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const {
      id,
      name,
      email,
      mobile,
      alternate_phone,
      date_of_birth,
      gender,
      address,
      status,
      notes,
      license_number,
      id_number
    } = req.body; 
    // Files
    const profile_image = req.files?.profile_image?.[0]?.path || null;
    const vehicle_rc_image = req.files?.vehicle_rc_image?.[0]?.path || null;
    const license_front_image = req.files?.license_front_image?.[0]?.path || null;
    const license_back_image = req.files?.license_back_image?.[0]?.path || null;
    const id_front_image = req.files?.id_front_image?.[0]?.path || null;
    const id_back_image = req.files?.id_back_image?.[0]?.path || null;

    let deliveryBoyId;

    /* =========================================================
       🔹 UPDATE MODE
    ========================================================= */
    if (id) {

      // Check exists
      const [existing] = await db.sequelize.query(
        `SELECT id FROM delivery_boys WHERE id = ? LIMIT 1`,
        { replacements: [id], transaction: t }
      );

      if (!existing.length) {
        await t.rollback();
        return res.status(404).json({
          success: false,
          message: "Delivery boy not found"
        });
      }

      // Update delivery boy
      await db.sequelize.query(`
        UPDATE delivery_boys SET
          name=?,
          email=?,
          mobile=?,
          alternate_phone=?,
          date_of_birth=?,
          gender=?,
          address=?,
          status=?,
          notes=?,
          updated_at=NOW()
        WHERE id=?
      `,{
        replacements:[
          name,email,mobile,alternate_phone,
          date_of_birth,gender,address,status,notes,id
        ],
        transaction:t
      });
      deliveryBoyId = id;
      const [docExist] = await db.sequelize.query(
        `SELECT id FROM delivery_boy_documents WHERE delivery_boy_id=? LIMIT 1`,
        { replacements:[id], transaction:t }
      );               
      if (docExist.length) {
        await db.sequelize.query(`
          UPDATE delivery_boy_documents SET
            profile_image = COALESCE(?, profile_image),
            vehicle_rc_image = COALESCE(?, vehicle_rc_image),
            license_number = ?,
            license_front_image = COALESCE(?, license_front_image),
            license_back_image = COALESCE(?, license_back_image),
            id_number = ?,
            id_front_image = COALESCE(?, id_front_image),
            id_back_image = COALESCE(?, id_back_image),
            updated_at = NOW()
          WHERE delivery_boy_id = ?
        `,{
          replacements:[
            profile_image,
            vehicle_rc_image,
            license_number,
            license_front_image,
            license_back_image,
            id_number,
            id_front_image,
            id_back_image,
            id
          ],
          transaction:t
        });
      } else {
        await db.sequelize.query(`
          INSERT INTO delivery_boy_documents
          (
            delivery_boy_id,
            profile_image,
            vehicle_rc_image,
            license_number,
            license_front_image,
            license_back_image,
            id_number,
            id_front_image,
            id_back_image
          )
          VALUES (?,?,?,?,?,?,?,?,?)
        `,{
          replacements:[
            id,
            profile_image,
            vehicle_rc_image,
            license_number,
            license_front_image,
            license_back_image,
            id_number,
            id_front_image,
            id_back_image
          ],
          transaction:t
        });
      }
      await t.commit();
      return res.json({
        success: true,
        message: "Delivery boy updated successfully"
      });
    }
    const [mobileExist] = await db.sequelize.query(
      `SELECT id FROM delivery_boys WHERE mobile=? LIMIT 1`,
      { replacements:[mobile], transaction:t }
    );
    if (mobileExist.length) {
      await t.rollback();
      return res.status(400).json({
        success:false,
        message:"Mobile already exists"
      });
    }
    const [insertResult] = await db.sequelize.query(`
      INSERT INTO delivery_boys
      (name,email,mobile,alternate_phone,date_of_birth,gender,address,status,notes,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,NOW(),NOW())
    `,{
      replacements:[
        name,email,mobile,alternate_phone,
        date_of_birth,gender,address,status,notes
      ],
      transaction:t
    });
    deliveryBoyId = insertResult;
    await db.sequelize.query(`
      INSERT INTO delivery_boy_documents
      (
        delivery_boy_id,
        profile_image,
        vehicle_rc_image,
        license_number,
        license_front_image,
        license_back_image,
        id_number,
        id_front_image,
        id_back_image
      )
      VALUES (?,?,?,?,?,?,?,?,?)
    `,{
      replacements:[
        deliveryBoyId,
        profile_image,
        vehicle_rc_image,
        license_number,
        license_front_image,
        license_back_image,
        id_number,
        id_front_image,
        id_back_image
      ],
      transaction:t
    });

    await t.commit();

    return res.status(201).json({
      success:true,
      message:"Delivery boy added successfully"
    });

  } catch (error) {
    await t.rollback();
    return res.status(500).json({
      success:false,
      message:error.message
    });
  }
};
/////////////////////////////////////////
export const deliveryboysList = async (req, res) => {
  try {
    const BASE_URL = `${req.protocol}://${req.get("host")}/`;
    const { id, search = "" } = req.query;
    let whereCondition = `d.deleted_at IS NULL`;
    let replacements = {};
    
    if (id) {
      whereCondition += ` AND d.id = :id`;
      replacements.id = id;
    } 
    else {
      whereCondition += `
        AND (
          d.name LIKE :search OR
          d.mobile LIKE :search OR
          d.email LIKE :search
        )
      `;
      replacements.search = `%${search}%`;
    }
    const [rows] = await db.sequelize.query(`
      SELECT 
        d.id,
        d.name,
        d.email,
        d.mobile,
        d.alternate_phone,
        d.date_of_birth,
        d.gender,
        d.address,
        d.status,
        d.notes,
        d.total_deliveries,
        d.created_at,
        d.updated_at,
        doc.profile_image,
        doc.vehicle_rc_image,
        doc.license_number,
        doc.license_front_image,
        doc.license_back_image,
        doc.id_number,
        doc.id_front_image,
        doc.id_back_image
      FROM delivery_boys d
      LEFT JOIN delivery_boy_documents doc 
      ON d.id = doc.delivery_boy_id
      WHERE ${whereCondition}
      ORDER BY d.id DESC
    `, { replacements });
    // Add Base URL to image paths
    const data = rows.map(item => ({
      ...item,
      profile_image: item.profile_image ? BASE_URL + item.profile_image : null,
      vehicle_rc_image: item.vehicle_rc_image ? BASE_URL + item.vehicle_rc_image : null,
      license_front_image: item.license_front_image ? BASE_URL + item.license_front_image : null,
      license_back_image: item.license_back_image ? BASE_URL + item.license_back_image : null,
      id_front_image: item.id_front_image ? BASE_URL + item.id_front_image : null,
      id_back_image: item.id_back_image ? BASE_URL + item.id_back_image : null,
    }));
    res.json({
      success: true,
      count: data.length,
      data: id ? data[0] || null : data
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
///////////////////////////////////////////////
export const getdeliveryboyProfile = async (req, res) => {
  try {
    const deliveryBoyId = req.user.id;
   const BASE_URL = `${req.protocol}://${req.get("host")}/`;
    const deliveryBoy = await db.sequelize.query(
      `SELECT db.*, 
              doc.profile_image,
              doc.vehicle_rc_image,  
              doc.license_number,
              doc.license_front_image,
              doc.license_back_image,
              doc.id_number,
              doc.id_front_image,
              doc.id_back_image
       FROM delivery_boys db
       LEFT JOIN delivery_boy_documents doc 
       ON db.id = doc.delivery_boy_id
       WHERE db.id = :id
       AND db.deleted_at IS NULL
       LIMIT 1`,
      {
        replacements: { id: deliveryBoyId },
        type: QueryTypes.SELECT
      }
    );
    if (!deliveryBoy.length) {
      return res.status(404).json({
        success: false,
        message: "Delivery boy not found"
      });
    }
    const data = deliveryBoy[0];
    // ✅ Add full image path
    data.profile_image = data.profile_image ? BASE_URL + data.profile_image : null;
    data.vehicle_rc_image = data.vehicle_rc_image ? BASE_URL + data.vehicle_rc_image : null;
    data.license_front_image = data.license_front_image ? BASE_URL + data.license_front_image : null;
    data.license_back_image = data.license_back_image ? BASE_URL + data.license_back_image : null;
    data.id_front_image = data.id_front_image ? BASE_URL + data.id_front_image : null;
    data.id_back_image = data.id_back_image ? BASE_URL + data.id_back_image : null;
    return res.json({
      success: true,
      delivery_boy: data
    });

  } catch (error) {
    console.error("Get Profile Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};
///////////////////////////////////////////////
export const createOrder = async (req, res) => {
  try {
    const { order_id, delivery_boy_id } = req.body;
    if (!order_id || !delivery_boy_id) {
      return res.status(400).json({
        success: false,
        message: "order_id and delivery_boy_id are required"
      });
    }
    // 1️⃣ Check order exists
    const order = await db.sequelize.query(
      `SELECT id FROM orders WHERE id = ?`,
      {
        replacements: [order_id],
        type: QueryTypes.SELECT
      }
    );
    if (!order.length) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }
    // 2️⃣ Check delivery boy exists
    const deliveryBoy = await db.sequelize.query(
      `SELECT id FROM delivery_boys WHERE id = ?`,
      {
        replacements: [delivery_boy_id],
        type: QueryTypes.SELECT
      }
    );

    if (!deliveryBoy.length) {
      return res.status(404).json({
        success: false,
        message: "Delivery boy not found"
      });
    }
    // 3️⃣ Update order
    await db.sequelize.query(
      `
      UPDATE orders
      SET delivery_boy_id = ?,
          delivery_boy_status = 'assign',
          status = 'assigned',
          updated_at = NOW()
      WHERE id = ?
      `,
      {
        replacements: [delivery_boy_id, order_id],
        type: QueryTypes.UPDATE
      }
    );
    return res.json({
      success: true,
      message: "Delivery boy assigned successfully"
    });
  } catch (error) {
    console.error("Assign Delivery Boy Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};
//////////////////////////////////////////////
export const orderslist = async (req, res) => {
  try {
    const { delivery_boy_id, order_id } = req.query;

    let whereConditions = [];
    let replacements = {};

    if (delivery_boy_id) {
      whereConditions.push("o.delivery_boy_id = :delivery_boy_id");
      replacements.delivery_boy_id = delivery_boy_id;
    }

    if (order_id) {
      whereConditions.push("o.id = :order_id");
      replacements.order_id = order_id;
    }

    const whereCondition =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

    const BASE_URL = `${req.protocol}://${req.get("host")}`;

    const orders = await db.sequelize.query(
      `
      SELECT 
        o.id,
        o.order_date,
        o.time_slot,
        o.status AS order_status,
        o.delivery_boy_status,
        o.delivery_boy_id,
        o.start_time,
        o.end_time,

        u.name AS user_name,
        u.mobile AS user_mobile,

        ua.address AS user_address,

        dd.item_name AS diet_name,

        db.name AS delivery_boy_name,
        db.mobile AS delivery_boy_mobile,

        IFNULL(
          CONCAT(:BASE_URL, up.profile_image),
          'https://lh3.googleusercontent.com/proxy/R9dXqanxVP2kpX9iSZxr3LsxIAfQhpkR6GbJW0EENe9zMmPYJUiuslNRReZJIT5n1wmExGlEEgh2v4T7i2gxgU505LP5XxTZmjpSQnjDvoDbzCPy6WXaZg7NJwssL7KT1DZ88VpIYdUcZnNmmw'
        ) AS profile_image

      FROM orders o

      LEFT JOIN users u 
        ON o.user_id = u.id

      LEFT JOIN user_profiles up
        ON up.user_id = u.id

      LEFT JOIN user_addresses ua
        ON ua.user_id = u.id
        AND ua.is_default = 1

      LEFT JOIN daily_diets dd
        ON o.daily_diet_id = dd.id

      LEFT JOIN delivery_boys db
        ON o.delivery_boy_id = db.id

      ${whereCondition}

      ORDER BY o.id DESC
      `,
      {
        replacements: {
          ...replacements,
          BASE_URL: BASE_URL
        },
        type: QueryTypes.SELECT
      }
    );

    return res.json({
      success: true,
      data: order_id ? orders[0] || null : orders
    });

  } catch (error) {
    console.error("Orders List Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};
///////////////////////////////////// 
export const updateDeliveryStatus = async (req, res) => {
  try {
    const { order_id, action, start_time, end_time } = req.body;
    const capture_selfie = req.file ? req.file.filename : null;
    if (!order_id || !action) {
      return res.status(400).json({
        success: false,
        message: "order_id and action are required"
      });
    }
    console.log("Update Delivery Status Body:", req.body);
    const order = await db.sequelize.query(
      `SELECT id FROM orders WHERE id = ?`,
      {
        replacements: [order_id],
        type: QueryTypes.SELECT
      }
    );
    if (!order.length) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }
    let query = "";
    let replacements = [];
    // 🚚 Start Delivery
    if (action === "start") {
      if (!start_time) {
        return res.status(400).json({
          success: false,
          message: "start_time is required"
        });
      }
      query = `
        UPDATE orders
        SET start_time = ?,
            status = 'out_for_delivery',
            updated_at = NOW()
        WHERE id = ?
      `;
      replacements = [start_time, order_id];
    }
    // 📦 Complete Delivery
    else if (action === "complete") {
      if (!end_time || !capture_selfie) {
        return res.status(400).json({
          success: false,
          message: "end_time and capture_selfie image required"
        });
      }
      query = `
        UPDATE orders
        SET end_time = ?,
            capture_selfie = ?,
            status = 'delivered',
            delivery_boy_status = 'delivered',
            updated_at = NOW()
        WHERE id = ?
      `;
      replacements = [end_time, capture_selfie, order_id];
    }
    else {
      return res.status(400).json({
        success: false,
        message: "Invalid action"
      });
    }
    await db.sequelize.query(query, {
      replacements,
      type: QueryTypes.UPDATE
    });
    return res.json({
      success: true,
      message: "Order updated successfully",
      selfie: capture_selfie
    });
  } catch (error) {
    console.error("Delivery Update Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};
////////////////////////////////
export const dashboardapp = async (req, res) => {
  try {
    const { delivery_boy_id } = req.query;

    if (!delivery_boy_id) {
      return res.status(400).json({
        success: false,
        message: "delivery_boy_id is required"
      });
    }

    const BASE_URL = `${req.protocol}://${req.get("host")}`;

    // Dashboard Counts
    const dashboardCounts = await db.sequelize.query(
      `
      SELECT 
        COUNT(CASE WHEN DATE(order_date) = CURDATE() THEN 1 END) 
        AS today_total_orders,

        COUNT(CASE WHEN DATE(order_date) = CURDATE() 
        AND delivery_boy_id = :delivery_boy_id
        
         AND delivery_boy_status = 'delivered' THEN 1 END) 
        AS today_assigned_orders,

        COUNT(CASE WHEN DATE(order_date) = CURDATE() 
        AND delivery_boy_id = :delivery_boy_id 
        AND delivery_boy_status = 'delivered' THEN 1 END) 
        AS today_delivered_orders,

        COUNT(CASE WHEN delivery_boy_id = :delivery_boy_id THEN 1 END) 
        AS overall_total_orders

      FROM orders
      `,
      {
        replacements: { delivery_boy_id },
        type: QueryTypes.SELECT
      }
    );

    // Today Orders List
   const todayOrders = await db.sequelize.query(
`
SELECT 
  o.id,
  o.order_date,
  o.time_slot,
  o.status AS order_status,
  o.delivery_boy_status,
  o.delivery_boy_id,
  o.start_time,
  o.end_time,

  u.name AS user_name,
  u.mobile AS user_mobile,

  ua.address AS user_address,

  dd.item_name AS diet_name,

  db.name AS delivery_boy_name,
  db.mobile AS delivery_boy_mobile,

  IFNULL(
    CONCAT(:BASE_URL, up.profile_image),
    'https://lh3.googleusercontent.com/proxy/R9dXqanxVP2kpX9iSZxr3LsxIAfQhpkR6GbJW0EENe9zMmPYJUiuslNRReZJIT5n1wmExGlEEgh2v4T7i2gxgU505LP5XxTZmjpSQnjDvoDbzCPy6WXaZg7NJwssL7KT1DZ88VpIYdUcZnNmmw'
  ) AS profile_image

FROM orders o

LEFT JOIN users u 
  ON o.user_id = u.id

LEFT JOIN user_profiles up
  ON up.user_id = u.id

LEFT JOIN user_addresses ua
  ON ua.user_id = u.id
  AND ua.is_default = 1

LEFT JOIN daily_diets dd
  ON o.daily_diet_id = dd.id

LEFT JOIN delivery_boys db
  ON o.delivery_boy_id = db.id

WHERE 
  o.delivery_boy_id = :delivery_boy_id
  AND DATE(o.order_date) = CURDATE()

ORDER BY o.id DESC
`,
{
  replacements: {
    delivery_boy_id,
    BASE_URL
  },
  type: QueryTypes.SELECT
}
);

    return res.json({
      success: true,
      message: "Dashboard data fetched successfully",
      dashboard: dashboardCounts[0],
      today_orders: todayOrders
    });

  } catch (error) {
    console.error("Dashboard API Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};
///////////////////////////////////////////////////////