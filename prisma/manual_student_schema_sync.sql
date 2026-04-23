BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'students' AND column_name = 'middle_name'
  ) THEN
    ALTER TABLE students RENAME COLUMN middle_name TO father_name;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'students' AND column_name = 'last_name'
  ) THEN
    ALTER TABLE students RENAME COLUMN last_name TO grandfather_name;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'study_year_roman') THEN
    CREATE TYPE study_year_roman AS ENUM ('I', 'II', 'III', 'IV', 'V');
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'students' AND column_name = 'study_year' AND udt_name <> 'study_year_roman'
  ) THEN
    ALTER TABLE students ADD COLUMN study_year_tmp study_year_roman;

    UPDATE students
    SET study_year_tmp = CASE study_year
      WHEN 1 THEN 'I'::study_year_roman
      WHEN 2 THEN 'II'::study_year_roman
      WHEN 3 THEN 'III'::study_year_roman
      WHEN 4 THEN 'IV'::study_year_roman
      WHEN 5 THEN 'V'::study_year_roman
      ELSE 'I'::study_year_roman
    END;

    ALTER TABLE students DROP COLUMN study_year;
    ALTER TABLE students RENAME COLUMN study_year_tmp TO study_year;
    ALTER TABLE students ALTER COLUMN study_year SET NOT NULL;
  END IF;
END
$$;

COMMIT;
