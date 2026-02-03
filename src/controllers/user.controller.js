import db from "../models/index.js";
import { QueryTypes } from "sequelize";
import { replaceNullWithBlank } from "../utils/responseHelper.js";
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
    const userId = req.user?.id; // from authMiddleware
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const users = await db.sequelize.query(
      `
      SELECT u.id, u.name, u.mobile, u.email, up.gender, up.dob, up.height, up.weight, up.profile_image
      FROM users u
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE u.id = :user_id
      LIMIT 1
      `,
      {
        replacements: { user_id: userId },
        type: QueryTypes.SELECT,
      }
    );
    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    const user = users[0];
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
    CASE 
      WHEN up.profile_image IS NULL OR up.profile_image = ''
      THEN :defaultImage
      ELSE up.profile_image
    END AS profile_image,
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
    DATE_FORMAT(ua.created_at, '%Y-%m-%d %H:%i:%s') AS address_created_at
  FROM users u
  LEFT JOIN user_profiles up ON up.user_id = u.id
  LEFT JOIN user_addresses ua ON ua.user_id = u.id
  ORDER BY u.id DESC
  `,
  {
    type: QueryTypes.SELECT,
    replacements: {
      defaultImage: "https://randomuser.me/api/portraits/men/75.jpg"
    }
  }
);

    /* 🔥 GROUP USERS + ADDRESSES */
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
      profile_image: row.profile_image,
      gender: row.gender,
      dob: row.dob,
      height: row.height,
      weight: row.weight,
      address: null   // ✅ SINGLE address
    };
  }
  // ✅ Take only ONE address (default first preference)
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
}
 return res.json({
      success: true,
      data: Object.values(replaceNullWithBlank(usersMap))
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
      id, // 🔥 optional (edit ke liye)
      title,
      description,
      duration_days,
      price,
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
      (title, description, duration_days, price, status, created_at)
      VALUES
      (:title, :description, :duration_days, :price, :status, NOW())
      `,
      {
        replacements: {
          title,
          description: description || "",
          duration_days,
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
        id, 
        title,
        description,
        duration_days,
        category_id,
        price,
        status,
        created_at,
        updated_at
      FROM plans
      ORDER BY id DESC
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
    const { id } = req.params;
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
    `;
    // 🔹 If id exists → single record
    if (id) {
      query += ` WHERE id = :id`;
    }
    query += ` ORDER BY id DESC`;
    const banners = await db.sequelize.query(query, {
      type: QueryTypes.SELECT,
      replacements: id ? { id } : {},
    });
    // 🔹 Base URL
    const baseUrl = `${req.protocol}://${req.get("host")}`;
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
    const { id } = req.params; // 👈 route param
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
    const baseUrl = `${req.protocol}://${req.get("host")}`;
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

    const baseUrl = `${req.protocol}://${req.get("host")}/uploads/plates`;

    const formattedPlates = plates.map((plate) => ({
      ...plate,
      image: plate.image ? `${baseUrl}/${plate.image}` : null,
    }));

    // 👉 Agar id aayi hai to daily_diets bhi lao
    if (id && formattedPlates.length > 0) {
      const plateId = id;

      // JS se aaj ka day nikal lo (Monday, Tuesday...)
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
  try {
    const {
      id, // edit ke liye optional
      plate_id,
      day_name,
      meal_type,
      item_name,
      description
    } = req.body;
    const image = req.file ? req.file.filename : null;
    // 🔹 Validation
    if (!plate_id || !day_name || !meal_type || !item_name) {
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