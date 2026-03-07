import multer from "multer";
import path from "path";
import fs from "fs";

const basePath = "uploads/delivery_boys";

const folders = [
  "profile",
  "vehicle_rc",
  "license",
  "id_proof"
];

folders.forEach(folder => {
  const dir = `${basePath}/${folder}`;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {

    if (file.fieldname === "profile_image") {
      cb(null, `${basePath}/profile`);
    } 
    else if (file.fieldname === "vehicle_rc_image") {
      cb(null, `${basePath}/vehicle_rc`);
    }
    else if (
      file.fieldname === "license_front_image" ||
      file.fieldname === "license_back_image"
    ) {
      cb(null, `${basePath}/license`);
    }
    else if (
      file.fieldname === "id_front_image" ||
      file.fieldname === "id_back_image"
    ) {
      cb(null, `${basePath}/id_proof`);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}_${Date.now()}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only images allowed"), false);
  }
};

export const uploadDeliveryBoys = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});