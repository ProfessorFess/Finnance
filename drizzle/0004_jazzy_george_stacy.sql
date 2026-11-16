CREATE TABLE "income_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"frequency" text NOT NULL,
	"anchor_date" date,
	"second_day" integer,
	"amount_mode" text NOT NULL,
	"expected_cents" bigint,
	"min_cents" bigint,
	"max_cents" bigint,
	"account_id" text,
	"category_id" text,
	"match_pattern" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_dismissals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"merchant_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"frequency" text NOT NULL,
	"anchor_date" date NOT NULL,
	"second_day" integer,
	"expected_cents" bigint NOT NULL,
	"amount_varies" boolean DEFAULT false NOT NULL,
	"tolerance_cents" integer,
	"account_id" text,
	"category_id" text,
	"match_pattern" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "income_source_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "recurring_rule_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "expected_date" date;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "match_source" text;--> statement-breakpoint
ALTER TABLE "income_sources" ADD CONSTRAINT "income_sources_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_sources" ADD CONSTRAINT "income_sources_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_sources" ADD CONSTRAINT "income_sources_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_dismissals" ADD CONSTRAINT "recurring_dismissals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "income_sources_user_idx" ON "income_sources" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_dismissals_user_key_idx" ON "recurring_dismissals" USING btree ("user_id","merchant_key");--> statement-breakpoint
CREATE INDEX "recurring_rules_user_idx" ON "recurring_rules" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_income_source_id_income_sources_id_fk" FOREIGN KEY ("income_source_id") REFERENCES "public"."income_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_rule_id_recurring_rules_id_fk" FOREIGN KEY ("recurring_rule_id") REFERENCES "public"."recurring_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_income_occurrence_idx" ON "transactions" USING btree ("income_source_id","expected_date");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_recurring_occurrence_idx" ON "transactions" USING btree ("recurring_rule_id","expected_date");