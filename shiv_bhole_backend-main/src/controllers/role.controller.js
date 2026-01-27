import sequelize from "../config/db.js";
import {Role} from "../models/role.js";

export const getAllRoles = async (req, res) => {
  try {
 const roles = await Role.findAll({
  attributes: ["role_id", "role_name" , "percentage"],
  order: [["role_id", "ASC"]],
});


    return res.status(200).json({
      success: true,
      data: roles
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

export const rolePercantage = async (req, res) => { 
  try {
    const { role_id, percentage } = req.body;
    const role = await Role.findByPk(role_id);
    if (!role) {
      return res.status(404).json({ success: false, message: "Role not found" });
    }
    role.percentage = percentage;
    await role.save();
    return res.status(200).json({
      success: true,
      message: "Role percentage updated successfully"
    });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  };

export const createRoles = async (req, res) => {
  try {
    const { role_name, percentage } = req.body;
    const existingRole = await Role.findOne({ where: { role_name } });
    if (existingRole) {
      return res.status(400).json({ success: false, message: "Role already exists" });
    }

    const newRole = await Role.create({ role_name, percentage });
    return res.status(201).json({
      success: true,
      message: "Role created successfully",
      data: newRole,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};