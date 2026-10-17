/**
 * 从 tools/netease-events.json 按动态 ID 合并进 source/_data/shuoshuo.yml。
 * 已有随笔只补配乐链接和配图说明，不改写正文。新动态才追加。
 * 配图下载到 source/img/moments/netease/*.webp。
 *
 * 用法：
 *   pnpm run moments:sync
 *   # 或分步：
 *   node tools/fetch-netease-events.mjs
 *   node tools/migrate-netease-shuoshuo.mjs
 *   # 跳过图片下载（仅文）：  node tools/migrate-netease-shuoshuo.mjs --no-images
 *   # 强制重下图片：        node tools/migrate-netease-shuoshuo.mjs --force-images
 */
import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const eventsPath = path.join(root, 'tools/netease-events.json')
const rawEventsPath = path.join(root, 'tools/netease-events-raw.json')
const outPath = path.join(root, 'source/_data/shuoshuo.yml')
const reportPath = path.join(root, 'tools/netease-migrate-report.json')
const imgDir = path.join(root, 'source/img/moments/netease')

const args = new Set(process.argv.slice(2))
const noImages = args.has('--no-images')
const forceImages = args.has('--force-images')

/**
 * 明确不发布的动态 ID。
 * 攻击 6 条、活动模板 11 条、与博客雨夜随笔重复的 1 条。
 * 37956681393 为 10/1 姥姥相关动态，明确不发布（连同其下评论）。
 * 2026-10-01 且正文写到姥姥的动态由 isGrandmaHold 拦截（当时尚未进入这份归档）。
 */
const DENY_IDS = new Set([
  30566223206, 30360088008, 24833936828, 24799678762, 24799654752, 24788275255,
  37677442659, 37659617772, 30590773110, 30522558536, 30451293552,
  30326740319, 30226227155, 30218964535, 30153228260, 24900907186, 24530486663,
  37694195909,
  37956681393
])

const HIDDEN_TAGS = new Set(['随笔', '配乐', '配图'])

let sharp = null
try {
  sharp = require('sharp')
} catch {
  console.warn('[migrate] sharp 不可用，将保存原图扩展名（建议 pnpm add -D sharp）')
}

const raw = JSON.parse(fs.readFileSync(eventsPath, 'utf8'))

/** 对他人攻击 / 指名道姓发泄 */
function isAttack (msg) {
  const t = msg || ''
  if (/送你对象这是什么意思/.test(t)) return true
  if (/终极joker|顶级joker/.test(t) && t.length < 200) return true
  if (/有点素质行吗|真是双标/.test(t)) return true
  if (/血透淋淋的骂|真是反人类/.test(t)) return true
  if (/狐朋狗友/.test(t)) return true
  if (/理念不同不应该一起|大手大脚又挺/.test(t)) return true
  return false
}

