# Setting up Finnance (owner checklist)

This gets your private Finnance site live and lets you sign in on your phone. It takes about 15 minutes. You create the accounts and type your own password; nobody else ever sees it.

You'll need: a GitHub account with access to `ProfessorFess/Finnance`, and this repo on your computer with `pnpm install` done.

## 1. Create the Vercel project

1. Go to [vercel.com](https://vercel.com) and sign up with GitHub.
2. Click **Add New → Project** and import **ProfessorFess/Finnance**.
3. Leave the settings as they are (Vercel reads `vercel.json`), but **don't click Deploy yet**. If it deploys automatically, that's fine; the first build will fail until step 3 and you'll redeploy then.

✅ You see the Finnance project in your Vercel dashboard.

## 2. Add the database (Neon)

1. In the project, open **Storage → Create Database → Neon** (from the Vercel Marketplace) and create it on the free plan.
2. Connect it to **all environments** (Production, Preview, Development).
3. Turn on the option to **create a database branch for each preview deployment**. This gives each preview its own copy of the database, so testing a change never touches your real data.

✅ **Settings → Environment Variables** now lists `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.

## 3. Add the app's settings

In **Settings → Environment Variables**, add:

| Name | Value | Environments |
|---|---|---|
| `BETTER_AUTH_SECRET` | Run `openssl rand -base64 32` in Terminal and paste the result. Make a **different** one for Preview. | Production, and separately Preview |
| `ALLOW_SIGNUP` | `false` | All |
| `BETTER_AUTH_URL` | `https://<your-project>.vercel.app` (your production URL) | Production only |

Previews work out their own URL automatically, so they don't need `BETTER_AUTH_URL`.

✅ Five variables are listed: the two database ones plus these three.

## 4. Deploy

Go to **Deployments**, then click **Redeploy** on the latest one (or push to `main`). When it finishes, open:

`https://<your-project>.vercel.app/api/auth/ok`

✅ It shows `{"ok":true}`.

## 5. Create your login

In Terminal, in the Finnance folder:

```bash
pnpm dlx vercel link
```

```bash
pnpm dlx vercel env pull .env.production.local --environment=production
```

```bash
pnpm create-owner --env-file .env.production.local
```

Type your name, email, and a password of 12+ characters (use your password manager). Then delete the downloaded secrets file:

```bash
rm .env.production.local
```

✅ The script prints `Owner created: <your email>`.

## 6. Sign in on your phone and turn on two-step login

1. Open `https://<your-project>.vercel.app` on your phone and sign in.
2. Go to **More → Settings → Security** and tap **Enable two-factor authentication**.
3. Scan the QR code with your authenticator app (1Password, Google Authenticator, Authy…), enter the code, and **save your backup codes** in your password manager.

✅ Security shows "Two-factor authentication is on".

## 7. Add Finnance to your home screen

- **iPhone:** Safari → Share → **Add to Home Screen**
- **Android:** Chrome menu → **Install app**

✅ Finnance opens full-screen from its own icon.
