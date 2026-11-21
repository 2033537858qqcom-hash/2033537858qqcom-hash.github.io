/**
 * 栖居原生玻璃态音乐引擎 (Zero-Dependency Sanctuary Music Engine)
 * - 零外部 APlayer/MetingJS 阻塞，点击即播站内完整高品质纯音，并按需流式加载网易云歌单（支持千首检索、LRC 同步歌词、自动跳过失效源、试听片段温和标注）。
 * - 统一建筑感磨砂胶囊：稳驻左下角湖畔留白槽（left: 16px, bottom: 64px），与天时罗盘 (#sanctuary-dock) 垂直对齐、弹窗互斥，绝不遮挡正文卡片。
 * - 跨 PJAX 无缝续播 + MediaSession 系统媒体键 + Alt+M 快捷键 + /music/ 专属听音室 + 静观模式底部快捷控制。
 */
(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (window.__blogMusicEngineInit) return
  window.__blogMusicEngineInit = true

  const NETEASE_PLAYLIST_ID = '5355255169'
  const NETEASE_PLAYLIST_URL = 'https://music.163.com/playlist?id=' + NETEASE_PLAYLIST_ID
  const METING_ENDPOINTS = [
    'https://api.injahow.cn/meting/?server=netease&type=playlist&id=' + NETEASE_PLAYLIST_ID,
    'https://api.i-meto.com/meting/api?server=netease&type=playlist&id=' + NETEASE_PLAYLIST_ID
  ]

  const PREF_KEY = 'blog_music_prefs_v2'

  const LOCAL_TRACKS = [
    {
      id: 'local-1',
      name: '宇宙无星河',
      artist: '福合埕在逃牛肉丸',
      url: '/music-files/yu-zhou-wu-xing-he.mp3',
      cover: '/img/optimized/music-cover-yu-zhou-wu-xing-he.webp',
      source: 'local',
      note: '星河未落，晚风先至 · 站内完整纯音'
    },
    {
      id: 'local-2',
      name: '萤火之森',
      artist: 'CMJ',
      url: '/music-files/ying-huo-zhi-sen.mp3',
      cover: '/img/optimized/music-cover-ying-huo-zhi-sen.webp',
      source: 'local',
      note: '林间微光，穿过仲夏湖岸 · 站内完整纯音'
    },
    {
      id: 'local-3',
      name: '瞬间的永恒',
      artist: '赵海洋',
      url: '/music-files/shun-jian-de-yong-heng.mp3',
      cover: '/img/optimized/music-cover-shun-jian-de-yong-heng.webp',
      source: 'local',
      note: '琴键轻落，替山谷留住这一刻 · 站内完整纯音'
    }
  ]

  const MODES = ['list', 'one', 'shuffle']
  const MODE_LABELS = { list: '列表循环', one: '单曲循环', shuffle: '随机漫游' }

  const state = {
    sourceTab: 'local', // 'local' | 'netease'
    neteaseTracks: [],
    neteaseStatus: 'idle', // 'idle' | 'loading' | 'ready' | 'error'
    neteaseLimit: 40,
    searchQuery: '',
    currentTrack: LOCAL_TRACKS[0],
    currentList: 'local',
    currentIndex: 0,
    playing: false,
    loadingAudio: false,
    currentTime: 0,
    duration: 0,
    volume: 0.55,
    muted: false,
    mode: 'list',
    drawerOpen: false,
    isSnippet: false,
    statusNote: '',
    lyrics: [],
    activeLyric: ''
  }

  try {
    const saved = JSON.parse(localStorage.getItem(PREF_KEY) || 'null')
    if (saved && typeof saved === 'object') {
      if (typeof saved.volume === 'number' && saved.volume >= 0 && saved.volume <= 1) {
        state.volume = saved.volume
      }
      if (MODES.includes(saved.mode)) state.mode = saved.mode
    }
  } catch (e) {}

  const savePrefs = () => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({
        volume: state.volume,
        mode: state.mode
      }))
    } catch (e) {}
  }

  const audio = new Audio()
  audio.preload = 'metadata'
  audio.volume = state.volume
  let skipGuard = 0
  let statusTimer = 0
  const lyricCache = new Map()

  const escapeHtml = value => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  const formatTime = sec => {
    if (!Number.isFinite(sec) || sec < 0) return '00:00'
    const s = Math.floor(sec)
    const mm = String(Math.floor(s / 60)).padStart(2, '0')
    const ss = String(s % 60).padStart(2, '0')
    return mm + ':' + ss
  }

  const getActiveList = listKey => (listKey === 'netease' ? state.neteaseTracks : LOCAL_TRACKS)

  const setTransientNote = msg => {
    state.statusNote = msg || ''
    window.clearTimeout(statusTimer)
    if (msg) {
      statusTimer = window.setTimeout(() => {
        state.statusNote = ''
        syncAllUI()
      }, 3600)
    }
    syncAllUI()
  }

  /* ==========================================================================
     LRC Synced Lyrics Parser
     ========================================================================== */
  const parseLrc = text => {
    if (!text) return []
    const lines = []
    const rawLines = String(text).split(/\r?\n/)
    for (let i = 0; i < rawLines.length; i += 1) {
      const line = rawLines[i]
      const content = line.replace(/\[[^\]]*\]/g, '').trim()
      if (!content) continue
      const matches = [...line.matchAll(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g)]
      for (let m = 0; m < matches.length; m += 1) {
        const min = parseInt(matches[m][1], 10)
        const sec = parseInt(matches[m][2], 10)
        const frac = matches[m][3] ? parseInt(matches[m][3].padEnd(3, '0'), 10) / 1000 : 0
        lines.push({ time: min * 60 + sec + frac, text: content })
      }
    }
    lines.sort((a, b) => a.time - b.time)
    return lines
  }

  const loadLyricsForTrack = track => {
    state.lyrics = []
    state.activeLyric = (track && track.note) || ''
    if (!track || !track.lrc) return
    if (lyricCache.has(track.lrc)) {
      state.lyrics = lyricCache.get(track.lrc)
      updateActiveLyric()
      return
    }
    if (typeof window.fetch !== 'function') return
    window.fetch(track.lrc)
      .then(res => (res.ok ? res.text() : ''))
      .then(text => {
        const parsed = parseLrc(text)
        lyricCache.set(track.lrc, parsed)
        if (state.currentTrack && state.currentTrack.id === track.id) {
          state.lyrics = parsed
          updateActiveLyric()
          syncAllUI()
        }
      })
      .catch(() => {})
  }

  const updateActiveLyric = () => {
    if (!state.lyrics.length) {
      state.activeLyric = (state.currentTrack && state.currentTrack.note) || ''
      return
    }
    const t = audio.currentTime + 0.25
    let active = state.lyrics[0].text
    for (let i = 0; i < state.lyrics.length; i += 1) {
      if (state.lyrics[i].time <= t) active = state.lyrics[i].text
      else break
    }
    state.activeLyric = active
  }

  /* ==========================================================================
     MediaSession & Playback Events
     ========================================================================== */
  const updateMediaSession = () => {
    if (!('mediaSession' in navigator) || !state.currentTrack) return
    try {
      const t = state.currentTrack
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.name || '未知曲目',
        artist: t.artist || 'Rogue_l 歌单',
        album: t.source === 'local' ? '站内精选纯音' : '网易云歌单',
        artwork: t.cover ? [{ src: t.cover, sizes: '256x256', type: 'image/webp' }] : []
      })
      navigator.mediaSession.playbackState = state.playing ? 'playing' : 'paused'
    } catch (e) {}
  }

  const bindMediaSessionHandlers = () => {
    if (!('mediaSession' in navigator)) return
    try {
      navigator.mediaSession.setActionHandler('play', () => play())
      navigator.mediaSession.setActionHandler('pause', () => pause())
      navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack())
      navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack())
    } catch (e) {}
  }

  const emitPlaybackEvent = () => {
    const title = state.currentTrack ? state.currentTrack.name : ''
    document.documentElement.classList.toggle('has-music-playing', state.playing)
    try {
      window.dispatchEvent(new CustomEvent(state.playing ? 'blog:music-play' : 'blog:music-pause', {
        detail: { title, artist: state.currentTrack ? state.currentTrack.artist : '', playing: state.playing }
      }))
      window.dispatchEvent(new CustomEvent('blog:music-state', {
        detail: {
          playing: state.playing,
          track: state.currentTrack,
          lyric: state.activeLyric
        }
      }))
    } catch (e) {}
  }

  /* ==========================================================================
     Core Audio Control
     ========================================================================== */
  const selectTrack = (listKey, index, autoPlay) => {
    const list = getActiveList(listKey)
    if (!list.length) return
    const safeIdx = ((index % list.length) + list.length) % list.length
    const track = list[safeIdx]
    state.currentList = listKey
    state.currentIndex = safeIdx
    state.currentTrack = track
    state.currentTime = 0
    state.duration = 0
    state.isSnippet = false
    state.loadingAudio = true

    audio.src = track.url
    audio.load()
    loadLyricsForTrack(track)
    updateMediaSession()

    if (autoPlay) {
      play()
    } else {
      syncAllUI()
    }
  }

  const play = () => {
    if (!audio.src && state.currentTrack) {
      audio.src = state.currentTrack.url
      loadLyricsForTrack(state.currentTrack)
    }
    state.loadingAudio = true
    syncAllUI()
    const p = audio.play()
    if (p && typeof p.then === 'function') {
      p.then(() => {
        skipGuard = 0
        state.loadingAudio = false
        state.playing = true
        updateMediaSession()
        emitPlaybackEvent()
        syncAllUI()
      }).catch(() => {
        state.loadingAudio = false
        state.playing = false
        syncAllUI()
      })
    }
  }

  const pause = () => {
    audio.pause()
    state.playing = false
    state.loadingAudio = false
    updateMediaSession()
    emitPlaybackEvent()
    syncAllUI()
  }

  const togglePlay = () => {
    if (state.playing) pause()
    else play()
  }

  const nextTrack = () => {
    const list = getActiveList(state.currentList)
    if (!list.length) return
    let nextIdx = state.currentIndex + 1
    if (state.mode === 'shuffle' && list.length > 1) {
      do {
        nextIdx = Math.floor(Math.random() * list.length)
      } while (nextIdx === state.currentIndex)
    }
    selectTrack(state.currentList, nextIdx, true)
  }

  const prevTrack = () => {
    const list = getActiveList(state.currentList)
    if (!list.length) return
    const prevIdx = (state.currentIndex - 1 + list.length) % list.length
    selectTrack(state.currentList, prevIdx, true)
  }

  const cycleMode = () => {
    const idx = MODES.indexOf(state.mode)
    state.mode = MODES[(idx + 1) % MODES.length]
    savePrefs()
    setTransientNote('播放模式：' + MODE_LABELS[state.mode])
  }

  const setVolume = v => {
    const val = Math.max(0, Math.min(1, Number(v)))
    if (Number.isNaN(val)) return
    state.volume = val
    state.muted = val === 0
    audio.volume = val
    audio.muted = state.muted
    savePrefs()
    syncProgressAndVolumeUI()
  }

  const seekToRatio = ratio => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return
    const r = Math.max(0, Math.min(1, ratio))
    audio.currentTime = audio.duration * r
    state.currentTime = audio.currentTime
    updateActiveLyric()
    syncProgressAndVolumeUI()
  }

  audio.addEventListener('loadedmetadata', () => {
    state.duration = Number.isFinite(audio.duration) ? audio.duration : 0
    state.isSnippet = Boolean(
      state.currentTrack &&
      state.currentTrack.source === 'netease' &&
      state.duration > 0 &&
      state.duration < 45
    )
    syncAllUI()
  })

  audio.addEventListener('playing', () => {
    skipGuard = 0
    state.playing = true
    state.loadingAudio = false
    updateMediaSession()
    emitPlaybackEvent()
    syncAllUI()
  })

  audio.addEventListener('pause', () => {
    if (!audio.ended) {
      state.playing = false
      state.loadingAudio = false
      updateMediaSession()
      emitPlaybackEvent()
      syncAllUI()
    }
  })

  audio.addEventListener('timeupdate', () => {
    state.currentTime = audio.currentTime || 0
    if (Number.isFinite(audio.duration)) state.duration = audio.duration
    const prevLrc = state.activeLyric
    updateActiveLyric()
    syncProgressAndVolumeUI()
    if (prevLrc !== state.activeLyric) syncLyricNodes()
  })

  audio.addEventListener('ended', () => {
    if (state.mode === 'one') {
      audio.currentTime = 0
      play()
    } else {
      nextTrack()
    }
  })

  audio.addEventListener('error', () => {
    state.loadingAudio = false
    if (!state.playing && !audio.src) return
    skipGuard += 1
    if (state.currentList === 'netease' && skipGuard <= 5 && state.neteaseTracks.length > 1) {
      setTransientNote('该曲受版权限制，已自动切至下一首')
      nextTrack()
    } else if (state.currentList === 'netease') {
      skipGuard = 0
      setTransientNote('外链曲目暂不可播，已为您切回站内精选完整纯音')
      selectTrack('local', 0, true)
    } else {
      state.playing = false
      setTransientNote('音频加载受阻，请稍后再试')
      emitPlaybackEvent()
    }
  })

  /* ==========================================================================
     Lazy NetEase Playlist Fetcher (Multi-Mirror + Graceful Cache)
     ========================================================================== */
  const fetchNeteasePlaylist = () => {
    if (state.neteaseStatus === 'loading' || state.neteaseStatus === 'ready') return
    if (typeof window.fetch !== 'function') {
      state.neteaseStatus = 'error'
      syncAllUI()
      return
    }
    state.neteaseStatus = 'loading'
    syncAllUI()

    const tryIdx = idx => {
      if (idx >= METING_ENDPOINTS.length) {
        state.neteaseStatus = 'error'
        syncAllUI()
        return
      }
      window.fetch(METING_ENDPOINTS[idx], { mode: 'cors', credentials: 'omit' })
        .then(res => (res.ok ? res.json() : Promise.reject(new Error('HTTP ' + res.status))))
        .then(data => {
          if (!Array.isArray(data) || !data.length) throw new Error('empty')
          state.neteaseTracks = data
            .filter(item => item && item.url)
            .map((item, i) => ({
              id: 'ne-' + i + '-' + (item.name || ''),
              name: String(item.name || item.title || '未命名曲目'),
              artist: String(item.artist || item.author || '未知歌手'),
              url: String(item.url).replace(/^http:\/\//i, 'https://'),
              cover: item.pic ? String(item.pic).replace(/^http:\/\//i, 'https://') : '/img/avatar.jpg',
              lrc: item.lrc ? String(item.lrc).replace(/^http:\/\//i, 'https://') : '',
              source: 'netease',
              note: ''
            }))
          state.neteaseStatus = state.neteaseTracks.length ? 'ready' : 'error'
          syncAllUI()
        })
        .catch(() => tryIdx(idx + 1))
    }

    tryIdx(0)
  }

  /* ==========================================================================
     SVG Architectural Icons (Zero Emoji / Zero FontAwesome Missing Glyphs)
     ========================================================================== */
  const ICONS = {
    play: '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M4.2 2.8a.7.7 0 0 1 1.05-.6l8.1 5.2a.7.7 0 0 1 0 1.2l-8.1 5.2a.7.7 0 0 1-1.05-.6V2.8Z"/></svg>',
    pause: '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><rect x="3.4" y="2.6" width="3.1" height="10.8" rx="1"/><rect x="9.5" y="2.6" width="3.1" height="10.8" rx="1"/></svg>',
    prev: '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><rect x="2.6" y="3" width="1.8" height="10" rx=".8"/><path d="M13 3.2a.6.6 0 0 0-.93-.5L5.2 7.5a.6.6 0 0 0 0 1l6.87 4.8a.6.6 0 0 0 .93-.5V3.2Z"/></svg>',
    next: '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><rect x="11.6" y="3" width="1.8" height="10" rx=".8"/><path d="M3 3.2a.6.6 0 0 1 .93-.5l6.87 4.8a.6.6 0 0 1 0 1L3.93 13.3a.6.6 0 0 1-.93-.5V3.2Z"/></svg>',
    chevron: '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10l4-4 4 4"/></svg>',
    vol: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.2h2.6l3.4-2.8v9.2L5.1 9.8H2.5V6.2Z"/><path d="M11 5.6a3.5 3.5 0 0 1 0 4.8M12.9 3.8a6 6 0 0 1 0 8.4"/></svg>',
    list: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M2.5 4.2h11M2.5 8h11M2.5 11.8h7"/></svg>',
    one: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11.8 4.2H5.2a3 3 0 0 0-3 3v.6M4.2 11.8h6.6a3 3 0 0 0 3-3v-.6"/><path d="M10.2 2.4L12 4.2 10.2 6M5.8 10L4 11.8l1.8 1.8"/><text x="8" y="9.8" text-anchor="middle" font-size="5.6" fill="currentColor" stroke="none" font-weight="700">1</text></svg>',
    shuffle: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.2 4.5h2.2l5.2 7h3.8M11.6 9.8l2 1.7-2 1.7M2.2 11.5h2.2l1.6-2.2M9.2 5.9l.4-.6h3.8M11.6 2.8l2 1.7-2 1.7"/></svg>'
  }

  /* ==========================================================================
     Compact Bottom-Left Architectural Music Pill & Popover Drawer
     ========================================================================== */
  const setDrawerOpen = open => {
    state.drawerOpen = Boolean(open)
    const drawer = document.getElementById('sanctuary-music-drawer')
    const toggleBtn = document.getElementById('sanctuary-music-expand')
    if (drawer) drawer.hidden = !state.drawerOpen
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', state.drawerOpen ? 'true' : 'false')
    const rootEl = document.getElementById('sanctuary-music')
    if (rootEl) rootEl.classList.toggle('is-open', state.drawerOpen)
    if (state.drawerOpen) {
      // Close atmosphere popover so popovers never overlap!
      const atmPop = document.getElementById('sanctuary-popover')
      if (atmPop && !atmPop.hidden) {
        atmPop.hidden = true
        const wb = document.getElementById('sanctuary-weather-btn')
        if (wb) wb.setAttribute('aria-expanded', 'false')
      }
      if (state.sourceTab === 'netease' && state.neteaseStatus === 'idle') {
        fetchNeteasePlaylist()
      }
      syncAllUI()
    }
  }

  const ensureFloatingWidget = () => {
    if (!document.body) return null
    let wrap = document.getElementById('sanctuary-music')
    if (wrap) return wrap

    wrap = document.createElement('div')
    wrap.id = 'sanctuary-music'
    wrap.className = 'sanctuary-music'
    wrap.innerHTML =
      '<div class="sanctuary-music__pill">' +
        '<button type="button" id="blog-music-launcher" class="sanctuary-music__playbtn" aria-label="播放或暂停音乐" title="播放 / 暂停 (Alt+M)">' +
          '<img class="sanctuary-music__cover" id="sanctuary-music-cover" src="' + LOCAL_TRACKS[0].cover + '" alt="" width="28" height="28">' +
          '<span class="sanctuary-music__playoverlay" id="sanctuary-music-playicon">' + ICONS.play + '</span>' +
        '</button>' +
        '<button type="button" id="sanctuary-music-expand" class="sanctuary-music__info" aria-expanded="false" title="展开歌单与歌词">' +
          '<span class="sanctuary-music__eq" aria-hidden="true"><i></i><i></i><i></i></span>' +
          '<span class="sanctuary-music__title" id="sanctuary-music-title">' + escapeHtml(LOCAL_TRACKS[0].name) + '</span>' +
          '<span class="sanctuary-music__chev">' + ICONS.chevron + '</span>' +
        '</button>' +
      '</div>' +
      '<div class="sanctuary-music__drawer" id="sanctuary-music-drawer" hidden>' +
        '<div class="sm-drawer__head">' +
          '<img class="sm-drawer__art" id="sm-drawer-art" src="' + LOCAL_TRACKS[0].cover + '" alt="" width="54" height="54">' +
          '<div class="sm-drawer__meta">' +
            '<div class="sm-drawer__name" id="sm-drawer-name">' + escapeHtml(LOCAL_TRACKS[0].name) + '</div>' +
            '<div class="sm-drawer__artist" id="sm-drawer-artist">' + escapeHtml(LOCAL_TRACKS[0].artist) + '</div>' +
            '<div class="sm-drawer__lyric" id="sm-drawer-lyric">' + escapeHtml(LOCAL_TRACKS[0].note) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="sm-drawer__progress">' +
          '<div class="sm-scrub" data-sm-scrub role="slider" aria-label="播放进度" tabindex="0">' +
            '<div class="sm-scrub__fill" id="sm-drawer-fill"></div>' +
          '</div>' +
          '<div class="sm-times">' +
            '<span id="sm-drawer-cur">00:00</span>' +
            '<span class="sm-snippet-badge" id="sm-drawer-snippet" hidden>试听片段</span>' +
            '<span id="sm-drawer-dur">00:00</span>' +
          '</div>' +
        '</div>' +
        '<div class="sm-drawer__controls">' +
          '<button type="button" class="sm-ctrl-btn" data-sm-mode title="切换播放模式" id="sm-drawer-mode">' + ICONS.list + '</button>' +
          '<div class="sm-ctrl-main">' +
            '<button type="button" class="sm-ctrl-btn" data-sm-prev aria-label="上一首">' + ICONS.prev + '</button>' +
            '<button type="button" class="sm-ctrl-btn sm-ctrl-btn--primary" data-sm-toggle aria-label="播放或暂停" id="sm-drawer-play">' + ICONS.play + '</button>' +
            '<button type="button" class="sm-ctrl-btn" data-sm-next aria-label="下一首">' + ICONS.next + '</button>' +
          '</div>' +
          '<label class="sm-vol" title="调节音量">' +
            '<span class="sm-vol__ico">' + ICONS.vol + '</span>' +
            '<input type="range" class="sm-vol__slider" data-sm-volume min="0" max="1" step="0.02" value="' + state.volume + '" aria-label="音量">' +
          '</label>' +
        '</div>' +
        '<div class="sm-drawer__note" id="sm-drawer-note" hidden></div>' +
        '<div class="sm-drawer__tabs" role="tablist">' +
          '<button type="button" role="tab" data-sm-tab="local" class="is-active">站内精选 (' + LOCAL_TRACKS.length + ')</button>' +
          '<button type="button" role="tab" data-sm-tab="netease" id="sm-tab-netease">网易云歌单</button>' +
        '</div>' +
        '<div class="sm-drawer__search" id="sm-drawer-search-wrap" hidden>' +
          '<input type="search" id="sm-drawer-search" data-sm-search placeholder="检索歌名或歌手…" autocomplete="off">' +
        '</div>' +
        '<div class="sm-drawer__list" id="sm-drawer-list"></div>' +
        '<div class="sm-drawer__foot">' +
          '<a href="/music/">进入完整听音室 →</a>' +
          '<a href="' + NETEASE_PLAYLIST_URL + '" target="_blank" rel="noopener noreferrer">网易云原歌单</a>' +
        '</div>' +
      '</div>'

    document.body.appendChild(wrap)
    return wrap
  }

  /* ==========================================================================
     Dedicated /music/ Sanctuary Music Studio Hydration
     ========================================================================== */
  const hydrateMusicPageStudio = () => {
    const mount = document.getElementById('sanctuary-music-studio')
    if (!mount) return
    if (!mount.dataset.hydrated) {
      mount.dataset.hydrated = '1'
      mount.innerHTML =
        '<div class="sm-studio__stage">' +
          '<div class="sm-studio__artwrap">' +
            '<img class="sm-studio__art" id="sm-studio-art" src="' + (state.currentTrack ? state.currentTrack.cover : LOCAL_TRACKS[0].cover) + '" alt="" width="116" height="116">' +
          '</div>' +
          '<div class="sm-studio__body">' +
            '<div class="sm-studio__eyebrow" id="sm-studio-source">站内精选 · 完整纯音</div>' +
            '<h2 class="sm-studio__title" id="sm-studio-name"></h2>' +
            '<div class="sm-studio__artist" id="sm-studio-artist"></div>' +
            '<p class="sm-studio__lyric" id="sm-studio-lyric"></p>' +
            '<div class="sm-studio__progress">' +
              '<div class="sm-scrub" data-sm-scrub role="slider" aria-label="播放进度" tabindex="0">' +
                '<div class="sm-scrub__fill" id="sm-studio-fill"></div>' +
              '</div>' +
              '<div class="sm-times">' +
                '<span id="sm-studio-cur">00:00</span>' +
                '<span class="sm-snippet-badge" id="sm-studio-snippet" hidden>试听片段</span>' +
                '<span id="sm-studio-dur">00:00</span>' +
              '</div>' +
            '</div>' +
            '<div class="sm-studio__controls">' +
              '<button type="button" class="sm-ctrl-btn" data-sm-mode title="切换播放模式" id="sm-studio-mode">' + ICONS.list + '</button>' +
              '<button type="button" class="sm-ctrl-btn" data-sm-prev aria-label="上一首">' + ICONS.prev + '</button>' +
              '<button type="button" class="sm-ctrl-btn sm-ctrl-btn--primary" data-sm-toggle aria-label="播放或暂停" id="sm-studio-play">' + ICONS.play + '</button>' +
              '<button type="button" class="sm-ctrl-btn" data-sm-next aria-label="下一首">' + ICONS.next + '</button>' +
              '<label class="sm-vol" title="调节音量">' +
                '<span class="sm-vol__ico">' + ICONS.vol + '</span>' +
                '<input type="range" class="sm-vol__slider" data-sm-volume min="0" max="1" step="0.02" value="' + state.volume + '" aria-label="音量">' +
              '</label>' +
            '</div>' +
            '<div class="sm-studio__ambient">' +
              '<span class="sm-studio__ambient-label">叠加自然环境声</span>' +
              '<button type="button" data-sound-pick="rain">细雨</button>' +
              '<button type="button" data-sound-pick="breeze">松风</button>' +
              '<button type="button" data-sound-pick="fire">炉火</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="sm-studio__note" id="sm-studio-note" hidden></div>' +
        '<div class="sm-studio__library">' +
          '<div class="sm-studio__bar">' +
            '<div class="sm-drawer__tabs" role="tablist">' +
              '<button type="button" role="tab" data-sm-tab="local" class="is-active">站内精选 (' + LOCAL_TRACKS.length + ')</button>' +
              '<button type="button" role="tab" data-sm-tab="netease" id="sm-studio-tab-netease">网易云歌单</button>' +
            '</div>' +
            '<input type="search" class="sm-studio__search" id="sm-studio-search" data-sm-search placeholder="在歌单里检索歌名或歌手…" autocomplete="off">' +
          '</div>' +
          '<div class="sm-studio__list" id="sm-studio-list"></div>' +
        '</div>'

      if (state.neteaseStatus === 'idle') fetchNeteasePlaylist()
    }

    // Bind lazy legacy NetEase iframe toggle (zero console SecurityError on page load!)
    const legacyDetails = document.getElementById('netease-legacy-details')
    if (legacyDetails && !legacyDetails.dataset.bound) {
      legacyDetails.dataset.bound = '1'
      legacyDetails.addEventListener('toggle', () => {
        if (!legacyDetails.open) return
        const box = document.getElementById('netease-embed')
        if (box && !box.querySelector('iframe')) {
          const iframe = document.createElement('iframe')
          iframe.className = 'music-page__iframe'
          iframe.title = '网易云音乐外链歌单'
          iframe.setAttribute('frameborder', 'no')
          iframe.setAttribute('marginwidth', '0')
          iframe.setAttribute('marginheight', '0')
          iframe.width = '100%'
          iframe.height = '430'
          iframe.src = 'https://music.163.com/outchain/player?type=0&id=' + NETEASE_PLAYLIST_ID + '&auto=0&height=430'
          iframe.referrerPolicy = 'no-referrer-when-downgrade'
          iframe.allow = 'autoplay *; encrypted-media *'
          box.replaceChildren(iframe)
        }
      })
    }

    syncAllUI()
  }

  /* ==========================================================================
     UI Synchronization
     ========================================================================== */
  const renderTrackListHtml = (listKey, maxVisible) => {
    if (listKey === 'netease') {
      if (state.neteaseStatus === 'loading') {
        return '<div class="sm-list__empty">正在同步网易云歌单…</div>'
      }
      if (state.neteaseStatus === 'error') {
        return '<div class="sm-list__empty">歌单接口暂时繁忙，<button type="button" class="sm-inline-btn" data-sm-retry>点击重试</button> 或先聆听站内完整纯音。</div>'
      }
      if (!state.neteaseTracks.length) {
        return '<div class="sm-list__empty">歌单暂未加载，<button type="button" class="sm-inline-btn" data-sm-retry>点击同步</button></div>'
      }
    }

    const fullList = getActiveList(listKey)
    const q = state.searchQuery.trim().toLowerCase()
    const matched = []
    for (let i = 0; i < fullList.length; i += 1) {
      const t = fullList[i]
      if (!q || t.name.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)) {
        matched.push({ track: t, idx: i })
      }
    }
    if (!matched.length) {
      return '<div class="sm-list__empty">没有找到包含「' + escapeHtml(state.searchQuery) + '」的曲目</div>'
    }

    const slice = matched.slice(0, maxVisible)
    const rows = slice.map(({ track, idx }) => {
      const isCur = state.currentList === listKey && state.currentIndex === idx
      return (
        '<button type="button" class="sm-track' + (isCur ? ' is-current' : '') + (isCur && state.playing ? ' is-playing' : '') + '" data-sm-pick-list="' + listKey + '" data-sm-pick-idx="' + idx + '">' +
          '<span class="sm-track__num">' + (isCur ? '<span class="sanctuary-music__eq"><i></i><i></i><i></i></span>' : String(idx + 1).padStart(2, '0')) + '</span>' +
          '<span class="sm-track__info">' +
            '<span class="sm-track__name">' + escapeHtml(track.name) + '</span>' +
            '<span class="sm-track__artist">' + escapeHtml(track.artist) + '</span>' +
          '</span>' +
          (track.source === 'local' ? '<span class="sm-track__badge">完整</span>' : '') +
        '</button>'
      )
    }).join('')

    const moreBtn = matched.length > maxVisible
      ? '<button type="button" class="sm-list__more" data-sm-more>展开更多（已显 ' + slice.length + ' / ' + matched.length + ' 首）</button>'
      : ''

    return rows + moreBtn
  }

  const syncLyricNodes = () => {
    const text = state.activeLyric || (state.currentTrack && state.currentTrack.note) || (state.playing ? '正在聆听…' : '轻点播放，伴着山水慢慢逛')
    const l1 = document.getElementById('sm-drawer-lyric')
    const l2 = document.getElementById('sm-studio-lyric')
    if (l1 && l1.textContent !== text) l1.textContent = text
    if (l2 && l2.textContent !== text) l2.textContent = text
  }

  const syncProgressAndVolumeUI = () => {
    const pct = state.duration > 0 ? Math.min(100, Math.max(0, (state.currentTime / state.duration) * 100)) : 0
    const curStr = formatTime(state.currentTime)
    const durStr = formatTime(state.duration)

    ;['sm-drawer-fill', 'sm-studio-fill'].forEach(id => {
      const el = document.getElementById(id)
      if (el) el.style.width = pct.toFixed(2) + '%'
    })
    ;['sm-drawer-cur', 'sm-studio-cur'].forEach(id => {
      const el = document.getElementById(id)
      if (el) el.textContent = curStr
    })
    ;['sm-drawer-dur', 'sm-studio-dur'].forEach(id => {
      const el = document.getElementById(id)
      if (el) el.textContent = durStr
    })
    document.querySelectorAll('[data-sm-volume]').forEach(slider => {
      if (document.activeElement !== slider) slider.value = String(state.volume)
    })
  }

  function syncAllUI () {
    const wrap = ensureFloatingWidget()
    if (!wrap) return
    const t = state.currentTrack || LOCAL_TRACKS[0]
    wrap.classList.toggle('is-playing', state.playing)
    wrap.classList.toggle('is-loading', state.loadingAudio)

    const coverEl = document.getElementById('sanctuary-music-cover')
    if (coverEl && coverEl.getAttribute('src') !== t.cover) coverEl.setAttribute('src', t.cover)
    const titleEl = document.getElementById('sanctuary-music-title')
    if (titleEl) titleEl.textContent = t.name
    const playOverlay = document.getElementById('sanctuary-music-playicon')
    if (playOverlay) playOverlay.innerHTML = state.playing ? ICONS.pause : ICONS.play

    const setImg = (id, src) => {
      const el = document.getElementById(id)
      if (el && el.getAttribute('src') !== src) el.setAttribute('src', src)
    }
    const setText = (id, txt) => {
      const el = document.getElementById(id)
      if (el) el.textContent = txt
    }
    setImg('sm-drawer-art', t.cover)
    setImg('sm-studio-art', t.cover)
    setText('sm-drawer-name', t.name)
    setText('sm-studio-name', t.name)
    setText('sm-drawer-artist', t.artist)
    setText('sm-studio-artist', t.artist)
    setText('sm-studio-source', t.source === 'local' ? '站内精选 · 完整纯音' : '网易云歌单 · 在线流媒体')

    const studioArt = document.getElementById('sm-studio-art')
    if (studioArt) studioArt.classList.toggle('is-spinning', state.playing)

    ;['sm-drawer-play', 'sm-studio-play'].forEach(id => {
      const el = document.getElementById(id)
      if (el) el.innerHTML = state.playing ? ICONS.pause : ICONS.play
    })
    ;['sm-drawer-mode', 'sm-studio-mode'].forEach(id => {
      const el = document.getElementById(id)
      if (el) {
        el.innerHTML = ICONS[state.mode] || ICONS.list
        el.title = '播放模式：' + MODE_LABELS[state.mode]
      }
    })
    ;['sm-drawer-snippet', 'sm-studio-snippet'].forEach(id => {
      const el = document.getElementById(id)
      if (el) el.hidden = !state.isSnippet
    })
    ;['sm-drawer-note', 'sm-studio-note'].forEach(id => {
      const el = document.getElementById(id)
      if (el) {
        el.hidden = !state.statusNote
        el.textContent = state.statusNote
      }
    })

    const neLabel = state.neteaseTracks.length ? ('网易云歌单 (' + state.neteaseTracks.length + ')') : '网易云歌单'
    setText('sm-tab-netease', neLabel)
    setText('sm-studio-tab-netease', neLabel)

    document.querySelectorAll('[data-sm-tab]').forEach(btn => {
      btn.classList.toggle('is-active', btn.getAttribute('data-sm-tab') === state.sourceTab)
    })

    const searchWrap = document.getElementById('sm-drawer-search-wrap')
    if (searchWrap) searchWrap.hidden = state.sourceTab !== 'netease'

    const drawerList = document.getElementById('sm-drawer-list')
    if (drawerList && state.drawerOpen) {
      drawerList.innerHTML = renderTrackListHtml(state.sourceTab, state.neteaseLimit)
    }
    const studioList = document.getElementById('sm-studio-list')
    if (studioList) {
      studioList.innerHTML = renderTrackListHtml(state.sourceTab, state.neteaseLimit)
    }

    syncLyricNodes()
    syncProgressAndVolumeUI()
  }

  /* ==========================================================================
     Event Delegation & Global API
     ========================================================================== */
  document.addEventListener('click', event => {
    const target = event.target
    if (!target || !target.closest) return

    if (target.closest('#blog-music-launcher')) {
      event.stopPropagation()
      togglePlay()
      return
    }

    if (target.closest('#sanctuary-music-expand')) {
      event.stopPropagation()
      setDrawerOpen(!state.drawerOpen)
      return
    }

    if (target.closest('[data-sm-toggle]')) {
      event.stopPropagation()
      togglePlay()
      return
    }

    if (target.closest('[data-sm-prev]')) {
      event.stopPropagation()
      prevTrack()
      return
    }

    if (target.closest('[data-sm-next]')) {
      event.stopPropagation()
      nextTrack()
      return
    }

    if (target.closest('[data-sm-mode]')) {
      event.stopPropagation()
      cycleMode()
      return
    }

    const tabBtn = target.closest('[data-sm-tab]')
    if (tabBtn) {
      event.stopPropagation()
      const nextTab = tabBtn.getAttribute('data-sm-tab') || 'local'
      state.sourceTab = nextTab
      state.neteaseLimit = 40
      if (nextTab === 'netease' && state.neteaseStatus === 'idle') {
        fetchNeteasePlaylist()
      }
      syncAllUI()
      return
    }

    if (target.closest('[data-sm-retry]')) {
      event.stopPropagation()
      state.neteaseStatus = 'idle'
      fetchNeteasePlaylist()
      return
    }

    if (target.closest('[data-sm-more]')) {
      event.stopPropagation()
      state.neteaseLimit += 40
      syncAllUI()
      return
    }

    const pickBtn = target.closest('[data-sm-pick-idx]')
    if (pickBtn) {
      event.stopPropagation()
      const listKey = pickBtn.getAttribute('data-sm-pick-list') || 'local'
      const idx = parseInt(pickBtn.getAttribute('data-sm-pick-idx'), 10)
      if (!Number.isNaN(idx)) {
        if (state.currentList === listKey && state.currentIndex === idx) {
          togglePlay()
        } else {
          selectTrack(listKey, idx, true)
        }
      }
      return
    }

    const scrub = target.closest('[data-sm-scrub]')
    if (scrub) {
      event.stopPropagation()
      const rect = scrub.getBoundingClientRect()
      if (rect.width > 0) {
        seekToRatio((event.clientX - rect.left) / rect.width)
      }
      return
    }

    if (state.drawerOpen && !target.closest('#sanctuary-music')) {
      setDrawerOpen(false)
    }
  })

  document.addEventListener('input', event => {
    const target = event.target
    if (!target) return
    if (target.matches && target.matches('[data-sm-volume]')) {
      setVolume(target.value)
    } else if (target.matches && target.matches('[data-sm-search]')) {
      state.searchQuery = target.value || ''
      state.neteaseLimit = 40
      document.querySelectorAll('[data-sm-search]').forEach(el => {
        if (el !== target) el.value = state.searchQuery
      })
      if (state.sourceTab !== 'netease' && state.searchQuery.trim()) {
        state.sourceTab = 'netease'
        if (state.neteaseStatus === 'idle') fetchNeteasePlaylist()
      }
      syncAllUI()
    }
  })

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && state.drawerOpen) {
      setDrawerOpen(false)
    } else if (event.altKey && (event.key === 'm' || event.key === 'M')) {
      event.preventDefault()
      togglePlay()
    }
  })

  window.addEventListener('blog:sanctuary-popover-open', () => {
    if (state.drawerOpen) setDrawerOpen(false)
  })

  window.__blogNeteasePlaylist = {
    id: NETEASE_PLAYLIST_ID,
    url: NETEASE_PLAYLIST_URL
  }

  window.__blogMusic = {
    play,
    pause,
    togglePlay,
    nextTrack,
    prevTrack,
    setDrawerOpen,
    getState: () => ({
      playing: state.playing,
      track: state.currentTrack,
      lyric: state.activeLyric,
      source: state.currentList
    })
  }

  const init = () => {
    ensureFloatingWidget()
    bindMediaSessionHandlers()
    hydrateMusicPageStudio()
    syncAllUI()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true })
  } else {
    init()
  }
  document.addEventListener('pjax:complete', () => {
    ensureFloatingWidget()
    hydrateMusicPageStudio()
  })
})()
