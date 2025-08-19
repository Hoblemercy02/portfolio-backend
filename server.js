require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const cors = require("cors");
const Stripe = require("stripe");

const app = express();
app.use(cors());
app.use(express.json()); // Use built-in JSON parser

// --- Connect to MongoDB ---
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// --- Create Models ---
const FormSchema = new mongoose.Schema({
  name: String,
  email: String,
  message: String,
  date: { type: Date, default: Date.now },
});
const Form = mongoose.model("Form", FormSchema);

const PaymentSchema = new mongoose.Schema({
  email: String,
  amount: Number,
  status: String,
  date: { type: Date, default: Date.now },
});
const Payment = mongoose.model("Payment", PaymentSchema);

// --- Nodemailer Transporter ---
let transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER, // Gmail address
    pass: process.env.EMAIL_PASS, // App password
  },
});

// --- Stripe Setup ---
const stripe = Stripe(process.env.STRIPE_SECRET);

// --- Root Route (fix for Render "Cannot GET /") ---
app.get("/", (req, res) => {
  res.send("🚀 Portfolio Backend is running successfully!");
});

// --- Form submission ---
app.post("/submit", async (req, res) => {
  try {
    const { name, email, message } = req.body;

    // Save to MongoDB
    const newForm = new Form({ name, email, message });
    await newForm.save();

    // Send confirmation email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Form Submission Received",
      text: `Hello ${name}, thank you for reaching out. I’ll get back to you soon!`,
    });

    res.json({ success: true, message: "Form saved & email sent" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- Payment endpoint (Stripe Checkout) ---
app.post("/create-checkout-session", async (req, res) => {
  try {
    const { email, amount } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: "Portfolio Service Payment" },
            unit_amount: amount * 100, // Stripe uses cents
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: process.env.FRONTEND_URL + "/success",
      cancel_url: process.env.FRONTEND_URL + "/cancel",
    });

    // Save pending payment in DB
    const newPayment = new Payment({ email, amount, status: "pending" });
    await newPayment.save();

    res.json({ url: session.url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// --- Stripe Webhook ---
app.post(
  "/webhook",
  express.raw({ type: "application/json" }), // Only raw for webhook
  (request, response) => {
    const sig = request.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        request.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      response.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      Payment.findOneAndUpdate(
        { email: session.customer_email },
        { status: "paid" }
      ).then(() => console.log("✅ Payment updated in DB"));
    }

    response.json({ received: true });
  }
);

// --- Start Server ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
