# vitamem Brand Assets

## Logo

| File | Use |
|---|---|
| `logo-concept-a.svg` | Primary logo mark. Site header, README (via raw GitHub URL), and marketing. |

Public documentation site: **[vitamem.dev](https://vitamem.dev/)** (deployed via Vercel).

The mark is a continuous thread line passing through three lifecycle state nodes (active, cooling, dormant), ending in a memory spiral. Monochrome-first.

For the npm package README, the image URL must point at GitHub raw content (the published tarball does not include `website/`):

`https://raw.githubusercontent.com/yuw321/Vitamem/main/website/public/brand/logo-concept-a.svg`

## Social & Preview Images

| File | Use |
|---|---|
| `social-preview.png` | GitHub social preview / OG image. Dark navy with flowing thread lines and lifecycle nodes. 1280x640. |

Use `social-preview.png` as the GitHub repository social preview image (Settings → Social preview).

## Color Palette

| Name | Hex | Role |
|---|---|---|
| Deep Navy | `#1a1f36` | Primary / text / logo / active state |
| Slate Blue | `#5b6b8a` | Accent / links / cooling state |
| Cool Gray | `#8e9ab5` | Secondary / dormant state |
| Light Gray | `#cbd5e1` | Closed state / borders |
| Off White | `#f8fafc` | Background |
| Forest Green | `#3b7a57` | Success / memory stored |

Visual reference: `colors.svg`

## Diagrams

| File | Content |
|---|---|
| `lifecycle-diagram.svg` | Thread lifecycle: active → cooling → dormant → closed |
| `memory-pipeline-diagram.svg` | Memory pipeline: extract → dedup → store → compress → retrieve |

## Animated Demos

| File | Duration | Content |
|---|---|---|
| `thread-lifecycle-demo.mp4` | 6s | Animated thread lifecycle: nodes appear in sequence (active → cooling → dormant → closed) with the "100x insight" callout. |
| `memory-pipeline-demo.mp4` | 7s | Animated memory pipeline: extract → dedup → store → retrieve, with dedup thresholds and 3-tier compression. |

Use these for launch posts, social media, README hero sections, and product demos.

## Typography

- **UI / Docs:** System sans-serif stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`
- **Code:** Monospace: `'SF Mono', 'Fira Code', 'Cascadia Code', monospace`
- **Headings:** Same sans-serif, weight 600-700
