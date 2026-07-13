import admin from "firebase-admin";
import db from "../models/index.js";
import { QueryTypes } from "sequelize";

/* ============================================================
   🔹 LOW-LEVEL FCM FUNCTIONS (jaisa tha waisa hi rakha hai)
============================================================ */

// Single device ko notification
export async function sendToDevice(token, title, body, data = {}) {
  const message = {
    notification: { title, body },
    data, // extra key-value data (sab string honi chahiye)
    token,
  };

  try {
    const response = await admin.messaging().send(message);
    return { success: true, response };
  } catch (error) {
    console.error("FCM Error (single):", error.message);
    return { success: false, error: error.message, code: error.code };
  }
}

// Multiple devices ko notification (bulk)
export async function sendToMultipleDevices(tokens, title, body, data = {}) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return { success: false, error: "Tokens array empty hai" };
  }

  const message = {
    notification: { title, body },
    data,
    tokens,
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
      responses: response.responses,
    };
  } catch (error) {
    console.error("FCM Error (multiple):", error.message);
    return { success: false, error: error.message };
  }
}

// Topic based notification
export async function sendToTopic(topic, title, body, data = {}) {
  const message = {
    notification: { title, body },
    data,
    topic,
  };

  try {
    const response = await admin.messaging().send(message);
    return { success: true, response };
  } catch (error) {
    console.error("FCM Error (topic):", error.message);
    return { success: false, error: error.message };
  }
}

/* ============================================================
   🔹 HIGH-LEVEL FUNCTION — DB fcm_token fetch + DB save + FCM send
   Controllers mein YEH function use karo (order, delivery status, etc.)
============================================================ */

/**
 * User ko notification bhejo:
 * 1. notifications table mein save karega (history/list ke liye)
 * 2. users table se fcm_token nikaal ke push notification bhejega
 */
export async function notifyUser(userId, title, body, data = {}) {
  try {
    // 1️⃣ Notification history table mein save karo
    await db.sequelize.query(
      `INSERT INTO notifications (user_id, title, message, is_read, created_at)
       VALUES (:user_id, :title, :message, 0, NOW())`,
      {
        replacements: { user_id: userId, title, message: body },
        type: QueryTypes.INSERT,
      }
    );

    // 2️⃣ User ka FCM token DB se nikalo
    const rows = await db.sequelize.query(
      `SELECT fcm_token FROM users WHERE id = :user_id LIMIT 1`,
      {
        replacements: { user_id: userId },
        type: QueryTypes.SELECT,
      }
    );

    const fcmToken = rows[0]?.fcm_token;
    if (!fcmToken) {
      console.log(`User ${userId} ke paas FCM token nahi hai — sirf DB mein save hui`);
      return { success: false, error: "No FCM token found for this user" };
    }

    // 3️⃣ Data ke saare values string honi chahiye (FCM requirement)
    const stringData = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    );

    // 4️⃣ Existing sendToDevice function reuse karo
    return await sendToDevice(fcmToken, title, body, stringData);
  } catch (error) {
    console.error(`notifyUser Error (userId: ${userId}):`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Multiple users ko ek saath notification (DB save + FCM dono)
 * users = [{ id, fcm_token }] format ya sirf user IDs ka array bhi chalega
 */
export async function notifyMultipleUsers(userIds, title, body, data = {}) {
  try {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return { success: false, error: "userIds array empty hai" };
    }

    // 1️⃣ Sabke liye DB mein notification history insert karo (bulk insert)
    const values = userIds.map((id) => `(${id}, :title, :message, 0, NOW())`).join(", ");
    await db.sequelize.query(
      `INSERT INTO notifications (user_id, title, message, is_read, created_at) VALUES ${values}`,
      {
        replacements: { title, message: body },
        type: QueryTypes.INSERT,
      }
    );

    // 2️⃣ Un sab users ke FCM tokens nikalo
    const rows = await db.sequelize.query(
      `SELECT fcm_token FROM users WHERE id IN (:userIds) AND fcm_token IS NOT NULL`,
      {
        replacements: { userIds },
        type: QueryTypes.SELECT,
      }
    );

    const tokens = rows.map((r) => r.fcm_token).filter(Boolean);

    if (tokens.length === 0) {
      return { success: false, error: "Kisi bhi user ke paas FCM token nahi hai" };
    }

    // 3️⃣ Existing sendToMultipleDevices function reuse karo
    return await sendToMultipleDevices(tokens, title, body, data);
  } catch (error) {
    console.error("notifyMultipleUsers Error:", error.message);
    return { success: false, error: error.message };
  }
}