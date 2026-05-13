(function () {
  const root = document.documentElement
  const title = document.getElementById('site-title')
  if (!title) return

  const subtitles = {
    light: [
      '在代码、风景与日常之间',
      '把问题写清楚，也把生活过明亮',
      '沿着樱花路，慢慢整理灵感',
      '晴天适合学习，也适合重新开始',
      '把今天学会的东西，留给明天的自己',
      '写代码，也写那些一闪而过的好天气',
      '从一个小问题开始，抵达更开阔的地方',
      '愿每一次提交，都比昨天更清楚一点',
      '让知识像风景一样，被认真收藏',
      '慢慢写，慢慢修，慢慢变成自己的世界',
      '把复杂拆小，把日子过亮',
      '今天也在路上，和新的想法相遇',
      '阳光很好，适合整理笔记和心情',
      '在明亮的页面里，记录一点真实的成长'
    ],
    dark: [
      '在星空和终端之间，保存一点安静',
      '夜深了，适合把想法写成文字',
      '把零散的光，整理成可以回看的记录',
      '愿今晚的 bug 都有温柔的答案',
      '把白天没想通的事，交给夜色慢慢展开',
      '星光落在湖面，也落在未完成的草稿里',
      '夜晚适合复盘，也适合重新出发',
      '在安静里写下今天的变量和心事',
      '愿所有报错，都指向更清晰的方向',
      '把灵感暂存，等明天继续编译',
      '月色很轻，适合读文档，也适合想远方',
      '在深蓝色的时间里，慢慢把自己调亮',
      '给深夜一点秩序，给明天一点线索',
      '如果世界安静下来，就继续写吧'
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
