
import DataTypes from "sequelize";
import sequelize from "../config/db.js";

export const Role = sequelize.define(
    "Role",
    {
        role_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        role_name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        percentage: {
            type: DataTypes.FLOAT,
            allowNull: false,
            defaultValue: 0.0,
        },
    },
    {
        tableName: "roles",
        timestamps: false,
    }
);