function isSpam (msg) {
  const t = (msg || '').trim()
  if (!t) return true
  if (/^推荐了《/.test(t) && t.length < 40) return true
  if (/云贴贴红包|年度听歌报告|晒晒我的三代村民证|这是我的脑回路/.test(t) && t.length < 100) return true
  if (/哇！这些年我听歌赚了/.test(t)) return true
  if (/^#云贴贴|^#2023年度|^#晒晒/.test(t)) return true
  return false
}

function cleanMsg (msg) {
  let t = String(msg).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  t = t.replace(/\n?(?:#[^\n#]+#\s*)+$/g, '').trim()
  t = t.replace(/[ \t]+\n/g, '\n')
  t = t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\uFEFF]/g, '')
  const fixups = [
    [/\uFFFD+途一片迷茫/g, '前途一片迷茫'],
    [/结\uFFFD+了/g, '结束了'],
    [/才\uFFFD+年/g, '才两年'],
    [/大\uFFFD+姐/g, '大小姐'],
    [/不得\uFFFD+/g, '不得已']
  ]
  for (const [re, to] of fixups) t = t.replace(re, to)
  t = t.replace(/\uFFFD+/g, '…')
  t = t.replace(/\u2011|\u2012|\u2013|\u2014|\u2015|﹣/g, '—')
  return t.trim()
}

function extractTags (msg) {
  const tags = []
  const t = msg
  if (/雨|雨夜|雨声|打在/.test(t)) tags.push('雨')
  if (/夜|深夜|失眠|夜深/.test(t)) tags.push('夜')
  if (/高考|考试|毕业/.test(t)) tags.push('回忆')
  if (/梦|梦见/.test(t)) tags.push('梦')
  if (/杭州|实习/.test(t)) tags.push('杭州')
  if (/读后|打卡《|观后|影片|电影|小说/.test(t)) tags.push('观感')
  if (msg.length >= 300) tags.push('长文')
  return tags
}

function isDuplicateRain (msg) {
  return /不知从何写起/.test(msg) && /阴雨天持续了两周/.test(msg)
}

function isWorthKeeping (msg) {
  const t = msg.trim()
  if (t.length < 35) return false
  if (t.length < 50) {
    const poetic = /[，。；！？…—、]/.test(t) && t.split('\n').length >= 2
    if (!poetic) return false
  }
  return true
}

function isGrandmaHold (msg, date) {
  return String(date || '').startsWith('2026-10-01') && /姥姥|外婆/.test(msg || '')
}

function visibleTags (tags) {
  return (tags || []).filter(tag => tag && !HIDDEN_TAGS.has(tag))
}

function proseOf (text) {
  return String(text || '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/^—— 配乐：.*$/gm, '')
    .replace(/\s+/g, '')
}

function altText (content, index, total) {
  const line = String(content || '')
    .split('\n')
    .map(item => item.trim())
    .find(item => item && !item.startsWith('![') && !item.startsWith('——') && !item.startsWith('<'))
  let alt = (line || '这一则随笔').replace(/[[\]()]/g, '').replace(/\s+/g, ' ').trim()
  if (alt.length > 28) alt = alt.slice(0, 28).replace(/[，。、\s]+$/g, '')
  if (!alt) alt = '这一则随笔'
  if (total > 1) alt += ' ' + (index + 1)
  return alt
}

function upgradeImages (content) {
  const re = /!\[([^\]]*)\]\((\/img\/moments\/netease\/\d+-\d+\.webp)\)/g
  const matches = [...String(content).matchAll(re)]
  if (!matches.length) return content
  let index = 0
  return String(content).replace(re, (full, alt, src) => {
    const next = altText(content, index, matches.length)
    index += 1
    if (alt && !/^配图(?: \d+)?$/.test(alt)) return full
    return `![${next}](${src})`
  })
}

function songLinkLine (song) {
  const name = String(song.name || '这首歌').replace(/[[\]]/g, '')
  const artists = song.artists ? String(song.artists) : ''
  const linked = `[${name}](https://music.163.com/song?id=${song.id})`
  return '—— 配乐：' + linked + (artists ? ' / ' + artists : '')
}

function upgradeSong (content, song) {
  if (!song || !song.id) return content
  if (!/^—— 配乐：/m.test(content)) return content
  if (/music\.163\.com\/song\?id=/.test(content)) return content
  return String(content).replace(/^—— 配乐：.*$/m, songLinkLine(song))
}

function loadSongMeta (events) {
  const map = new Map()
  for (const event of events) {
    if (event.song && event.song.id) {
      map.set(String(event.id), {
        id: event.song.id,
        name: event.song.name || '',
        artists: event.song.artists || ''
      })
    }
  }
  if (!fs.existsSync(rawEventsPath)) return map
  let rawEvents = []
  try {
    rawEvents = JSON.parse(fs.readFileSync(rawEventsPath, 'utf8'))
  } catch {
    return map
  }
  for (const event of rawEvents) {
    let json = {}
    try {
      json = typeof event.json === 'string' ? JSON.parse(event.json) : event.json || {}
    } catch {
      continue
    }
    if (!json.song || !json.song.id) continue
    map.set(String(event.id), {
      id: json.song.id,
      name: json.song.name || '',
      artists: (json.song.artists || []).map(artist => artist.name).filter(Boolean).join('/')
    })
  }
  return map
}

function parseShuoshuo (text) {
  const newline = text.includes('\r\n') ? '\r\n' : '\n'
  const normalized = text.replace(/\r\n/g, '\n')
  const entries = []
  const re = /^- (?:id: (\d+)\n  )?content: \|\n([\s\S]*?)\n  date: ([^\n]+)(?:\n  tags:\n((?:    - .*\n?)*))?/gm
  let match
  while ((match = re.exec(normalized))) {
    const content = match[2]
      .split('\n')
      .map(line => (line.startsWith('    ') ? line.slice(4) : line))
      .join('\n')
    const tags = match[4]
      ? [...match[4].matchAll(/^    - (.*)$/gm)].map(item => item[1].trim()).filter(Boolean)
      : []
    const fromImage = content.match(/\/img\/moments\/netease\/(\d+)-\d+\.webp/)
    entries.push({
      id: match[1] || (fromImage ? fromImage[1] : null),
      content,
      date: match[3].trim(),
      tags
    })
  }
  return { entries, newline }
}

function httpsUrl (url) {
  if (!url) return ''
  return String(url).replace(/^http:\/\//i, 'https://')
}

function downloadBuffer (url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const u = httpsUrl(url)
    if (!u) return reject(new Error('empty url'))
    if (redirects > 5) return reject(new Error('too many redirects'))

    const lib = u.startsWith('https') ? https : http
    const req = lib.get(
      u,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer: 'https://music.163.com/',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
        },
        timeout: 25000
      },
      res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          return downloadBuffer(res.headers.location, redirects + 1).then(resolve, reject)
        }
        if (res.statusCode !== 200) {
          res.resume()
          return reject(new Error('HTTP ' + res.statusCode + ' ' + u))
        }
        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      }
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('timeout ' + u))
    })
  })
}

