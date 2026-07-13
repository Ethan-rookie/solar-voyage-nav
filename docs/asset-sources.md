# 星球真实感与开源资源路线

## 当前实现

当前版本已经接入一批本地 NASA 贴图，并保留 Canvas 程序化拟真材质作为 fallback：

- Earth：`assets/textures/nasa/earth.jpg`
- Moon：`assets/textures/nasa/moon.jpg`
- Mars：`assets/textures/nasa/mars.jpg`
- Jupiter：`assets/textures/nasa/jupiter.jpg`
- Saturn：`assets/textures/nasa/saturn.jpg`

地表起降阶段另外使用：

- Moon：Apollo 15 月面照片 `assets/surfaces/nasa/moon-surface.jpg`
- Mars：Perseverance Navcam 360 全景 `assets/surfaces/nasa/mars-panorama.jpg`

其余可着陆天体使用按天体类型生成的高频地表材质、凹凸贴图、环形山、冰裂纹或火山裂隙。这里的目标是保持视觉可信和风貌差异，不将程序化场景标记为真实照片。

没有真实贴图或贴图加载失败时，会继续使用程序化材质：

- 地球：海洋、陆地、云带
- 火星：铁锈色地表、尘带、极冠
- 木星：多层云带、大红斑
- 土星：云带、环系统
- 月球/水星/谷神星：环形山、岩石斑块
- 欧罗巴：冰面裂纹
- 泰坦：橙色雾霾
- 海王星：蓝色大气层和风暴斑

这种方式适合小程序第一版：包体小、离线可用、没有贴图下载和版权处理成本。

## 推荐资源

### NASA 3D Resources

NASA 3D Resources 是最适合优先接入的资源库，包含 3D 模型、可打印模型和纹理。NASA 页面说明这些资源免费可下载和使用，并镜像到 GitHub，但仍需遵守 NASA Images and Media Usage Guidelines。

适合接入：

- 星球/卫星贴图
- 月球、火星地形或表面资源
- 探测器、航天器、空间站模型

### NASA Images and Media Usage Guidelines

NASA 指南说明，NASA 内容，包括 3D 模型渲染中使用的 texture maps 和 polygon data，通常在美国不受版权保护，可用于网页、计算机图形模拟、教育和信息用途。但需要注意：

- 不要暗示 NASA 背书
- 不要滥用 NASA 标识、logo、徽章
- 如果页面标记了第三方版权，需要单独处理
- 商业用途、人物肖像、商品化需要额外检查

### Three.js

后续如果要从伪 3D Canvas 升级到真正 3D，Three.js 是优先选项。它是 MIT License，适合 Web 端做真实球体、纹理、光照、后期效果和相机控制。

小程序方向可以评估：

- threejs-miniprogram 适配
- 小程序 WebGL 原生实现
- 保留当前 Canvas 2D 作为低端设备 fallback

## 接入阶段

第一阶段：

- 保留当前程序化材质
- 调整星球外观，使用户能一眼识别真实特征

第二阶段：

- 新增 `assets/textures/` 目录
- 使用 NASA 低分辨率贴图，控制首包体积
- 地球、月球、火星、木星、土星优先

第三阶段：

- 抽象 `body.visual.texture`
- Canvas 版用 `drawImage` 裁剪到球体
- WebGL 版用球体 UV 贴图

第四阶段：

- 微信小程序分包加载高清贴图
- 远日行星和卫星按需加载
- 近景模式再加载高清资源
