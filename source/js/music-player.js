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
          name: 'Daylight Notes',
          artist: 'SoundHelix',
          url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
          cover: '/img/optimized/music-day.webp'
        },
        {
          name: 'Night Lake',
          artist: 'SoundHelix',
          url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
          cover: '/img/optimized/music-night.webp'
        },
        {
          name: 'Quiet Compile',
          artist: 'SoundHelix',
          url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
          cover: '/img/optimized/music-avatar.webp'
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
