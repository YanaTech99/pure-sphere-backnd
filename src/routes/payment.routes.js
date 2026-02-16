import express from "express";
import crypto from "crypto";
import Razorpay from "razorpay";
import db from "../config/db.js";

const router = express.Router();

/* ================= RAZORPAY CONFIG ================= */
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY,
  key_secret: process.env.RAZORPAY_SECRET,
});

/* =====================================================
   CREATE ORDER (RAZORPAY)
===================================================== */
router.post("/create-order", async (req, res) => {
  try {
    const { amount, booking_id } = req.body;

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: "booking_" + booking_id,
    });

    res.json({
      success: true,
      order,
    });
  } catch (err) {
    console.error("CREATE ORDER ERROR:", err);
    res.status(500).json({ error: "Order creation failed" });
  }
});

/* =====================================================
   VERIFY RAZORPAY PAYMENT
===================================================== */
router.post("/verify", async (req, res) => {
  try {
    const {
      booking_id,
      amount,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      gateway_response,
    } = req.body;
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");
    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    const query = `
      INSERT INTO payment_transactions (
        booking_id,
        transaction_reference,
        payment_gateway,
        gateway_transaction_id,
        amount,
        payment_type,
        payment_method,
        status,
        gateway_response,
        paid_at,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
    `;

    await db.query(query, {
      replacements: [
        booking_id,
        razorpay_order_id,
        "razorpay",
        razorpay_payment_id,
        amount,
        "booking",
        "online",
        "success",
        JSON.stringify(gateway_response || {}),
      ],
    });

    res.json({
      success: true,
      message: "Payment verified and stored",
    });
  } catch (err) {
    console.error("VERIFY PAYMENT ERROR:", err);
    res.status(500).json({ error: "Verification failed" });
  }
});

/* =====================================================
   SEND PAYMENT (MANUAL / ADMIN ENTRY)
===================================================== */
router.post("/send-payment", async (req, res) => {
  try {
    const {
      booking_id,
      user_id,
      amount,
      payment_type,
      payment_method,
      transaction_reference,
      gateway_transaction_id,
      status,
      gateway_response,
      failure_reason,
    } = req.body;

    const query = `
      INSERT INTO payment_transactions (
        booking_id,
        user_id,
        transaction_reference,
        payment_gateway,
        gateway_transaction_id,
        amount,
        payment_type,
        payment_method,
        status,
        gateway_response,
        failure_reason,
        paid_at,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
    `;

    await db.query(query, {
      replacements: [
        booking_id,
        user_id,
        transaction_reference || null,
        "manual",
        gateway_transaction_id || null,
        amount,
        payment_type || "booking",
        payment_method || "cash",
        status || "success",
        JSON.stringify(gateway_response || {}),
        failure_reason || null,
      ],
    });

    res.json({
      success: true,
      message: "Payment transaction added successfully",
    });
  } catch (err) {
    console.error("SEND PAYMENT ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
