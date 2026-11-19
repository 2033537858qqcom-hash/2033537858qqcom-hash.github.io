'use strict'

/**
 * 保留随笔页数据副本于 #body-wrap 内（#article-container 之外、.js-pjax 之外），
 * 防止 PJAX 局部替换或主题脚本先改写 #article-container 时丢失 #shuoshuo-data。
 */
const DATA_RE = /<script type="application\/json" id="shuoshuo-data">([\s\S]*?)<\/script>/

hexo.extend.filter.register('after_render:html', str => {
  if (typeof str !== 'string' || !str.includes('id="shuoshuo-data"')) return str
  if (str.includes('id="moments-years-data"')) return str

  const match = str.match(DATA_RE)
  if (!match) return str

  const payload = `<script type="application/json" id="moments-years-data">${match[1]}</script>`
  if (str.includes('</main>')) {
    return str.replace('</main>', `${payload}</main>`)
  }
  if (str.includes('</body>')) {
    return str.replace('</body>', `${payload}</body>`)
  }
  return str
}, 20)
