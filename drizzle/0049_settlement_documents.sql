CREATE TABLE "settlement_document_counters" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlement_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"sequential_number" integer NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"payment_id" text NOT NULL,
	"order_id" text NOT NULL,
	"original_document_id" text,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'RUB' NOT NULL,
	"vat_note" text NOT NULL,
	"payment_form" text NOT NULL,
	"settlement_sign" text NOT NULL,
	"service_name_snapshot" text NOT NULL,
	"site_url_snapshot" text NOT NULL,
	"operator_legal_name_snapshot" text NOT NULL,
	"operator_fio_snapshot" text NOT NULL,
	"inn_snapshot" text NOT NULL,
	"ogrnip_snapshot" text NOT NULL,
	"tax_system_snapshot" text NOT NULL,
	"settler_position_snapshot" text NOT NULL,
	"settler_surname_snapshot" text NOT NULL,
	"pdf_storage_key" text NOT NULL,
	"pdf_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "settlement_document_counters" ADD CONSTRAINT "settlement_document_counters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_documents" ADD CONSTRAINT "settlement_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_documents" ADD CONSTRAINT "settlement_documents_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_documents" ADD CONSTRAINT "settlement_documents_order_id_lesson_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."lesson_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_documents" ADD CONSTRAINT "settlement_documents_original_document_id_settlement_documents_id_fk" FOREIGN KEY ("original_document_id") REFERENCES "public"."settlement_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_documents_org_number_uidx" ON "settlement_documents" USING btree ("organization_id","sequential_number");--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_documents_payment_kind_uidx" ON "settlement_documents" USING btree ("payment_id","kind");--> statement-breakpoint
CREATE INDEX "settlement_documents_org_issued_idx" ON "settlement_documents" USING btree ("organization_id","issued_at");--> statement-breakpoint
CREATE INDEX "settlement_documents_order_idx" ON "settlement_documents" USING btree ("order_id");--> statement-breakpoint
ALTER TABLE "settlement_documents" ADD CONSTRAINT "settlement_documents_kind_check" CHECK ("kind" in ('income', 'income_return'));--> statement-breakpoint
ALTER TABLE "settlement_documents" ADD CONSTRAINT "settlement_documents_settlement_sign_check" CHECK ("settlement_sign" in ('приход', 'возврат прихода'));--> statement-breakpoint
ALTER TABLE "settlement_documents" ADD CONSTRAINT "settlement_documents_return_link_check" CHECK (
  ("kind" = 'income' AND "original_document_id" IS NULL)
  OR ("kind" = 'income_return' AND "original_document_id" IS NOT NULL)
);
