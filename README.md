# Rogue_l's Blog

基于 [Hexo](https://hexo.io/) + [Butterfly](https://butterfly.js.org/) 的个人博客。

- 站点：https://2033537858qqcom-hash.github.io
- 仓库：https://github.com/2033537858qqcom-hash/2033537858qqcom-hash.github.io

## 本地开发

要求：Node.js 20+、[pnpm](https://pnpm.io/) 9。

```bash
pnpm install
pnpm run optimize          # 图片 WebP + 音频压缩（可选）
pnpm run server            # http://localhost:4000
```

| 命令 | 说明 |
|------|------|
| `pnpm run server` | 本地预览 |
| `pnpm run build` | 生成 `public/` |
| `pnpm run clean` | 清理缓存与生成物 |
| `pnpm run optimize:assets` | sharp 生成 WebP |
| `pnpm run optimize:audio` | 将 MP3 压到约 96kbps |
| `pnpm exec hexo new post "标题"` | 新建文章 |

## 目录结构（简）

```text
source/
  _posts/            # 文章
  _data/             # anime / link / shuoshuo
  css/custom.css     # 自定义样式
  js/                # 交互脚本（多数 defer / 按需）
  img/optimized/     # 线上用 WebP
  music-files/       # 压缩后的音频
assets/raw/          # 原始大图（仅用于重新导出）
scripts/             # Hexo 扩展
tools/               # optimize-assets / compress-audio
.github/workflows/   # Pages 部署
```

## 性能约定

- 音乐：左下角按钮按需加载 APlayer，不自动播放
- Live2D / 粒子：桌面 + 非省电；粒子仅首页
- 原始大图放 `assets/raw/`，站点只引用 `img/optimized/`

## 部署

推送到 `main` 后 GitHub Actions 自动：`pnpm install` → `optimize:assets` → `build` → Pages。

**Settings → Pages → Source** 请选 **GitHub Actions**。

## 评论

Utterances：安装 [App](https://github.com/apps/utterances) 到本仓库并开启 Issues。

## 内容维护

- 番剧：`source/_data/anime.yml`
- 友链：`source/_data/link.yml`
- 随笔：`source/_data/shuoshuo.yml`
- 歌单：`source/js/music-player.js`

## 许可

主题基于 Butterfly；文章与自定义代码版权归作者，转载请注明。
