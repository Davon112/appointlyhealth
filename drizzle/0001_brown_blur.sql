CREATE TABLE "appointment_request_recipients" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"clinic_id" integer NOT NULL,
	"intake_email" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_message_id" text,
	"sent_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "appointment_requests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"phone_hash" text NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"phi_deleted_at" timestamp with time zone,
	"first_name" text,
	"last_name" text,
	"dob" text,
	"phone" text,
	"email" text,
	"reason_category" text,
	"reason_detail" text,
	"insurance_situation" text,
	"preferred_times" text,
	"language" text,
	"consent_version" text,
	"consent_accepted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "intake_email" text;--> statement-breakpoint
ALTER TABLE "appointment_request_recipients" ADD CONSTRAINT "appointment_request_recipients_request_id_appointment_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."appointment_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_request_recipients" ADD CONSTRAINT "appointment_request_recipients_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "arr_request_idx" ON "appointment_request_recipients" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "arr_clinic_idx" ON "appointment_request_recipients" USING btree ("clinic_id","sent_at");--> statement-breakpoint
CREATE INDEX "ar_phone_hash_idx" ON "appointment_requests" USING btree ("phone_hash","submitted_at");--> statement-breakpoint
CREATE INDEX "ar_status_idx" ON "appointment_requests" USING btree ("status","delivered_at");