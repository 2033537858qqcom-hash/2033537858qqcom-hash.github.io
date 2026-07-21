# 启用 Utterances 评论

本站评论使用 [Utterances](https://utteranc.es/)（GitHub Issues 驱动，无后端）。

## 一次性配置

1. 使用拥有本仓库权限的 GitHub 账号登录。
2. 打开 [github.com/apps/utterances](https://github.com/apps/utterances) → **Install**。
3. 选择账号下的仓库：`2033537858qqcom-hash/2033537858qqcom-hash.github.io`（可只授权这一仓库）。
4. 进入仓库 **Settings → General → Features**，勾选 **Issues**。
5. 打开线上任意文章页（例如 `/2026/07/22/what-i-write-here/`），滚动到底部：
   - 成功：出现 Utterances 评论框，可用 GitHub 登录发言
   - 失败：多为 App 未装、Issues 未开，或仓库名与 `_config.butterfly.yml` 中 `utterances.repo` 不一致

## 当前主题配置

```yaml
comments:
  use: Utterances

utterances:
  repo: 2033537858qqcom-hash/2033537858qqcom-hash.github.io
  issue_term: pathname
  light_theme: github-light
  dark_theme: photon-dark
```

每篇文章对应一条 Issue，标题由路径映射，无需手动建 Issue。

## 注意

- 访客需要 GitHub 账号才能评论。
- 评论内容存在本仓库 Issues 中，请定期查看是否有垃圾留言。
- 若更换仓库名，务必同步改 `utterances.repo` 并重新安装 App。
