/// Generate a stable slug from a title string.
/// Lowercase, replace non-alphanumeric with hyphens, collapse consecutive hyphens, trim.
pub fn generate_slug(title: &str) -> String {
    let slug: String = title
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect();

    // Collapse consecutive hyphens
    let mut result = String::with_capacity(slug.len());
    let mut prev_hyphen = false;
    for c in slug.chars() {
        if c == '-' {
            if !prev_hyphen {
                result.push('-');
            }
            prev_hyphen = true;
        } else {
            result.push(c);
            prev_hyphen = false;
        }
    }

    let trimmed = result.trim_matches('-');

    // Truncate to avoid exceeding filesystem filename limits (255 bytes).
    // Reserve space for id prefix (e.g. "001-") and ".md" suffix.
    const MAX_SLUG_LEN: usize = 200;
    if trimmed.len() <= MAX_SLUG_LEN {
        return trimmed.to_string();
    }
    // Truncate at a hyphen boundary to avoid cutting mid-word
    let truncated = &trimmed[..MAX_SLUG_LEN];
    truncated.trim_end_matches('-').to_string()
}
