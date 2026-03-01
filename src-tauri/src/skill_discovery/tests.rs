use super::*;
use crate::test_util::with_home;

fn write_md(dir: &Path, content: &str) {
    fs::create_dir_all(dir).unwrap();
    fs::write(dir.join(SKILL_FILENAME), content).unwrap();
}

// --- scan_skill_root ---

#[test]
fn scan_nested_layout() {
    let td = tempfile::TempDir::new().unwrap();
    let root = td.path();
    write_md(&root.join("my-skill"), "---\nname: my-skill\n---");
    let found = scan_skill_root(root, "test");
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].name, "my-skill");
    assert_eq!(found[0].source, "test");
    assert!(found[0].content.contains("my-skill"));
}

#[test]
fn scan_flat_layout() {
    let td = tempfile::TempDir::new().unwrap();
    let root = td.path().join("skills");
    write_md(&root, "flat content");
    let found = scan_skill_root(&root, "src");
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].name, "skills");
    assert_eq!(found[0].content, "flat content");
}

#[test]
fn scan_mixed_layout() {
    let td = tempfile::TempDir::new().unwrap();
    let root = td.path().join("mix");
    write_md(&root, "flat");
    write_md(&root.join("nested"), "nested");
    let found = scan_skill_root(&root, "s");
    assert_eq!(found.len(), 2);
}

#[test]
fn scan_empty_dir() {
    let td = tempfile::TempDir::new().unwrap();
    assert!(scan_skill_root(td.path(), "x").is_empty());
}

#[test]
fn scan_nonexistent_dir() {
    assert!(scan_skill_root(Path::new("/no/such/dir"), "x").is_empty());
}

#[test]
fn scan_skips_non_dir_entries() {
    let td = tempfile::TempDir::new().unwrap();
    // file (not dir) at root level — should be skipped
    fs::write(td.path().join("not-a-dir"), "x").unwrap();
    // subdir without SKILL.md — should be skipped
    fs::create_dir(td.path().join("empty-sub")).unwrap();
    assert!(scan_skill_root(td.path(), "x").is_empty());
}

// --- read_skill_file ---

#[test]
fn read_skill_file_normal() {
    let td = tempfile::TempDir::new().unwrap();
    let p = td.path().join("SKILL.md");
    fs::write(&p, "hello").unwrap();
    assert_eq!(read_skill_file(&p).unwrap(), "hello");
}

#[test]
fn read_skill_file_over_limit() {
    let td = tempfile::TempDir::new().unwrap();
    let p = td.path().join("BIG.md");
    let big = vec![b'x'; (MAX_SKILL_BYTES + 1) as usize];
    fs::write(&p, &big).unwrap();
    assert_eq!(read_skill_file(&p).unwrap(), "");
}

#[test]
fn read_skill_file_nonexistent() {
    assert!(read_skill_file(Path::new("/no/file")).is_err());
}

// --- expand_path ---

#[test]
fn expand_tilde_path() {
    with_home(|home| {
        assert_eq!(expand_path("~/foo"), home.join("foo"));
        assert_eq!(expand_path("~"), home.to_path_buf());
    });
}

#[test]
fn expand_absolute_unchanged() {
    assert_eq!(expand_path("/abs/path"), PathBuf::from("/abs/path"));
}

#[test]
fn expand_relative_unchanged() {
    assert_eq!(expand_path("relative/path"), PathBuf::from("relative/path"));
}

// --- discover_skills_impl ---

#[test]
fn discover_scans_default_roots() {
    with_home(|home| {
        // Create a skill in ~/.claude/skills/my-skill/SKILL.md
        write_md(&home.join(".claude/skills/my-skill"), "claude skill");
        // Create a skill in ~/.cove/skills/cove-skill/SKILL.md
        write_md(&home.join(".cove/skills/cove-skill"), "cove skill");

        let result = discover_skills_impl(None, None, None).unwrap();
        assert!(result.len() >= 2);

        let claude = result.iter().find(|e| e.name == "my-skill");
        assert!(claude.is_some(), "should find claude skill");
        assert_eq!(claude.unwrap().source, "claude");

        let cove = result.iter().find(|e| e.name == "cove-skill");
        assert!(cove.is_some(), "should find cove skill");
        assert_eq!(cove.unwrap().source, "cove");
    });
}

