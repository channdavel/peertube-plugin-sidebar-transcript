import { parse } from '@plussub/srt-vtt-parser'

function register ({ registerHook, peertubeHelpers }) {
  const logger = peertubeHelpers?.logger || console

  function formatTimestamp (milliseconds) {
    const totalSeconds = Math.max(0, Math.floor((milliseconds || 0) / 1000))
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const secs = totalSeconds % 60

    const pad = val => String(val).padStart(2, '0')
    if (hours > 0) {
      return `${hours}:${pad(minutes)}:${pad(secs)}`
    }
    return `${minutes}:${pad(secs)}`
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
      const { entries = [] } = parse(content)

      return entries
        .map(entry => {
          const start = Number(entry?.from)
          const text = typeof entry?.text === 'string' ? entry.text.trim() : ''
          if (!Number.isFinite(start) || !text) return null

          return {
            start: start / 1000,
            startFormatted: formatTimestamp(start),
            text
          }
        })
        .filter(Boolean)
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
