function register ({ registerHook }) {
  registerHook({
    target: 'action:embed.player.loaded',
    handler: async ({ player }) => {
      try {
        if (!isTranscriptEnabled()) return
        if (!player) return

        const uuid = getVideoUuidFromUrl()
        if (!uuid) return

        const segments = await fetchCaptions(uuid)
        if (!segments.length) return

        buildTranscriptSidebar(player, segments)
      } catch (err) {
        console.error('[transcript-sidebar]', err)
      }
    }
  })
}

function isTranscriptEnabled () {
  try {
    return new URLSearchParams(window.location.search).get('transcript') === '1'
  } catch (e) {
    return false
  }
}

function getVideoUuidFromUrl () {
  // Embed URLs look like /videos/embed/{uuid} or /video-playlists/embed/{uuid}
  const parts = window.location.pathname.split('/')
  return parts[parts.length - 1] || null
}

async function fetchCaptions (uuid) {
  const res = await fetch('/api/v1/videos/' + encodeURIComponent(uuid) + '/captions')
  if (!res.ok) return []

  const payload = await res.json()
  const captions = payload.data || payload
  if (!Array.isArray(captions) || captions.length === 0) return []

  const captionPath = captions[0].captionPath || captions[0].path || captions[0].fileUrl
  if (!captionPath) return []

  const captionUrl = new URL(captionPath, window.location.origin).href
  const fileRes = await fetch(captionUrl)
  if (!fileRes.ok) return []

  const text = await fileRes.text()
  return parseVtt(text)
}

function parseVtt (text) {
  var segments = []
  var blocks = text.replace(/\r\n/g, '\n').split(/\n\n+/)

  for (var i = 0; i < blocks.length; i++) {
    var lines = blocks[i].trim().split('\n')
    var timeLine = null
    var textLines = []

    for (var j = 0; j < lines.length; j++) {
      if (lines[j].indexOf('-->') !== -1) {
        timeLine = lines[j]
      } else if (timeLine && lines[j].trim() !== '' && !/^\d+$/.test(lines[j].trim())) {
        textLines.push(lines[j].trim())
      }
    }

    if (timeLine && textLines.length > 0) {
      var startStr = timeLine.split('-->')[0].trim()
      var start = parseTimestamp(startStr)
      segments.push({
        start: start,
        startFormatted: formatDuration(start),
        text: textLines.join(' ').replace(/<[^>]+>/g, '')
      })
    }
  }

  return segments
}

function parseTimestamp (str) {
  str = str.replace(',', '.')
  var parts = str.split(':')
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2])
  } else if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1])
  }
  return 0
}

function formatDuration (seconds) {
  var h = Math.floor(seconds / 3600)
  var m = Math.floor((seconds % 3600) / 60)
  var s = Math.floor(seconds % 60)
  var mm = m < 10 ? '0' + m : '' + m
  var ss = s < 10 ? '0' + s : '' + s
  return h > 0 ? h + ':' + mm + ':' + ss : m + ':' + ss
}

function buildTranscriptSidebar (player, segments) {
  var playerEl = player.el()
  if (!playerEl) return

  // --- Sidebar panel ---
  var sidebar = document.createElement('div')
  sidebar.className = 'vjs-transcript-menu'

  var header = document.createElement('div')
  header.className = 'vjs-transcript-header'

  var title = document.createElement('span')
  title.className = 'vjs-transcript-title'
  title.textContent = 'Transcript'

  var closeBtn = document.createElement('button')
  closeBtn.className = 'vjs-transcript-close'
  closeBtn.type = 'button'
  closeBtn.textContent = '\u00d7'
  closeBtn.setAttribute('aria-label', 'Close transcript')

  header.appendChild(title)
  header.appendChild(closeBtn)
  sidebar.appendChild(header)

  var segmentsContainer = document.createElement('div')
  segmentsContainer.className = 'vjs-transcript-segments'

  var segmentEls = []

  for (var i = 0; i < segments.length; i++) {
    (function (seg) {
      var row = document.createElement('div')
      row.className = 'vjs-transcript-segment'
      row.setAttribute('data-start', seg.start)
      row.setAttribute('tabindex', '0')

      var timeSpan = document.createElement('span')
      timeSpan.className = 'vjs-transcript-time'
      timeSpan.textContent = seg.startFormatted

      var textSpan = document.createElement('span')
      textSpan.className = 'vjs-transcript-text'
      textSpan.textContent = seg.text

      row.appendChild(timeSpan)
      row.appendChild(textSpan)

      row.addEventListener('click', function () {
        player.currentTime(seg.start)
        player.play()
      })

      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          player.currentTime(seg.start)
          player.play()
        }
      })

      segmentsContainer.appendChild(row)
      segmentEls.push(row)
    })(segments[i])
  }

  sidebar.appendChild(segmentsContainer)
  playerEl.appendChild(sidebar)

  // --- Control bar button ---
  var btn = document.createElement('button')
  btn.className = 'vjs-transcript-button vjs-control vjs-button'
  btn.type = 'button'
  btn.title = 'Transcript'
  btn.innerHTML = '<span class="vjs-icon-placeholder" aria-hidden="true">\u2261</span><span class="vjs-control-text">Transcript</span>'

  var controlBar = playerEl.querySelector('.vjs-control-bar')
  if (controlBar) {
    var fullscreenBtn = controlBar.querySelector('.vjs-fullscreen-control')
    if (fullscreenBtn) {
      controlBar.insertBefore(btn, fullscreenBtn)
    } else {
      controlBar.appendChild(btn)
    }
  }

  // --- Toggle open/close ---
  var isOpen = false

  function openSidebar () {
    isOpen = true
    playerEl.classList.add('transcript-menu-displayed')
  }

  function closeSidebar () {
    isOpen = false
    playerEl.classList.remove('transcript-menu-displayed')
  }

  btn.addEventListener('click', function () {
    if (isOpen) closeSidebar()
    else openSidebar()
  })

  closeBtn.addEventListener('click', closeSidebar)

  // --- Highlight active segment ---
  player.on('timeupdate', function () {
    var currentTime = player.currentTime()
    var activeEl = null

    for (var j = 0; j < segmentEls.length; j++) {
      segmentEls[j].classList.remove('vjs-active')
      var segStart = parseFloat(segmentEls[j].getAttribute('data-start'))
      if (segStart <= currentTime) {
        activeEl = segmentEls[j]
      }
    }

    if (activeEl) {
      activeEl.classList.add('vjs-active')
      if (isOpen) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  })
}

export { register }
