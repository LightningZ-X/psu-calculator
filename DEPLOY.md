# 部署说明（A 档：拿到一个可访问的链接）

目标：把本工具发布到公网，得到一个能发给别人的网址。**全程免费，不需要服务器。**

> **站点地址已配置完毕**：所有 `example.com` 占位符都已替换为
> `https://lightningz-x.github.io/`，可以直接上传，无需再做替换。
> 若日后更换域名，需同步改 `index.html`（canonical / og:url / og:image / twitter:image 共 4 处）、
> `sitemap.xml`（2 处）、`robots.txt`（1 处）；
> 跑 `node tools/browsertest.mjs` 会检查是否还有残留。

---

## 方案一：GitHub Pages（当前使用的方案）

### 步骤

1. **注册 / 登录** [github.com](https://github.com)

2. **新建仓库**
   - 点右上角 `+` → `New repository`
   - Repository name 必须填 **`LightningZ-X.github.io`**（这是账号的「用户站」仓库，
     网址就是 `https://lightningz-x.github.io/`，不带任何路径后缀；
     仓库名必须与用户名完全一致，否则不会挂在根路径上）
   - 选 **Public**（Pages 免费版需要公开仓库）
   - **不要**勾选 "Add a README file"
   - 点 `Create repository`

3. **上传文件**
   - 进入新仓库 → `uploading an existing file`
   - 把项目里**这些**拖进去：
     ```
     index.html
     404.html
     favicon.svg
     robots.txt
     sitemap.xml
     assets/        （整个文件夹，含 style.css 与 og-image.png）
     js/            （整个文件夹，5 个 .js）
     ```
   - ⚠️ **不要上传** `tools/`、`docs/`、`dist/`、`README.md`、`DEPLOY.md`
     （源码与文档对访客没用，还会拖慢加载、被搜索引擎抓到重复内容）
   - 底部点 `Commit changes`

4. **开启 Pages**
   - 仓库页 → `Settings` → 左侧 `Pages`
   - `Source` 选 **Deploy from a branch**
   - `Branch` 选 **main**，目录选 **/ (root)**
   - 点 `Save`

5. **等待生效**
   - 等 1～3 分钟，刷新 Settings → Pages 页面
   - 顶部会出现 `Your site is live at https://...`
   - 这就是你的网址

### 换成自己的域名（可选，约 ¥50/年）

1. 在阿里云 / 腾讯云 / Cloudflare 买域名
2. 域名服务商处添加 DNS 记录：
   - `CNAME` 记录，主机记录填 `www`，指向 `你的用户名.github.io`
   - 若要裸域名（`example.com`），加 4 条 `A` 记录指向 GitHub 的 IP
     （IP 会变，请查 GitHub 官方文档 "Managing a custom domain"）
3. 仓库 Pages 设置里填 `Custom domain`，勾选 `Enforce HTTPS`
4. **等 DNS 生效**（几分钟到几小时），然后开启 HTTPS

> ⚠️ **GitHub Pages 在国内访问不稳定**。如果主要受众在国内，
> 建议看下面的方案二，或者接受"偶尔打不开"。

---

## 方案二：Cloudflare Pages / Vercel（国内访问略快）

两者用法几乎一样，以 **Cloudflare Pages** 为例：

1. 注册 [dash.cloudflare.com](https://dash.cloudflare.com)
2. 左侧 `Workers & Pages` → `Create` → `Pages` → `Upload assets`
3. 把**要上传的那些文件**（同上）拖进去
4. `Deploy site` → 几十秒后拿到 `https://xxx.pages.dev` 的地址

优点：全球 CDN，国内访问通常比 GitHub Pages 快，构建无限制。
自定义域名也可以直接绑定（在 Cloudflare 买域名最省事）。

---

## 方案三：国内服务器（最快，但需备案）

**如果你要挂广告，或者受众几乎全在国内**，才值得走这条路。

1. 买国内云服务器 / 虚拟主机（阿里云、腾讯云，¥60～100/年起）
2. **ICP 备案 —— 2～4 周**，这是最大的时间成本
   - 需要身份证、人脸核验
   - 个人备案**不能放广告、不能有商业内容**
   - 备案期间网站必须关闭或只显示备案中页面
3. 备案通过后，用 FTP / 宝塔面板上传文件
4. 申请免费 SSL 证书并开启 HTTPS

> 判断标准：**如果只是为了"打开快一点"，不值得等 2～4 周。**
> 先上线（方案一或二），有真实流量了再考虑迁移。

---

## 部署后建议做的三件事

1. **测试分享卡片**
   - 微信：把链接发给自己，看预览图是否正常
   - 或访问 [opengraph.xyz](https://www.opengraph.xyz/) 输入网址检查
   - 若预览图不显示，多半是 `og:image` 的 URL 不是绝对地址或不可公开访问

2. **提交给搜索引擎**（可选，但能让别人搜到）
   - [Google Search Console](https://search.google.com/search-console) → 添加资源 → 验证 → 提交 sitemap
   - [必应站长工具](https://www.bing.com/webmasters)
   - 百度搜索资源平台（国内收录靠它）

3. **加访问统计**（可选，了解有没有人用）
   - [Umami](https://umami.is/)（开源、可自建、无 Cookie 弹窗）
   - [Google Analytics](https://analytics.google.com/)
   - 接入方式：在 `index.html` 的 `</body>` 前加一段统计脚本

---

## 更新网站内容

改完 `js/db-*.js` 里的数据后：

```powershell
# 1. 跑测试，确认没改坏
node tools/selftest.mjs
node tools/dataaudit.mjs

# 2. 重新构建单文件版（如果你也在分发单文件）
node tools/build-standalone.mjs

# 3. 把改动过的文件重新上传到托管平台
```

GitHub 网页版可以直接编辑单个文件并提交，改数据很方便。
改了数据记得顺手更新 `index.html` 里的 `lastmod`（sitemap）和版本号。

---

## 常见问题

**Q：打开是空白页 / 只有文字没样式？**
A：`assets/` 或 `js/` 没上传完整。检查这两个文件夹是否都在仓库根目录。

**Q：404 页面没生效？**
A：`404.html` 必须放在**根目录**，且文件名大写不能错。GitHub Pages 会自动识别。

**Q：修改后刷新看不到变化？**
A：浏览器缓存。按 `Ctrl + F5` 强制刷新，或等几分钟（托管平台有 CDN 缓存）。

**Q：sitemap 提交后说读取失败？**
A：检查 `sitemap.xml` 里的域名是否已替换、URL 结尾是否有斜杠、XML 格式是否完整。

**Q：能不能不公开仓库就部署？**
A：GitHub Pages 免费版需要 Public 仓库。想私有可用 Cloudflare Pages（支持私有仓库）。

**Q：会不会有人恶意刷流量把我搞欠费？**
A：不会。GitHub Pages / Cloudflare Pages 的免费额度对静态站极其宽松，
且没有绑定支付方式就不会产生费用。
