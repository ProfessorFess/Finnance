CREATE TABLE "buckets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"name" text NOT NULL,
	"icon" text NOT NULL,
	"color" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"role" text NOT NULL,
	"funding_type" text NOT NULL,
	"funding_cents" bigint,
	"funding_bps" integer,
	"limit_cents" bigint,
	"limit_period" text,
	"track_category_ids" text[] DEFAULT '{}' NOT NULL,
	"destination_account_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"template" text NOT NULL,
	"cadence" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_income_sources" (
	"plan_id" text NOT NULL,
	"income_source_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plan_income_sources_plan_id_income_source_id_pk" PRIMARY KEY("plan_id","income_source_id")
);
--> statement-breakpoint
CREATE TABLE "plan_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"type" text NOT NULL,
	"bucket_id" text NOT NULL,
	"income_source_id" text,
	"percent_bps" integer DEFAULT 10000 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD COLUMN "bucket_id" text;--> statement-breakpoint
ALTER TABLE "buckets" ADD CONSTRAINT "buckets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buckets" ADD CONSTRAINT "buckets_plan_id_budget_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."budget_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buckets" ADD CONSTRAINT "buckets_destination_account_id_accounts_id_fk" FOREIGN KEY ("destination_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_plans" ADD CONSTRAINT "budget_plans_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_income_sources" ADD CONSTRAINT "plan_income_sources_plan_id_budget_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."budget_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_income_sources" ADD CONSTRAINT "plan_income_sources_income_source_id_income_sources_id_fk" FOREIGN KEY ("income_source_id") REFERENCES "public"."income_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_income_sources" ADD CONSTRAINT "plan_income_sources_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_rules" ADD CONSTRAINT "plan_rules_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_rules" ADD CONSTRAINT "plan_rules_plan_id_budget_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."budget_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_rules" ADD CONSTRAINT "plan_rules_bucket_id_buckets_id_fk" FOREIGN KEY ("bucket_id") REFERENCES "public"."buckets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_rules" ADD CONSTRAINT "plan_rules_income_source_id_income_sources_id_fk" FOREIGN KEY ("income_source_id") REFERENCES "public"."income_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "buckets_plan_idx" ON "buckets" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_plans_one_active_idx" ON "budget_plans" USING btree ("user_id") WHERE "budget_plans"."active";--> statement-breakpoint
CREATE UNIQUE INDEX "plan_rules_plan_type_idx" ON "plan_rules" USING btree ("plan_id","type");--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_bucket_id_buckets_id_fk" FOREIGN KEY ("bucket_id") REFERENCES "public"."buckets"("id") ON DELETE set null ON UPDATE no action;