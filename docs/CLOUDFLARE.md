# 用 Cloudflare 加速国内访问（推荐）

GitHub Pages 源站在海外，国内直连常慢。自定义域名 + Cloudflare 代理通常是性价比最高的加速方式。

## 步骤概要

1. 购买并持有一个域名（任意注册商）。
2. 注册 [Cloudflare](https://dash.cloudflare.com/)，添加站点，按提示修改域名 NS。
3. 在 Cloudflare DNS 添加记录：
   - 类型 `CNAME`
   - 名称 `@` 或 `blog`（按你想要的主机名）
   - 目标 `2033537858qqcom-hash.github.io`
   - 代理状态：**已代理（橙色云）**
4. 仓库根目录创建（或保留）`CNAME` 文件，内容为你的域名，例如：

   ```text
   blog.example.com
   ```

5. GitHub 仓库 **Settings → Pages → Custom domain** 填入同一域名，并开启 DNS 检查 / HTTPS。
6. Cloudflare SSL/TLS 模式建议：**Full**（GitHub 提供证书后可用 Full strict 视情况）。

## 注意

- 首次生效可能需要数小时（NS 生效时间）。
- 若开启代理后样式异常，检查是否错误缓存了 HTML；可对 `*.html` 设置较短缓存。
- 不要在未验证域名时删除 `github.io` 访问入口，方便回退。

## 备选

- 腾讯云 / 阿里云静态网站托管 + 国内 CDN 双写部署  
- Cloudflare Pages 作为镜像入口（需另配构建）
