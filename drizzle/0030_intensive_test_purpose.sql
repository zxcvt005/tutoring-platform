ALTER TABLE "tests" DROP CONSTRAINT "tests_purpose_check";
--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_purpose_check" CHECK ("purpose" in ('homework', 'theory', 'intensive'));
