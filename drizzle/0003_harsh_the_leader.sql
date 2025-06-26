CREATE TABLE IF NOT EXISTS "treatment" (
	"id" text PRIMARY KEY NOT NULL,
	"cattleId" text NOT NULL,
	"treatment" text NOT NULL,
	"date" timestamp DEFAULT now() NOT NULL,
	"followUp" timestamp,
	"completed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "treatment" ADD CONSTRAINT "treatment_cattleId_cattle_id_fk" FOREIGN KEY ("cattleId") REFERENCES "public"."cattle"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
