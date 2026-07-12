# OrbitGo 太阳系旅行导航原型

这是一个静态 Web 原型，用本地 Three.js/WebGL 渲染真实 3D 太阳系，用 DOM 实现导航产品界面。当前版本用于验证产品结构、电影感视觉、路线与交通工具交互，并为后续迁移微信小程序保留核心模块边界。

## 运行

项目使用 ES Modules，需要通过本地静态 HTTP 服务运行。直接双击
`index.html` 会受到浏览器模块安全策略限制。

```bash
cd /Users/chenglin/selfvibe/solar-voyage-nav
python3 -m http.server 5178
```

然后访问 `http://127.0.0.1:5178/`。

`127.0.0.1` 仅限当前电脑访问。关闭终端或终止 Python 进程后，本地站点也会停止。

## 发布到 GitHub Pages

项目是纯静态站点，不需要 Vite、Node.js 后端、数据库或服务器。仓库已经包含
`.github/workflows/pages.yml`，推送到 GitHub 的 `main` 分支后可以由 GitHub Actions
自动发布。

首次发布：

```bash
cd /Users/chenglin/selfvibe/solar-voyage-nav
git init -b main
git add .
git commit -m "Initial OrbitGo site"
gh auth login -h github.com
gh repo create solar-voyage-nav --public --source=. --remote=origin --push
```

然后进入 GitHub 仓库的 `Settings > Pages`，确认 `Source` 为 `GitHub Actions`。
发布地址通常为：

```text
https://<GitHub 用户名>.github.io/solar-voyage-nav/
```

项目内资源全部使用相对路径，可以直接部署在 GitHub Pages 的仓库子路径下。

## 当前能力

- 太阳、行星、主要卫星和中继点的 WebGL 3D 地图
- NASA 星球贴图、动态光照、球体自转、土星环和星场
- 简化的行星/卫星时机运动
- 出发地、目的地、路线模式、交通工具选择
- 预计耗时、航程、窗口评分、风险等级
- 时间滑杆、时间播放、缩放、视角拖拽
- 3D 航线、起终点标记、流动粒子和飞船巡航
- 总览、路线、近景、深空第一人称四种视角模式
- 第一人称导航门、星流和实时剩余航程 HUD

## 文件结构

```text
solar-voyage-nav/
  index.html              应用骨架
  styles.css              地图 UI 视觉与响应式布局
  assets/                 本地 NASA 贴图资产与清单
  src/app.js              数据、路线、时间与导航 UI 状态
  src/webgl-scene.js      Three.js/WebGL 3D 渲染器
  vendor/three.*.js       本地 Three.js 0.185.1 运行文件
  docs/design.md          产品分类与可细化项
  docs/asset-sources.md   星球真实感与公开资源路线
  docs/wechat-miniapp.md  微信小程序迁移路径
```
