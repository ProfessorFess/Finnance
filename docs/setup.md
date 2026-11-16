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

## 11. Turn on AI sorting

Finnance sorts most transactions with rules and your past choices. For new merchants it asks Claude Haiku, which needs an Anthropic API key. Without a key everything still works; those transactions simply wait in **Review**.

1. Go to [console.anthropic.com](https://console.anthropic.com), sign in or create an account, then open **API Keys → Create Key** and name it `Finnance`. Copy the key.
2. In the Console's **Billing**, set a monthly spend limit (for example $5). Finnance also caps itself at $10 a month; normal use is a few cents.
3. In Vercel, open **Settings → Environment Variables** and add `ANTHROPIC_API_KEY` with your key (Production; marking it Sensitive is fine). If you run Finnance locally, add the same line to `.env.local`.
4. Redeploy (Deployments → Redeploy).
5. Open **Transactions → Review** and choose **Sort now** once. That sorts everything you imported before this update.

✅ Most transactions show a category, moves between your UFCU and Ally accounts show **Transfer**, and **Review** holds only the ones Finnance wasn't sure about.

What gets sent to Anthropic: for each new merchant, its cleaned name, the bank's description, the amount, and the bank's own category, plus a few of your past choices as examples. Nothing else.


## 12. Add your paycheck and bills

Enter each paycheck, bill, and subscription once. Finnance then expects it, links it when it shows up in an import, and tells you if it's late.

1. In **Transactions**, open your most recent paycheck deposit and tap **Track as recurring**. Choose **Every 2 weeks**, leave **Amount is: Varies**, and save. From now on each paycheck is linked automatically.
2. Do the same for each bill or subscription you see, or open **Recurring → Add**. Finnance also suggests repeating charges it notices ("Looks like Netflix, $15.49 monthly. Track it?"); tap **Track** or **Dismiss**.
3. After each import, the summary says how many items matched. **Recurring** shows anything **Late** (it was expected, your imported data covers that date, and it never arrived) or **Waiting for import** (it's due, but you haven't imported that far yet).

✅ Your latest paycheck shows under **Recurring → Income** with its date, and the next payday is two weeks later.

If a match is wrong, open the transaction and tap **Not this one**. If a payment was missed because it came unusually late, link it by hand with **Part of…**. Finnance never changes either choice afterward.

## 13. Make your plan

A plan splits the money you receive into buckets and shows what's left in each, from your imports alone.

1. Make sure your paycheck is in **Recurring** (step 12). Income that isn't in a bank file can be added with **Log income**.
2. Open **Plan** and choose **Paycheck plan** (or **Start from scratch**: split each income as it arrives, or budget each month).
3. Set what each bucket gets from each paycheck, and any limits (like $200 per week; typing a limit suggests what the bucket should get). Pick where money moves to. Add, rename, or remove buckets freely; everything can change later in **Edit plan**.
4. Bills come from **Recurring**: each is paid from its **Paid from** bucket (your **Bills** bucket by default), shared across the paychecks in a month. Whatever's left goes to **Goal fund / buffer**.
5. When a paycheck arrives, **Plan** shows it with your moves ("Move $400 to Ally Savings"). Each one ticks off by itself once the transfer shows up.

✅ **Weekly spending** shows what's left this week, and the check reads **Fully allocated**.

## 14. Add your goals

Goals track themselves from the money you actually move.

1. Open **Goals → Add goal**.
2. For your emergency fund: enter the target (or leave it blank for now), what's **already saved** and **as of** which date, and choose **Funded by: Savings & investing**. That makes it count **moves into Ally Savings** automatically.
3. Add your Roth IRA next, with **Counts automatically: Spending in Investing** (or use **Add money** whenever you contribute).
4. Goals are in priority order; use the arrows to change it. When a goal is reached, its card asks you to **Mark done**, and what you move next counts toward the following goal.
5. Any transaction can count toward a goal: open it in **Transactions** and choose **Counts toward**.

✅ Each goal shows its progress and when you'll get there, "your plan" until 3 months of real contributions exist, then "your recent pace".

## 15. Your Home

Home is built from your plan, and keeps itself up to date from your imports.

1. Open **Home**. In order, it shows:
   - what's left in **Weekly spending** this week;
   - your latest paycheck's moves;
   - your plan;
   - your goals;
   - what's coming up in the next two weeks;
   - where your money went this month;
   - anything that needs a look;
   - your recent transactions.
2. If **Finish setting up** appears, it links to the next step. Each step can be skipped, and **Setup** stays in the menu until every step is done or skipped.
3. After each import, Home updates by itself, with no typing.

✅ Home shows **Weekly spending** left this week, your paycheck's moves, your plan, and your goals, all from your imports. That's Phase 2a's goal: Finnance replaces the spreadsheet.
