import sharp from 'sharp'
import { mkdir, access } from 'node:fs/promises'
import { constants } from 'node:fs'

const outDir = 'source/img/optimized'
await mkdir(outDir, { recursive: true })

const exists = async path => {
  try {
    await access(path, constants.R_OK)
    return true
  } catch {
    return false
  }
}

const jobs = [
  {
    input: 'assets/raw/白天.png',
    output: `${outDir}/banner-day-bg.webp`,
    resize: { width: 1400, withoutEnlargement: true },
    webp: { quality: 62, effort: 6 }
  },
  {
    input: 'assets/raw/夜晚.png',
    output: `${outDir}/banner-night-bg.webp`,
    resize: { width: 1400, withoutEnlargement: true },
    webp: { quality: 62, effort: 6 }
  },
  {
    input: 'assets/raw/白天.png',
    output: `${outDir}/cover-day.webp`,
    resize: { width: 900, withoutEnlargement: true },
    webp: { quality: 64, effort: 6 }
  },
  {
    input: 'assets/raw/夜晚.png',
    output: `${outDir}/cover-night.webp`,
    resize: { width: 900, withoutEnlargement: true },
    webp: { quality: 64, effort: 6 }
  },
  {
    input: 'assets/raw/白天.png',
    output: `${outDir}/music-day.webp`,
    resize: { width: 420, height: 420, fit: 'cover' },
    webp: { quality: 72, effort: 6 }
  },
  {
    input: 'assets/raw/夜晚.png',
    output: `${outDir}/music-night.webp`,
    resize: { width: 420, height: 420, fit: 'cover' },
    webp: { quality: 72, effort: 6 }
  },
  {
    input: 'source/img/avatar.jpg',
    output: `${outDir}/music-avatar.webp`,
    resize: { width: 420, height: 420, fit: 'cover' },
    webp: { quality: 76, effort: 6 }
  },
  // Anime covers（原图在 assets/raw，线上只保留 optimized webp）
  {
    input: 'assets/raw/anime-covers/summer-time-rendering.png',
    output: `${outDir}/anime-summer-time-rendering.webp`,
    resize: { width: 480, withoutEnlargement: true },
    webp: { quality: 72, effort: 6 }
  },
  {
    input: 'assets/raw/anime-covers/relife.png',
    output: `${outDir}/anime-relife.webp`,
    resize: { width: 480, withoutEnlargement: true },
    webp: { quality: 72, effort: 6 }
  },
  {
    input: 'assets/raw/anime-covers/chainsaw-man.png',
    output: `${outDir}/anime-chainsaw-man.webp`,
    resize: { width: 480, withoutEnlargement: true },
    webp: { quality: 72, effort: 6 }
  },
  {
    input: 'assets/raw/anime-covers/tensei-slime.jpg',
    output: `${outDir}/anime-tensei-slime.webp`,
    resize: { width: 480, withoutEnlargement: true },
    webp: { quality: 72, effort: 6 }
  },
  {
    input: 'assets/raw/anime-covers/mushoku-s1.jpg',
    output: `${outDir}/anime-mushoku-s1.webp`,
    resize: { width: 480, withoutEnlargement: true },
    webp: { quality: 72, effort: 6 }
  },
  {
    input: 'assets/raw/anime-covers/mushoku-s2.png',
    output: `${outDir}/anime-mushoku-s2.webp`,
    resize: { width: 480, withoutEnlargement: true },
    webp: { quality: 72, effort: 6 }
  },
  {
    input: 'assets/raw/anime-covers/mushoku-s3.jpg',
    output: `${outDir}/anime-mushoku-s3.webp`,
    resize: { width: 480, withoutEnlargement: true },
    webp: { quality: 72, effort: 6 }
  },
  {
    input: 'assets/raw/anime-covers/your-name.png',
    output: `${outDir}/anime-your-name.webp`,
    resize: { width: 480, withoutEnlargement: true },
    webp: { quality: 72, effort: 6 }
  },
  {
    input: 'assets/raw/anime-covers/toki-wo-kakeru.png',
    output: `${outDir}/anime-toki-wo-kakeru.webp`,
    resize: { width: 480, withoutEnlargement: true },
    webp: { quality: 72, effort: 6 }
  },
  {
    input: 'assets/raw/anime-covers/hello-world.jpg',
    output: `${outDir}/anime-hello-world.webp`,
    resize: { width: 480, withoutEnlargement: true },
    webp: { quality: 72, effort: 6 }
  },
  {
    input: 'assets/raw/anime-covers/pancreas.jpg',
    output: `${outDir}/anime-pancreas.webp`,
    resize: { width: 480, withoutEnlargement: true },
    webp: { quality: 72, effort: 6 }
  },
  {
    input: 'assets/raw/anime-covers/tunnel-summer.jpg',
    output: `${outDir}/anime-tunnel-summer.webp`,
    resize: { width: 480, withoutEnlargement: true },
    webp: { quality: 72, effort: 6 }
  },
  {
    input: 'assets/raw/anime-covers/summer-ghost.jpg',
    output: `${outDir}/anime-summer-ghost.webp`,
    resize: { width: 480, withoutEnlargement: true },
    webp: { quality: 72, effort: 6 }
  },
  // Music covers
  {
    input: 'assets/raw/music-covers/yu-zhou-wu-xing-he.jpg',
    output: `${outDir}/music-cover-yu-zhou-wu-xing-he.webp`,
    resize: { width: 320, height: 320, fit: 'cover' },
    webp: { quality: 74, effort: 6 }
  },
  {
    input: 'assets/raw/music-covers/ying-huo-zhi-sen.jpg',
    output: `${outDir}/music-cover-ying-huo-zhi-sen.webp`,
    resize: { width: 320, height: 320, fit: 'cover' },
    webp: { quality: 74, effort: 6 }
  },
  {
    input: 'assets/raw/music-covers/shun-jian-de-yong-heng.jpg',
    output: `${outDir}/music-cover-shun-jian-de-yong-heng.webp`,
    resize: { width: 320, height: 320, fit: 'cover' },
    webp: { quality: 74, effort: 6 }
  },
  // Post covers
  {
    input: 'source/img/post/rednote-1028qjh.jpg',
    output: `${outDir}/post-rednote-1028qjh.webp`,
    resize: { width: 1200, withoutEnlargement: true },
    webp: { quality: 75, effort: 6 }
  },
  {
    input: 'source/img/post/cloud-banner.jpg',
    output: `${outDir}/post-cloud-banner.webp`,
    resize: { width: 1200, withoutEnlargement: true },
    webp: { quality: 75, effort: 6 }
  },
  {
    input: 'source/img/post/Slime.jpg',
    output: `${outDir}/post-slime.webp`,
    resize: { width: 1200, withoutEnlargement: true },
    webp: { quality: 75, effort: 6 }
  }
]

let ok = 0
let skipped = 0

for (const job of jobs) {
  if (!(await exists(job.input))) {
    console.warn(`[skip] missing input: ${job.input}`)
    skipped += 1
    continue
  }

  await sharp(job.input)
    .resize(job.resize)
    .webp(job.webp)
    .toFile(job.output)

  console.log(job.output)
  ok += 1
}

console.log(`optimize-assets: ${ok} written, ${skipped} skipped`)
