const express = require("express");
const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config(); // Load environment variables from .env file

const app = express();

// Enable CORS for specific origins
const allowedOrigins = ["https://portfolio-nu-ten-32.vercel.app"];
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true); // Allow the request
      } else {
        callback(new Error("Not allowed by CORS"), false); // Deny the request
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE"], // Allow only specific HTTP methods if necessary
    allowedHeaders: ["Content-Type", "Authorization"], // Allow specific headers if necessary
  })
);

app.use(express.json());

const PORT = process.env.PORT || 8080;

// Email sending function
const sendEmail = async (name, email, message) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_EMAIL,
      pass: process.env.GMAIL_PASSWORD,
    },
  });

  const mailOptions = {
    from: process.env.GMAIL_EMAIL,
    to: process.env.GMAIL_EMAIL,
    subject: `New Contact Form Submission from ${name}`,
    html: `<h3>Message from ${name} (${email})</h3><p>${message}</p>`,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true, message: "Email sent successfully!" };
  } catch (error) {
    console.error("Error sending email:", error);
    return { success: false, message: "Failed to send email." };
  }
};

// Endpoint to handle contact form submission
app.post("/api/send-email", async (req, res) => {
  const { fullname, email, message } = req.body;

  if (!fullname || !email || !message) {
    return res
      .status(400)
      .json({ success: false, message: "All fields are required." });
  }

  const response = await sendEmail(fullname, email, message);

  if (response.success) {
    return res.status(200).json(response);
  } else {
    return res.status(500).json(response);
  }
});

app.get("/api/health", async (req, res) => {
  try {
    const healthCheck = {
      uptime: process.uptime(),
      message: "OK",
      timestamp: new Date(),
    };
    res.status(200).json(healthCheck);
  } catch (error) {
    res.status(500).json({
      message: "Health check failed",
      error: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
