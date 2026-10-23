CREATE TABLE "lesson_topics" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"lesson_id" text NOT NULL,
	"topic_id" text,
	"title" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "lesson_topics" ADD CONSTRAINT "lesson_topics_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_topics" ADD CONSTRAINT "lesson_topics_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_topics" ADD CONSTRAINT "lesson_topics_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lesson_topics_lesson_idx" ON "lesson_topics" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "lesson_topics_org_idx" ON "lesson_topics" USING btree ("organization_id");--> statement-breakpoint
INSERT INTO "lesson_topics" ("id", "organization_id", "lesson_id", "topic_id", "title", "sort_order")
SELECT
  'lt_' || "id",
  "organization_id",
  "id",
  "topic_id",
  COALESCE(NULLIF("subject", ''), 'Тема'),
  0
FROM "lessons"
WHERE "topic_id" IS NOT NULL OR COALESCE(NULLIF("subject", ''), '') <> '';
