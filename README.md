# Peertube Plugin Sidebar Transcript

A PeerTube plugin that adds a sliding transcript sidebar to the video player, allowing viewers to read and navigate captions in real time. Works in OEmbed/iframe embeds.

## Requirements

* PeerTube >= 6.0.0 (tested on 7.2.3 and 8.1.3)
* Videos must have at least one caption/subtitle file (WebVTT or SRT) uploaded

## Installation

### Via PeerTube Admin UI

1. Navigate to **Administration → Settings → Plugins/Themes**
2. Click **Search plugins**
3. Search for `peertube-plugin-sidebar-transcript`
4. Click **Install**

### Via CLI

```bash
# For production instances:
cd /var/www/peertube/peertube-latest
sudo -u peertube NODE_CONFIG_DIR=/var/www/peertube/config NODE_ENV=production npm run plugin:install -- --npm-name peertube-plugin-sidebar-transcript

# Or from a local path:
sudo -u peertube NODE_CONFIG_DIR=/var/www/peertube/config NODE_ENV=production npm run plugin:install -- --plugin-path /path/to/peertube-plugin-sidebar-transcript
```

## Configuration

No global configuration is required. The plugin is self-contained and activates automatically on any embed that includes the `transcript=1` URL parameter.

## Usage

Add the `transcript=1` parameter to your embed URL to enable the transcript sidebar:

```html
<iframe
  title="My Video"
  width="560"
  height="315"
  src="https://your-peertube-instance.com/videos/embed/VIDEO-UUID?transcript=1"
  frameborder="0"
  allowfullscreen
  sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
></iframe>
```

When active:

1. A **≡ (transcript) button** appears in the player control bar.
2. Clicking the button slides open a sidebar panel on the right side of the player.
3. The sidebar displays all caption segments with timestamps. The currently playing segment is highlighted and auto-scrolled into view.
4. Clicking any segment **seeks the video** to that timecode and begins playback.
5. Clicking the × button or the transcript button again closes the sidebar.

## Behaviour notes

* **Caption selection** — the plugin uses the first available caption track returned by the PeerTube captions API (`/api/v1/videos/{uuid}/captions`).
* **VTT/SRT parsing** — uses the `@plussub/srt-vtt-parser` library to parse both WebVTT and SRT caption formats.
* **Keyboard accessible** — transcript segments are focusable and respond to Enter/Space for seeking.
* **Responsive** — on viewports narrower than 300px the sidebar expands to full width instead of a fixed 300px panel.
* **Scopes** — the client script is registered for the `embed` scope, so the sidebar works in standalone embeds and iframes.
* **No-op when inactive** — if `?transcript=1` is not present in the URL, no sidebar components are injected and no caption data is fetched, keeping overhead at zero for normal playback.

## Limitations

* Only the **first** caption track is displayed; there is no language selector within the sidebar.
* Does not currently support **live/streaming** captions — only pre-uploaded VTT/SRT files.
* The sidebar overlays the right edge of the video; on very narrow players the video area may become small.
* The **Share modal** does not currently include a checkbox to append `?transcript=1` automatically — the parameter must be added manually to embed URLs.

## Development

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Build output goes to dist/
```

## Maintainers

* University Library System, University of Pittsburgh

## License

GNU AGPLv3