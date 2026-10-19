# LIGHTNING 素材来源

用户于 2026-10-19 提供并要求恢复以下原始素材，PNG 与视频逐字节复制，无重新绘制：

- `lightning-mark.png`：`red_lightning_transparent.png`（94×172）。
- `lightning-wordmark.png`：`download.png`（412×62）。
- `lightningz-gap-cut-v2.mp4`：同名启动视频（1280×720，约 4.1 秒），含 `build to be perfect` 口号。

网页用透明 PNG 作为 CSS mask，沿用主题强调色；字标下保留旧版小写口号。favicon、主屏图标与 404 均来自这两张 PNG，分享卡片和单文件版由构建脚本同步生成。

标签页图标由 `node tools/build-favicon.mjs` 生成：透明 32px PNG 使用内容指纹文件名，ICO 包含 16/32/48/64px，两个链接都使用新地址以避免旧品牌的 favicon 缓存。`build-logo.mjs` 会自动运行该步骤；404 和离线版保留自包含图标。
