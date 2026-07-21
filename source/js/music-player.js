/**
 * 全站迷你播放器
 * 优先：网易云歌单（MetingJS）
 * 回退：本地曲目
 * 按需加载：用户点击左下角按钮后再拉依赖
 */
(function () {
  const NETEASE_PLAYLIST_ID = '5355255169'
  const NETEASE_PLAYLIST_URL =
    'https://music.163.com/playlist?id=' + NETEASE_PLAYLIST_ID

  // 一律 https；bootcdn 国内较稳，失败则回退本地曲目
  const APLAYER_CSS = 'https://cdn.bootcdn.net/ajax/libs/aplayer/1.10.1/APlayer.min.css'
  const APLAYER_JS = 'https://cdn.bootcdn.net/ajax/libs/aplayer/1.10.1/APlayer.min.js'
  const METING_JS = 'https://cdn.jsdelivr.net/npm/meting@2.0.1/dist/Meting.min.js'
  // 第三方歌单代理（仅点击播放器后请求；失败 6s 回退本地）
  const METING_API =
    'https://api.injahow.cn/meting/?server=:server&type=:type&id=:id&auth=:auth&r=:r'

  const LOCAL_FALLBACK = [
    {
      name: '宇宙无星河',
      artist: '福合埕在逃牛肉丸',
      url: '/music-files/yu-zhou-wu-xing-he.mp3',
      cover: '/img/optimized/music-cover-yu-zhou-wu-xing-he.webp'
    },
    {
      name: '萤火之森',
      artist: 'CMJ',
      url: '/music-files/ying-huo-zhi-sen.mp3',
      cover: '/img/optimized/music-cover-ying-huo-zhi-sen.webp'
    },
    {
      name: '瞬间的永恒',
      artist: '赵海洋',
      url: '/music-files/shun-jian-de-yong-heng.mp3',
      cover: '/img/optimized/music-cover-shun-jian-de-yong-heng.webp'
    }
  ]

  let loading = false

  const loadCss = href => new Promise(resolve => {
    if (document.querySelector('link[data-blog-music="' + href + '"]')) return resolve()
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.setAttribute('data-blog-music', href)
    link.onload = resolve
    link.onerror = resolve
    document.head.appendChild(link)
  })

  const loadScript = src => new Promise((resolve, reject) => {
    if (document.querySelector('script[data-blog-music="' + src + '"]')) return resolve()
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.setAttribute('data-blog-music', src)
    script.onload = resolve
    script.onerror = reject
    document.body.appendChild(script)
  })

  const ensureLauncher = () => {
    let btn = document.getElementById('blog-music-launcher')
    if (btn) return btn
    btn = document.createElement('button')
    btn.id = 'blog-music-launcher'
    btn.type = 'button'
    btn.className = 'blog-music-launcher'
    btn.setAttribute('aria-label', '打开音乐播放器')
    btn.title = '音乐'
    const icon = document.createElement('i')
    icon.className = 'fas fa-music'
    icon.setAttribute('aria-hidden', 'true')
    btn.appendChild(icon)
    document.body.appendChild(btn)
    return btn
  }

  const hideLauncher = () => {
    const launcher = document.getElementById('blog-music-launcher')
    if (launcher) {
      launcher.classList.remove('is-loading')
      launcher.classList.add('is-hidden')
    }
  }

  const initLocalFallback = () => {
    if (window.__blogMusicPlayer || !window.APlayer) return false

    const container = document.createElement('div')
    container.id = 'blog-music-player'
    document.body.appendChild(container)

    window.__blogMusicPlayer = new APlayer({
      container: container,
      fixed: true,
      mini: true,
      autoplay: false,
      loop: 'all',
      order: 'list',
      preload: 'none',
      volume: 0.45,
      mutex: true,
      audio: LOCAL_FALLBACK
    })
    window.__blogMusicSource = 'local'
    hideLauncher()
    return true
  }

  const initNeteaseMeting = () => {
    if (window.__blogMusicPlayer || document.querySelector('meting-js[data-blog-netease]')) {
      return true
    }
    if (!window.APlayer || typeof customElements === 'undefined') return false

    const meting = document.createElement('meting-js')
    meting.setAttribute('data-blog-netease', '1')
    meting.setAttribute('server', 'netease')
    meting.setAttribute('type', 'playlist')
    meting.setAttribute('id', NETEASE_PLAYLIST_ID)
    meting.setAttribute('fixed', 'true')
    meting.setAttribute('mini', 'true')
    meting.setAttribute('autoplay', 'false')
    meting.setAttribute('loop', 'all')
    meting.setAttribute('order', 'list')
    meting.setAttribute('preload', 'none')
    meting.setAttribute('volume', '0.45')
    meting.setAttribute('mutex', 'true')
    meting.setAttribute('list-folded', 'true')
    meting.setAttribute('api', METING_API)
    document.body.appendChild(meting)

    window.__blogMusicPlayer = true
    window.__blogMusicSource = 'netease'
    hideLauncher()

    // Meting 异步拉歌单，超时则回退本地
    window.setTimeout(function () {
      const hasAplayer = document.querySelector('.aplayer')
      if (!hasAplayer) {
        try { meting.remove() } catch (e) {}
        window.__blogMusicPlayer = null
        initLocalFallback()
      }
    }, 6000)

    return true
  }

  const boot = () => {
    if (window.__blogMusicPlayer || loading) return
    loading = true
    const launcher = ensureLauncher()
    launcher.classList.add('is-loading')

    loadCss(APLAYER_CSS)
      .then(function () { return loadScript(APLAYER_JS) })
      .then(function () { return loadScript(METING_JS) })
      .then(function () {
        if (!initNeteaseMeting()) initLocalFallback()
        launcher.classList.remove('is-loading')
        if (!window.__blogMusicPlayer) loading = false
      })
      .catch(function () {
        // 仅 APlayer 成功时仍可用本地回退
        loadScript(APLAYER_JS)
          .then(function () {
            initLocalFallback()
            launcher.classList.remove('is-loading')
            if (!window.__blogMusicPlayer) loading = false
          })
          .catch(function () {
            loading = false
            launcher.classList.remove('is-loading')
          })
      })
  }

  const onReady = callback => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true })
    } else {
      callback()
    }
  }

  onReady(function () {
    if (window.matchMedia('(prefers-reduced-data: reduce)').matches) return

    const launcher = ensureLauncher()
    launcher.addEventListener('click', boot)

    // 音乐页：自动准备播放器（仍不自动播放）
    if (/\/music\/?$/.test(location.pathname)) {
      window.setTimeout(boot, 400)
    }

    // 供音乐页展示外链
    window.__blogNeteasePlaylist = {
      id: NETEASE_PLAYLIST_ID,
      url: NETEASE_PLAYLIST_URL
    }
  })
})()
