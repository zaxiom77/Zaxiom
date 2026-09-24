// backend-example.js
//
// Handles the form on trading-blueprint-funnel.html. Deploy this on any
// Node.js host — Render, Railway, a Vercel/Netlify serverless function, or
// your own VPS — anywhere the HTML file's /api/submit request can reach it.
//
// Setup:
//   npm install express nodemailer
//
// Sends through zaxiom77@gmail.com via Gmail's own SMTP. This needs a
// Gmail App Password, not your regular Gmail password — Google stopped
// allowing regular passwords for third-party apps back in 2022, so the
// real password simply won't work here even if you tried it. To create
// an App Password:
//   1. Go to myaccount.google.com/security
//   2. Turn on 2-Step Verification if it isn't already on
//   3. Under "How you sign in to Google," open App Passwords
//   4. Create one named for this project and copy the 16-character code
// That code goes in GMAIL_APP_PASSWORD below, as an environment variable
// on whatever host you deploy this to — never paste it into this file,
// into chat, or anywhere else it'll sit in plain text.
//
// Required environment variables:
//   GMAIL_USER           — zaxiom77@gmail.com
//   GMAIL_APP_PASSWORD   — the 16-character App Password from the steps above
//   DISCORD_INVITE        — Server Settings > Invites in Discord; set an expiry
//                           or max-uses there if you don't want it public forever
//   WHATSAPP_INVITE       — from the WhatsApp group's "Invite via link" screen
//
// DISCORD_INVITE and WHATSAPP_INVITE aren't used on first submission below —
// that email just confirms the application was received. They're read in
// and ready for whenever you add the "you're approved" email that goes out
// after your team reviews someone. Neither needs a bot — a plain invite
// link is enough unless you later want per-user tracking.
//
// Worth knowing before you rely on this: Gmail is built for a person
// sending mail, not a server. Google sometimes flags automated sends from
// hosting infrastructure as suspicious, especially once volume picks up,
// and personal accounts cap out around 500 emails a day. Fine to start
// with — if delivery ever gets unreliable, switching to a dedicated
// sender like Resend or Postmark later is a smaller change than it
// sounds, since only the transporter block below changes.

const express = require('express');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.json());

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const DISCORD_INVITE = process.env.DISCORD_INVITE;
const WHATSAPP_INVITE = process.env.WHATSAPP_INVITE;

// --- very basic in-memory rate limit: 1 submission per IP per minute ---
// Fine for getting started; swap for Redis (or your host's built-in rate
// limiting) once you have real traffic, since this resets on every restart
// and won't work across multiple server instances.
const lastSubmissionByIP = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const last = lastSubmissionByIP.get(ip);
  if (last && now - last < 60_000) return true;
  lastSubmissionByIP.set(ip, now);
  return false;
}

function sanitize(str) {
  return String(str || '').slice(0, 1000).replace(/[<>]/g, '');
}
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

app.post('/api/submit', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (isRateLimited(ip)) {
      return res.status(429).json({ error: 'Too many requests. Try again shortly.' });
    }

    const { why, expectation, budget, time, email, phone, gender, honeypot } = req.body;

    // Honeypot: real visitors never fill this hidden field; bots often do.
    // Accept silently and do nothing, so the bot doesn't learn it was caught.
    if (honeypot) {
      return res.status(200).json({ ok: true });
    }

    if (!why || !expectation || !budget || !time || !gender || !email || !isValidEmail(email) || !phone) {
      return res.status(400).json({ error: 'Missing or invalid required fields.' });
    }

    const code = crypto.randomBytes(4).toString('hex').toUpperCase(); // internal reference ID — not shown to the applicant

    // TODO: persist this submission to your own database (Postgres, Supabase,
    // Airtable — whatever you're comfortable with) before or after sending
    // the email, so an application is never lost even if the email fails:
    //   await db.applications.insert({
    //     why: sanitize(why), expectation: sanitize(expectation),
    //     budget, time, gender, email: sanitize(email), phone: sanitize(phone),
    //     code, status: 'pending', createdAt: new Date(),
    //   });

    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: sanitize(email),
      subject: 'Your spot is saved',
      html: `
        <p>Hi there,</p>
        <p>Your spot for The Blueprint is saved. Our team will review your application, and you'll hear from us soon with next steps.</p>
        <p>Stay tuned.</p>
        <p>Regards,<br>The Blueprint Team</p>
      `,
    });

    // Once you've reviewed and approved an application (wherever you're
    // tracking that — your database, a spreadsheet, etc.), send a second,
    // separate email with DISCORD_INVITE / WHATSAPP_INVITE below. That
    // approval step isn't built here yet — say the word if you want it.

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('submit error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listening on ${port}`));
