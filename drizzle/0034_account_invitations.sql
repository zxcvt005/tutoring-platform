CREATE TABLE "account_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"teacher_id" text,
	"student_id" text,
	"token_hash" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_by_user_id" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_invitations_kind_check" CHECK ("kind" in ('teacher', 'student')),
	CONSTRAINT "account_invitations_target_check" CHECK ((
        ("kind" = 'teacher' and "teacher_id" is not null and "student_id" is null)
        or
        ("kind" = 'student' and "student_id" is not null and "teacher_id" is null)
      ))
);
--> statement-breakpoint
ALTER TABLE "account_invitations" ADD CONSTRAINT "account_invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "account_invitations" ADD CONSTRAINT "account_invitations_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "account_invitations" ADD CONSTRAINT "account_invitations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "account_invitations" ADD CONSTRAINT "account_invitations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "account_invitations" ADD CONSTRAINT "account_invitations_used_by_user_id_users_id_fk" FOREIGN KEY ("used_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "account_invitations_token_hash_uidx" ON "account_invitations" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX "account_invitations_org_idx" ON "account_invitations" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "account_invitations_teacher_idx" ON "account_invitations" USING btree ("teacher_id");
--> statement-breakpoint
CREATE INDEX "account_invitations_student_idx" ON "account_invitations" USING btree ("student_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "account_invitations_active_teacher_uidx" ON "account_invitations" ("teacher_id") WHERE "teacher_id" IS NOT NULL AND "used_at" IS NULL AND "revoked_at" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "account_invitations_active_student_uidx" ON "account_invitations" ("student_id") WHERE "student_id" IS NOT NULL AND "used_at" IS NULL AND "revoked_at" IS NULL;
