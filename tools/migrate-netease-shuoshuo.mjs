/**
 * 从 tools/netease-events.json 迁移公开动态到 source/_data/shuoshuo.yml
 * 并下载配图 → source/img/moments/netease/*.webp
 *
 * 排除：对他人攻击、活动模板垃圾、过短噪声；雨夜随笔保留博客配图版
 *
 * 用法：
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
const outPath = path.join(root, 'source/_data/shuoshuo.yml')
const reportPath = path.join(root, 'tools/netease-migrate-report.json')
const imgDir = path.join(root, 'source/img/moments/netease')

const args = new Set(process.argv.slice(2))
const noImages = args.has('--no-images')
const forceImages = args.has('--force-images')

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

function extractTags (msg, song, hasPics) {
  const tags = new Set(['随笔'])
  const t = msg
  if (/雨|雨夜|雨声|打在/.test(t)) tags.add('雨')
  if (/夜|深夜|失眠|夜深/.test(t)) tags.add('夜')
  if (/高考|考试|毕业/.test(t)) tags.add('回忆')
  if (/梦|梦见/.test(t)) tags.add('梦')
  if (/杭州|实习/.test(t)) tags.add('杭州')
  if (/读后|打卡《|观后|影片|电影|小说|书/.test(t)) tags.add('观感')
  if (/春|夏|秋|冬/.test(t)) tags.add('季节')
  if (song) tags.add('配乐')
  if (hasPics) tags.add('配图')
  if (msg.length >= 300) tags.add('长文')
  return [...tags]
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
const excluded = { attack: [], spam: [], short: [], dup: [] }

for (const e of raw) {
  if (!e.msg || !String(e.msg).trim()) continue
  const msg = cleanMsg(e.msg)
  if (isAttack(msg)) {
    excluded.attack.push({ date: e.date, preview: msg.slice(0, 100) })
    continue
  }
  if (isSpam(msg)) {
    excluded.spam.push({ date: e.date, preview: msg.slice(0, 100) })
    continue
  }
  if (isDuplicateRain(msg)) {
    excluded.dup.push({ date: e.date, preview: '雨夜随笔（博客已有配图增强版）' })
    continue
  }
  if (!isWorthKeeping(msg)) {
    excluded.short.push({ date: e.date, preview: msg.slice(0, 100) })
    continue
  }

  const pics = Array.isArray(e.pics) ? e.pics.filter(Boolean).slice(0, 9) : []

  kept.push({
    msg,
    date: e.date,
    tags: extractTags(msg, e.song, pics.length > 0),
    source: 'netease',
    id: e.id,
    song: e.song || null,
    pics
  })
}

kept.sort((a, b) => (a.date < b.date ? 1 : -1))

// —— 下载图片 ——
const imageJobs = []
for (const item of kept) {
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

// 组装 content
for (const item of kept) {
  let content = item.msg

  const locals = (item.localPics || []).filter(Boolean)
  if (locals.length) {
    content += '\n'
    locals.forEach((src, i) => {
      const alt = locals.length === 1 ? '配图' : `配图 ${i + 1}`
      content += `\n![${alt}](${src})`
    })
    content += '\n'
  }

  if (item.song && item.song.name) {
    content += `\n\n—— 配乐：${item.song.name}${item.song.artists ? ' / ' + item.song.artists : ''}`
  }

  item.content = content
  item.tags = extractTags(item.msg, item.song, locals.length > 0)
}

/** 博客站内原有 / 增强版，不覆盖 */
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

const all = [
  ...blogNative,
  ...kept.map(k => ({ content: k.content, date: k.date, tags: k.tags }))
].sort((a, b) => (a.date < b.date ? 1 : -1))

function yamlBlock (s) {
  return String(s)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(l => '    ' + l)
    .join('\n')
}

function tagsYaml (tags) {
  return tags.map(t => '    - ' + t).join('\n')
}

let out = ''
out += '# 随笔 / 说说\n'
out += '# 网易云 Rogue_lr (uid 3988339491) 公开动态迁移\n'
out += '# 规则：排除对他人攻击、活动模板、过短噪声；雨夜随笔保留博客配图版\n'
out += '# 配图：source/img/moments/netease/（WebP）\n'
out += `# 生成时间: ${new Date().toISOString()}\n`
out += `# 条目数: ${all.length}（博客原有 ${blogNative.length} + 网易云 ${kept.length}）\n`
out += `# 配图: ok=${imgStats.ok} fail=${imgStats.fail} planned=${imgStats.planned}\n\n`

for (const item of all) {
  out += '- content: |\n'
  out += yamlBlock(item.content) + '\n'
  out += `  date: ${item.date}\n`
  out += '  tags:\n'
  out += tagsYaml(item.tags) + '\n\n'
}

fs.writeFileSync(outPath, out, 'utf8')

const withLocalPics = kept.filter(k => (k.localPics || []).filter(Boolean).length > 0).length

const report = {
  totalEvents: raw.length,
  withMsg: raw.filter(e => e.msg && String(e.msg).trim()).length,
  migratedFromNetease: kept.length,
  blogNative: blogNative.length,
  finalCount: all.length,
  images: imgStats,
  essaysWithLocalPics: withLocalPics,
  excluded: {
    attack: excluded.attack.length,
    spam: excluded.spam.length,
    short: excluded.short.length,
    dup: excluded.dup.length,
    attackSamples: excluded.attack
  },
  dateRange: kept.length
    ? { newest: kept[0].date, oldest: kept[kept.length - 1].date }
    : null
}
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
console.log('wrote', outPath, 'bytes', Buffer.byteLength(out))
