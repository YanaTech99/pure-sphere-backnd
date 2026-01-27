import jwt from "jsonwebtoken";

export const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log("AUTH HEADER:", authHeader);

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Token required"
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("Decoded JWT:", decoded); // 🔥 Check what is inside

    // Make sure the key exists
    const userId = decoded.user_id || decoded.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Token does not contain user ID"
      });
    }

    req.user = { id: userId };
    console.log("USER ATTACHED TO REQ:", req.user);

    next();
  } catch (err) {
    console.error("JWT Error:", err);
    return res.status(401).json({
      success: false,
      message: "Invalid token"
    });
  }
};
