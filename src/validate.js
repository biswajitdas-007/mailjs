'use strict'

/** html-escapes untrusted text so it renders as text, never markup */
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// one line, printable, no control characters (keeps headers like the subject injection-free)
const SINGLE_LINE = /^[^\u0000-\u001f\u007f]+$/u
// deliberately strict: local@domain.tld, no spaces, quotes or angle brackets
const EMAIL = /^[A-Za-z0-9.!#$%&*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/

const LIMITS = { fullname: 100, email: 254, message: 5000 }

/**
 * validates a send request. returns { ok: true, value } or { ok: false, error }.
 * only the three known fields are accepted; anything else is rejected rather than ignored.
 */
function validateMessage(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'The request body must be a JSON object.' }
  const keys = Object.keys(body)
  const unknown = keys.filter((k) => !['fullname', 'email', 'message'].includes(k))
  if (unknown.length) return { ok: false, error: 'Unexpected fields in the request.' }
  const { fullname, email, message } = body
  if (typeof fullname !== 'string' || typeof email !== 'string' || typeof message !== 'string') {
    return { ok: false, error: 'fullname, email and message are required strings.' }
  }
  const name = fullname.trim()
  const from = email.trim().toLowerCase()
  const text = message.replace(/\r\n?/g, '\n').trim()
  if (!name || name.length > LIMITS.fullname || !SINGLE_LINE.test(name)) return { ok: false, error: 'Invalid name.' }
  if (from.length > LIMITS.email || !EMAIL.test(from)) return { ok: false, error: 'Invalid email address.' }
  if (!text || text.length > LIMITS.message || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) {
    return { ok: false, error: 'Invalid message.' }
  }
  return { ok: true, value: { fullname: name, email: from, message: text } }
}

/** the email the owner receives: escaped html plus a plain-text alternative */
function composeEmail({ fullname, email, message }, { to, from }) {
  return {
    from,
    to,
    replyTo: email,
    subject: `New contact form message from ${fullname}`.slice(0, 150),
    text: `From: ${fullname} <${email}>\n\n${message}`,
    html: `<h3>Message from ${escapeHtml(fullname)} (${escapeHtml(email)})</h3><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`,
  }
}

module.exports = { escapeHtml, validateMessage, composeEmail, LIMITS }
