# Campus Bulkmart Backend

Handles the waitlist signup + confirmation email. Payment endpoints will be
added here later once that gets redesigned.

## 1. Add this folder to your repo

Copy this entire `server/` folder into the root of your existing Campus
Bulkmart repo (the one with `src/`, `build.js`, etc.), then commit and push:

```
git add server
git commit -m "Add backend server"
git push
```

Your frontend and this backend now live in the same repo but deploy
completely separately — this folder has its own `package.json` and doesn't
touch your Tailwind build pipeline at all.

## 2. Set up the Supabase table

1. Go to your Supabase project → **SQL Editor** → **New Query**
2. Paste the contents of `supabase-setup.sql` and click **Run**
3. Go to **Settings → API** and copy:
   - **Project URL** (you already have this: `https://oiwgadfjrkuzjkvhugos.supabase.co`)
   - **service_role key** (NOT the `anon` key — the service_role one, further
     down the page, usually behind a "reveal" click). Keep this secret.

## 3. Set up Brevo

> **Note:** this replaces Resend. If you already set up Resend earlier, you
> can ignore/delete those env vars — Brevo lets us send to *real* students
> immediately without owning a domain, which Resend's test mode couldn't do.

1. Go to [brevo.com](https://www.brevo.com) → sign up (free, no card needed)
2. Create a **new dedicated Gmail** just for sending, e.g.
   `campusbulkmart.noreply@gmail.com` — don't use a personal inbox
3. In Brevo: **Senders, Domains & Dedicated IPs → Senders → Add a sender**
   → enter that Gmail address and a sender name (`Campus Bulkmart`)
4. Brevo emails a 6-digit code to that Gmail — copy it, paste it back into
   Brevo to verify
5. **SMTP & API → API Keys → Generate a new API key** → copy it immediately

## 4. Deploy to Render

1. **New** → **Web Service** → connect your GitHub repo
2. **Root Directory**: `server`
3. **Build Command**: `npm install`
4. **Start Command**: `npm start`
5. **Environment** tab → add these (values, not the names in quotes):

   | Key | Value |
   |---|---|
   | `SUPABASE_URL` | `https://oiwgadfjrkuzjkvhugos.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | *(from step 2)* |
   | `BREVO_API_KEY` | *(from step 3)* |
   | `BREVO_FROM_EMAIL` | `campusbulkmart.noreply@gmail.com` |
   | `BREVO_FROM_NAME` | `Campus Bulkmart` |
   | `ALLOWED_ORIGINS` | `https://campusbulkmart.web.app,http://localhost:3000,http://127.0.0.1:5500` |

6. Deploy. Render gives you a URL like `https://campus-bulkmart-api.onrender.com`

## 5. Test it

Once deployed, test with curl (replace the URL with your actual Render URL):

```bash
curl -X POST https://your-service.onrender.com/api/waitlist \
  -H "Content-Type: application/json" \
  -d '{"email":"a-real-email-you-can-check@example.com","source":"test"}'
```

Expected response:
```json
{"success":true,"position":1,"alreadyOnList":false}
```

Check that inbox (and its spam folder, just in case — see note below) for
the confirmation email.

Run it again with the same email — you should get `"alreadyOnList":true`
with the same position number, not a duplicate row.

## 6. Frontend — already wired up

Both `coming-soon-desktop.html` and `coming-soon-mobile.html` already POST
to this endpoint, include the honeypot field, and show the real position
number in the success toast. Nothing left to do here unless the Render URL
changes.

## A note on deliverability

Since we're sending from a personal-style Gmail address rather than an
authenticated domain, some emails may land in spam instead of the inbox —
this is a Gmail/Yahoo/Microsoft policy thing, not a bug in the code. The
on-page toast message already accounts for this ("check your inbox and spam
folder"). When there's budget for a real domain later, switching to full
domain authentication with Brevo (or moving back to Resend) will fix this
properly — no code changes needed beyond swapping env vars.

## Notes on the honeypot

The field is named `website` — a name bots commonly auto-fill when scraping
forms. It needs to:
- Be a real `<input>` in the DOM (not `display:none`, some bots skip those)
- Be visually hidden via off-screen positioning or `opacity:0` + `height:0`
- Have no `label` a real user would notice
- Never get filled by an actual person, so if it arrives non-empty, we know
  it's a bot and quietly no-op instead of erroring (which would tip off the
  bot that it got caught)

This gets added to both frontend forms in Phase 3.
