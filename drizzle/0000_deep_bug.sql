CREATE TABLE `accepting_status_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`npi` text NOT NULL,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`source_detail` text,
	`reported_at` integer NOT NULL,
	FOREIGN KEY (`npi`) REFERENCES `providers`(`npi`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `asr_npi_reported_at_idx` ON `accepting_status_reports` (`npi`,`reported_at`);--> statement-breakpoint
CREATE TABLE `clinics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`hrsa_site_id` text,
	`name` text NOT NULL,
	`address_line1` text,
	`city` text,
	`state` text,
	`zip` text,
	`phone` text,
	`services_offered` text,
	`is_fqhc` integer DEFAULT false,
	`is_look_alike` integer DEFAULT false,
	`sliding_fee_scale` integer DEFAULT true,
	`lat` real,
	`lng` real
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clinics_hrsa_site_id_unique` ON `clinics` (`hrsa_site_id`);--> statement-breakpoint
CREATE INDEX `clinics_geo_idx` ON `clinics` (`lat`,`lng`);--> statement-breakpoint
CREATE TABLE `provider_locations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`npi` text NOT NULL,
	`address_line1` text,
	`address_line2` text,
	`city` text,
	`state` text,
	`zip` text,
	`lat` real,
	`lng` real,
	`is_primary` integer DEFAULT false,
	FOREIGN KEY (`npi`) REFERENCES `providers`(`npi`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `provider_locations_npi_idx` ON `provider_locations` (`npi`);--> statement-breakpoint
CREATE INDEX `provider_locations_geo_idx` ON `provider_locations` (`lat`,`lng`);--> statement-breakpoint
CREATE TABLE `providers` (
	`npi` text PRIMARY KEY NOT NULL,
	`first_name` text,
	`last_name` text,
	`organization_name` text,
	`credential` text,
	`primary_taxonomy` text,
	`specialty_group` text,
	`phone` text,
	`languages` text,
	`accepting_status` text DEFAULT 'unknown' NOT NULL,
	`accepting_status_updated_at` integer,
	`accepting_status_source` text,
	`loaded_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `providers_specialty_idx` ON `providers` (`specialty_group`);