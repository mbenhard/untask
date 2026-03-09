use thiserror::Error;

#[derive(Error, Debug)]
pub enum UnshipError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("YAML parse error: {0}")]
    YamlParse(#[from] serde_yaml::Error),

    #[error("JSON parse error: {0}")]
    JsonParse(#[from] serde_json::Error),

    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),

    #[error("Project not initialized - run 'unship init' first")]
    NotInitialized,

    #[error("Task not found: {0}")]
    TaskNotFound(String),

    #[error("Doc not found: {0}")]
    DocNotFound(String),

    #[error("Ambiguous reference '{0}': matches {1}")]
    Ambiguous(String, String),

    #[error("Repair failed: {0}")]
    RepairFailed(String),

    #[error("{0}")]
    CommandFailed(String),

    #[error("Lock acquisition failed: {0}")]
    LockFailed(String),
}

pub type Result<T> = std::result::Result<T, UnshipError>;