async function saveImage (url, eventId, index) {
  const base = `${eventId}-${index}`
  const webpPath = path.join(imgDir, base + '.webp')
  const publicPath = `/img/moments/netease/${base}.webp`

  if (!forceImages && fs.existsSync(webpPath)) {
    return publicPath
  }

  // 无 sharp 时的回退路径
  const extGuess = (() => {
    const m = String(url).match(/\.(jpe?g|png|gif|webp)(?:\?|$)/i)
    return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg'
  })()
  const rawPath = path.join(imgDir, base + '.' + extGuess)
  const rawPublic = `/img/moments/netease/${base}.${extGuess}`

  if (!forceImages && !sharp && fs.existsSync(rawPath)) {
    return rawPublic
  }

  const buf = await downloadBuffer(url)
  if (!buf || buf.length < 100) throw new Error('too small')

  fs.mkdirSync(imgDir, { recursive: true })

  if (sharp) {
    await sharp(buf)
      .rotate()
      .resize({ width: 1280, withoutEnlargement: true })
      .webp({ quality: 74, effort: 5 })
      .toFile(webpPath)
    return publicPath
  }

  fs.writeFileSync(rawPath, buf)
  return rawPublic
}

async function mapPool (items, concurrency, worker) {
  const results = new Array(items.length)
  let i = 0
  async function run () {
    while (i < items.length) {
      const idx = i++
      results[idx] = await worker(items[idx], idx)
    }
  }
  const n = Math.min(concurrency, Math.max(1, items.length))
  await Promise.all(Array.from({ length: n }, () => run()))
  return results
}

const kept = []
const excluded = { deny: [], attack: [], spam: [], short: [], dup: [], grandma: [] }
const songMeta = loadSongMeta(raw)

for (const e of raw) {
  if (!e.msg || !String(e.msg).trim()) continue
  const msg = cleanMsg(e.msg)
  const id = Number(e.id)
  const listed = DENY_IDS.has(id)
  const grandma = isGrandmaHold(msg, e.date)
  if (listed || grandma) {
    const bucket = grandma ? excluded.grandma : excluded.deny
    bucket.push({ id, date: e.date, preview: msg.slice(0, 80) })
    continue
  }
  if (isAttack(msg)) {
    excluded.attack.push({ id, date: e.date, preview: msg.slice(0, 100) })
    console.warn('[migrate] 新的攻击类动态，请写入 DENY_IDS:', id, e.date)
    continue
  }
  if (isSpam(msg)) {
    excluded.spam.push({ id, date: e.date, preview: msg.slice(0, 100) })
    console.warn('[migrate] 新的活动模板，请写入 DENY_IDS:', id, e.date)
    continue
  }
  if (isDuplicateRain(msg)) {
    excluded.dup.push({ id, date: e.date, preview: '雨夜随笔（博客已有配图增强版）' })
    console.warn('[migrate] 新的雨夜重复，请写入 DENY_IDS:', id, e.date)
    continue
  }
  if (!isWorthKeeping(msg)) {
    excluded.short.push({ date: e.date, preview: msg.slice(0, 100) })
    continue
  }

  const pics = Array.isArray(e.pics) ? e.pics.filter(Boolean).slice(0, 9) : []
  const song = songMeta.get(String(e.id)) || (e.song
    ? { id: e.song.id || null, name: e.song.name || '', artists: e.song.artists || '' }
    : null)

  kept.push({
    msg,
    date: e.date,
    tags: extractTags(msg),
    source: 'netease',
    id: e.id,
    song,
    pics
  })
}

