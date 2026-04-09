from __future__ import annotations

import html
import os
import re
from pathlib import Path

import markdown

DOCS_ROOT = Path("docs")
INDEX_PATH = Path("index.html")

CSS = """
:root {
  --bg: #0f172a;
  --text: #e2e8f0;
  --muted: #94a3b8;
  --accent: #14b8a6;
  --border: rgba(148, 163, 184, 0.25);
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.7;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
header {
  position: sticky;
  top: 0;
  z-index: 5;
  backdrop-filter: blur(8px);
  background: rgba(15, 23, 42, 0.9);
  border-bottom: 1px solid var(--border);
}
.header-inner {
  max-width: 980px;
  margin: 0 auto;
  padding: 12px 20px;
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
}
.header-links {
  display: flex;
  gap: 14px;
  align-items: center;
}
.badge {
  display: inline-block;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
  border: 1px solid rgba(20, 184, 166, 0.35);
  background: rgba(20, 184, 166, 0.12);
  border-radius: 999px;
  padding: 3px 9px;
}
main {
  max-width: 980px;
  margin: 0 auto;
  padding: 28px 20px 60px;
}
h1, h2, h3, h4, h5 { line-height: 1.3; margin-top: 1.2em; margin-bottom: 0.4em; color: #f8fafc; }
h1 { font-size: clamp(28px, 5vw, 38px); margin-top: 0.2em; }
h2 { font-size: clamp(22px, 3.7vw, 28px); border-top: 1px solid var(--border); padding-top: 18px; }
h3 { font-size: clamp(18px, 2.8vw, 22px); }
p { margin: 0 0 14px; color: var(--text); }
ul, ol { margin: 0 0 14px 20px; }
li { margin: 5px 0; }
hr { border: none; border-top: 1px solid var(--border); margin: 24px 0; }
blockquote {
  margin: 16px 0;
  padding: 12px 14px;
  border-left: 3px solid var(--accent);
  background: rgba(20, 184, 166, 0.08);
  color: var(--text);
}
pre {
  background: #020617;
  color: #e2e8f0;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
  overflow-x: auto;
}
code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.94em;
}
p > code, li > code {
  background: #1e293b;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 2px 6px;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
  overflow-x: auto;
  display: block;
}
th, td { border: 1px solid var(--border); padding: 8px 10px; text-align: left; }
th { background: rgba(148, 163, 184, 0.12); }
.description {
  margin-top: -2px;
  color: var(--muted);
  font-size: 15px;
}
.source-note {
  margin-top: 28px;
  font-size: 12px;
  color: var(--muted);
}
@media (max-width: 640px) {
  .header-inner { flex-direction: column; align-items: flex-start; }
}
"""

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n?", re.S)


def parse_frontmatter(source: str) -> tuple[str | None, str | None, str]:
    title = None
    description = None
    body = source

    match = FRONTMATTER_RE.match(source)
    if match:
        body = source[match.end() :]
        for line in match.group(1).splitlines():
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            value = value.strip().strip('"').strip("'")
            if key.strip() == "title":
                title = value
            elif key.strip() == "description":
                description = value

    return title, description, body


def rewrite_doc_href(href: str, current_dir: Path) -> str:
    raw = href.strip()
    if not raw:
        return raw

    lowered = raw.lower()
    if raw.startswith("#") or lowered.startswith(("http://", "https://", "mailto:", "tel:", "javascript:")):
        return raw

    target: Path | None = None

    if raw.startswith("/docs/"):
        slug = raw[len("/docs/") :]
        if not Path(slug).suffix:
            slug += ".html"
        else:
            slug = re.sub(r"\.(md|mdx)$", ".html", slug, flags=re.I)
        target = DOCS_ROOT / slug
    elif raw.startswith("docs/"):
        slug = raw[len("docs/") :]
        if not Path(slug).suffix:
            slug += ".html"
        else:
            slug = re.sub(r"\.(md|mdx)$", ".html", slug, flags=re.I)
        target = DOCS_ROOT / slug
    elif raw.endswith((".md", ".mdx")):
        target = current_dir / re.sub(r"\.(md|mdx)$", ".html", raw, flags=re.I)

    if target is None:
        return raw

    rel = os.path.relpath(target.resolve(), start=current_dir.resolve())
    return rel.replace("\\", "/")


def rewrite_anchor_hrefs(rendered_html: str, current_dir: Path) -> str:
    pattern = re.compile(r"href=(\"|')(.*?)(\1)")

    def replace(match: re.Match[str]) -> str:
        quote = match.group(1)
        href = match.group(2)
        rewritten = rewrite_doc_href(href, current_dir)
        return f"href={quote}{rewritten}{quote}"

    return pattern.sub(replace, rendered_html)


def render_file(mdx_path: Path) -> None:
    source = mdx_path.read_text(encoding="utf-8")
    title, description, body = parse_frontmatter(source)

    page_title = title or mdx_path.stem.replace("-", " ").title()
    page_description = description or ""

    md = markdown.Markdown(extensions=["fenced_code", "tables", "sane_lists"])
    rendered = md.convert(body)
    rendered = rewrite_anchor_hrefs(rendered, mdx_path.parent)

    home_href = os.path.relpath(INDEX_PATH, start=mdx_path.parent).replace("\\", "/")
    source_rel = os.path.relpath(mdx_path, start=DOCS_ROOT).replace("\\", "/")
    description_html = (
        f'<p class="description">{html.escape(page_description)}</p>'
        if page_description
        else ""
    )

    html_output = f"""<!doctype html>
<html lang=\"en\">
  <head>
    <meta charset=\"UTF-8\" />
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />
    <title>{html.escape(page_title)} | Vitamem Docs</title>
    <meta name=\"description\" content=\"{html.escape(page_description)}\" />
    <style>{CSS}</style>
  </head>
  <body>
    <header>
      <div class=\"header-inner\">
        <div><span class=\"badge\">Vitamem Docs</span></div>
        <div class=\"header-links\">
          <a href=\"{home_href}#documentation\">Home</a>
          <a href=\"{home_href}#quick-start\">Quick Start</a>
        </div>
      </div>
    </header>

    <main>
      <h1>{html.escape(page_title)}</h1>
      {description_html}
      {rendered}
      <p class=\"source-note\">Source: <code>{html.escape(source_rel)}</code></p>
    </main>
  </body>
</html>
"""

    mdx_path.with_suffix(".html").write_text(html_output, encoding="utf-8")


def main() -> None:
    mdx_files = sorted(p for p in DOCS_ROOT.rglob("*.mdx") if p.is_file())
    for mdx_path in mdx_files:
        render_file(mdx_path)
    print(f"Generated {len(mdx_files)} documentation HTML pages.")


if __name__ == "__main__":
    main()
