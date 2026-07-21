# Rogue_l's Blog

基于 [Hexo](https://hexo.io/) + [Butterfly](https://butterfly.js.org/) 的个人博客。

- 站点：https://2033537858qqcom-hash.github.io
- 仓库：https://github.com/2033537858qqcom-hash/2033537858qqcom-hash.github.io

## 内容优先怎么维护

| 类型 | 路径 | 建议 |
|------|------|------|
| 随笔（高频） | `source/_data/shuoshuo.yml` | 短句即可；可从网易云公开动态迁移（见下） |
| 文章 | `source/_posts/*.md` | 写好 `description`；`pnpm exec hexo new post "标题"` |
| 建站手记 | 同 posts + `series: 建站手记` | 可用 `hidden: true` 不进首页 |
| 番剧 | `source/_data/anime.yml` | 一条作品一段短评 |
| 音乐 | 网易云歌单 + `source/js/music-player.js` | 页面嵌入 + 迷你播放器 |
| 友链 | `source/_data/link.yml` | 留言板收集申请 |

阅读路径引导见文章《这里写些什么》。

### 网易云随笔迁移

公开动态可批量写入随笔页（会排除对他人攻击、活动模板与过短噪声）：

```bash
node tools/fetch-netease-events.mjs   # 默认 uid=3988339491
node tools/migrate-netease-shuoshuo.mjs
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
- 微信：图标点击复制，号码在 `source/js/wechat-contact.js` 与关于页

## 评论

Utterances：安装 [App](https://github.com/apps/utterances) 并开启 Issues。

## 部署

`main` 推送 → Actions：`install` → `optimize:assets` → `build` → smoke checks → Pages。

## 许可

主题基于 Butterfly；文章与自定义代码版权归作者。
