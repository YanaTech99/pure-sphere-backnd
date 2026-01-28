import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const adminAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader)
      return res.status(401).json({ message: "Token missing" });

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findOne({ where: { user_id: decoded.sub } });

    if (!user)
      return res.status(401).json({ message: "User not found" });

    if (user.role_id !== 1)
      return res.status(403).json({ message: "Not accessible" });

    if (user.token !== token) {
      return res.status(401).json({
        success: false,
        message: "Session expired, logged in from another device"
      });
    }

    req.user = user;
    next();

  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
