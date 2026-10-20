ALTER TABLE "sessions" ADD COLUMN "impersonator_user_id" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_impersonator_user_id_users_id_fk" FOREIGN KEY ("impersonator_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_impersonator_idx" ON "sessions" USING btree ("impersonator_user_id");
