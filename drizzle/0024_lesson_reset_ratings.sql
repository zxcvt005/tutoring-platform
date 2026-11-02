ALTER TABLE "test_assignments" DROP CONSTRAINT "test_assignments_status_check";--> statement-breakpoint
ALTER TABLE "test_assignments" ADD CONSTRAINT "test_assignments_status_check" CHECK ("status" in ('assigned', 'in_progress', 'remaining_questions', 'attempt1_submitted', 'attempt2_in_progress', 'completed', 'reviewed', 'overdue', 'withdrawn'));--> statement-breakpoint
ALTER TABLE "lesson_ratings" DROP CONSTRAINT "lesson_ratings_comment_check";
