use super::parsers::*;

#[test]
fn page_range_basics() {
    assert_eq!(parse_page_range("1,3,5", 10), vec![1, 3, 5]);
    assert_eq!(parse_page_range("2-5", 10), vec![2, 3, 4, 5]);
    assert_eq!(parse_page_range("1,3-5,7", 10), vec![1, 3, 4, 5, 7]);
}

#[test]
fn page_range_reversed() {
    assert_eq!(parse_page_range("5-2", 10), vec![2, 3, 4, 5]);
}

#[test]
fn page_range_edge_cases() {
    assert_eq!(parse_page_range("1,99", 5), vec![1]); // out of bounds
    assert_eq!(parse_page_range("1,1,2", 10), vec![1, 2]); // dedup
    let empty: Vec<usize> = vec![];
    assert_eq!(parse_page_range("", 10), empty);
    assert_eq!(parse_page_range("abc", 10), empty);
}

#[test]
fn slide_index() {
    assert_eq!(extract_slide_index("ppt/slides/slide3.xml"), 3);
    assert_eq!(extract_slide_index("ppt/slides/slide12.xml"), 12);
    assert_eq!(extract_slide_index("garbage"), 0);
}

#[test]
fn plain_text_reads_content() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("test.txt");
    std::fs::write(&path, "hello world").unwrap();
    let (text, truncated, warnings) = parse_plain_text(&path, 1024).unwrap();
    assert_eq!(text, "hello world");
    assert!(!truncated);
    assert!(warnings.is_empty());
}

#[test]
fn plain_text_truncates_large_file() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("big.txt");
    std::fs::write(&path, "a".repeat(200)).unwrap();
    let (text, truncated, warnings) = parse_plain_text(&path, 50).unwrap();
    assert!(truncated);
    assert!(!warnings.is_empty());
    assert!(text.contains("内容已截断"));
}

#[test]
fn truncate_within_limit() {
    use super::truncation::truncate_text_by_chars;
    let (text, truncated) = truncate_text_by_chars("hello".to_string(), 100);
    assert_eq!(text, "hello");
    assert!(!truncated);
}

#[test]
fn truncate_over_limit() {
    use super::truncation::truncate_text_by_chars;
    let (text, truncated) = truncate_text_by_chars("abcdef".to_string(), 3);
    assert!(truncated);
    assert!(text.starts_with("abc"));
    assert!(text.contains("内容已截断"));
}
