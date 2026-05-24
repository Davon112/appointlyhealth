CREATE TABLE "accepting_status_reports" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"npi" text NOT NULL,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"source_detail" text,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinics" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"hrsa_site_id" text,
	"name" text NOT NULL,
	"address_line1" text,
	"city" text,
	"state" text,
	"zip" text,
	"phone" text,
	"services_offered" text,
	"is_fqhc" boolean DEFAULT false,
	"is_look_alike" boolean DEFAULT false,
	"sliding_fee_scale" boolean DEFAULT true,
	"lat" double precision,
	"lng" double precision,
	CONSTRAINT "clinics_hrsa_site_id_unique" UNIQUE("hrsa_site_id")
);
--> statement-breakpoint
CREATE TABLE "provider_locations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"npi" text NOT NULL,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"state" text,
	"zip" text,
	"lat" double precision,
	"lng" double precision,
	"is_primary" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"npi" text PRIMARY KEY NOT NULL,
	"first_name" text,
	"last_name" text,
	"organization_name" text,
	"credential" text,
	"primary_taxonomy" text,
	"specialty_group" text,
	"phone" text,
	"languages" text,
	"accepting_status" text DEFAULT 'unknown' NOT NULL,
	"accepting_status_updated_at" timestamp with time zone,
	"accepting_status_source" text,
	"loaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accepting_status_reports" ADD CONSTRAINT "accepting_status_reports_npi_providers_npi_fk" FOREIGN KEY ("npi") REFERENCES "public"."providers"("npi") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_locations" ADD CONSTRAINT "provider_locations_npi_providers_npi_fk" FOREIGN KEY ("npi") REFERENCES "public"."providers"("npi") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asr_npi_reported_at_idx" ON "accepting_status_reports" USING btree ("npi","reported_at");--> statement-breakpoint
CREATE INDEX "clinics_geo_idx" ON "clinics" USING btree ("lat","lng");--> statement-breakpoint
CREATE INDEX "provider_locations_npi_idx" ON "provider_locations" USING btree ("npi");--> statement-breakpoint
CREATE INDEX "provider_locations_geo_idx" ON "provider_locations" USING btree ("lat","lng");--> statement-breakpoint
CREATE INDEX "providers_specialty_idx" ON "providers" USING btree ("specialty_group");