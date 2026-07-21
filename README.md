# Rogue_l's Blog

基于 [Hexo](https://hexo.io/) + [Butterfly](https://butterfly.js.org/) 的个人博客。

- 站点：https://2033537858qqcom-hash.github.io
- 仓库：https://github.com/2033537858qqcom-hash/2033537858qqcom-hash.github.io

## 本地开发

要求：Node.js 20+、[pnpm](https://pnpm.io/) 9。

```bash
pnpm install
pnpm run optimize:assets   # 可选：生成 WebP 封面
pnpm run server            # http://localhost:4000
```

常用命令：

| 命令 | 说明 |
|------|------|
| `pnpm run server` | 本地预览 |
| `pnpm run build` | 生成 `public/` |
| `pnpm run clean` | 清理缓存与生成物 |
| `pnpm run optimize:assets` | 用 sharp 压缩 banner / 封面 / 番剧图 |
| `pnpm exec hexo new post "标题"` | 新建文章 |

## 目录结构（简）

```text
source/
  _posts/          # 文章
  _data/           # anime.yml / link.yml / shuoshuo.yml
  css/custom.css   # 站点自定义样式
  js/              # 主题交互脚本
  img/optimized/   # 优化后的 WebP
scripts/           # Hexo 扩展（如番剧页）
tools/             # 资源优化脚本
.github/workflows/ # GitHub Pages 部署
```

## 部署

推送到 `main` 后，由 GitHub Actions（`.github/workflows/pages.yml`）执行：

1. `pnpm install --frozen-lockfile`
2. `pnpm run optimize:assets`
3. `pnpm run build`
4. 部署到 GitHub Pages

请在仓库 **Settings → Pages** 中将 Source 设为 **GitHub Actions**（不要再使用 `gh-pages` 分支部署）。

## 评论系统

默认使用 [Utterances](https://utteranc.es/)：

1. 打开 https://github.com/apps/utterances 安装到本仓库
2. 确保 Issues 已开启
3. 主题配置见 `_config.butterfly.yml` → `comments` / `utterances`

若改用 Twikoo，需先填写 `twikoo.envId`，再将 `comments.use` 改为 `Twikoo`。

## 内容维护

- **番剧**：编辑 `source/_data/anime.yml`
- **友链**：编辑 `source/_data/link.yml`
- **随笔**：编辑 `source/_data/shuoshuo.yml`
- **歌单**：编辑 `source/js/music-player.js`

## 许可

站点主题基于 Butterfly；文章与自定义代码版权归作者所有，转载请注明出处。
