ALTER TABLE "cattle" ADD COLUMN "receivedAt" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "cattle" ADD COLUMN "receivedAge" integer DEFAULT 0 NOT NULL;