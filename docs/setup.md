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
3. Turn on the option to **create a database branch for each preview deployment**. Each preview then gets its own copy of the database, so trying out a change can't modify your real data. The copy still *contains* your data, though, which is why step 4 keeps previews private.

✅ **Settings → Environment Variables** now lists `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.

## 3. Add the app's settings

In **Settings → Environment Variables**, add:

| Name | Value | Environments |
|---|---|---|
| `BETTER_AUTH_SECRET` | Run `openssl rand -base64 32` in Terminal and paste the result. Make a **different** one for Preview. | Production, and separately Preview |
| `ALLOW_SIGNUP` | `false` | All |

You don't need `BETTER_AUTH_URL` on Vercel: Finnance uses your production address automatically. Only add it (Production only) if you later connect a custom domain, set to that domain, e.g. `https://money.example.com`.

✅ Four variables are listed: the two database ones plus these two.

## 4. Keep previews private

Go to **Settings → Deployment Protection** and make sure **Vercel Authentication** is on for **preview deployments** (it's on by default for new projects). This way only you, signed in to Vercel, can open a preview.

✅ Vercel Authentication shows as enabled for previews.

## 5. Deploy

Go to **Deployments**, then click **Redeploy** on the latest one (or push to `main`). When it finishes, open:

`https://<your-project>.vercel.app/api/auth/ok`

✅ It shows `{"ok":true}`.

## 6. Create your login

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

Type your name, email, and a password of 12+ characters (use your password manager). The script only uses the database address from that file. Vercel's warning that "Sensitive" values were written as `[SENSITIVE]` placeholders is expected and harmless here.

Then delete the downloaded file, since it holds your database password:

```bash
rm .env.production.local
```

✅ The script prints `Owner created: <your email>`.

## 7. Sign in on your phone and turn on two-step login

1. Open `https://<your-project>.vercel.app` on your phone and sign in.
2. Go to **More → Settings → Security** and tap **Enable two-factor authentication**.
3. Scan the QR code with your authenticator app (1Password, Google Authenticator, Authy…), enter the code, and **save your backup codes** in your password manager.

✅ Security shows "Two-factor authentication is on".

## 8. Add Finnance to your home screen

- **iPhone:** Safari → Share → **Add to Home Screen**
- **Android:** Chrome menu → **Install app**

✅ Finnance opens full-screen from its own icon.

## 9. Later: let previews update their database

Preview deployments skip database migrations until you confirm each one really gets its own database branch. This prevents a half-finished change from ever altering your real database.

After your first preview deployment (from a pull request), open the Neon console from **Storage** and check there's a branch named after the preview (e.g. `preview/…`). If there is, add `MIGRATE_PREVIEWS` = `true` for the **Preview** environment only.

✅ The next preview build log shows `[vercel-build] migrations: yes`.

## 10. Your first import

Do this once you're ready to start tracking, ideally right after the payday you're starting from.

1. **Accounts → When does tracking start?** Pick that payday and choose **Save start date**.
2. **Add account** four times: **UFCU Checking**, **UFCU Savings**, **Ally Spending** (type: Checking), and **Ally Savings**. Set each one's bank (UFCU or Ally) and its balance **at the start of that day**, which is the bank's balance at the end of the day before.
3. **Download a CSV from each account** on the bank's website, covering at least your start date through today. Longer is fine, since Finnance skips anything earlier.
4. **Import → Choose files**, and pick all four at once. Each file shows its bank format and the account it'll go into; check those, then choose **Import 4 files**.
5. **Accounts:** compare each balance with your bank app. They should match, apart from any pending transactions (Finnance brings those in once they post).

✅ Four balances match your banks, and **Transactions** shows everything since your start date.

From then on: download new CSVs whenever you like (weekly or monthly) and drop them all into **Import**. Overlapping dates are fine, since anything already imported is skipped.
