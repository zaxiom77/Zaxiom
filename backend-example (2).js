// backend-example.js
//
// Handles the form on trading-blueprint-funnel.html. Deploy this on any
// Node.js host — Render, Railway, a Vercel/Netlify serverless function, or
// your own VPS — anywhere the HTML file's /api/submit request can reach it.
//
// Setup:
//   npm install express nodemailer cors
//
// This currently accepts requests from any website (app.use(cors()) below).
// Once your form's final home has a fixed domain, tighten that to just
// your domain — e.g. cors({ origin: 'https://yourdomain.com' }) — so
// only your own site can submit to this backend.
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
//
// Logging: every branch below now prints a line to the Logs tab, so a
// submission that reaches this server always leaves a trace — success,
// a rejected field, or an error. If you submit the form and NOTHING new
// prints here at all, the request isn't reaching this server in the
// first place (a CORS block or the frontend pointing at the wrong URL
// are the usual reasons), which is a different problem than anything
// this file can fix on its own.

const express = require('express');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const cors = require('cors');

const app = express();
app.use(cors());
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

// Quick manual sanity check — open https://zaxiom.onrender.com directly in
// a browser. Seeing this line back confirms the server itself is alive,
// separate from whatever the form's /api/submit is doing.
app.get('/', (req, res) => {
  res.send('Backend is running.');
});

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
  console.log('--- /api/submit hit ---');
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (isRateLimited(ip)) {
      console.log('Rejected: rate limited, ip =', ip);
      return res.status(429).json({ error: 'Too many requests. Try again shortly.' });
    }

    const { why, expectation, budget, time, email, phone, gender, honeypot } = req.body;

    if (honeypot) {
      console.log('Rejected silently: honeypot field was filled (likely a bot)');
      return res.status(200).json({ ok: true });
    }

    if (!why || !expectation || !budget || !time || !gender || !email || !isValidEmail(email) || !phone) {
      console.log('Rejected: missing or invalid fields ->', {
        why: !!why, expectation: !!expectation, budget, time, gender,
        email, phone: !!phone,
      });
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

    console.log('Fields look valid, attempting to send email to', email);

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

    console.log('Email sent successfully to', email);

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
