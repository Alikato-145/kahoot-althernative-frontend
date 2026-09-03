CREATE TABLE quizzes (
  id CHAR(36) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  cover_image_url TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE questions (
  id CHAR(36) PRIMARY KEY,
  quiz_id CHAR(36) NOT NULL,
  position INT NOT NULL,
  body TEXT NOT NULL,
  question_image_url TEXT NULL,
  reveal_image_url TEXT NULL,
  explanation TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_questions_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  CONSTRAINT uq_questions_quiz_position UNIQUE (quiz_id, position),
  INDEX idx_questions_quiz_id (quiz_id)
);

CREATE TABLE choices (
  id CHAR(36) PRIMARY KEY,
  question_id CHAR(36) NOT NULL,
  position INT NOT NULL,
  body TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  CONSTRAINT fk_choices_question FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
  CONSTRAINT uq_choices_question_position UNIQUE (question_id, position),
  INDEX idx_choices_question_id (question_id)
);

CREATE TABLE game_sessions (
  id CHAR(36) PRIMARY KEY,
  quiz_id CHAR(36) NOT NULL,
  pin CHAR(6) NOT NULL,
  status VARCHAR(32) NOT NULL,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_game_sessions_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE RESTRICT,
  CONSTRAINT uq_game_sessions_pin UNIQUE (pin)
);

CREATE TABLE game_players (
  id CHAR(36) PRIMARY KEY,
  session_id CHAR(36) NOT NULL,
  nickname VARCHAR(255) NOT NULL,
  final_score INT NOT NULL DEFAULT 0,
  final_rank INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_game_players_session FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE,
  INDEX idx_game_players_session_id (session_id)
);

CREATE TABLE game_answers (
  id CHAR(36) PRIMARY KEY,
  session_id CHAR(36) NOT NULL,
  player_id CHAR(36) NOT NULL,
  question_id CHAR(36) NOT NULL,
  choice_id CHAR(36) NOT NULL,
  score INT NOT NULL DEFAULT 0,
  answered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_game_answers_session FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_game_answers_player FOREIGN KEY (player_id) REFERENCES game_players(id) ON DELETE CASCADE,
  CONSTRAINT fk_game_answers_question FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
  CONSTRAINT fk_game_answers_choice FOREIGN KEY (choice_id) REFERENCES choices(id) ON DELETE CASCADE,
  INDEX idx_game_answers_session_id (session_id)
);
