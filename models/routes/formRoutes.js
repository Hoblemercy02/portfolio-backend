const express = require('express');
const router = express.Router();
const Form = require('../models/Form');
const nodemailer = require('nodemailer');

// POST: /api/form
router.post('/form', async (req, res) => {
  try {
    const { name, email, message } = req.body;

    // 1. Save form data to MongoDB
    const newForm = new Form({ name, email, message });
    await newForm.save();

    // 2. Setup Gmail transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,  // your Gmail
        pass: process.env.EMAIL_PASS,  // Gmail App Password
      },
    });

    // 3. Send confirmation email to the user
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Thanks for contacting me!",
      text: `Hi ${name},\n\nThank you for reaching out. I will reply soon!\n\nYour message: "${message}"\n\nBest,\nYour Name`,
    });

    res.status(200).json({ success: true, msg: "Form submitted and email sent!" });
  } catch (err) {
    console.error("❌ Error submitting form:", err);
    res.status(500).json({ success: false, msg: "Server error" });
  }
});

module.exports = router;
