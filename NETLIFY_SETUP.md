# Netlify + Decap CMS setup guide

A one-time setup to make `/admin/` work. After this, you'll be able to edit text, swap images, add projects, and reorder things from a browser instead of touching code.

You'll do this in the **Netlify dashboard** (the web app at `app.netlify.com`), not in code. About 10 minutes.

---

## Before you start

You need:

1. **A GitHub account** — free. Sign up at [github.com/signup](https://github.com/signup) if you don't have one.
2. **A Netlify account** — free. Sign up at [app.netlify.com](https://app.netlify.com) (use "Sign up with GitHub" to make later steps easier).
3. **The Terminal app** on your Mac — you'll paste a couple of commands. Already installed; open Spotlight (⌘ Space), type "Terminal," press Enter.

---

## Step 1 — Put the code on GitHub

The site lives in a folder on your computer right now. GitHub is where it'll live online so Netlify can read it and the CMS can save edits back to it.

### 1a. Create an empty repository on GitHub

1. Sign in at [github.com](https://github.com).
2. Click the **+** icon (top-right) → **New repository**.
3. Fill in the form:
   - **Repository name:** `menendezmorro-portfolio` (or anything you like — used internally only).
   - **Description:** optional, e.g. "Portfolio site for menendezmorro.com".
   - **Visibility:** select **Private**. The spec calls for a private repo because Decap CMS access piggybacks on who has collaborator access here.
   - **Important — do NOT tick** "Add a README file," "Add .gitignore," or "Choose a license." The repo on GitHub needs to start empty, because you already have all the files on your computer.
4. Click **Create repository**.

You'll land on a setup page with several command examples. Keep this tab open — you'll copy a URL from it in the next sub-step.

### 1b. Push your local code up to that repository

1. Open the **Terminal** app.
2. Move into the project folder. If the folder is on your Desktop, run:
   ```bash
   cd ~/Desktop/menendezmorro-portfolio
   ```
   (Replace the path if you keep it somewhere else. Or: type `cd ` with a trailing space, then drag the folder from Finder into the Terminal window, then press Enter — that auto-fills the path.)
3. Back on GitHub's setup page, find the section titled **"…or push an existing repository from the command line."** Copy the first command shown there — it looks like:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   ```
   Use the **HTTPS URL** (the one starting with `https://`), not the SSH one (`git@…`) — HTTPS is easier for a first setup.
4. Paste that command into Terminal and press Enter. No output means success.
5. Run:
   ```bash
   git push -u origin main
   ```
6. **Sign-in prompt.** The first push needs your GitHub credentials:
   - On most modern Macs a browser window opens, you sign in to GitHub, click **Authorize**, and you're done.
   - If instead Terminal asks for a *username and password* on the command line: the "password" isn't your real password. Open [github.com/settings/tokens](https://github.com/settings/tokens?type=beta) → **Generate new token (fine-grained)** → give it `Contents: Read and write` access on this one repository → copy the long string it shows once → paste it into Terminal as the password.
7. When the push finishes, refresh your GitHub repo page in the browser. You should see all the project files (`BUILD_SPEC.md`, `src/`, `public/`, etc.).

You only do this once. Future commits get pushed with a plain `git push` and no auth prompt.

---

## Step 2 — Connect the site to Netlify

If you've already connected the repo to Netlify and the site builds, **skip to Step 3**.

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

## Step 3 — Enable Netlify Identity

Identity is Netlify's user-login service. The CMS needs it to know *you're allowed to edit*.

1. In your Netlify site (click into it from the dashboard), go to **Site configuration → Identity** (left sidebar).
2. Click **Enable Identity**.

You should now see an Identity settings page.

---

## Step 4 — Lock it down to you only

By default, anyone on the internet could sign up. We don't want that.

1. Still on the Identity page, find **Registration preferences**.
2. Click **Edit settings**.
3. Change from **Open** to **Invite only**.
4. Save.

Now only people you explicitly invite can log in.

---

## Step 5 — Add GitHub as the login method

So you can sign in with your GitHub account instead of creating yet another password.

1. On the Identity page, scroll to **External providers**.
2. Click **Add provider → GitHub**.
3. Leave the **Use default configuration** option ticked.
4. Click **Enable**.

GitHub now appears as a sign-in option on your `/admin/` page.

---

## Step 6 — Enable Git Gateway

Git Gateway is what lets the CMS save your edits as commits on the repo without you having to grant the CMS direct GitHub access.

1. On the Identity page, scroll to **Services → Git Gateway**.
2. Click **Enable Git Gateway**.
3. If it asks for permissions, click **Authorize**. Use your GitHub account.

Done.

---

## Step 7 — Invite yourself

1. Still on the Identity page, find the **Identity** tab at the top of the page (the user list — not Site configuration → Identity).
2. Click **Invite users**.
3. Enter your email.
4. Send.

Check that email. You'll get a "You've been invited" message with a confirmation link.

---

## Step 8 — Accept the invite and log in

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
