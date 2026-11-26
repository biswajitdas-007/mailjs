'use strict'

/**
 * a small fixed-window limiter kept in memory. on serverless each instance has its own counts, so this is
 * defence in depth on top of the api key, not the main control.
 */
function createRateLimiter({ limit, windowMs, now = Date.now }) {
  const hits = new Map()
  return function take(key) {
    const t = now()
    const entry = hits.get(key)
    if (!entry || t >= entry.reset) {
      hits.set(key, { count: 1, reset: t + windowMs })
      if (hits.size > 10_000) for (const [k, v] of hits) if (t >= v.reset) hits.delete(k)
      return { ok: true }
    }
    entry.count += 1
    return { ok: entry.count <= limit, retryAfter: Math.ceil((entry.reset - t) / 1000) }
  }
}

module.exports = { createRateLimiter }
