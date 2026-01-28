import multer from "multer";
import path from "path";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/plates");
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `plates_${Date.now()}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only images are allowed"), false);
  }
};

export const uploadPlates = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});