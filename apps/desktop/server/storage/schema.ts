export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    root_path TEXT NOT NULL,
    last_session_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CONSTRAINT uq_projects__root_path UNIQUE (root_path)
  );

  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    working_dir TEXT NOT NULL,
    title TEXT NOT NULL,
    engine_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_sessions__project_id_updated_at ON sessions (project_id, updated_at);

  CREATE TABLE session_personas (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    persona_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (session_id, persona_id)
  );

  CREATE TABLE history_archives (
    session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    archive_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `,
  `
  ALTER TABLE sessions ADD COLUMN archived_at TEXT;
  CREATE INDEX idx_sessions__project_id_archived_at ON sessions (project_id, archived_at);

  CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE user_decisions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    engine_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_user_decisions__project_id_created_at ON user_decisions (project_id, created_at);
  `,
];
