ALTER TABLE quizzes ADD COLUMN intro_duration_seconds INT NOT NULL DEFAULT 5;
ALTER TABLE quizzes ADD COLUMN answer_duration_seconds INT NOT NULL DEFAULT 20;
ALTER TABLE quizzes ADD COLUMN reveal_duration_seconds INT NOT NULL DEFAULT 4;
