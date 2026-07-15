# OrbitGo 太阳系旅行导航原型

这是一个静态 Web 原型，用本地 Three.js/WebGL 渲染 3D 太阳系，用 DOM 实现导航产品界面。产品分为“真实航天”和“跃迁探索”两套相互独立的体验，并为后续迁移微信小程序保留核心模块边界。

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

- 真实航天：内置 NASA/JPL Horizons DE441 状态向量，覆盖 2042-01-01 至 2048-08-28
- 真实航天：日心两体 Lambert 转移、出发/到达/总 Δv、C3 与转移窗口比较
- 跃迁探索：以 1 au = 149,597,870.7 km 为距离单位的能源规划
- 五类虚构能源、每个可达行星/卫星矿脉、库存、采集与实际启航扣除
- 常规推进与曲率晶核跃迁两种娱乐航行方式
- 第一人称姿态仪、油门、反应堆、能源与跃迁控制台
- 启航时冻结轨迹与到达历元，避免追逐移动天体造成镜头抖动
- 已配置星球风貌的天体使用对应地表起飞与着陆场景，未配置的天体沿用中心锁定的轨道港景观
- 地表风貌阶段隔离太阳系天体图层，只保留当地地形、天空与飞行器
- 月球与火星起降接入 NASA/JSC、NASA/JPL-Caltech 实景素材，其余天体使用带凹凸、环形山、冰裂纹与大气差异的程序化拟真风貌
- Blender 制作的原创掠翼飞船，包含宽幅双翼、装甲座舱、三组推进器、进气光环和起落架；网页运行时加载 GLB，失败时自动回退程序化模型
- 地表第三人称起飞、深空第一视角巡航、目的地第三人称下降与着陆连续镜头
- 卫星航线在离港和抵达阶段冻结端点，母行星退到可见背景位，避免遮挡和高速公转带动镜头
- 全窗口驾驶舱、角切科技边框、动态锁定框与真实模式天体自转跟随视角
- 环绕太阳系一周的可见奥尔特云冰质环带
- 太阳、行星、主要卫星和中继点的 WebGL 3D 地图
- NASA 星球贴图、动态光照、球体自转、土星环和星场
- 简化的行星/卫星时机运动
- 出发地、目的地、路线模式、交通工具选择
- 预计耗时、航程、窗口评分、风险等级
- 时间滑杆、时间播放、缩放、视角拖拽
- 3D 航线、起终点标记、流动粒子和飞船巡航
- 总览、路线、近景、深空第一人称四种视角模式
- 第一人称导航门、星流和实时剩余航程 HUD

## 模型边界

真实航天模式使用 JPL 状态向量作为出发与到达边界，并用太阳中心两体 Lambert 解算。当前 Δv 是天体日心速度与瞬时脉冲转移速度之差，不含停泊轨道逃逸/捕获、有限推力、修正机动和多体摄动，因此用于交互式早期方案比较，不可直接作为任务设计结果。为保证地图可读性，卫星与母行星的局部显示距离会被放大。

`assets/ephemeris/jpl/` 是预生成静态数据，GitHub Pages 运行时不依赖 JPL API。重新生成需要 Node.js 18+ 和网络：

```bash
node scripts/generate-jpl-ephemeris.mjs
```

飞船的可编辑源文件与网页模型位于 `assets/models/`。安装 Blender 后可以重新生成：

```bash
blender --background --python scripts/blender/build-space-opera-ship.py
```

## 文件结构

```text
solar-voyage-nav/
  index.html              应用骨架
  styles.css              地图 UI 视觉与响应式布局
  assets/                 本地 NASA 贴图、Blender 源文件、GLB 模型与清单
  scripts/blender/        飞船建模、预览与 GLB 导出脚本
  src/app.js              数据、路线、时间与导航 UI 状态
  src/webgl-scene.js      Three.js/WebGL 3D 渲染器
  vendor/three.*.js       本地 Three.js 0.185.1 运行文件
  vendor/addons/          与当前 Three.js 版本一致的 GLTFLoader 依赖
  docs/design.md          产品分类与可细化项
  docs/asset-sources.md   星球真实感与公开资源路线
  docs/wechat-miniapp.md  微信小程序迁移路径
```
