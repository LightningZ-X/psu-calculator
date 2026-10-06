# VELTRIX 启动动画素材

用户于 2026-10-06 提供 VELTRIX Logo 图片，并要求去掉下方圆角框内的小图标，再参照提供的 ROG 动画制作和应用到功率计算器。

`veltrix-boot.png` 为清理后的 1672 × 941 图像，主标志和 VELTRIX 字样保持原有布局。Canvas 使用该图像的两个区域分别绘制主标志和字标，最终恢复完整横版 Logo。动画复现已确认的视频节奏，不含 ROG 图像像素。网页保持原先静音自播放的行为。

入口和跳过、声明、重播、减少动态效果、打印中断的生命周期契约保持一致；素材同时内联到离线单文件版。

用户随后要求同步页面 Logo 和图标。`veltrix-mark.svg`、`veltrix-wordmark.svg` 沿原图主标志和字标的实色轮廓转换成矢量，去掉背景和辉光，保持字形。它们用于页头、声明弹窗、404、favicon、主屏图标和分享卡片。

`node tools/build-logo.mjs` 同步矢量 CSS 遮罩、favicon 和 404 页；`node tools/build-icon.mjs` 生成 180×180 主屏图标；`node tools/build-og.mjs` 生成 1200×630 分享卡片；最后运行 `node tools/build-standalone.mjs` 重建离线版。
