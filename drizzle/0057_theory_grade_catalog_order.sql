CREATE TABLE IF NOT EXISTS "theory_grade_catalog_order" (
	"organization_id" text NOT NULL,
	"grade" text NOT NULL,
	"material_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "theory_grade_catalog_order_pk" PRIMARY KEY("organization_id","grade","material_id")
);
--> statement-breakpoint
ALTER TABLE "theory_grade_catalog_order" ADD CONSTRAINT "theory_grade_catalog_order_org_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "theory_grade_catalog_order" ADD CONSTRAINT "theory_grade_catalog_order_material_fk" FOREIGN KEY ("material_id") REFERENCES "public"."theory_materials"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "theory_grade_catalog_order_org_grade_idx" ON "theory_grade_catalog_order" USING btree ("organization_id","grade","sort_order");
--> statement-breakpoint
ALTER TABLE "theory_grade_catalog_order" ADD CONSTRAINT "theory_grade_catalog_order_grade_check" CHECK ("grade" in ('7', '8', '9', '10', '11'));
