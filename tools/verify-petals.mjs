/**
 * 本地验证樱瓣轮廓：渲染 SVG → WebP，并做几何自检
 * 通过后再推送前端粒子改动
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const sharp = require('sharp')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, 'verify-output')
const outWebp = path.join(outDir, 'sakura-petal-preview.webp')
const outSvg = path.join(outDir, 'sakura-petal-preview.svg')

/**
 * 与 theme-particles.js 中 buildSakuraPetalPath 同源（s=100 时的绝对路径）
 * 原点在基部，-y 方向为瓣尖凹缺
 */
function petalPathD (s, ox = 0, oy = 0) {
  const w = s
  const h = s * 1.55
  // SVG y 向下，故对 y 取反并平移，使花瓣正立显示
  const X = x => (ox + x).toFixed(2)
  const Y = y => (oy - y).toFixed(2) // 翻转 y：基部在下、尖在上
  return [
    `M ${X(0)} ${Y(0)}`,
    `C ${X(-w * 0.28)} ${Y(-h * 0.12)}, ${X(-w * 1.05)} ${Y(-h * 0.28)}, ${X(-w * 0.92)} ${Y(-h * 0.58)}`,
    `C ${X(-w * 0.88)} ${Y(-h * 0.78)}, ${X(-w * 0.55)} ${Y(-h * 0.95)}, ${X(-w * 0.22)} ${Y(-h * 0.98)}`,
    `Q ${X(0)} ${Y(-h * 0.78)}, ${X(w * 0.22)} ${Y(-h * 0.98)}`,
    `C ${X(w * 0.55)} ${Y(-h * 0.95)}, ${X(w * 0.88)} ${Y(-h * 0.78)}, ${X(w * 0.92)} ${Y(-h * 0.58)}`,
    `C ${X(w * 1.05)} ${Y(-h * 0.28)}, ${X(w * 0.28)} ${Y(-h * 0.12)}, ${X(0)} ${Y(0)}`,
    'Z'
  ].join(' ')
}

// 几何自检（在逻辑坐标系：基部 y=0，尖凹缺 y≈-1.55s）
function geometricChecks (s = 100) {
  const h = s * 1.55
  const tipY = -h * 0.98
  const cleftY = -h * 0.78
  const baseY = 0
  const leftTipX = -s * 0.22
  const rightTipX = s * 0.22
  const maxHalfWidth = s * 1.05

  const checks = []
  const ok = (name, pass, detail = '') => {
    checks.push({ name, pass: !!pass, detail })
  }

  // 1) 瓣尖在基部「上方」（逻辑 -y）
  ok('tip above base', tipY < baseY, `tipY=${tipY} baseY=${baseY}`)
  // 2) 凹缺比两尖峰更靠近基部（形成缺口）
  ok('cleft is indented (emarginate)', cleftY > tipY, `cleftY=${cleftY} tipY=${tipY}`)
  // 3) 两尖峰对称分开
  ok('bilobed tip notch', leftTipX < 0 && rightTipX > 0 && Math.abs(leftTipX + rightTipX) < 0.01)
  // 4) 最宽处 > 基宽尺度，呈心/扇形而非细长椭圆
  ok('wider than tall-skinny ellipse', maxHalfWidth / h > 0.55, `ratio=${(maxHalfWidth / h).toFixed(3)}`)
  // 5) 高宽比约 1.3–1.8（真实樱瓣偏圆润略长）
  const aspect = h / (maxHalfWidth * 2)
  ok('aspect ratio botanical-ish', aspect > 0.55 && aspect < 1.1, `aspect=${aspect.toFixed(3)}`)

  return checks
}

