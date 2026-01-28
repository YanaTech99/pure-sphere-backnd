export const adminKeyMiddleware = (req, res, next) => {
  const adminKey = req.headers["x-admin-key"];

  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({
      success: false,
      message: "Admin access denied"
    });
  }

  next();
};
