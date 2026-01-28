import { Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

// Log environment variables for debugging
console.log("=== Database Configuration ===");
console.log("DB_NAME:", process.env.DB_NAME);
console.log("DB_USER:", process.env.DB_USER);
console.log("DB_PASSWORD:", process.env.DB_PASSWORD ? "*** (hidden)" : "undefined");
console.log("DB_HOST:", process.env.DB_HOST);
console.log("DB_PORT:", process.env.DB_PORT || 3306);
console.log("==============================");
console.log("==============================");

const sequelize = new Sequelize(
  process.env.DB_NAME,      // database name
  process.env.DB_USER,      // mysql username
  process.env.DB_PASSWORD,  // mysql password
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    dialect: "mysql",
    logging: false,
  }
);

try {
  await sequelize.authenticate();
  console.log("Database connected successfully!");
} catch (error) {
  console.error("DB Connection Failed:", error);
}

export default sequelize;
