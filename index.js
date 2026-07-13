import express from "express";
import dotenv from "dotenv";
import "./config/firebase.js"; // sirf initialize karne ke liye import
import { sendToDevice } from "./services/notificationService.js";

dotenv.config();

const app = express();
app.use(express.json()); // body-parser ki zarurat nahi

app.post("/send-notification", async (req, res) => {
  const { token, title, body } = req.body;

  if (!token || !title || !body) {
    return res.status(400).json({
      success: false,
      error: "token, title, aur body required hain",
    });
  }

  const result = await sendToDevice(token, title, body);

  if (!result.success) {
    if (
      result.code === "messaging/invalid-registration-token" ||
      result.code === "messaging/registration-token-not-registered"
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid ya expired token — device se naya token lo",
      });
    }
    return res.status(500).json(result);
  }

  res.json(result);
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});