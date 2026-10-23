CREATE TABLE "chats" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"student_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"type" text NOT NULL,
	"author_user_id" text,
	"body" text,
	"event_type" text,
	"event_payload" jsonb,
	"event_key" text,
	"client_request_id" text,
	"related_lesson_id" text,
	"related_assignment_id" text,
	"deleted_at" timestamp with time zone,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "chat_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"object_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "chat_read_cursors" (
	"chat_id" text NOT NULL,
	"user_id" text NOT NULL,
	"last_read_at" timestamp with time zone NOT NULL,
	"last_read_message_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_read_cursors_chat_id_user_id_pk" PRIMARY KEY("chat_id","user_id")
);--> statement-breakpoint
CREATE TABLE "chat_pending_objects" (
	"object_key" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_read_cursors" ADD CONSTRAINT "chat_read_cursors_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_read_cursors" ADD CONSTRAINT "chat_read_cursors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_type_check" CHECK ("chat_messages"."type" in ('user_message', 'system_event'));--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_size_check" CHECK ("chat_attachments"."size_bytes" >= 0 AND "chat_attachments"."size_bytes" <= 20971520);--> statement-breakpoint
CREATE UNIQUE INDEX "chats_org_pair_uidx" ON "chats" USING btree ("organization_id","student_id","teacher_id");--> statement-breakpoint
CREATE INDEX "chats_teacher_activity_idx" ON "chats" USING btree ("organization_id","teacher_id","last_message_at");--> statement-breakpoint
CREATE INDEX "chats_student_activity_idx" ON "chats" USING btree ("organization_id","student_id","last_message_at");--> statement-breakpoint
CREATE INDEX "chat_messages_chat_created_idx" ON "chat_messages" USING btree ("chat_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_messages_request_uidx" ON "chat_messages" USING btree ("chat_id","client_request_id") WHERE "client_request_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_messages_event_uidx" ON "chat_messages" USING btree ("chat_id","event_key") WHERE "event_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "chat_messages_org_idx" ON "chat_messages" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "chat_attachments_message_idx" ON "chat_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_attachments_key_uidx" ON "chat_attachments" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "chat_read_cursors_user_idx" ON "chat_read_cursors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_pending_created_idx" ON "chat_pending_objects" USING btree ("created_at");
