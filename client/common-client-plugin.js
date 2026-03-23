function register ({ registerHook, peertubeHelpers }) {
  const logger = peertubeHelpers?.logger || console

  function parseTimestamp (timestamp) {
    if (!timestamp || typeof timestamp !== 'string') return null
    const normalized = timestamp.trim().replace(',', '.').replace(/\s+/g, ' ')
    const match = normalized.match(/^(?:([0-9]{1,2}):)?([0-9]{1,2}):([0-9]{2})(?:\.[0-9]{1,3})?$/)
    if (!match) return null

    const hours = Number(match[1] || 0)
    const minutes = Number(match[2] || 0)
    const seconds = Number(match[3] || 0)
    if (Number.isNaN(hours) || Number.isNaN(minutes) || Number.isNaN(seconds)) return null

    return hours * 3600 + minutes * 60 + seconds
  }

  function formatTimestamp (seconds) {
    const totalSeconds = Math.max(0, Math.floor(seconds || 0))
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const secs = totalSeconds % 60

    const pad = val => String(val).padStart(2, '0')
    if (hours > 0) {
      return `${hours}:${pad(minutes)}:${pad(secs)}`
    }
    return `${minutes}:${pad(secs)}`
  }

  function parseCaptions (content) {
    if (!content || typeof content !== 'string') return []
    const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const lines = normalized.split('\n')

    const blocks = []
    let current = []
    for (const line of lines) {
      if (line.trim() === '') {
        if (current.length > 0) {
          blocks.push(current)
          current = []
        }
      } else {
        current.push(line)
      }
    }
    if (current.length > 0) blocks.push(current)

    const segments = []
    for (const block of blocks) {
      const timingLine = block.find(line => line.includes('-->'))
      if (!timingLine) continue

      const [startRaw] = timingLine.split('-->')
      const start = parseTimestamp(startRaw.trim())
      if (start === null) continue

      const textLines = block.slice(block.indexOf(timingLine) + 1)
      const text = textLines.map(line => line.trim()).filter(Boolean).join(' ')
      if (!text) continue

      segments.push({
        start,
        startFormatted: formatTimestamp(start),
        text
      })
    }

    return segments.sort((a, b) => a.start - b.start)
  }

  async function fetchCaptionsForVideo (uuid) {
    if (!uuid) return []
    try {
      const captionsResponse = await fetch(`/api/v1/videos/${encodeURIComponent(uuid)}/captions`)
      if (!captionsResponse.ok) {
        logger.warn('Transcript sidebar: captions API returned', captionsResponse.status)
        return []
      }
      const payload = await captionsResponse.json()
      const caption = payload?.data?.[0]
      if (!caption) return []

      const rawUrl = caption.captionPath || caption.path || caption.fileUrl || caption.url
      if (!rawUrl) return []

      let captionUrl
      try {
        captionUrl = new URL(rawUrl, window.location.origin).href
      } catch (err) {
        logger.warn('Transcript sidebar: invalid caption URL', rawUrl)
        return []
      }

      const fileResponse = await fetch(captionUrl)
      if (!fileResponse.ok) {
        logger.warn('Transcript sidebar: caption file fetch failed', fileResponse.status)
        return []
      }

      const content = await fileResponse.text()
      return parseCaptions(content)
    } catch (error) {
      logger.error('Transcript sidebar: failed to load captions', error)
      return []
    }
  }

  function ensureTranscriptPlugin (videojs) {
    if (!videojs || typeof videojs !== 'function') return

    const PluginBase = videojs.getPlugin('plugin') || (class {})

    if (!videojs.getComponent('TranscriptMenu')) {
      class TranscriptMenu extends videojs.getComponent('Component') {
        constructor (player, options) {
          super(player, options)
          this.options_ = options || {}
          this.segmentElements = []
          this.onPlayerClick = this.onPlayerClick.bind(this)
          this.onUserInactive = this.onUserInactive.bind(this)
          this.player().on('click', this.onPlayerClick)
          this.player().on('userinactive', this.onUserInactive)
        }

        dispose () {
          this.player().off('click', this.onPlayerClick)
          this.player().off('userinactive', this.onUserInactive)
          super.dispose()
        }

        createEl () {
          const menu = super.createEl('div', {
            className: 'vjs-transcript-menu',
            tabIndex: -1
          })

          const header = super.createEl('div', { className: 'vjs-transcript-header' })
          const title = super.createEl('div', {
            className: 'vjs-transcript-title',
            innerText: this.player().localize ? this.player().localize('Transcript') : 'Transcript'
          })

          const closeButton = super.createEl('button', {
            className: 'vjs-transcript-close',
            type: 'button',
            innerText: '×',
            tabIndex: -1,
            ariaLabel: this.player().localize ? this.player().localize('Close transcript') : 'Close transcript'
          })
          closeButton.addEventListener('click', () => this.close())

          header.appendChild(title)
          header.appendChild(closeButton)

          this.segmentsContainer = super.createEl('div', { className: 'vjs-transcript-segments' })
          menu.appendChild(header)
          menu.appendChild(this.segmentsContainer)

          this.currentSegmentIndex = -1
          return menu
        }

        setSegments (segments) {
          if (!Array.isArray(segments)) return
          this.options_.segments = segments
          this.renderSegments()
        }

        renderSegments () {
          this.segmentElements = []
          if (!this.segmentsContainer) return
          this.segmentsContainer.innerHTML = ''

          const segments = this.options_.segments || []
          for (const segment of segments) {
            const segmentEl = super.createEl('div', {
              className: 'vjs-transcript-segment',
              tabIndex: 0
            })
            segmentEl.dataset.start = String(segment.start)

            const left = super.createEl('span', {
              className: 'vjs-transcript-time',
              innerText: segment.startFormatted
            })
            const right = super.createEl('span', {
              className: 'vjs-transcript-text',
              innerText: segment.text
            })

            segmentEl.appendChild(left)
            segmentEl.appendChild(right)

            const seekAction = () => {
              this.player().currentTime(segment.start)
              this.player().play()
            }

            segmentEl.addEventListener('click', seekAction)
            segmentEl.addEventListener('keydown', event => {
              if (event.code === 'Enter' || event.code === 'Space') {
                event.preventDefault()
                seekAction()
              }
            })

            this.segmentsContainer.appendChild(segmentEl)
            this.segmentElements.push(segmentEl)
          }
        }

        onPlayerClick (event) {
          const target = event.target
          if (!target || !this.el()) return

          if (this.el().contains(target) || this.player().controlBar?.el()?.contains(target)) {
            return
          }
          this.close()
        }

        onUserInactive () {
          this.close()
        }

        open () {
          this.player().addClass('transcript-menu-displayed')
        }

        close () {
          this.player().removeClass('transcript-menu-displayed')
        }

        update (currentTime) {
          const segments = this.options_.segments || []
          if (!segments.length || !this.segmentElements.length || Number.isNaN(currentTime)) return

          let activeIndex = -1
          for (let i = segments.length - 1; i >= 0; i--) {
            if (segments[i].start <= currentTime) {
              activeIndex = i
              break
            }
          }

          if (activeIndex === -1) {
            this.segmentElements.forEach(el => el.classList.remove('vjs-active'))
            return
          }

          this.segmentElements.forEach(el => el.classList.remove('vjs-active'))
          const activeEl = this.segmentElements[activeIndex]
          if (!activeEl) return

          activeEl.classList.add('vjs-active')
          activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }
      }

      videojs.registerComponent('TranscriptMenu', TranscriptMenu)
    }

    if (!videojs.getComponent('TranscriptButton')) {
      class TranscriptButton extends videojs.getComponent('Button') {
        constructor (player, options) {
          super(player, options)
          this.options_ = options || {}
        }

        createEl () {
          const el = super.createEl('button', {
            className: 'vjs-transcript-button vjs-control vjs-button',
            type: 'button',
            innerHTML: '<span class="vjs-icon-placeholder">≡</span>',
            title: this.player().localize ? this.player().localize('Transcript') : 'Transcript'
          })

          el.addEventListener('click', () => {
            const menu = this.player().getChild('TranscriptMenu')
            if (!menu) return
            if (this.player().hasClass('transcript-menu-displayed')) {
              menu.close()
            } else {
              menu.open()
            }
          })

          return el
        }
      }

      videojs.registerComponent('TranscriptButton', TranscriptButton)
    }

    if (!videojs.getPlugin('transcript')) {
      class TranscriptPlugin extends PluginBase {
        constructor (player, options) {
          super(player, options)
          this.player = player
          this.options = options || {}
          this.player.addClass('vjs-transcript')

          this.transcriptMenu = new (videojs.getComponent('TranscriptMenu'))(player, this.options)
          player.addChild(this.transcriptMenu)

          const controlBar = player.getChild('controlBar')
          if (controlBar) {
            const insertIndex = Math.max(controlBar.children().length - 1, 0)
            this.transcriptButton = new (videojs.getComponent('TranscriptButton'))(player, { transcriptMenu: this.transcriptMenu })
            controlBar.addChild(this.transcriptButton, {}, insertIndex)
          }

          this.player.on('timeupdate', () => {
            this.transcriptMenu.update(this.player.currentTime())
          })
        }

        dispose () {
          this.player.removeClass('vjs-transcript')
          if (this.transcriptMenu) {
            this.transcriptMenu.dispose()
            this.player.removeChild(this.transcriptMenu)
          }
          if (this.transcriptButton && this.player.controlBar) {
            this.player.controlBar.removeChild(this.transcriptButton)
            this.transcriptButton.dispose()
          }
          super.dispose && super.dispose()
        }
      }

      videojs.registerPlugin('transcript', function (options) {
        if (this.transcriptInstance) {
          return this.transcriptInstance
        }
        this.transcriptInstance = new TranscriptPlugin(this, options)
        if (options && options.segments) {
          const menu = this.getChild('TranscriptMenu')
          menu?.setSegments(options.segments)
        }
        return this.transcriptInstance
      })
    }
  }

  function isTranscriptEnabled () {
    if (typeof window === 'undefined' || typeof window.location === 'undefined') return false
    return new URL(window.location.href).searchParams.get('transcript') === '1'
  }

  function addTranscriptQueryToUrl (url, enabled) {
    try {
      const transformed = new URL(url, window.location.href)
      if (enabled) {
        transformed.searchParams.set('transcript', '1')
      } else {
        transformed.searchParams.delete('transcript')
      }
      return transformed.toString()
    } catch (e) {
      return url
    }
  }

  function initShareModalCheckbox () {
    const placeholder = document.querySelector('#plugin-placeholder-share-modal-video-settings')
    if (!placeholder || placeholder.querySelector('.transcript-share-checkbox')) return

    const row = document.createElement('div')
    row.className = 'transcript-share-checkbox'
    row.style.marginTop = '12px'

    const label = document.createElement('label')
    label.style.fontSize = '0.9rem'
    label.style.display = 'flex'
    label.style.alignItems = 'center'
    label.style.gap = '8px'

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.setAttribute('aria-label', 'Include transcript in embed URL')

    const text = document.createElement('span')
    text.innerText = 'Include transcript'

    label.appendChild(checkbox)
    label.appendChild(text)
    row.appendChild(label)
    placeholder.appendChild(row)

    const updateEmbedInput = () => {
      const modal = placeholder.closest('.modal') || document.body
      const embedInput = modal.querySelector('textarea,input[type="text"],input[type="url"]')
      if (!embedInput) return
      embedInput.value = addTranscriptQueryToUrl(embedInput.value, checkbox.checked)
      embedInput.dispatchEvent(new Event('input', { bubbles: true }))
    }

    checkbox.addEventListener('change', updateEmbedInput)

    // update when modal content changes
    const sharedObserver = new MutationObserver(() => {
      if (checkbox.checked) {
        updateEmbedInput()
      }
    })
    sharedObserver.observe(placeholder, { childList: true, subtree: true })
  }

  function observeShareModal () {
    if (typeof MutationObserver === 'undefined') return

    const body = document.body
    if (!body) return

    const observer = new MutationObserver(() => {
      const placeholder = document.querySelector('#plugin-placeholder-share-modal-video-settings')
      if (placeholder) initShareModalCheckbox()
    })

    observer.observe(body, { childList: true, subtree: true })
    initShareModalCheckbox()
  }

  registerHook('action:video-watch.video.loaded', async ({ video }) => {
    if (!video?.uuid) return
    try {
      const data = await fetch(`/api/v1/videos/${encodeURIComponent(video.uuid)}/captions`)
      if (!data.ok) return
      const json = await data.json()
      if (Array.isArray(json.data) && json.data.length > 0) {
        initShareModalCheckbox()
      }
    } catch (err) {
      logger.error('Transcript sidebar: error checking captions for share modal', err)
    }
  })

  registerHook('action:video-watch.player.loaded', async ({ player, video, videojs }) => {
    if (!isTranscriptEnabled()) return
    if (!video?.uuid || !player) return

    observeShareModal()
    ensureTranscriptPlugin(videojs || window.videojs)

    const segments = await fetchCaptionsForVideo(video.uuid)
    if (!segments.length) return

    if (typeof player.transcript === 'function') {
      player.transcript({ segments })
    }
  })

  registerHook('action:embed.player.loaded', async ({ player, video, videojs }) => {
    if (!isTranscriptEnabled()) return
    if (!video?.uuid || !player) return

    ensureTranscriptPlugin(videojs || window.videojs)

    const segments = await fetchCaptionsForVideo(video.uuid)
    if (!segments.length) return

    if (typeof player.transcript === 'function') {
      player.transcript({ segments })
    }
  })
}

export {
  register
}