kept.sort((a, b) => (a.date < b.date ? 1 : -1))

const previousText = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : ''
const parsed = previousText
  ? parseShuoshuo(previousText)
  : { entries: [], newline: '\n' }

if (previousText) {
  const markerCount = (previousText.replace(/\r\n/g, '\n').match(/^- (?:id: \d+\n  )?content: \|/gm) || []).length
  if (parsed.entries.length !== markerCount) {
    console.error('[migrate] 拒绝写入：随笔解析数量对不上', parsed.entries.length, markerCount)
    process.exit(1)
  }
}

const eventsByDate = new Map(raw.map(event => [event.date, event]))
for (const entry of parsed.entries) {
  if (entry.id) continue
  const event = eventsByDate.get(entry.date)
  if (!event || !event.msg) continue
  const left = proseOf(entry.content).slice(0, 24)
  const right = proseOf(cleanMsg(event.msg)).slice(0, 24)
  const same = left && right && (left.startsWith(right.slice(0, 12)) || right.startsWith(left.slice(0, 12)))
  if (same) entry.id = String(event.id)
}

const existingIds = new Set(parsed.entries.map(entry => entry.id).filter(Boolean).map(String))
const existingDates = new Set(parsed.entries.map(entry => entry.date))
const fresh = kept.filter(item => !existingIds.has(String(item.id)) && !existingDates.has(item.date))

// —— 只下载新增动态的配图 ——
const imageJobs = []
for (const item of fresh) {
  item.pics.forEach((url, i) => {
    imageJobs.push({ item, url: httpsUrl(url), index: i })
  })
}

const imgStats = { planned: imageJobs.length, ok: 0, fail: 0, skipped: noImages }

if (!noImages && imageJobs.length) {
  fs.mkdirSync(imgDir, { recursive: true })
  console.log(`[migrate] downloading ${imageJobs.length} images → ${path.relative(root, imgDir)}`)

  await mapPool(imageJobs, 4, async job => {
    try {
      const local = await saveImage(job.url, job.item.id, job.index)
      if (!job.item.localPics) job.item.localPics = []
      job.item.localPics[job.index] = local
      imgStats.ok += 1
      if (imgStats.ok % 20 === 0) {
        console.log(`[migrate] images ${imgStats.ok}/${imageJobs.length}`)
      }
    } catch (err) {
      imgStats.fail += 1
      console.warn(`[migrate] image fail id=${job.item.id} #${job.index}: ${err.message}`)
    }
  })
  console.log(`[migrate] images done ok=${imgStats.ok} fail=${imgStats.fail}`)
}

for (const item of fresh) {
  let content = item.msg
  const locals = (item.localPics || []).filter(Boolean)
  if (locals.length) {
    content += '\n'
    locals.forEach((src, index) => {
      content += `\n![${altText(content, index, locals.length)}](${src})`
    })
    content += '\n'
  }
  if (item.song && item.song.name) {
    const line = item.song.id
      ? songLinkLine(item.song)
      : `—— 配乐：${item.song.name}${item.song.artists ? ' / ' + item.song.artists : ''}`
    content += `\n\n${line}`
  }
  item.content = content
  item.tags = visibleTags(item.tags)
}

/** 博客原有条目只在文件里还没有同一日期时补回，避免整文件重写把它们盖掉 */
const blogNative = [
  {
    content: `**所感所想**

不知从何写起 也不知写些什么
可最近的自己催促着 需要写些内容

阴雨天持续了两周
粘稠的空气附在周围 包裹着每个人
只有听觉与触觉才能知道他们的存在

![雨夜漫步](/img/moments/rain-night-walk.webp)

漫步雨中 轮胎与柏油摩擦 哗...
声音由远到近 由近到远
路过天桥 树下的鸟儿 也在追赶着什么
路过断桥 向下望去 全部覆盖着诙谐
溪水 绿葱 点缀的波荡 在灯光下是那般死寂

我撑着伞 还在小路走着
四面八方都会有风 时而逆风时而顺风
也许是披着外套 后背渗出水珠
风也在这时停止摇摆 褪去衣物 继续撑伞

道路旁的水渍趴在一旁 我们离得很近
映射着伞下的我 邯郸学步 只能这般形容
就同平常的雨天一样 快步走着
硕大的雨滴从叶上滴落 砸在头顶...

夜晚 雨声渐渐被蝉鸣替换
规律的鸣叫 又回到酷热的季节
嗡嗡的空调 一升一降 奏着清凉奏着盛夏
拉开窗帘 没有星空明月 泥垢糊满视野
窗沿缝隙还有着雨水 也许日出时它也会消失
最后的泥垢会证明存在的痕迹

夜深了`,
    date: '2026-07-22 01:15:00',
    tags: ['随笔', '雨']
  },
  {
    content: '白天的句子偏轻，夜晚的句子偏静。主题切换不只是换颜色，也应该换语气。',
    date: '2026-05-13 22:20:00',
    tags: ['随想']
  },
  {
    content: '先把首页、友链、随笔、番剧这些入口搭起来。有地方安放想法，内容就会慢慢长出来。',
    date: '2026-05-13 22:00:00',
    tags: ['随想']
  }
]

