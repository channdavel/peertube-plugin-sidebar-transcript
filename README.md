# Peertube Plugin Sidebar Transcript

A PeerTube plugin that adds a sliding transcript sidebar to the video player, allowing viewers to read and navigate captions in real time. Works on both the watch page and in OEmbed/iframe embeds.

## Requirements

- PeerTube >= 6.0.0
- Videos must have at least one caption/subtitle file (WebVTT) uploaded

## Installation

### Via PeerTube Admin UI

1. Navigate to **Administration → Plugins/Themes**
2. Search for `peertube-plugin-sidebar-transcript`
3. Click **Install**

## Configuration

No global configuration is required. The plugin is self-contained and activates automatically on any video that has captions available.

## Usage

The transcript sidebar is activated via the `?transcript=1` query parameter on the video or embed URL. When active:

1. A **≡ (transcript) button** appears in the player control bar.
2. Clicking the button slides open a sidebar panel on the right side of the player.
3. The sidebar displays all caption segments with timestamps. The currently playing segment is highlighted and auto-scrolled into view.
4. Clicking any segment **seeks the video** to that timecode and begins playback.
5. Clicking outside the sidebar or when the player becomes inactive, the sidebar closes automatically.

### Sharing with transcript enabled

When a video has captions, a **"Include transcript"** checkbox is injected into the PeerTube share/embed modal. Checking it appends `?transcript=1` to the share URL so recipients see the transcript sidebar automatically.

## Behaviour notes

- **Caption selection** — the plugin uses the first available caption track returned by the PeerTube captions API (`/api/v1/videos/{uuid}/captions`).
- **VTT parsing** — the client-side parser handles standard WebVTT timing lines (`HH:MM:SS.mmm --> HH:MM:SS.mmm`), normalising comma decimal separators and optional hour components.
- **Keyboard accessible** — transcript segments are focusable and respond to Enter/Space for seeking.
- **Responsive** — on viewports narrower than 300 px the sidebar expands to full width instead of a fixed 300 px panel.
- **Scopes** — the client script is registered for both `embed` and `common` scopes, so the sidebar works on the main watch page as well as standalone embeds.
- **No-op when inactive** — if `?transcript=1` is not present in the URL, no sidebar components are injected and no caption data is fetched, keeping overhead at zero for normal playback.

## Limitations

- Only the **first** caption track is displayed; there is no language selector within the sidebar.
- Does not currently support **live/streaming** captions — only pre-uploaded VTT files.
- The sidebar overlays the right edge of the video; on very narrow players the video area may become small.

## Maintainers

- University Library System, University of Pittsburgh

## License

GNU AGPLv3
