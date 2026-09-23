use std::ffi::OsString;
use std::path::Path;

pub fn agent_path(program: &Path) -> OsString {
    let base = crate::engine_path();
    let Some(parent) = program.parent() else {
        return OsString::from(base);
    };
    let mut path = OsString::from(parent);
    path.push(":");
    path.push(base);
    path
}
