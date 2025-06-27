CREATE TYPE "public"."gender" AS ENUM('bul', 'vers', 'os', 'koei');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cattle" (
	"id" text PRIMARY KEY NOT NULL,
	"tag_number" text NOT NULL,
	"gender" "gender" NOT NULL,
	"breed" text DEFAULT '' NOT NULL,
	"mass" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "cattle_tag_number_unique" UNIQUE("tag_number")
);
--> statement-breakpoint
DROP TABLE "todo" CASCADE;