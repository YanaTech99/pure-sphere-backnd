import cron from "node-cron";
import db from "../models/index.js";
import { QueryTypes } from "sequelize";
import { sendWhatsappSubscriptionExpiryReminder } from "../services/whatsapp.service.js";

/**
 * Finds all active user_plans whose end_date is exactly 2 days, 1 day,
 * or 0 days (today) from now, and sends a WhatsApp expiry reminder for each.
 */
export async function checkSubscriptionExpiries() {
  try {
    const rows = await db.sequelize.query(
      `
      SELECT
        u.id            AS user_id,
        u.name          AS user_name,
        u.mobile        AS user_mobile,
        p.title         AS plan_title,
        up.end_date     AS end_date,
        DATEDIFF(up.end_date, CURDATE()) AS days_left
      FROM user_plans up
      INNER JOIN users u ON u.id = up.user_id
      INNER JOIN plans p ON p.id = up.plan_id
      WHERE up.status = 1
        AND DATEDIFF(up.end_date, CURDATE()) IN (2, 1, 0)
      `,
      { type: QueryTypes.SELECT }
    );

    if (!rows.length) {
      console.log("[cron:subscription-expiry] No plans expiring in next 2 days — nothing to send.");
      return;
    }

    console.log(`[cron:subscription-expiry] Found ${rows.length} plan(s) needing a reminder.`);

    for (const row of rows) {
      if (!row.user_mobile) {
        console.log(`[cron:subscription-expiry] User ${row.user_id} has no mobile number — skipping.`);
        continue;
      }

      try {
        const result = await sendWhatsappSubscriptionExpiryReminder(
          row.user_mobile,
          row.user_name,
          row.plan_title,
          row.end_date,
          row.days_left
        );

        if (!result.success) {
          console.error(
            `[cron:subscription-expiry] Failed for user ${row.user_id} (daysLeft=${row.days_left}):`,
            result.error
          );
        } else {
          console.log(
            `[cron:subscription-expiry] Sent to user ${row.user_id} (daysLeft=${row.days_left}).`
          );
        }
      } catch (err) {
        console.error(`[cron:subscription-expiry] Error for user ${row.user_id}:`, err.message);
      }
    }
  } catch (error) {
    console.error("[cron:subscription-expiry] Query failed:", error.message);
  }
}

/**
 * Registers all scheduled cron jobs for the app.
 * Call this once from your server entry file, e.g.:
 *   import { startCronJobs } from "./cron/index.js";
 *   startCronJobs();
 */
export function startCronJobs() {
  // Runs every day at 9:00 AM (server timezone).
  cron.schedule("0 9 * * *", () => {
    console.log("[cron:subscription-expiry] Running daily subscription expiry check...");
    checkSubscriptionExpiries();
  });

  console.log("[cron] Subscription expiry reminder job scheduled for 9:00 AM daily.");
}