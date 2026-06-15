// Controllers/razorpay_controller.js
const crypto = require("crypto");
const razorpay = require("../Config/razorpay");
const PaymentsModel = require("../Models/paymentsModel");
const  CONSTANTS  = require("../Utils/constants");

// helper: convert paise -> rupees number
const toRupees = (v) => {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n / 100 : 0;
};

// Create Razorpay order
exports.createOrder = async (req, res) => {
  try {
    const { appId, appName, amount, currency = "INR", receipt, notes, userId } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: "Valid amount is required" });
    }

    const options = {
      amount: Math.round(Number(amount) * 100), // rupees -> paisa
      currency,
      receipt: receipt || `rcpt_${Date.now()}`,
      notes: notes || {},
    };

    const order = await razorpay.orders.create(options);

    // ✅ NEW: Save a "pending" record (does not affect API response)
    // Use upsert so if same orderId comes again, it won't break
    try {
      await PaymentsModel.findOneAndUpdate(
        { orderId: order.id },
        {
          $set: {
            appId,
            appName,
            orderId: order.id,
            currency: order.currency || currency,
            status: CONSTANTS.PAYMENT_STATUS.ORDER_CREATED,
            notes: order.notes || notes || {},
            customerUserId: userId || "",
            rawPayload: {
              order,
              source: "createOrder",
            },
          },
        },
        { upsert: true, new: true }
      );
    } catch (dbErr) {
      console.error("DB save (createOrder) warning:", dbErr);
      // do not fail order creation if DB write fails
    }

    return res.status(200).json({
      orderId: order.id,
      amount: order.amount, // paisa
      currency: order.currency,
      receipt: order.receipt,
      keyId: process.env.RAZORPAY_KEY_ID, // safe to return
    });
  } catch (err) {
    console.error("Create order error:", err);
    return res.status(500).json({ message: "Failed to create order" });
  }
};

// Verify Razorpay payment
exports.verifyPayment = async (req, res) => {
  try {
    const {
      appId,
      appName,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      userId,
      meta,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: "Missing payment fields" });
    }

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    const isValid = expectedSignature === razorpay_signature;

    if (!isValid) {
      return res
        .status(400)
        .json({ verified: false, message: "Invalid signature" });
    }

    // ✅ NEW: Fetch full payment details from Razorpay
    // This is how you get method/bank/email/contact/fee/gst/invoice_id/rrn etc.
    let payment = null;
    try {
      payment = await razorpay.payments.fetch(razorpay_payment_id);
    } catch (rpErr) {
      console.error("Razorpay fetch payment error:", rpErr);
      // still proceed saving minimal verified record (same as your current logic)
    }

    // Prepare fields from Razorpay payment response
    const bankRrn =
      payment?.acquirer_data?.bank_transaction_id ||
      payment?.acquirer_data?.rrn ||
      payment?.acquirer_data?.arn ||
      "";

    const bank = payment?.bank || ""; // sometimes bank code/name
    const method = payment?.method || ""; // netbanking/card/upi/...
    const status = payment?.status || CONSTANTS.PAYMENT_STATUS.CAPTURED; // captured/authorized/failed...

    const fee = toRupees(payment?.fee); // fee in paise => rupees
    const gst = toRupees(payment?.tax); // tax in paise => rupees
    const totalFee = fee + gst; // total fee (fee + gst) in rupees
    const totalAmountPaid = toRupees(payment?.amount); // total amount in rupees

    const payloadNotes = payment?.notes || {};

    // ✅ Save / Update record (upsert to avoid duplicate key error)
    // Keep "working exactly same" — just store more data now.
    await PaymentsModel.findOneAndUpdate(
      // Prefer paymentId (unique), fallback to orderId
      // { paymentId: razorpay_payment_id },
      { $or: [{ paymentId: razorpay_payment_id }, { orderId: razorpay_order_id }] },
      {
        $set: {
            appId,
            appName,
          paymentId: razorpay_payment_id,
          orderId: razorpay_order_id,

          invoiceId: payment?.invoice_id || "",
          bankRrn: bankRrn,

          paymentMethod: method,
          bank: bank,
          currency: payment?.currency || "INR",

          customerPhone: payment?.contact || "",
          customerEmail: payment?.email || "",
          customerUserId: userId || "",

          totalFee: totalFee,
          bankFee: fee,
          gst: gst,
          totalAmountPaid: totalAmountPaid,

          feeBearer: payment?.fee_bearer || "",
          description: payment?.description || "",

          // Notes dynamic keys
          notes: payloadNotes,

          lateAuthorized: payment?.late_authorized === true,
          autoCaptured: payment?.auto_captured === true,

          status: status,

          rawPayload: {
            payment,
            verifyBody: req.body, // includes userId/meta you were sending
            source: "verifyPayment",
          },
        },
        // If you want, you can keep existing notes from order creation too:
        // $setOnInsert: { ... }
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      verified: true,
      message: "Payment verified successfully",
      razorpay_order_id,
      razorpay_payment_id,
      userId: userId || null,
      meta: meta || {},
    });
  } catch (err) {
    console.error("Verify payment error:", err);
    return res.status(500).json({ message: "Failed to verify payment" });
  }
};



