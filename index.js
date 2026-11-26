'use strict'

const fs = require('node:fs')
const nodemailer = require('nodemailer')
const { createApp } = require('./src/app')

// local development only; on vercel the environment is injected
if (fs.existsSync('.env') && typeof process.loadEnvFile === 'function') process.loadEnvFile('.env')

const { GMAIL_EMAIL, GMAIL_PASSWORD, MAILJS_API_KEY } = process.env
if (!MAILJS_API_KEY || MAILJS_API_KEY.length < 32) {
  console.error('[mailjs] MAILJS_API_KEY must be set to a random value of at least 32 characters; refusing to send mail')
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: GMAIL_EMAIL, pass: GMAIL_PASSWORD },
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000,
})

const app = createApp({
  // fail closed: a missing or weak key disables sending instead of leaving the relay open
  apiKey: MAILJS_API_KEY && MAILJS_API_KEY.length >= 32 ? MAILJS_API_KEY : undefined,
  sendMail: (mail) => transporter.sendMail(mail),
  mailTo: GMAIL_EMAIL,
  mailFrom: GMAIL_EMAIL,
})

if (require.main === module) {
  const port = Number(process.env.PORT) || 8080
  app.listen(port, () => console.log(`[mailjs] listening on http://localhost:${port}`))
}

module.exports = app