#[test]
fn discover_scans_custom_roots() {
    with_home(|_| {
        let td = tempfile::TempDir::new().unwrap();
        let custom = td.path().join("my-custom-skills");
        write_md(&custom.join("extra"), "custom content");

        let result = discover_skills_impl(
            None,
            None,
            Some(vec![custom.to_string_lossy().into_owned()]),
        )
        .unwrap();

        let custom_entry = result.iter().find(|e| e.name == "extra");
        assert!(custom_entry.is_some(), "should find custom skill");
        assert_eq!(custom_entry.unwrap().source, "custom");
        assert_eq!(custom_entry.unwrap().content, "custom content");
    });
}

#[test]
fn discover_scans_workspace_path() {
    with_home(|_| {
        let td = tempfile::TempDir::new().unwrap();
        let ws = td.path().join("workspace");
        write_md(&ws.join(".claude/skills/ws-skill"), "ws claude");
        write_md(&ws.join(".agents/skills/agent-skill"), "ws agent");

        let result = discover_skills_impl(
            None,
            Some(ws.to_string_lossy().into_owned()),
            None,
        )
        .unwrap();

        let ws_claude = result.iter().find(|e| e.name == "ws-skill");
        assert!(ws_claude.is_some(), "should find workspace claude skill");
        assert_eq!(ws_claude.unwrap().source, "claude");

        let ws_agent = result.iter().find(|e| e.name == "agent-skill");
        assert!(ws_agent.is_some(), "should find workspace agent skill");
        assert_eq!(ws_agent.unwrap().source, "agents");
    });
}

#[test]
fn discover_skips_empty_workspace_path() {
    with_home(|_| {
        // Empty string workspace_path should be filtered out
        let result = discover_skills_impl(None, Some(String::new()), None).unwrap();
        // Should still succeed (just scanning default roots, which are empty in tempdir)
        assert!(result.is_empty());
    });
}

#[test]
fn discover_skips_nonexistent_custom_root() {
    with_home(|_| {
        let result = discover_skills_impl(
            None,
            None,
            Some(vec!["/no/such/path".into()]),
        )
        .unwrap();
        // Non-existent custom root is silently skipped (not an error)
        assert!(result.is_empty());
    });
}

#[test]
fn discover_scans_bundled_officellm_skills() {
    with_home(|_| {
        let td = tempfile::TempDir::new().unwrap();
        let bundled_skills = td.path().join("officellm-skills");
        write_md(&bundled_skills.join("OfficeLLM"), "bundled officellm skill");

        let result = discover_skills_impl(
            Some(bundled_skills),
            None,
            None,
        )
        .unwrap();

        let entry = result.iter().find(|e| e.name == "OfficeLLM");
        assert!(entry.is_some(), "should find bundled officellm skill");
        assert_eq!(entry.unwrap().source, "office");
        assert_eq!(entry.unwrap().content, "bundled officellm skill");
    });
}

#[test]
fn discover_custom_roots_with_tilde() {
    with_home(|home| {
        let custom_dir = home.join("my-skills");
        write_md(&custom_dir.join("tilde-skill"), "tilde content");

        let result = discover_skills_impl(
            None,
            None,
            Some(vec!["~/my-skills".into()]),
        )
        .unwrap();

        let entry = result.iter().find(|e| e.name == "tilde-skill");
        assert!(entry.is_some(), "should resolve ~ in custom roots");
        assert_eq!(entry.unwrap().content, "tilde content");
    });
}
