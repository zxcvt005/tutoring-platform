CREATE TABLE "private_call_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"accepting" boolean DEFAULT true NOT NULL,
	"active_room_id" text,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "private_call_sessions_status_check" CHECK ("status" in ('active', 'ended'))
);
--> statement-breakpoint
CREATE TABLE "private_call_rooms" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"display_name" text NOT NULL,
	"livekit_room_name" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "private_call_rooms_status_check" CHECK ("status" in ('open', 'closed'))
);
--> statement-breakpoint
ALTER TABLE "private_call_rooms" ADD CONSTRAINT "private_call_rooms_session_id_private_call_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."private_call_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "private_call_sessions_code_uidx" ON "private_call_sessions" USING btree ("code");
--> statement-breakpoint
CREATE INDEX "private_call_sessions_status_idx" ON "private_call_sessions" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX "private_call_rooms_livekit_uidx" ON "private_call_rooms" USING btree ("livekit_room_name");
--> statement-breakpoint
CREATE INDEX "private_call_rooms_session_idx" ON "private_call_rooms" USING btree ("session_id");
--> statement-breakpoint
CREATE INDEX "private_call_rooms_open_seen_idx" ON "private_call_rooms" USING btree ("status","last_seen_at");
