# Netlify + Decap CMS setup guide

A one-time setup to make `/admin/` work. After this, you'll be able to edit text, swap images, add projects, and reorder things from a browser instead of touching code.

You'll do this in the **Netlify dashboard** (the web app at `app.netlify.com`), not in code. About 10 minutes.

---

## Before you start

You need:

1. **A GitHub account** — you already have one (this repo is yours).
2. **The site pushed to a GitHub repo** — already done.
3. **A Netlify account** — free. Sign up at [app.netlify.com](https://app.netlify.com) if you don't have one yet (use "Sign up with GitHub" to make later steps easier).

---

## Step 1 — Connect the site to Netlify

If you've already connected the repo to Netlify and the site builds, **skip to Step 2**.

1. In the Netlify dashboard, click **Add new site → Import an existing project**.
2. Pick **GitHub** as the source.
3. Authorize Netlify to read your repos (if it asks).
4. Find and select this repo from the list.
5. On the build settings screen, Netlify will read `netlify.toml` from the repo and fill in:
   - **Build command:** `npm run build`
   - **Publish directory:** `public`
   - Leave these as detected.
6. Click **Deploy site**.
7. Wait ~1–2 minutes for the first deploy. You'll see a URL like `random-name-12345.netlify.app` once it's live.

---

## Step 2 — Enable Netlify Identity

Identity is Netlify's user-login service. The CMS needs it to know *you're allowed to edit*.

1. In your Netlify site (click into it from the dashboard), go to **Site configuration → Identity** (left sidebar).
2. Click **Enable Identity**.

You should now see an Identity settings page.

---

## Step 3 — Lock it down to you only

By default, anyone on the internet could sign up. We don't want that.

1. Still on the Identity page, find **Registration preferences**.
2. Click **Edit settings**.
3. Change from **Open** to **Invite only**.
4. Save.

Now only people you explicitly invite can log in.

---

## Step 4 — Add GitHub as the login method

So you can sign in with your GitHub account instead of creating yet another password.

1. On the Identity page, scroll to **External providers**.
2. Click **Add provider → GitHub**.
3. Leave the **Use default configuration** option ticked.
4. Click **Enable**.

GitHub now appears as a sign-in option on your `/admin/` page.

---

## Step 5 — Enable Git Gateway

Git Gateway is what lets the CMS save your edits as commits on the repo without you having to grant the CMS direct GitHub access.

1. On the Identity page, scroll to **Services → Git Gateway**.
2. Click **Enable Git Gateway**.
3. If it asks for permissions, click **Authorize**. Use your GitHub account.

Done.

---

## Step 6 — Invite yourself

1. Still on the Identity page, find the **Identity** tab at the top of the page (the user list — not Site configuration → Identity).
2. Click **Invite users**.
3. Enter your email.
4. Send.

Check that email. You'll get a "You've been invited" message with a confirmation link.

---

## Step 7 — Accept the invite and log in

1. Click the link in the email.
2. It opens your live site URL with a confirmation pop-up. **The pop-up may or may not appear** depending on whether the Netlify Identity widget is on your home page — that's fine either way.
3. Open `https://your-site.netlify.app/admin/` (or whatever your live URL is, with `/admin/` at the end).
4. Click **Login with Netlify Identity** → **Continue with GitHub**.
5. Authorize, and you should land in the CMS.

You'll see two sections in the left sidebar:

- **Site settings** — site-wide text, contact email, OG image, social links, analytics.
- **Projects** — the list of all 8 projects. Click one to edit; drag the handles to reorder.

---

## How edits work day-to-day

- You click in, change something, click **Publish**.
- Behind the scenes, the CMS creates a commit on the `main` branch.
- Netlify sees the new commit, runs `npm run build`, and redeploys.
- Your change is live ~1–2 minutes after you click Publish.

---

## If something goes wrong

| Symptom | What to check |
|---|---|
| `/admin/` page is blank or shows "404 — page not found" | The site hasn't been deployed yet, or your URL is wrong. Visit `https://your-site.netlify.app/admin/` exactly as Netlify shows in the dashboard. |
| Login modal opens but "Continue with GitHub" gives an error | Step 4 wasn't completed — go back and add GitHub as an External provider. |
| Logged in but the CMS says "Failed to load entries" | Step 5 (Git Gateway) wasn't enabled. Go back and enable it. |
| Logged in but edits won't save | Same as above. Git Gateway is the piece that lets the CMS write commits. |
| Got the invite email but the link does nothing | The site hasn't been deployed yet at the URL the invite was sent for. Re-deploy and re-send the invite from the Identity tab. |

If you're stuck, ask me — paste the exact error message and which step it appeared on.

---

## Custom domain (later)

When you're ready to move from `random-name-12345.netlify.app` to `menendezmorro.com`:

1. Netlify → **Domain management → Add a domain**.
2. Follow Netlify's DNS instructions (it walks you through updating your domain registrar).
3. Wait for the DNS to propagate (anywhere from minutes to a day).
4. The site automatically gets a free HTTPS certificate.

This is Phase 15 territory — handle it when you're ready to go live, not now.
