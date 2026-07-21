/**
 * 音乐播放器：首屏不加载 APlayer，仅在用户首次点击悬浮按钮后再拉取依赖。
 */
(function () {
  const APLAYER_CSS = 'https://cdn.jsdelivr.net/npm/aplayer@1.10.1/dist/APlayer.min.css'
  const APLAYER_JS = 'https://cdn.jsdelivr.net/npm/aplayer@1.10.1/dist/APlayer.min.js'
  const PLAYLIST = [
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
    if (document.querySelector('link[href="' + href + '"]')) return resolve()
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.onload = resolve
    link.onerror = resolve
    document.head.appendChild(link)
  })

  const loadScript = src => new Promise((resolve, reject) => {
    if (document.querySelector('script[src="' + src + '"]')) return resolve()
    const script = document.createElement('script')
    script.src = src
    script.async = true
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
    btn.innerHTML = '<i class="fas fa-music" aria-hidden="true"></i>'
    document.body.appendChild(btn)
    return btn
  }

  const initPlayer = () => {
    if (window.__blogMusicPlayer || !window.APlayer) return

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
      audio: PLAYLIST
    })

    const launcher = document.getElementById('blog-music-launcher')
    if (launcher) launcher.classList.add('is-hidden')
  }

  const boot = () => {
    if (window.__blogMusicPlayer || loading) return
    loading = true
    const launcher = ensureLauncher()
    launcher.classList.add('is-loading')

    Promise.all([loadCss(APLAYER_CSS), loadScript(APLAYER_JS)])
      .then(function () {
        initPlayer()
        launcher.classList.remove('is-loading')
        launcher.classList.add('is-hidden')
      })
      .catch(function () {
        loading = false
        launcher.classList.remove('is-loading')
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

    // 进入音乐页时自动准备播放器（仍不自动播放）
    if (/\/music\/?$/.test(location.pathname)) {
      window.setTimeout(boot, 600)
    }
  })
})()
