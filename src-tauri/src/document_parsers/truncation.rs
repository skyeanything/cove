pub(crate) fn truncate_text_by_chars(mut text: String, max_chars: usize) -> (String, bool) {
    let total_chars = text.chars().count();
    if total_chars <= max_chars {
        return (text, false);
    }
    text = text.chars().take(max_chars).collect::<String>();
    (format!(
        "{}\n\n[内容已截断：原始文本长度约 {} 字符，当前保留 {} 字符]",
        text, total_chars, max_chars
    ), true)
}
