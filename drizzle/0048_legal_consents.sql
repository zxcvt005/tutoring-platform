CREATE TABLE "legal_consents" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"user_id" text,
	"site_lead_id" text,
	"contact_hint" text,
	"source" text NOT NULL,
	"document_slug" text,
	"document_version" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "legal_consents" ADD CONSTRAINT "legal_consents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_consents" ADD CONSTRAINT "legal_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_consents" ADD CONSTRAINT "legal_consents_site_lead_id_site_leads_id_fk" FOREIGN KEY ("site_lead_id") REFERENCES "public"."site_leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legal_consents_org_created_idx" ON "legal_consents" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "legal_consents_user_idx" ON "legal_consents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "legal_consents_lead_idx" ON "legal_consents" USING btree ("site_lead_id");--> statement-breakpoint
CREATE INDEX "legal_consents_kind_idx" ON "legal_consents" USING btree ("kind","created_at");--> statement-breakpoint
ALTER TABLE "legal_consents" ADD CONSTRAINT "legal_consents_kind_check" CHECK ("kind" in ('privacy_ack', 'personal_data', 'marketing', 'cookie_prefs', 'public_offer'));--> statement-breakpoint
ALTER TABLE "legal_consents" ADD CONSTRAINT "legal_consents_status_check" CHECK ("status" in ('granted', 'withdrawn'));
