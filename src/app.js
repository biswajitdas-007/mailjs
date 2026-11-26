'use strict'

const crypto = require('node:crypto')
const express = require('express')
const { composeEmail, validateMessage } = require('./validate')
const { createRateLimiter } = require('./rate-limit')

const digest = (s) => crypto.createHash('sha256').update(String(s)).digest()

/** constant-time comparison of a presented bearer token with the configured key */
function tokenMatches(header, apiKey) {
  const match = /^Bearer (.+)$/.exec(header || '')
  if (!match) return false
  return crypto.timingSafeEqual(digest(match[1]), digest(apiKey))
}

/** client address for rate limiting; forwarded headers are only trusted on vercel, which sets them itself */
function clientKey(req) {
  const fwd = process.env.VERCEL ? req.get('x-vercel-forwarded-for') || req.get('x-forwarded-for') : undefined
  return (fwd ? fwd.split(',')[0].trim() : req.socket.remoteAddress) || 'unknown'
}

/**
 * the relay: authenticated, server-to-server only (no cors, so browsers can't call it).
 * deps are injected so tests can run without gmail.
 */
function createApp({ apiKey, sendMail, mailTo, mailFrom, rateLimit = { limit: 20, windowMs: 60 * 60 * 1000 } }) {
  const app = express()
  const limiter = createRateLimiter(rateLimit)
  const failedAuth = createRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 })

  app.disable('x-powered-by')
  app.set('etag', false)
  app.use((_req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
      'Cross-Origin-Resource-Policy': 'same-origin',
    })
    next()
  })

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

  app.post(
    '/api/send-email',
    (req, res, next) => {
      const ip = clientKey(req)
      if (!apiKey) return res.status(503).json({ success: false, message: 'The relay is not configured.' })
      if (!tokenMatches(req.get('authorization'), apiKey)) {
        const blocked = !failedAuth(ip).ok
        return res.status(blocked ? 429 : 401).json({ success: false, message: blocked ? 'Too many requests.' : 'Unauthorized.' })
      }
      const quota = limiter(ip)
      if (!quota.ok) {
        res.set('Retry-After', String(quota.retryAfter))
        return res.status(429).json({ success: false, message: 'Too many requests.' })
      }
      next()
    },
    express.json({ limit: '16kb', strict: true, type: 'application/json' }),
    async (req, res) => {
      const parsed = validateMessage(req.body)
      if (!parsed.ok) return res.status(400).json({ success: false, message: parsed.error })
      try {
        await sendMail(composeEmail(parsed.value, { to: mailTo, from: mailFrom }))
        return res.status(200).json({ success: true, message: 'Email sent.' })
      } catch (err) {
        console.error('[mailjs] send failed:', err && err.code ? err.code : 'unknown')
        return res.status(502).json({ success: false, message: 'Failed to send email.' })
      }
    },
  )

  app.all('/api/send-email', (_req, res) => res.set('Allow', 'POST').status(405).json({ success: false, message: 'Method not allowed.' }))
  app.use((_req, res) => res.status(404).json({ success: false, message: 'Not found.' }))
  // malformed json, oversize bodies, anything unexpected: never leak details
  app.use((err, _req, res, _next) => {
    const status = err && (err.type === 'entity.too.large' ? 413 : err.type === 'entity.parse.failed' ? 400 : 500)
    if (status === 500) console.error('[mailjs] unexpected error:', err && err.name)
    res.status(status).json({ success: false, message: status === 413 ? 'Request too large.' : status === 400 ? 'Invalid JSON.' : 'Something went wrong.' })
  })
  return app
}

module.exports = { createApp, tokenMatches }
