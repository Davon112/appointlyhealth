ALTER TABLE "appointment_request_recipients" ALTER COLUMN "clinic_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "appointment_request_recipients" ADD COLUMN "provider_npi" text;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "intake_email" text;--> statement-breakpoint
ALTER TABLE "appointment_request_recipients" ADD CONSTRAINT "appointment_request_recipients_provider_npi_providers_npi_fk" FOREIGN KEY ("provider_npi") REFERENCES "public"."providers"("npi") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "arr_provider_idx" ON "appointment_request_recipients" USING btree ("provider_npi","sent_at");