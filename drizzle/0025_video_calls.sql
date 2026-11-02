CREATE TABLE "video_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"active_participant_id" text,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_calls_mode_check" CHECK ("mode" in ('parallel', 'group')),
	CONSTRAINT "video_calls_status_check" CHECK ("status" in ('active', 'ended'))
);--> statement-breakpoint
CREATE TABLE "video_call_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"call_id" text NOT NULL,
	"student_id" text NOT NULL,
	"livekit_room_name" text NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_call_participants_status_check" CHECK ("status" in ('invited', 'closed'))
);--> statement-breakpoint
ALTER TABLE "video_calls" ADD CONSTRAINT "video_calls_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_calls" ADD CONSTRAINT "video_calls_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_call_participants" ADD CONSTRAINT "video_call_participants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_call_participants" ADD CONSTRAINT "video_call_participants_call_id_video_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."video_calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_call_participants" ADD CONSTRAINT "video_call_participants_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "video_calls_org_idx" ON "video_calls" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "video_calls_teacher_status_idx" ON "video_calls" USING btree ("teacher_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "video_call_participants_call_student_uidx" ON "video_call_participants" USING btree ("call_id","student_id");--> statement-breakpoint
CREATE INDEX "video_call_participants_room_idx" ON "video_call_participants" USING btree ("livekit_room_name");--> statement-breakpoint
CREATE INDEX "video_call_participants_student_idx" ON "video_call_participants" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "video_call_participants_call_idx" ON "video_call_participants" USING btree ("call_id");
