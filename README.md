# mailjs

A small, authenticated relay that emails contact-form messages to the owner's Gmail inbox. It's meant to be called **server to server** (for example by SpendBook's API), never directly from a browser.

## API

### `POST /api/send-email`

```http
POST /api/send-email
Authorization: Bearer <MAILJS_API_KEY>
Content-Type: application/json

{ "fullname": "Asha Rao", "email": "asha@example.com", "message": "Plain text.\nLine breaks are kept." }
```

| Status | Meaning |
| --- | --- |
| 200 | Sent |
| 400 | Invalid input (unknown fields, bad email, control characters, empty or too long) |
| 401 | Missing or wrong token |
| 413 | Body over 16 KB |
| 429 | Rate limited |
| 502 | Gmail refused or timed out |
| 503 | `MAILJS_API_KEY` isn't configured (the relay fails closed) |

Send **plain text**. The relay escapes it, converts line breaks for the HTML part, and also sends a plain-text part. The sender's address is set as `Reply-To`.

### `GET /api/health`

Returns `{ "status": "ok" }`.

## Security

- Every send needs `Authorization: Bearer <MAILJS_API_KEY>`, compared in constant time. Without a key of at least 32 characters, sending is disabled.
- There is no CORS, so browsers can't call it cross-site.
- Fields are validated strictly: only `fullname`, `email` and `message` are accepted; names and emails must be one line with no control characters, which keeps the subject and headers injection-free.
- All user input is HTML-escaped in the email.
- Limits: 16 KB bodies, 20 sends per hour per client and 10 failed authentications per 15 minutes per client (per instance, as defence in depth).
- Only `POST /api/send-email` and `GET /api/health` exist. Responses use `no-store` and strict security headers, and errors never include internal details.

## Setup

```bash
npm install
cp .env.example .env   # fill in the values
npm test
npm start
```

On Vercel, set `GMAIL_EMAIL`, `GMAIL_PASSWORD` and `MAILJS_API_KEY` in the project's environment variables, then redeploy. Give every caller the same `MAILJS_API_KEY`.