const upgraded = parsed.entries.map(entry => {
  const song = entry.id ? songMeta.get(String(entry.id)) : null
  return {
    id: entry.id ? String(entry.id) : null,
    content: upgradeSong(upgradeImages(entry.content), song),
    date: entry.date,
    tags: visibleTags(entry.tags)
  }
})

for (const entry of parsed.entries) {
  const next = upgraded.find(item => item.date === entry.date)
  if (!next || proseOf(next.content) !== proseOf(entry.content)) {
    console.error('[migrate] 拒绝写入：已有正文被改动', entry.date)
    process.exit(1)
  }
}

const restored = blogNative
  .filter(item => !existingDates.has(item.date))
  .map(item => ({ id: null, content: item.content, date: item.date, tags: visibleTags(item.tags) }))

const appended = fresh.map(item => ({
  id: String(item.id),
  content: item.content,
  date: item.date,
  tags: item.tags
}))

const all = [...upgraded, ...restored, ...appended].sort((a, b) => (a.date < b.date ? 1 : -1))
const lost = parsed.entries.filter(entry => !all.some(item => item.date === entry.date))
if (lost.length || all.length < parsed.entries.length) {
  console.error('[migrate] 拒绝写入：条目变少', lost.map(entry => entry.date))
  process.exit(1)
}

function yamlBlock (text) {
  return String(text)
    .replace(/\r\n/g, '\n')
    .replace(/\n$/, '')
    .split('\n')
    .map(line => '    ' + line)
    .join('\n')
}

let out = ''
out += '# 随笔 / 说说\n'
out += '# 网易云 Rogue_lr (uid 3988339491) 公开动态。按动态 ID 合并，不覆盖已有正文。\n'
out += '# 排除名单：tools/migrate-netease-shuoshuo.mjs 的 DENY_IDS；2026-10-01 姥姥相关见 isGrandmaHold\n'
out += '# 配图：source/img/moments/netease/（WebP）\n'
out += `# 生成时间: ${new Date().toISOString()}\n`
out += `# 条目数: ${all.length}（原有 ${parsed.entries.length} + 新增 ${appended.length}）\n`
out += `# 配图: ok=${imgStats.ok} fail=${imgStats.fail} planned=${imgStats.planned}\n\n`

for (const item of all) {
  if (item.id) out += `- id: ${item.id}\n  content: |\n`
  else out += '- content: |\n'
  out += yamlBlock(item.content) + '\n'
  out += `  date: ${item.date}\n`
  if (item.tags && item.tags.length) {
    out += '  tags:\n'
    out += item.tags.map(tag => '    - ' + tag).join('\n') + '\n'
  }
  out += '\n'
}

const fileText = parsed.newline === '\r\n' ? out.replace(/\n/g, '\r\n') : out
fs.writeFileSync(outPath, fileText, 'utf8')

const linkedSongs = all.filter(item => /music\.163\.com\/song\?id=/.test(item.content)).length
const report = {
  totalEvents: raw.length,
  withMsg: raw.filter(event => event.msg && String(event.msg).trim()).length,
  keptFromNetease: kept.length,
  previousCount: parsed.entries.length,
  appended: appended.length,
  restoredBlog: restored.length,
  finalCount: all.length,
  linkedSongs,
  images: imgStats,
  excluded: {
    deny: excluded.deny.length,
    grandma: excluded.grandma.length,
    attack: excluded.attack.length,
    spam: excluded.spam.length,
    short: excluded.short.length,
    dup: excluded.dup.length
  },
  dateRange: all.length
    ? { newest: all[0].date, oldest: all[all.length - 1].date }
    : null
}
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
console.log('wrote', outPath, 'bytes', Buffer.byteLength(fileText))
