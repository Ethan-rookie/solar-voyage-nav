# 微信小程序迁移路径

## 推荐架构

核心原则：把“会变的产品规则”和“平台相关渲染”分离。

```text
core/
  bodies        天体、地点、港口、景点数据
  ephemeris     JPL 星历读取、插值与简化星体运动
  astrodynamics Lambert、Δv、C3 与轨迹采样
  energy        矿脉、库存、采集与能源消耗
  vehicles      交通工具能力模型
  planner       路线生成、评分、风险、耗时
  formatting    日期、距离、耗时格式化

renderers/
  webThree       当前浏览器 Three.js/WebGL 实现
  wxThree        小程序 Three.js/WebGL 适配实现
  wxCanvas2d     低性能设备的可选降级实现

ui/
  web            当前 DOM 面板
  miniprogram    WXML/WXSS/TS 页面组件
```

## 小程序技术选择

当前推荐：

- 小程序 WebGL Canvas
- `threejs-miniprogram` 或等价 Three.js 适配层
- 星球贴图、飞船模型按分包或远程资产缓存加载
- JPL 星历按天体拆包；只下载当前路线端点和必要母行星

可选降级：

- 小程序原生 Canvas 2D，仅保留球体投影、轨道线、标签和航线
- Taro / uni-app 负责业务 UI，3D Canvas 仍使用平台适配代码

## 迁移顺序

1. 将 `src/app.js` 里的数据和纯函数拆到 `core/`
2. 为路线规划、时间运动补最小单元测试
3. 将 `src/webgl-scene.js` 的场景图逻辑拆成平台无关配置与 Web 适配器
4. 新建小程序页面，只先接 `core/` 数据和路线面板
5. 接入小程序 WebGL Canvas 与 Three.js 适配层
6. 真机验证帧率、内存和包体
7. 为低性能设备补充 Canvas 2D 降级模式

## 小程序注意点

- 不依赖 CDN，所有贴图和模型必须本地或后台下发后缓存
- 控制首包大小，星球贴图、飞船、音效适合分包
- 当前全量 JPL 星历约 12 MB，不应进入小程序首包，建议放到对象存储并按天体缓存
- Canvas 标签不适合过多 DOM 叠加，标签绘制最好统一走 Canvas
- 浏览器 DOM 标签层需要改成小程序 Cover View 或 WebGL Sprite
- 触摸交互以单指旋转、双指缩放为主
- 分享路线可以生成一张 Canvas 海报
- 路线数据应可序列化，方便分享和恢复

## 当前原型中可复用的部分

- `BODIES` 数据结构
- `VEHICLES` 数据结构
- `ROUTE_MODES` 数据结构
- `ENERGY_TYPES` 与采集/消耗纯函数
- `src/astrodynamics.js` 中不依赖 DOM 的 Lambert 和轨迹采样
- `getBodyPosition`
- `calculateWindowScore`
- `resolveWaypoints`
- `buildRoute`
- `formatDate`
- `formatDuration`

## 当前原型中需要替换的部分

- DOM 查询与事件绑定
- 浏览器 `requestAnimationFrame` 管理方式
- WebGL Canvas 创建、尺寸和 DPR 处理
- 鼠标滚轮与 Pointer Events
- HTML/CSS 面板
- Three.js 浏览器纹理加载器与模块加载路径
