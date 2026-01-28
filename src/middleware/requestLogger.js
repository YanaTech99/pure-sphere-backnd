export const requestLogger = (req, res, next) => {
  console.log(`➡️ API Hit: ${req.method} ${req.originalUrl}`);
  console.log("📦 Body:", req.body);
  console.log("🔗 Query:", req.query);
  console.log("🔑 Headers:", req.headers);
  console.log("--------------------------------------");
  next(); 
};
