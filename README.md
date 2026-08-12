# Rogue_l's Blog

基于 [Hexo](https://hexo.io/) + [Butterfly](https://butterfly.js.org/) 的个人博客。

- 站点：https://2033537858qqcom-hash.github.io
- 仓库：https://github.com/2033537858qqcom-hash/2033537858qqcom-hash.github.io

## 内容优先怎么维护

| 类型 | 路径 | 建议 |
|------|------|------|
| 随笔（高频） | `source/_data/shuoshuo.yml` | 短句即可；可从网易云公开动态迁移（见下） |
| 文章 | `source/_posts/*.md` | 写好 `description`；`pnpm exec hexo new post "标题"` |
| 建站手记 | 同 posts + `series: 建站手记` | `hidden: true`：不进首页/侧栏/RSS/搜索/sitemap；归档与直链仍可访问 |
| 番剧 | `source/_data/anime.yml` | 一条作品一段短评 |
| 音乐 | 网易云歌单 + `source/js/music-player.js` | 页面嵌入 + 迷你播放器 |
| 友链 | `source/_data/link.yml` | 留言板收集申请 |

阅读路径引导见文章《这里写些什么》。

### 网易云随笔迁移

公开动态可批量写入随笔页（会排除对他人攻击、活动模板与过短噪声）：

```bash
node tools/fetch-netease-events.mjs   # 默认 uid=3988339491
node tools/migrate-netease-shuoshuo.mjs
# 配图会下载到 source/img/moments/netease/*.webp 并写入随笔 Markdown
# 可选：--no-images  仅文字；--force-images  强制重下
```

## 本地开发

```bash
pnpm install
pnpm run optimize    # 图片 + 音频（可选）
pnpm run server
```

| 命令 | 说明 |
|------|------|
| `pnpm run server` | 本地预览 |
| `pnpm run build` | 生成 `public/` |
| `pnpm run optimize:assets` | WebP |
| `pnpm run optimize:audio` | MP3 ≈64kbps |
| `pnpm exec hexo new draft "标题"` | 草稿（不发布） |
| `pnpm exec hexo new post "标题"` | 正式文章 |

## 国内访问

直连 GitHub Pages 在国内偏慢。推荐自定义域名 + Cloudflare，步骤见 [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md)。

## 社交

- GitHub：配置在 `_config.butterfly.yml` → `social`
- 微信：图标点击复制，号码仅在 `source/js/wechat-contact.js` 与留言板（关于页不重复明文）

## 评论（Utterances）

必须完成，否则文章页评论区为空：

1. 打开 [Utterances App](https://github.com/apps/utterances)，安装到仓库 `2033537858qqcom-hash/2033537858qqcom-hash.github.io`
2. 仓库 **Settings → General → Features** 开启 **Issues**
3. 主题配置见 `_config.butterfly.yml` → `utterances`（`issue_term: pathname`）
4. 用 GitHub 账号打开任意文章页底部，应出现评论框

细节见 [docs/UTTERANCES.md](docs/UTTERANCES.md)。

## 缓存与版本

自定义 CSS/JS 的 `?v=` 由 `scripts/site-polish.js` 统一写成 **`package.json` 的 `version`**。  
改前端后请同步 bump 版本号（当前 `1.5.8`），否则用户可能一直用旧脚本。

## 部署

`main` 推送 → Actions：`install` → `optimize:assets` → `build` → smoke checks → Pages。

## 许可

主题基于 Butterfly；文章与自定义代码版权归作者。
