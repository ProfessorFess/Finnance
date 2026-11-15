# Finnance — Design

**Date:** 2026-11-15
**Status:** Draft for owner approval

## 1. Intent and the why

Finnance is a personal finance dashboard with an AI assistant built in. It tracks income, expenses, budgets, and short- and long-term goals.

**Why it exists.** The owner kept their money in an Excel spreadsheet and **stopped updating it because it was too much manual work**. Every expense had to be typed in, and the exact income amount had to be entered by hand, every time, in several places. Finnance exists to remove that work. The test for every feature:

> **Does this keep the data accurate with less effort from the user?**

A beautiful dashboard over stale data is a failure. A plain dashboard that stays current with a few minutes a week is a success.

**Modular by design (owner's vision).** People's finances differ. Someone may have several incomes, irregular income, a different way of budgeting, or no interest in some features at all. Finnance must not force one fixed layout or method on everyone. It is built from shared building blocks (income sources, accounts, transactions, budget buckets, goals, dashboard widgets) that each user combines and configures to fit their own situation. The owner's own setup (section 13) is the first configuration, not a hard-coded design.

**Clean-slate start (owner's decision).** The owner is not bringing over past data. Tracking starts fresh **on the date of their next paycheck** and runs forward from there, with a new plan made in the app. Finnance treats this as normal for every user, not as an edge case:
- every user has a **tracking start date**;
- each account has a **starting balance** on that date;
- the app must be useful from day one, with no history to learn from (see 7.5).

**Audience.** The first user is the owner, for personal use. Later it may be opened to other people, so the foundations must allow that without a rewrite: auth, per-user data isolation, provider abstractions, and the modular building blocks. Features built only for other users wait until Phase 5.

## 2. Goals, non-goals, anti-goals

### Goals
- **Low-effort data entry.** Transactions come in by file upload (Phase 1), then by automatic bank sync (Phase 3). Income and bills are entered once and recur automatically.
- **Modular and customizable:**
  - any number of income sources;
  - a choice of budgeting methods, built on one flexible engine;
  - a dashboard made of widgets the user (or the AI) can add, remove, reorder, and configure;
  - feature modules that can be switched on or off.
- **Automatic categorization that learns.** Corrections become rules, so less review is needed over time.
- **Goals that track themselves**, with projected completion dates based on actual behavior.
- **An AI assistant that acts, not just talks.** It answers questions and makes changes (add an expense, adjust a goal or budget, recategorize, create a rule, rearrange the dashboard), always visibly and reversibly.
- **Professional, intuitive UI** that works equally well on a phone and a laptop.

### Success looks like
- Keeping Finnance current takes **under 10 minutes a week**. The monthly import of the owner's 4 account files takes **under 2 minutes**.
- After a month of corrections, **90% or more** of imported transactions are categorized correctly without review.
- The owner opens it on their phone to check "how much is left this week" and goal progress. **It fully replaces the spreadsheet.**
- A user with a different situation can set Finnance up to fit them without code changes. Examples: two jobs, a freelancer, or someone who prefers a monthly category budget.

### Non-goals (for now)
- Moving money, paying bills, or any write access to bank accounts. Finnance is **read-only** toward financial institutions. It may *remind* the user to move money ("Move $400 to savings") and detect when they did, but it never moves money itself.
- Investment advice, trading, or portfolio management. Investment accounts may be tracked as a balance only.
- Multiple currencies (USD only; amounts are stored so this can be added later).
- Taxes and business accounting.
- Native iOS or Android apps (installable PWA instead).
- Shared household accounts (revisit in Phase 5).
- A free-form "build anything" dashboard editor. Modularity means configurable building blocks, not a programming tool.

### Anti-goals: failure even if it technically works
- **It becomes another chore.** For example, a review queue that fills up every week, setup that demands lots of upfront configuration, or customization that's required rather than optional.
- **The AI changes data silently, or in ways the user can't see or undo.**
- **Wrong totals the user can't trust.** For example, transfers between the user's own accounts counted as spending or income, or duplicate imports double-counting.
- **Modularity that makes it confusing.** Endless settings, or a blank canvas where a sensible default should be. Every user starts from a good template and customizes only if they want to.
- **A generic, cluttered "template" look.**
- **Leaking financial data.** For example, cross-user access, secrets in logs, or data sent to services the user didn't agree to.

## 3. Constraints

- **Hosting:** a private website reachable from a phone. Only the owner can sign in at first; signup is closed.
- **Cost:** near-zero fixed cost for personal use. Vercel Hobby and the Neon free tier, plus Anthropic API usage (expected to be a few dollars a month). Vercel Hobby is non-commercial; moving to commercial use means Vercel Pro (about $20 a month).
- **Data leaving the system:** transaction data goes to Anthropic for AI features, and to SimpleFIN once bank sync exists. Nothing else.
- **Owner's banks:** **UFCU** and **Ally**, each with one checking and one savings account. That's 4 accounts, no credit cards, and cash spending is not tracked. Export formats are confirmed with real sample files at the start of Phase 1. SimpleFIN coverage of both banks is checked before Phase 3.
- **Toolchain:** Node 24 and pnpm. The repository is empty, with remote `git@github.com:ProfessorFess/Finnance.git` on branch `main`.
- **Accounts and secrets:** the owner creates the Vercel, Neon, and Anthropic accounts and enters the secrets. The builder never handles the owner's passwords or creates accounts on their behalf. Plans include explicit hand-off checkpoints for this.

## 4. Approaches considered

### 4.1 Application architecture
| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | **One TypeScript app: Next.js + Postgres, hosted on Vercel** | One codebase for UI, server logic, and AI. AI tools call the same domain functions as the UI, so the assistant can do whatever the UI can, with identical validation. Strong UI ecosystem; installable as a PWA. Long-running background jobs need a job service later. |
| B | React frontend + Python (FastAPI) backend | Good for data crunching, but means two codebases, two deployments, and an API contract to maintain. The benefit only shows with heavy analytics this product doesn't need. |
| C | React SPA on Supabase (Postgres, auth, row-level security, edge functions) | Fastest start. But business logic gets split across SQL policies and edge functions, which is harder to test and makes the AI-equals-UI design messier. |

The owner picked **A**.

### 4.2 How budgeting is made modular
| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | **One "bucket" engine; budgeting methods are templates on top** | A bucket is a pot of money with a funding rule, a reset period, and the spending that counts against it. Per-paycheck plans, weekly allowances, monthly category budgets, 50/30/20, and sinking funds are all just different bucket setups. One engine to build and test. New methods are new templates, not new code, and users can mix and match. |
| B | Separate hard-coded budgeting modes | Simpler per mode, but every new method is new code and new screens, and users can't combine methods. The owner's own plan, a per-paycheck split with a weekly allowance inside it, already mixes two methods. |

*(Builder's call; the owner delegated technical choices.)*

### 4.3 How the dashboard is made modular
| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | **Widget registry + saved layout per user** | Each widget type is registered with a settings schema, sizes, and a data loader. A user's dashboard is a saved list of configured widgets. Users can add, remove, reorder, resize, and configure widgets, and the AI does the same through tools. Templates provide good starting layouts. |
| B | Fixed pages with show/hide toggles | Less work, but can't handle "show my car fund big on top" or per-user arrangements, and the AI can only flip switches. |

*(Builder's call.)*

## 5. Architecture

### Stack
These are the builder's calls unless noted.

- **Framework:** Next.js (App Router), TypeScript in strict mode, React Server Components plus Server Actions.
- **Database:** Postgres on Neon, accessed through **Drizzle ORM** with versioned migrations.
- **Auth:** **Better Auth** with email and password plus TOTP two-factor. Signup is disabled by environment flag; the owner's login is created by a CLI script.
- **UI:** Tailwind CSS and shadcn/ui components, Recharts for charts, lucide icons, and dnd-kit for drag-to-reorder widgets. Light and dark themes. Tabular numerals for money.
- **AI:** Anthropic TypeScript SDK.
  - Assistant: `claude-sonnet-5-5`.
  - Bulk categorization and column detection: `claude-haiku-5-5`.
  - Model IDs live in config, not scattered through code.
- **Jobs (Phase 3+):** Vercel Cron for scheduled triggers. Add a durable job runner (e.g. Inngest) only if syncs outgrow serverless time limits.
- **Testing:** Vitest for domain logic, Playwright for key end-to-end flows.
- **Hosting:** Vercel, auto-deploying from `main`, with preview deployments on branches. GitHub Actions runs typecheck, lint, and tests. The default `*.vercel.app` domain is used; a custom domain can come later.

### Layering: the core rule
```
UI (pages, widgets)          AI assistant (tool definitions)
          \                          /
           Server Actions / route handlers
                       |
           Domain services  (pure-ish TS, unit-tested)
           e.g. transactions.create(userId, input)
                       |
           Data access (Drizzle; every query scoped by userId)
                       |
                    Postgres
```
- **All business logic lives in domain services.** Server Actions and AI tools are thin adapters over them.
- When the UI gains a capability, exposing it to the AI means writing a tool definition that calls the same service.
- **Every data-access function takes `userId` and filters by it.** No query reads user data without that scope. A test helper asserts cross-user isolation for each repository.
- Input validation uses **Zod** schemas, shared by forms, Server Actions, AI tool input schemas, and widget settings.
- **Schedules** (biweekly, monthly on the 15th, etc.) and **transaction matching** are one shared module, used by income sources, recurring bills, and bucket periods.

### Money and dates
- Store amounts as **integer cents** (`bigint`). Sign convention: **negative means money out, positive means money in.**
- Transaction dates are calendar dates (no time) in the user's timezone. Store the user's timezone and week-start day in settings.

## 6. Domain model

All tables carry `id`, `userId`, `createdAt`, and `updatedAt` unless noted.

### Core
- **User / Settings:** `trackingStartDate`, timezone, week-start day, currency (USD), AI preferences, monthly AI usage cap, and enabled modules (see 8.3).
- **Account:** name, type (`checking | savings | credit_card | cash | loan | investment | other`), institution, `lastFour`, `startingBalance` (as of the tracking start date), `currentBalance` (nullable; derived from the starting balance plus transactions, overridden by a balance column in imports or by sync), `includeInNetWorth`, archived flag, and `importProfileId`.
- **Category:** name, group (e.g. *Essentials*, *Lifestyle*, *Income*, *Savings*, *Transfers*), icon, color, `kind` (`expense | income | transfer`), and an optional parent.
  - Seeded with a default set, all editable.
  - The **Transfer** kind is excluded from spending and income totals.
- **Transaction:**
  - Core fields: account, date, amount (cents), `rawDescription`, `merchant` (normalized), category, notes, and tags.
  - Origin: `source` (`csv | xlsx | ofx | manual | ai | sync`), `importBatchId`, and `externalId` (from sync).
  - Matching: `dedupeHash`, `status` (`cleared | pending`), `incomeSourceId` or `recurringRuleId` (if matched), and `transferPairId`.
  - Review: `categorizationSource` (`rule | history | ai | user`), `categorizationConfidence`, and a `needsReview` flag.
- **ImportProfile:** a saved mapping for one bank's file layout. It records the header signature, column mapping, date format, amount convention (single signed column, separate debit and credit columns, or inverted sign), rows to skip, and the default account.
- **ImportBatch:** file name, account, row counts (imported, duplicates skipped, errors), status, and timestamp. An entire batch can be undone.
- **CategoryRule:** match type (`merchant_equals | description_contains | regex`), pattern, optional amount range, target category, optional merchant rename, priority, and `createdFrom` (`user | correction | ai`).

### Income and recurring
- **IncomeSource** (any number per user):
  - name and type (`salary | hourly | freelance | benefits | side_income | other`);
  - schedule: weekly, biweekly, semimonthly, monthly, or **irregular**;
  - amount mode: `fixed`, `varies` (with a typical range), or `estimated` (trailing 3-month average of matched deposits);
  - expected amount, deposit account, merchant/description match pattern, anchor date, and active flag.
- **RecurringRule** (bills and subscriptions):
  - name, kind (`bill | subscription | transfer`), expected amount (with a tolerance, or a "varies" flag), and schedule (weekly to yearly);
  - account, category, match pattern, and active flag;
  - an optional `bucketId` (which budget bucket it's paid from).

### Budgeting: the bucket engine
- **BudgetPlan:** name, `template` (`paycheck_plan | monthly_categories | fifty_thirty_twenty | custom`; a label for the UI), `cadence`, and active flag.
  - `cadence` is `per_paycheck` (tied to one or more IncomeSources) or `monthly`.
  - One active plan per user at a time. Others can be kept as drafts.
- **Bucket:**
  - plan, name, icon, color, sort order, and `role` (`spending | bills | savings | goal | buffer`);
  - **funding rule:**
    - `fixed` amount per plan period;
    - `percent` of income;
    - `sum_of_recurring`: the total of linked RecurringRules, prorated to the plan period. This auto-updates, like the spreadsheet's Subscriptions total feeding the budget.
    - `remainder`: whatever is left after all other buckets.
  - **spending period:** how often its limit resets (`weekly | per_paycheck | monthly`), which can differ from funding. For example, funded $400 per paycheck and spent as $200 a week.
  - **tracking:** which spending counts against it (a set of categories, optionally limited to accounts). Buckets with the savings, goal, or buffer role track transfers or contributions instead of spending.
  - **destination:** optional account and/or goal the money is meant to go to;
  - **rollover:** `none`, `carry` (leftover adds to next period), or `sweep` (leftover moves to another bucket).
- **PlanRule:** special-case income rules. For example: "In months with a 3rd paycheck, send 100% of it to bucket X", or "Irregular or bonus income: split 50% Savings / 50% Buffer."
- **AllocationTask** (derived, not stored): when a paycheck arrives, each bucket with a destination account generates a to-do, such as "Move $400 to Ally Savings". It is ticked off automatically when a matching transfer appears.

### Goals
- **Goal:**
  - name, type (`savings | debt_payoff | purchase | retirement`), target amount (optional while the owner decides), optional target date, and `startingAmount` (what's already saved toward it at the start, e.g. an existing emergency fund);
  - horizon, derived: **short-term** if 12 months or less away, **long-term** otherwise;
  - priority, planned contribution (per month or per paycheck), icon, and status (`active | paused | completed | archived`);
  - optional `linkedAccountId` (Phase 3) and optional `fundedByBucketId`.
- **GoalContribution:** goal, date, amount, optional linked transaction, and note.

### Dashboard and modules
- **Dashboard:** name and `isDefault`. Phase 2 has one per user; multiple dashboards come later.
- **DashboardWidget:** dashboard, `type` (a key in the widget registry), `config` (JSON validated by the widget's Zod schema), `size` (`sm | md | lg | full`), and `position`.

### Audit and AI
- **ActivityLog:** every data-changing operation records the actor (`user | ai | system`), action, entity, a before and after snapshot (JSON), the AI conversation or message id if applicable, and `undoneAt`. **This powers undo.**
- **AiConversation / AiMessage:** chat history, including tool calls and proposed changes.
- **AiUsage:** tokens and cost per call, used for the monthly cap.
- **Insight / MonthlyReview (Phase 3+):** generated text and supporting numbers for a period.

## 7. Getting data in

### 7.1 File import (Phase 1)
1. **Upload** one or more files at once (drag-and-drop, or file picker on mobile). Accept **CSV, XLSX, and OFX/QFX**; OFX/QFX are structured and skip mapping. PDF statements are not supported.
   - Each file is matched to its account by saved ImportProfile or OFX account id. Unmatched files ask for an account.
   - For the owner, a monthly import is 4 files (UFCU checking and savings, Ally checking and savings) in one upload.
2. **Column detection.**
   - If the header signature matches a saved ImportProfile, apply it and skip to step 4.
   - Otherwise, use heuristics for date, description, amount (or debit and credit), and balance columns. Fall back to Haiku when the heuristics aren't confident.
3. **Mapping preview.** Show the first rows as Finnance will read them, for the user to confirm or adjust. Save the result as an ImportProfile, so **the next import from this bank needs no setup**.
4. **Start-date filter and dedupe.**
   - Rows dated before the user's tracking start date are skipped and counted ("37 rows before your start date were skipped"). Bank exports often include older rows, so the user never has to trim files.
   - `dedupeHash = hash(accountId, date, amountCents, normalizedDescription, occurrenceIndex)`. The `occurrenceIndex` makes two identical coffees on the same day count as two transactions.
   - Overlapping date ranges must skip existing rows. The duplicate count is reported.
5. **Pipeline:** categorize (7.2) → detect transfers (7.3) → match income and recurring (7.4).
6. **Summary:** for example, "142 imported, 18 duplicates skipped, 6 need a look." Link to the review queue. The batch is undoable.

If the file includes a balance column, update the account's `currentBalance` from its latest row.

**Manual entry** (for anything not in a bank file): quick-add with three fields and smart defaults. The assistant also handles free text like "spent $40 at Costco".

### 7.2 Categorization pipeline
For each new transaction, in order:
1. **User rules**, by priority.
2. **History match:** the most recent user-confirmed category for the same normalized merchant.
3. **AI:** remaining transactions go to Haiku in batches, with the category list and a few examples of the user's past choices. It returns a category and a confidence.
4. Below a confidence threshold, set `needsReview`.

**Merchant normalization:** strip processor noise such as `SQ *`, `TST*`, store numbers, and city/state suffixes, then title-case.

**Learning from corrections:** when the user recategorizes, offer "Always categorize *Merchant* as *Category*?". A second correction of the same merchant creates the rule automatically, and the app says so.

**Review queue:** one card at a time on mobile, swipeable, with quick-pick categories. It must stay short.

### 7.3 Transfer detection
- Pair a money-out transaction in one account with an opposite money-in transaction of equal amount in another of the user's accounts within 5 days. This covers transfers between UFCU and Ally, which are the owner's main case.
- Mark both sides as **Transfer** and link them.
- **Unpaired card payments** (for users with credit cards):
  - If the user has that card in Finnance, the payment is treated as a transfer.
  - Otherwise it counts as spending, in a "Credit card (untracked)" category, and the UI suggests importing the card.
- **ATM withdrawals:** a transfer if the user has a Cash account, otherwise spending ("Cash").
- **Unpaired transfers to accounts not in Finnance** (e.g. a Roth IRA at a brokerage) are categorized as **Savings/Investing outflows**. They are not spending, and they count toward the matching savings bucket or goal.

*(Builder's call, so totals are never quietly undercounted or inflated.)*

### 7.4 Income and recurring: "enter once"
- **Income sources** and **recurring bills** generate **expected occurrences** from their schedules on the fly. They are not stored as transactions.
- An imported or synced transaction that matches (pattern, amount within tolerance, date within ±3 days) is linked to the occurrence. **The expected item is then fulfilled, never double-counted.**
- **Irregular income** has no expected dates. Its typical monthly amount (trailing average) is used for planning, and each deposit is matched by pattern.
- Expected items that haven't arrived appear in "Upcoming", feed plans and projections, and are flagged when late.
- **Detection:** scan history for the same merchant at a regular interval with a similar amount, and suggest tracking it (e.g. "Looks like Netflix, $20 monthly. Track it?"). A light version ships in Phase 1, the full version in Phase 3.
- **Price changes** are noticed when a matched amount differs from the expected amount. They are surfaced as insights in Phase 4.

### 7.5 Starting with no history
With a clean-slate start, features that normally learn from history start cold. Each needs a sensible fallback:
- **Categorization:** no history to match against at first, so the first couple of imports lean on default rules and AI, and the review queue is larger at the start.
  - Ship a good set of default merchant rules for common merchants (streaming services, gas stations, coffee chains, rideshare).
  - Recurring bills and subscriptions entered during setup create matching rules too.
  - The queue should shrink noticeably by the third import.
- **Recurring items and income:** pattern detection needs months of data, so **setup asks for these directly**: income sources, bills, and subscriptions are entered (or told to the assistant) up front. Detection later only suggests what was missed.
- **Irregular income:** use the user's own estimate until 3 months of deposits exist.
- **Goal projections:** use the planned contribution until 3 months of actual contributions exist, and say so ("based on your plan").
- **Comparisons** ("vs. last month", "vs. 3-month average"): hidden until enough data exists. Show "Your first month" framing instead of empty or misleading comparisons.
- **Balances:** come from the starting balance plus transactions, so goals and accounts are correct from day one.

## 8. Modularity

### 8.1 Budget plans (bucket engine)
**How a period is computed**
- Each bucket's **funded** amount comes from its funding rule.
- **Spent or moved** is the sum of tracked transactions, transfers, or contributions in the current spending period.
- **Remaining** is funded minus spent.
- Rollover applies at period end.

**Plan health check:** total allocations versus expected income, shown as "Fully allocated", "$X unassigned", or "Over by $X". This is the spreadsheet's "Check" cell.

**Templates shipped in Phase 2a/2b** (each creates a plan with sensible buckets the user can edit):
- **Paycheck plan:** a per-paycheck split into fixed or percent buckets, plus a remainder bucket and an extra-paycheck rule. This is the owner's method.
- **Monthly category budget:** one fixed bucket per chosen category, reset monthly.
- **50/30/20:** three percent-of-income buckets mapped to category groups (Needs, Wants, Savings).

Later templates, such as zero-based envelopes and debt snowball, are data, not code.

**Weekly allowance** is simply a spending bucket with a weekly spending period. The weekly tracker in the owner's spreadsheet becomes automatic: discretionary transactions count against it, and nothing is entered by hand.

**Multiple incomes:** a per-paycheck plan can be tied to several income sources, and each paycheck funds buckets by the plan's rules. A monthly plan uses total expected monthly income.

**Paycheck flow** (owner's main loop):
1. A paycheck is detected.
2. The plan shows a "Paycheck arrived: $1,200" card with its allocation tasks (move $400 to savings, and so on).
3. Tasks tick off automatically as matching transfers appear.
4. Bucket balances reset or fund for the new period.

### 8.2 Modular dashboard
- **Widget registry.** Each widget type defines:
  - a key, a title, and a settings schema (Zod) with defaults;
  - allowed sizes;
  - a server data loader and a component;
  - an optional required module.
- **Layout.**
  - Desktop: a 12-column grid. Sizes map to column spans.
  - Mobile: a single column in the same order.
  - In edit mode, users add widgets from a catalog, drag to reorder, resize, configure (e.g. "which goal?", "which bucket?"), and remove.
- **Starting layouts** come from the user's plan template, so nobody starts from a blank canvas.
- **Phase 2 widget catalog:**
  - Needs attention;
  - Bucket status (one bucket, e.g. "Weekly spending: $72 left · resets Monday");
  - Plan overview (all buckets);
  - Paycheck tasks;
  - Income: received vs. expected (per source or total);
  - Spending by category;
  - Goal progress (one goal, or top N);
  - Upcoming bills and income;
  - Subscriptions total;
  - Recent transactions;
  - Quick add.
- **Later widgets:** insight card, monthly review, net worth, cash-flow forecast, and trend charts.

### 8.3 Feature modules
- These can be switched on or off in Settings: **Budget plan**, **Goals**, **Subscriptions & bills**, **Net worth** (Phase 4), **Debt payoff** (Phase 4), and **Reports** (Phase 4).
- Navigation and the widget catalog show only enabled modules.
- Core features (transactions, accounts, income, import, assistant) are always on.

## 9. Goals
- **Progress:**
  - Phase 2: sum of GoalContributions. These come from manual entry, from the assistant, from linking a transfer, or automatically from a savings bucket that funds the goal (each matched transfer to that bucket's destination is credited to the goal).
  - Phase 3: optionally link an account, so progress equals its balance (or its change since the goal started).
- **Projection:**
  - based on the actual average contribution over the last 3 months, falling back to the planned contribution;
  - shows the projected completion date, ahead or behind the target date, and the amount needed per month or per paycheck to hit the target date;
  - goals with no target amount yet show progress only, with a prompt to set a target.
- **Goal cards:** progress bar, projection, and a status chip (On track / Behind / Ahead / Done).
- **Priority order** supports the owner's "emergency fund first, then Roth IRA". When a goal completes, its funding bucket's destination can roll to the next goal (with a prompt).

## 10. Pages and navigation
- **Desktop:** left sidebar with Home, Transactions, Plan, Goals, Recurring, Accounts, Reports (Phase 4), and Import, with Settings at the bottom.
  - Items for disabled modules are hidden.
  - The assistant is a slide-over panel on every page, opened with ⌘K / Ctrl+K.
- **Mobile:** bottom tab bar with Home, Transactions, a raised center **Assistant** button, Plan, and More. The assistant opens as a full-height sheet, and import works from the phone's file picker.
- **Home:** the modular dashboard (8.2) with an **Edit** button.
- **Transactions:**
  - search, plus filters for date range, account, category, bucket, amount, and needs-review;
  - inline category edit, multi-select bulk edit, and split view on desktop;
  - each transaction's detail shows its history from ActivityLog.
- **Plan:**
  - bucket cards (funded, spent, remaining, period);
  - plan health check and the current paycheck's tasks;
  - an edit mode for buckets, funding rules, and plan rules, plus template switching (shown as a preview before switching).
- **Recurring:** income sources and bills/subscriptions, each with its next expected date and last match.
- **Accounts:** balances and last import or sync time.
- **Settings:**
  - profile, 2FA, week-start day, modules, categories, rules, import profiles;
  - AI preferences, usage, and AI activity (everything the AI changed, with undo);
  - data export (CSV/JSON) and "delete all data".

## 11. The AI assistant

### Tools (Phase 2b)
- **Read tools** run without confirmation:
  - `search_transactions` (filters; aggregate by category, merchant, month, or bucket);
  - `get_spending_summary`, `get_plan_status`, `get_goals`;
  - `get_income_sources`, `get_recurring`, `get_accounts`, `get_dashboard`.
- **Write tools** return a **proposed change**, not applied until approved:
  - Transactions: `add_transaction`, `update_transaction`, `recategorize_transactions` (bulk, by filter), `create_category_rule`.
  - Goals: `create_goal`, `update_goal`, `add_goal_contribution`.
  - Income and bills: `create_income_source`, `update_income_source`, `create_recurring_rule`, `update_recurring_rule`.
  - Plan: `create_bucket`, `update_bucket`, `delete_bucket`, `update_plan_rule`.
  - Dashboard: `add_widget`, `update_widget`, `remove_widget`, `move_widget`.

  The plan tools handle requests like "drop weekly spending to $175 and put the difference toward my goal fund". The dashboard tools handle requests like "put my emergency fund at the top".

### How it works
- A route handler runs the Claude tool-use loop and streams responses to the UI.
- The system prompt holds today's date, timezone, category list, accounts, income sources, the plan summary, and a short snapshot. Detail is fetched through tools; the full history is never stuffed into context.
- When Claude calls a write tool, the server validates the input with the shared Zod schema and runs a **dry run** in the domain service, producing a human-readable diff.
- The UI shows a **change card** with Approve / Edit / Dismiss. Example: "Weekly spending bucket: $200 → $175/week. Goal fund bucket: $219 → $269/paycheck."
- **Approve** applies the change through the domain service and records it in ActivityLog (actor `ai`). Applied changes show **Undo**. A bulk change is one card and one undo.
- **Phase 3 option:** auto-apply low-risk changes, such as adding a single manual transaction or a widget layout tweak. It is off by default.

### Guardrails
- No personalized investment advice and no moving money; it says so plainly if asked. It can explain the user's own plan and numbers.
- It only touches the signed-in user's data, through `userId`-scoped tools.
- A monthly usage cap (default $10, configurable). When the cap is hit, the assistant explains, and the rest of the app works normally.
- Transaction descriptions are untrusted text. Tool results are treated as data, and writes always need approval, so text injected into a merchant name can't silently change anything.

### Later AI features
- **Monthly check-in (Phase 3):** generated on the 1st by a cron job and shown on Home and a Reviews page. It covers where the money went, changes vs. normal, plan adherence, goal progress, and one or two suggestions.
- **Insights and anomalies (Phase 4):** unusual charges, subscription price increases, categories trending up, and late income.
- **Receipt capture (Phase 4):** take a photo, and Claude vision proposes a transaction.
- **Setup by conversation (Phase 2b).** Because the assistant's write tools already cover income sources, bills, buckets, goals, and widgets, a user can set up by chatting. For example: "I get $1,200 every other Friday, I want $400 to savings and $200 a week for fun." The assistant proposes everything as change cards. This needs no extra tools, only a setup-oriented prompt.
- **Spreadsheet upload during onboarding (Phase 5):** a new user uploads their old budget spreadsheet, and the assistant reads it and proposes a configuration.

## 12. Bank sync (Phase 3)
- A provider interface, `TransactionSource`, with `listAccounts()` and `fetchTransactions(since)`.
  - Implement **SimpleFIN Bridge** first (about $15 a year, read-only). Confirm it supports UFCU and Ally before starting.
  - **Plaid** comes in Phase 5 for public users.
- The SimpleFIN setup token is pasted in Settings. The resulting access URL is stored **encrypted at the application level** (AES-GCM, key in an environment variable).
- **Sync** runs on Vercel Cron (e.g. every 6 hours), with a manual "Sync now".
  - Map provider accounts to Finnance accounts.
  - Upsert by `externalId`.
  - Run the same pipeline as imports.
  - Update balances.
- **No double-up with CSV history.** Dedupe by `dedupeHash` plus a fuzzy date/amount/description match. Initial sync fetches only from the last imported date onward.

## 13. The owner's starting point

### Clean slate
The owner starts tracking **from the date of their next paycheck**, with no past data imported and a **new plan made in the app**. There is no seed script.

The start date doesn't depend on when the app is ready. Banks keep recent history, so once Phase 2a ships the owner sets the start date to that paycheck and imports from there. The start-date filter (7.1) skips anything older.

### First-run setup (Phase 2a)
A short guided flow, every step skippable and editable later. From Phase 2b it can also be done by chatting with the assistant (11):
1. **Tracking start date:** defaults to the most recent paycheck.
2. **Accounts and their starting balances.** For the owner: UFCU Checking, UFCU Savings, Ally Checking, Ally Savings.
3. **Income sources.** For the owner: one biweekly paycheck. The amount is taken from the first matched deposit if the user isn't sure.
4. **Pick a plan template** and adjust its buckets.
5. **Bills and subscriptions.** Quick entry from a list of common services with typical prices, or tell the assistant.
6. **Goals**, with what's already saved toward each.
7. **Dashboard** starts from the template's layout.

### `budget.xlsx`: reference, not data
The owner's old spreadsheet is a per-paycheck budget plan with three sheets:
- **Budget:** inputs, monthly bills, and the paycheck split.
- **Subscriptions:** a list of 10 services.
- **Weekly Tracker:** weekly allowance vs. spent, never really filled in.

It is **not imported**. It shapes the product in three ways:
- **It defines the Paycheck plan template.** The template must express everything the sheet did:
  - a per-paycheck split into fixed buckets plus a remainder ("goal fund / buffer");
  - a bills bucket funded by the sum of recurring bills;
  - a spending bucket with a weekly limit inside a biweekly paycheck;
  - "send the 3rd paycheck of the month to savings";
  - the "fully allocated / over budget" check.
- **It is the test fixture.** An automated test builds that plan through the domain services ($1,200 biweekly; $400 savings; bills = phone $100 + subscriptions $142 + haircuts $30 + gas $90, split per paycheck; $200/week spending; remainder $219; 3rd-paycheck rule). It asserts the numbers match the spreadsheet's.
- **It informs the default dashboard** for the Paycheck plan template:
  1. Weekly spending left (large);
  2. Paycheck tasks;
  3. Plan overview;
  4. Goals;
  5. Upcoming bills and income;
  6. Spending by category;
  7. Needs attention;
  8. Recent transactions.

### Context for the assistant
Rent, insurance, and groceries are covered by family. The owner can note this in their AI preferences, so the assistant doesn't flag them as missing. The **"notes for the assistant"** field in Settings is a general feature: free text included in the assistant's context.

## 14. Security and privacy
- HTTPS only (Vercel). Secure, HTTP-only session cookies via Better Auth. 2FA (TOTP) is available from Phase 0.
- Signup is closed until Phase 5. Login attempts are rate-limited.
- Per-user scoping is enforced in the data-access layer and covered by tests.
- Neon encrypts the database at rest. Bank access tokens are additionally encrypted at the application level.
- Secrets live only in environment variables (Vercel and a gitignored `.env.local`). Transaction contents and secrets are never logged in production.
- Data export and "delete all my data" (which requires typing a confirmation).
- Settings states plainly what is shared with Anthropic and, later, SimpleFIN.

## 15. Design direction
- **Feel:** calm, confident, trustworthy. Closer to a well-made banking or analytics product than a playful consumer app.
- **Hierarchy:** the number that matters is the biggest thing on screen ("$72 left this week").
- **Spacing:** generous on mobile, denser on desktop.
- **Color:** a restrained palette with one accent color. Green for money in, neutral for money out, and red reserved for problems. Light and dark themes.
- **Money formatting:** `$1,234.56`, tabular numerals, numbers right-aligned in tables.
- **Empty states** always point to the next action.
- **Edit mode** for the dashboard and plan should feel light, like rearranging phone home-screen icons, not like a settings form.
- **Mobile-first:** import, review, ask the assistant, check buckets, and check goals all work with one thumb.
- **Installable PWA** with an app icon and splash screen. Full offline support is out of scope.

## 16. Phased roadmap

Each phase gets its own implementation plan and may be split further when planned.

**Phase 0: Foundation**
- Next.js + TypeScript, Tailwind and shadcn/ui, Drizzle + Neon with migrations.
- Better Auth with closed signup, a script that creates the owner's login, and 2FA.
- Responsive app shell (sidebar and bottom tabs), theme, and design tokens.
- CI and Vercel deployment.
- Setup checklist and hand-off checkpoints for the owner (accounts and secrets).
- **Done when:** the owner signs in on their phone at the deployed URL and sees the empty app shell.

**Phase 1: Data in**
- Tracking start date; accounts with starting balances; categories with default merchant rules for a cold start.
- Multi-file CSV/XLSX/OFX import with mapping, saved profiles, start-date filter, dedupe, batch undo, and balances. Verified against real UFCU and Ally exports.
- Merchant normalization, categorization pipeline, and review queue with learn-from-corrections.
- Transfer detection.
- Transactions page with search, filters, inline and bulk edit, and quick-add.
- Income sources (multiple, including irregular) and recurring bills/subscriptions, with matching and light detection.
- Shared schedule/matching module.
- **Done when:** the owner uploads all 4 accounts' exports in under 2 minutes. Only transactions since the start date come in, totals are correct (UFCU↔Ally transfers excluded), the paycheck is matched to its income source, and balances match the banks.

**Phase 2a: Start using it** *(the owner's clean-slate start; replaces the spreadsheet)*
- Bucket engine, the Paycheck plan template (others in 2b), plan rules, paycheck tasks, and the Plan page.
- The `budget.xlsx` plan as an automated test fixture.
- Goals with starting amounts, contributions, bucket funding, projections, and priority roll-over.
- Cold-start fallbacks (7.5).
- First-run setup flow (13).
- Widget registry with the Paycheck plan's default Home layout. Fixed for now; editing comes in 2b.
- **Done when:** the owner completes setup with their start date and new plan, imports since that paycheck, and Home shows weekly spending left, paycheck tasks, plan, and goals, with no manual entry. At this point the owner starts living in Finnance.

**Phase 2b: Make it yours**
- Dashboard edit mode (add, remove, reorder, resize, configure), the full Phase 2 widget catalog, and feature modules.
- Monthly category and 50/30/20 templates.
- Assistant v1:
  - read tools, plus write tools with change cards (including plan, setup, and dashboard tools);
  - ActivityLog with undo and the AI activity view;
  - "notes for the assistant", setup by conversation, and the usage cap.
- **Done when:** the owner can rearrange Home and change the plan by tapping or by asking the assistant, and undo anything the AI did.

*(Builder's call: Phase 2 is split so the owner can start using Finnance as soon as the plan works, rather than waiting for the assistant and dashboard editing.)*

**Phase 3: Hands-off**
- SimpleFIN bank sync with scheduled syncs and balances.
- Goals linked to account balances.
- Full recurring detection.
- Monthly check-in.
- Optional auto-apply for low-risk AI changes.
- Multiple dashboards.

**Phase 4: Insights and depth**
- Reports: trends, income vs. spending, category and merchant drill-downs.
- Anomaly and price-change alerts.
- Net worth and debt payoff modules.
- Cash-flow forecast.
- Split transactions.
- Receipt capture.
- Notifications (PWA push and/or email).

**Phase 5: Open to others**
- Open signup, polished onboarding, and spreadsheet upload during onboarding.
- Plaid provider.
- Per-user AI limits and possibly billing.
- Privacy policy and terms.
- Security review.
- Account deletion.
- Shared households (to be decided).

## 17. Left to the builder
- Exact default category list, icons, and colors. It must include the categories the owner's weekly-spending bucket tracks (coffee, restaurants, bars, shopping).
- Visual design details (typography, accent color, chart styling) within section 15. Use the frontend-design skill.
- Exact heuristics and thresholds: column detection, merchant normalization, AI confidence cutoff, transfer window, recurring tolerance.
- Folder structure, naming, and component breakdown.
- Prompt wording for the assistant, categorization, and monthly review.
- Grid and drag-and-drop implementation details for widgets.
- Whether a durable job runner is needed in Phase 3.
