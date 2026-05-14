(function () {
  const onDomReady = callback => {
    let called = false
    const run = () => {
      if (called) return
      called = true
      callback()
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run, { once: true })
    } else {
      run()
    }
  }

  const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(value => {
      window.clearTimeout(timer)
      resolve(value)
    }).catch(error => {
      window.clearTimeout(timer)
      reject(error)
    })
  })

  const loadCss = href => new Promise(resolve => {
    if (document.querySelector(`link[href="${href}"]`)) return resolve()
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.onload = resolve
    document.head.appendChild(link)
  })

  const loadScript = src => new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve()
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.onload = resolve
    script.onerror = reject
    document.body.appendChild(script)
  })

  const initPlayer = () => {
    if (window.__blogMusicPlayer || !window.APlayer) return

    const container = document.createElement('div')
    container.id = 'blog-music-player'
    document.body.appendChild(container)

    window.__blogMusicPlayer = new APlayer({
      container,
      fixed: true,
      mini: true,
      autoplay: false,
      loop: 'all',
      order: 'list',
      preload: 'none',
      volume: 0.45,
      mutex: true,
      audio: [
        {
          name: '宇宙无星河',
          artist: '福合埕在逃牛肉丸',
          url: '/music-files/yu-zhou-wu-xing-he.mp3',
          cover: '/img/music-covers/yu-zhou-wu-xing-he.jpg'
        },
        {
          name: '萤火之森',
          artist: 'CMJ',
          url: '/music-files/ying-huo-zhi-sen.mp3',
          cover: '/img/music-covers/ying-huo-zhi-sen.jpg'
        },
        {
          name: '瞬间的永恒',
          artist: '赵海洋',
          url: '/music-files/shun-jian-de-yong-heng.mp3',
          cover: '/img/music-covers/shun-jian-de-yong-heng.jpg'
        }
      ]
    })
  }

  const start = () => {
    withTimeout(Promise.all([
      loadCss('https://cdn.jsdelivr.net/npm/aplayer@1.10.1/dist/APlayer.min.css'),
      loadScript('https://cdn.jsdelivr.net/npm/aplayer@1.10.1/dist/APlayer.min.js')
    ]), 8000).then(initPlayer).catch(() => {})
  }

  onDomReady(() => window.setTimeout(start, 300))
})()
