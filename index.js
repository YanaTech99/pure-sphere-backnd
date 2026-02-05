const express = require("express");
const bodyParser = require("body-parser");
const admin = require("firebase-admin");

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();
app.use(bodyParser.json());

app.post("/send-notification", async (req, res) => {
  const { token, title, body } = req.body;

  const message = {
    notification: {
      title: title,
      body: body
    },
    token: token
  };

  try {
    const response = await admin.messaging().send(message);
    res.json({ success: true, response });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error });
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
