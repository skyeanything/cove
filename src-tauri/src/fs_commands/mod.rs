//! 文件系统 Tauri 命令：限定在工作区内，供前端 read/write/edit 工具调用。

mod detection;
mod list;
mod office;
mod read;
mod validation;
mod write;

#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests_detection;
#[cfg(test)]
mod tests_list;
#[cfg(test)]
mod tests_read;
#[cfg(test)]
mod tests_validation;

pub use list::*;
pub use office::*;
pub use read::*;
pub use write::*;

pub(crate) use validation::ensure_inside_workspace_exists;
pub(crate) use validation::ensure_inside_workspace_may_not_exist;

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// 错误类型
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", content = "message")]
pub enum FsError {
    /// 路径不在工作区内
    OutsideWorkspace,
    /// 文件或目录不存在
    NotFound,
    /// 权限不足或类型不符（如期望文件却是目录）
    NotAllowed(String),
    /// 被判定为二进制文件，拒绝读取
    BinaryFile,
    /// 文件超过 250KB
    TooLarge,
    /// 其它 I/O 错误
    Io(String),
}

impl From<std::io::Error> for FsError {
    fn from(e: std::io::Error) -> Self {
        use std::io::ErrorKind;
        match e.kind() {
            ErrorKind::NotFound => FsError::NotFound,
            ErrorKind::PermissionDenied => FsError::NotAllowed(e.to_string()),
            _ => FsError::Io(e.to_string()),
        }
    }
}
