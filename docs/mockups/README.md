# Design mockups (12 November 2026)

Source of the second round of mockups made with Claude on a claude.ai design canvas. The canvas itself belongs to one claude.ai account, so its files are kept here to survive an account change.

| Direction | Files | Decision |
| --- | --- | --- |
| **A · Docking** | `A-docking-access.dc.html`, `A-docking-home.dc.html` | **Liked. To implement later** (see "Next tasks" in `CLAUDE.md`) |
| **B · Earthlight** | `B-earthlight-access.dc.html`, `B-earthlight-home.dc.html` | **Chosen and implemented** (live since PR #3) |
| C · White Room | `C-whiteroom-access.dc.html`, `C-whiteroom-home.dc.html` | Not chosen |

Rejected before this round: the "med bay" glass and aurora look (looked AI-made), the "Flight Data File" paper look (too serious, few animations, not intuitive), and a playful round with a mascot, a 70s retro style and an orbit style (too animated, not serious enough for NASA).

## A · Docking in short

The cockpit of a modern spacecraft. Deep black (`#050608`) with a faint 26 px grid, thin lines, safety orange (`#ff6a2b`) for actions, teal (`#4ad3a0`) for nominal, amber (`#ffb547`) for caution. Michroma (wide, NASA-like) for the wordmark and small labels, Barlow Light for titles and big numbers, IBM Plex Mono for data.

- **Access:** a docking reticle with four rings, each offset by a different angle. Every digit typed rotates one ring into alignment and lights its marker orange, while a radar sweep turns in the background. When all four are aligned: "DOCKING COMPLETE", the centre (the fingerprint button) turns teal, and "ALIGNMENT 4/4 · LATCH OK · NOMINAL".
- **Home:** body silhouette with an orange scan line and diamond markers per system (a pinging amber one on the heart), "7/8 NOMINAL" in large light numerals, a caution box, thin bars per system, an orange "BEGIN DAILY CHECK" button, telemetry tiles (live ECG trace, blood pressure in amber, oxygen bar, radiation arc), and a bottom bar STATUS · LOG · TRENDS · FORECAST.

## Reading the files

They are `.dc.html` components for the claude.ai design canvas: plain HTML with inline styles, `{{holes}}` filled by a small `DCLogic` class at the bottom, and `<sc-if>` / `<sc-for>` for conditions and loops. They do not run on their own in a browser; use them as an exact visual and behavioural reference (colours, sizes, animations, copy) when rebuilding a direction in the real app.
