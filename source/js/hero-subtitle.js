(function () {
  const root = document.documentElement
  const title = document.getElementById('site-title')
  if (!title) return

  const subtitles = {
    light: [
      '先读随笔，再读文章——随便点开就好',
      '在代码、风景与日常之间',
      '写得出就写，写不出就先活着',
      '把今天的一句，留给以后的自己',
      '阳光很好，适合读一段短的',
      '建站手记可以跳过，故事不用'
    ],
    dark: [
      '夜深了，适合读完一条随笔',
      '在星空和终端之间，保存一点安静',
      '把零散的光，整理成可以回看的记录',
      '如果世界安静下来，就继续读吧',
      '月色很轻，适合想远方，也适合翻旧句',
      '评论可留言，微信可点绿标复制'
    ]
  }

  let index = -1
  let timer

  const currentMode = () => root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'

  const setSubtitle = text => {
    title.classList.add('subtitle-changing')
    window.setTimeout(() => {
      title.style.setProperty('--hero-subtitle', `"${text}"`)
      title.classList.remove('subtitle-changing')
    }, 240)
  }

  const nextSubtitle = reset => {
    const pool = subtitles[currentMode()]
    index = reset ? 0 : (index + 1) % pool.length
    setSubtitle(pool[index])
  }

  const start = () => {
    window.clearInterval(timer)
    nextSubtitle(true)
    timer = window.setInterval(() => nextSubtitle(false), 4600)
  }

  const observer = new MutationObserver(mutations => {
    const changed = mutations.some(mutation => mutation.attributeName === 'data-theme')
    if (!changed) return
    start()
  })

  observer.observe(root, { attributes: true })
  start()
})()
