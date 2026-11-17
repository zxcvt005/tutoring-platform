-- Split legacy multi-student lessons/schedules into independent 1:1 records,
-- then enforce uniqueness. First student (ordered by student_id) keeps the
-- original id. Lesson clones do not inherit schedule_id (avoid unique
-- schedule occurrence collisions). Schedule clones are independent templates.

DO $$
DECLARE
  lid text;
  keep_sid text;
  sid text;
  new_lid text;
  sch_id text;
  new_sch text;
BEGIN
  -- 1) Split multi-student lessons
  FOR lid IN
    SELECT lesson_id
    FROM lesson_students
    GROUP BY lesson_id
    HAVING count(*) > 1
  LOOP
    SELECT student_id INTO keep_sid
    FROM lesson_students
    WHERE lesson_id = lid
    ORDER BY student_id
    LIMIT 1;

    FOR sid IN
      SELECT student_id
      FROM lesson_students
      WHERE lesson_id = lid AND student_id <> keep_sid
      ORDER BY student_id
    LOOP
      new_lid := 'l_' || substr(md5(random()::text || clock_timestamp()::text || sid), 1, 16);

      INSERT INTO lessons (
        id, organization_id, teacher_id, direction_id, topic_id,
        schedule_id, schedule_occurrence_key, subject,
        starts_at, ends_at, status, created_at, updated_at
      )
      SELECT
        new_lid, organization_id, teacher_id, direction_id, topic_id,
        NULL, NULL, subject,
        starts_at, ends_at, status, now(), now()
      FROM lessons
      WHERE id = lid;

      INSERT INTO lesson_students (lesson_id, student_id)
      VALUES (new_lid, sid);

      INSERT INTO lesson_topics (
        id, organization_id, lesson_id, topic_id, title, sort_order, created_at, updated_at
      )
      SELECT
        'lt_' || substr(md5(random()::text || id), 1, 16),
        organization_id, new_lid, topic_id, title, sort_order, now(), now()
      FROM lesson_topics
      WHERE lesson_id = lid;

      -- PK (lesson_id, student_id): перенос через delete+insert
      INSERT INTO attendances (lesson_id, student_id, status, updated_at)
      SELECT new_lid, student_id, status, updated_at
      FROM attendances
      WHERE lesson_id = lid AND student_id = sid;
      DELETE FROM attendances
      WHERE lesson_id = lid AND student_id = sid;

      UPDATE test_assignments
      SET lesson_id = new_lid, updated_at = now()
      WHERE lesson_id = lid AND student_id = sid;

      INSERT INTO lesson_ratings (
        id, organization_id, lesson_id, student_id, teacher_id,
        score, comment, submitted_at, created_at, updated_at
      )
      SELECT
        'lr_' || substr(md5(random()::text || id), 1, 16),
        organization_id, new_lid, student_id, teacher_id,
        score, comment, submitted_at, created_at, now()
      FROM lesson_ratings
      WHERE lesson_id = lid AND student_id = sid;
      DELETE FROM lesson_ratings
      WHERE lesson_id = lid AND student_id = sid;

      INSERT INTO lesson_debit_state (
        lesson_id, student_id, direction_id, ledger_entry_id, updated_at
      )
      SELECT new_lid, student_id, direction_id, ledger_entry_id, now()
      FROM lesson_debit_state
      WHERE lesson_id = lid AND student_id = sid;
      DELETE FROM lesson_debit_state
      WHERE lesson_id = lid AND student_id = sid;

      UPDATE student_lesson_ledger
      SET lesson_id = new_lid
      WHERE lesson_id = lid AND student_id = sid;

      DELETE FROM lesson_students
      WHERE lesson_id = lid AND student_id = sid;
    END LOOP;
  END LOOP;

  -- 2) Split multi-student recurring schedules (templates)
  FOR sch_id IN
    SELECT schedule_id
    FROM lesson_schedule_students
    GROUP BY schedule_id
    HAVING count(*) > 1
  LOOP
    SELECT student_id INTO keep_sid
    FROM lesson_schedule_students
    WHERE schedule_id = sch_id
    ORDER BY student_id
    LIMIT 1;

    FOR sid IN
      SELECT student_id
      FROM lesson_schedule_students
      WHERE schedule_id = sch_id AND student_id <> keep_sid
      ORDER BY student_id
    LOOP
      new_sch := 'sch_' || substr(md5(random()::text || clock_timestamp()::text || sid), 1, 16);

      INSERT INTO lesson_schedules (
        id, organization_id, teacher_id, direction_id, subject,
        weekdays, start_time, duration_min, active_from, active_until,
        status, created_at, updated_at
      )
      SELECT
        new_sch, organization_id, teacher_id, direction_id, subject,
        weekdays, start_time, duration_min, active_from, active_until,
        status, now(), now()
      FROM lesson_schedules
      WHERE id = sch_id;

      INSERT INTO lesson_schedule_students (schedule_id, student_id)
      VALUES (new_sch, sid);

      DELETE FROM lesson_schedule_students
      WHERE schedule_id = sch_id AND student_id = sid;
    END LOOP;
  END LOOP;
END $$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "lesson_students_one_per_lesson_uidx"
  ON "lesson_students" ("lesson_id");--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "lesson_schedule_students_one_per_schedule_uidx"
  ON "lesson_schedule_students" ("schedule_id");
