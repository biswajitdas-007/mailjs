'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const { createApp } = require('../src/app')
const { validateMessage, composeEmail } = require('../src/validate')

const KEY = 'k'.repeat(40)
const good = { fullname: 'Asha Rao', email: 'asha@example.com', message: 'Hello\nthere' }

async function withServer(opts, fn) {
  const sent = []
  const app = createApp({ apiKey: KEY, mailTo: 'owner@example.com', mailFrom: 'owner@example.com', sendMail: async (m) => sent.push(m), ...opts })
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}`
  const call = (path, init = {}) => fetch(base + path, init).then(async (r) => ({ status: r.status, headers: r.headers, body: await r.json().catch(() => null) }))
  const post = (body, headers = {}) =>
    call('/api/send-email', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}`, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })
  try {
    await fn({ call, post, sent })
  } finally {
    server.close()
  }
}

describe('authentication', () => {
  test('rejects requests without the right bearer token', () =>
    withServer({}, async ({ post, sent }) => {
      assert.equal((await post(good, { authorization: '' })).status, 401)
      assert.equal((await post(good, { authorization: 'Bearer wrong' })).status, 401)
      assert.equal((await post(good, { authorization: KEY })).status, 401)
      assert.equal(sent.length, 0)
    }))

  test('fails closed when no key is configured', () =>
    withServer({ apiKey: undefined }, async ({ post, sent }) => {
      assert.equal((await post(good)).status, 503)
      assert.equal(sent.length, 0)
    }))

  test('slows down repeated bad tokens', () =>
    withServer({}, async ({ post }) => {
      const statuses = []
      for (let i = 0; i < 12; i++) statuses.push((await post(good, { authorization: 'Bearer nope' })).status)
      assert.equal(statuses.at(-1), 429)
    }))
})

describe('sending', () => {
  test('sends an escaped email with a plain-text part and reply-to', () =>
    withServer({}, async ({ post, sent }) => {
      const res = await post({ ...good, message: '<script>alert(1)</script> & "x"\nline 2' })
      assert.equal(res.status, 200)
      const [mail] = sent
      assert.equal(mail.to, 'owner@example.com')
      assert.equal(mail.replyTo, 'asha@example.com')
      assert.ok(!mail.html.includes('<script>'))
      assert.ok(mail.html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;<br>line 2'))
      assert.ok(mail.text.includes('<script>'), 'text part keeps the literal characters')
    }))

  test('rejects bad input and header injection attempts', () =>
    withServer({}, async ({ post, sent }) => {
      assert.equal((await post({ ...good, fullname: 'Eve\r\nBcc: x@y.z' })).status, 400)
      assert.equal((await post({ ...good, email: 'a@b.c>, x@y.z' })).status, 400)
      assert.equal((await post({ ...good, email: 'not-an-email' })).status, 400)
      assert.equal((await post({ ...good, message: '' })).status, 400)
      assert.equal((await post({ ...good, cc: 'x@y.z' })).status, 400)
      assert.equal((await post({ fullname: ['a'], email: good.email, message: 'm' })).status, 400)
      assert.equal((await post('{not json')).status, 400)
      assert.equal((await post({ ...good, message: 'x'.repeat(20_000) })).status, 413)
      assert.equal(sent.length, 0)
    }))

  test('rate-limits a client even with a valid key', () =>
    withServer({ rateLimit: { limit: 3, windowMs: 60_000 } }, async ({ post }) => {
      const statuses = []
      for (let i = 0; i < 4; i++) statuses.push((await post(good)).status)
      assert.deepEqual(statuses, [200, 200, 200, 429])
    }))

  test('reports a delivery failure without details', () =>
    withServer({ sendMail: async () => { throw Object.assign(new Error('smtp secret detail'), { code: 'EAUTH' }) } }, async ({ post }) => {
      const res = await post(good)
      assert.equal(res.status, 502)
      assert.ok(!JSON.stringify(res.body).includes('secret'))
    }))
})

describe('surface', () => {
  test('only POST send-email and GET health exist, with strict headers and no cors', () =>
    withServer({}, async ({ call }) => {
      const health = await call('/api/health')
      assert.equal(health.status, 200)
      assert.deepEqual(health.body, { status: 'ok' })
      assert.equal(health.headers.get('x-powered-by'), null)
      assert.equal(health.headers.get('access-control-allow-origin'), null)
      assert.equal(health.headers.get('cache-control'), 'no-store')
      assert.equal((await call('/api/send-email', { method: 'DELETE' })).status, 405)
      assert.equal((await call('/api/send-email')).status, 405)
      assert.equal((await call('/anything')).status, 404)
    }))
})

test('validateMessage normalises input', () => {
  const r = validateMessage({ fullname: '  Asha  ', email: ' ASHA@Example.com ', message: 'hi\r\nthere ' })
  assert.deepEqual(r, { ok: true, value: { fullname: 'Asha', email: 'asha@example.com', message: 'hi\nthere' } })
  assert.equal(composeEmail(r.value, { to: 't', from: 'f' }).subject, 'New contact form message from Asha')
})