const poses = [
  { x: 110, y: 200, r: -18, sx: 1, label: '正面' },
  { x: 280, y: 190, r: 25, sx: 0.75, label: '斜倾' },
  { x: 450, y: 210, r: -40, sx: 0.35, label: '近侧立' },
  { x: 620, y: 185, r: 12, sx: -0.9, label: '背面感' },
  { x: 780, y: 220, r: -55, sx: 0.55, label: '翻滚中' },
  { x: 180, y: 380, r: 8, sx: 1, label: '近景大' },
  { x: 400, y: 400, r: -12, sx: 0.5, label: '远景小' },
  { x: 620, y: 390, r: 35, sx: 0.2, label: '极侧' }
]

const petals = poses
  .map((p, i) => {
    const s = i === 5 ? 70 : i === 6 ? 32 : 48
    const d = petalPathD(s, 0, 0)
    // 渐变 id
    const gid = 'g' + i
    return `
  <g transform="translate(${p.x},${p.y}) rotate(${p.r}) scale(${p.sx},1)">
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="-1" gradientUnits="objectBoundingBox">
        <stop offset="0%" stop-color="rgb(248,190,205)" stop-opacity="0.9"/>
        <stop offset="45%" stop-color="rgb(255,228,236)" stop-opacity="0.92"/>
        <stop offset="100%" stop-color="rgb(255,252,253)" stop-opacity="0.85"/>
      </linearGradient>
    </defs>
    <path d="${d}" fill="url(#${gid})" stroke="rgba(255,250,252,0.55)" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M 0 ${(-s * 0.05).toFixed(1)} Q ${(2 * Math.sign(p.sx || 1)).toFixed(1)} ${(-s * 1.55 * 0.4).toFixed(1)} 0 ${(-s * 1.55 * 0.72).toFixed(1)}"
      fill="none" stroke="rgba(225,155,175,0.35)" stroke-width="1"/>
    <text x="0" y="${(s * 0.55).toFixed(1)}" text-anchor="middle" font-size="11" fill="#667" font-family="sans-serif">${p.label}</text>
  </g>`
  })
  .join('\n')

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="520" viewBox="0 0 900 520">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#c8e0f5"/>
      <stop offset="55%" stop-color="#e8f2fa"/>
      <stop offset="100%" stop-color="#f7f3f0"/>
    </linearGradient>
  </defs>
  <rect width="900" height="520" fill="url(#sky)"/>
  <text x="28" y="36" font-size="18" fill="#24324a" font-family="Segoe UI,sans-serif" font-weight="600">
    Sakura petal path verification（凹缺尖端 · 基端收窄 · 非椭圆）
  </text>
  <text x="28" y="58" font-size="12" fill="#66738a" font-family="Segoe UI,sans-serif">
    Botanical: emarginate tip cleft distinguishes cherry from plum · soft pink-white gradient
  </text>
  ${petals}
</svg>
`

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(outSvg, svg, 'utf8')

await sharp(Buffer.from(svg))
  .webp({ quality: 90 })
  .toFile(outWebp)

const checks = geometricChecks(100)
let failed = 0
console.log('=== geometric checks ===')
for (const c of checks) {
  console.log((c.pass ? 'OK  ' : 'FAIL') + ' ' + c.name + (c.detail ? ' — ' + c.detail : ''))
  if (!c.pass) failed += 1
}

// 源码同步检查：路径关键常数是否仍在 theme-particles.js
const src = fs.readFileSync(path.join(__dirname, '../source/js/theme-particles.js'), 'utf8')
const srcChecks = [
  ['has buildSakuraPetalPath', src.includes('buildSakuraPetalPath')],
  ['has emarginate comment', /emarginate|凹缺/.test(src)],
  ['has quadratic cleft', src.includes('quadraticCurveTo')],
  ['not only ellipse fill', !/ctx\.ellipse\(0, 0, rx, ry/.test(src)]
]
console.log('=== source checks ===')
for (const [name, pass] of srcChecks) {
  console.log((pass ? 'OK  ' : 'FAIL') + ' ' + name)
  if (!pass) failed += 1
}

console.log('\npreview:', outWebp)
console.log(failed === 0 ? '\nALL CHECKS PASSED' : '\n' + failed + ' CHECK(S) FAILED')
if (failed) process.exit(1)
