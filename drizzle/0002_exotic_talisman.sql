CREATE TABLE "ai_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cache_read_tokens" integer NOT NULL,
	"cache_write_tokens" integer NOT NULL,
	"cost_micros" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"match_type" text NOT NULL,
	"pattern" text NOT NULL,
	"category_id" text NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"created_from" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "categorization_source" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "categorization_confidence" real;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "transfer_pair_id" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "ai_monthly_cap_cents" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "default_rules_seeded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_user_time_idx" ON "ai_usage" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "category_rules_user_pattern_idx" ON "category_rules" USING btree ("user_id","match_type","pattern");--> statement-breakpoint
CREATE INDEX "transactions_user_review_idx" ON "transactions" USING btree ("user_id","needs_review");