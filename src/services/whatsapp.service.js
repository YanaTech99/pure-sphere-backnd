import axios from "axios";
import dotenv from "dotenv";
import db from "../models/index.js";
import { QueryTypes } from "sequelize";

dotenv.config();

const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL; // e.g. https://<base>/v1/whatsapp
const WHATSAPP_API_KEY = process.env.WHATSAPP_API_KEY; // sent as `apikey` header
const WHATSAPP_FROM_NUMBER = process.env.WHATSAPP_FROM_NUMBER; // e.g. +91XXXXXXXXXX (registered WA business number)

const isConfigured = () =>
  Boolean(WHATSAPP_API_URL && WHATSAPP_API_KEY && WHATSAPP_FROM_NUMBER);

const formatWhatsappNumber = (phone) => {
  if (!phone) return phone;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`; // assume India if no country code
  return `+${digits}`;
};

export async function sendWhatsappTemplate(
  to,
  templateName,
  languageCode = "en",
  bodyParams = [],
  buttonParams = null,
  campaignName = "api-test"
) {
  if (!isConfigured()) {
    console.warn("WhatsApp API not configured yet (missing env vars) — skipping send.");
    return { success: false, error: "WhatsApp API not configured" };
  }

  const toNumber = formatWhatsappNumber(to);

  const components = {};

  if (bodyParams.length) {
    components.body = { params: bodyParams.map((p) => String(p)) };
  }

  if (buttonParams && buttonParams.length) {
    components.buttons = { params: buttonParams.map((p) => String(p)) };
  }

  const payload = {
    from: WHATSAPP_FROM_NUMBER,
    campaignName,
    to: toNumber,
    templateName,
    type: "template",
    ...(Object.keys(components).length ? { components } : {}),
  };

  try {
    const response = await axios.post(WHATSAPP_API_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        apikey: WHATSAPP_API_KEY,
      },
    });
    return { success: true, response: response.data };
  } catch (error) {
    console.error("WhatsApp Error (template):", error.response?.data || error.message);
    return { success: false, error: error.response?.data || error.message };
  }
}

export async function sendWhatsappOtp(phone, otp, languageCode = "en") {
  if (!isConfigured()) {
    console.warn("WhatsApp API not configured yet (missing env vars) — skipping send.");
    return { success: false, error: "WhatsApp API not configured" };
  }

  const toNumber = formatWhatsappNumber(phone);

  const payload = {
    from: WHATSAPP_FROM_NUMBER,
    campaignName: "otp-login",
    to: toNumber,
    templateName: "testing_otp",
    otp: String(otp),
    type: "template",
    language: { code: languageCode },
  };

  try {
    const response = await axios.post(WHATSAPP_API_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        apikey: WHATSAPP_API_KEY,
      },
    });
    return { success: true, response: response.data };
  } catch (error) {
    console.error("WhatsApp Error (otp):", error.response?.data || error.message);
    return { success: false, error: error.response?.data || error.message };
  }
}

export async function sendWhatsappSubscriptionThankYou(phone, name, planName, startDate, endDate) {
  return sendWhatsappTemplate(phone, "subscription_thank_you_with_variable", "en", [
    name,
    planName,
    startDate,
    endDate,
  ]);
}

export async function sendWhatsappSubscriptionExpiryReminder(phone, name, planName, endDate, daysLeft) {
  const templateMap = {
    2: "subscription_expiry_2days",
    1: "subscription_expiry_1day",
    0: "subscription_expiry_today",
  };

  const templateName = templateMap[daysLeft];
  if (!templateName) {
    return { success: false, error: `No template configured for daysLeft=${daysLeft}` };
  }

  const bodyParams = daysLeft === 0 ? [name, planName] : [name, planName, endDate];

  return sendWhatsappTemplate(phone, templateName, "en", bodyParams);
}

export async function sendWhatsappOrderUpdate(phone, name, orderId, status) {
  const templateMap = {
    out_for_delivery: "order_out_for_delivery",
    delivered: "order_delivered",
  };

  const templateName = templateMap[status];
  if (!templateName) {
    return { success: false, error: `No template configured for status="${status}"` };
  }

  return sendWhatsappTemplate(phone, templateName, "en", [name, orderId]);
}


export async function notifyUserWhatsapp(userId, templateName, params = []) {
  try {
    const rows = await db.sequelize.query(
      `SELECT mobile FROM users WHERE id = :user_id LIMIT 1`,
      {
        replacements: { user_id: userId },
        type: QueryTypes.SELECT,
      }
    );

    const phone = rows[0]?.mobile;
    if (!phone) {
      console.log(`User ${userId} has no phone number on file — skipping WhatsApp send`);
      return { success: false, error: "No phone number found for this user" };
    }

    return await sendWhatsappTemplate(phone, templateName, "en", params);
  } catch (error) {
    console.error(`notifyUserWhatsapp Error (userId: ${userId}):`, error.message);
    return { success: false, error: error.message };
  }
}