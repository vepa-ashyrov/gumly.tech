# Deploying Gumly to Vercel (gumly.tech)

## 0. Before you deploy — one required edit

Open `gumly-app.js` and paste your Supabase anon/public key into:

```js
SUPABASE_ANON_KEY: "PASTE_YOUR_SUPABASE_ANON_PUBLIC_KEY_HERE",
```

Find it in your Supabase dashboard → Settings → API → "anon" "public" key.
(Project URL and API base URL are already filled in.)

Also double-check the two endpoint paths match your actual Express routes:

```js
ENDPOINTS: {
  BOOKINGS: "/api/bookings",
  SERVICES: "/api/services",
}
```

## 1. Install the Vercel CLI (skip if you already have it)

```
npm i -g vercel
```

## 2. Deploy

From inside this folder:

```
cd gumly-deploy
vercel login
vercel --prod
```

First deploy will ask a few setup questions — accept the defaults (it's a static
site, no build command needed). This gives you a live `*.vercel.app` URL immediately
so you can check everything before pointing the real domain at it.

## 3. Point gumly.tech at this deployment

In the Vercel dashboard:
1. Open the new project → **Settings → Domains**
2. Add `gumly.tech` (and `www.gumly.tech` if you want both)
3. Vercel will show you the DNS records to set

In Spaceship (your domain registrar), update DNS to match what Vercel shows —
usually either:
- An **A record** pointing `@` to Vercel's IP, or
- Vercel's **nameservers**, if you want Vercel to manage DNS entirely

Propagation is usually a few minutes, sometimes up to a few hours.

## 4. If gumly.tech is currently live elsewhere

If your current marketing site is already deployed somewhere (another Vercel
project, or elsewhere), you have two options:
- Update the *existing* Vercel project's files instead of creating a new one, or
- Remove the domain from the old project first, then add it to this one

Let me know which situation you're in if you want help with that step specifically.

## Files in this folder

- `index.html` — homepage
- `login.html` — sign in
- `signup.html` — sign up (homeowner/technician)
- `book.html` — booking flow (requires login)
- `dashboard.html` — account dashboard (requires login)
- `gumly-app.js` — shared config, Supabase auth, API helper
- `vercel.json` — clean URLs (`/login` instead of `/login.html`) + caching
