-- Phase 1a had no automatic sorting, so every category already set was chosen by the user.
-- Mark those rows so 1b's rules, history, AI, backfill and transfer matching never change them.
UPDATE "transactions" SET "categorization_source" = 'user' WHERE "category_id" IS NOT NULL AND "categorization_source" IS NULL;
