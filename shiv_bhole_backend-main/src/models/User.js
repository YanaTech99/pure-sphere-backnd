import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";
import { hashPassword } from "../utils/hashEncrypt.js";
import { formatPhone } from "../utils/formatPhonenum.js";

const User = sequelize.define(
  "User",
  {
    user_id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    role_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3, 
    },

    full_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    phone: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
    },

    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      unique: true,
    },

    alternate_phone: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },

    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    date_of_birth: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    gender: {
      type: DataTypes.ENUM("MALE", "FEMALE", "OTHER"),
      allowNull: true,
    },

    address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    city: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    state: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    pincode: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },

    country: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: "India",
    },

    profile_image: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },

    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },

    is_verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },

    email_verified_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    last_login: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    token: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    user_type: {
      type: DataTypes.ENUM("super_admin", "customer", "system"),
    },
  },
  {
    tableName: "users",
    timestamps: true, 
    underscored: true,

   
    hooks: {
  beforeSave: async (user) => {
    // ✔ Fully protect hash from undefined/null/empty values
    if (
      user.changed("password_hash") &&
      typeof user.password_hash === "string" &&
      user.password_hash.trim() !== ""
    ) {
      user.password_hash = await hashPassword(user.password_hash);
    }

    if (user.changed("phone") && user.phone) {
      user.phone = formatPhone(user.phone);
    }
  },
}

  }
);

export default User;
