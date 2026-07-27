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

## 3. Set up Resend

1. Go to [resend.com](https://resend.com) → sign up → free tier
2. **API Keys** → **Create API Key** → copy it (shown once)
3. For now, leave `RESEND_FROM_EMAIL` as `onboarding@resend.dev` — this works
   immediately with zero setup, but only actually delivers to your own
   Resend account email (a restriction on their shared test domain, not
   something we can configure around). Real students' emails won't receive
   anything until a real domain is verified with Resend. When you're ready
   to buy one, come back and we'll add the domain + change this one setting.

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
   | `RESEND_API_KEY` | *(from step 3)* |
   | `RESEND_FROM_EMAIL` | `Campus Bulkmart <onboarding@resend.dev>` |
   | `ALLOWED_ORIGINS` | `https://campusbulkmart.web.app,http://localhost:3000,http://127.0.0.1:5500` |

6. Deploy. Render gives you a URL like `https://campus-bulkmart-api.onrender.com`

## 5. Test it

Once deployed, test with curl (replace the URL with your actual Render URL):

```bash
curl -X POST https://your-service.onrender.com/api/waitlist \
  -H "Content-Type: application/json" \
  -d '{"email":"your-own-email@example.com","source":"test"}'
```

Expected response:
```json
{"success":true,"position":1,"alreadyOnList":false}
```

And you should receive an email at that address (since Resend's test domain
only delivers to your own account email — use the same email your Resend
account is registered under to actually see it land).

Run it again with the same email — you should get `"alreadyOnList":true`
with the same position number, not a duplicate row.

## 6. What's next (Phase 3)

Once this is confirmed working, the frontend forms (`coming-soon-desktop.html`
and `coming-soon-mobile.html`) get updated to:
- POST to this real endpoint instead of just showing a fake toast
- Include a hidden `website` field (the honeypot) — named to match what this
  backend checks for
- Show the real position number in the success message

Send me the live Render URL once it's deployed and I'll wire that part up.

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
