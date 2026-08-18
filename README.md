# Everything HTTP Server · NAS 前端增强模板

> 基于 Everything 内置 HTTP 服务器打造的私人 NAS 网页界面。
> 暗色主题 · 图片灯箱 · 视频在线播放 · 列表/卡片双视图 · 全端响应式

---

## 简介

Everything 自带一个轻量 HTTP 服务器，允许通过浏览器搜索和访问本机已索引的文件。它的默认页面功能朴素，只提供最基础的目录浏览和文件下载。

本模板在不更换服务器、不加装任何第三方服务的前提下，通过 **`http_server_strings.ini` 定制页面结构 + 静态资源覆盖（CSS/JS）**，把默认页面升级为一个具备现代 NAS 体验的网页界面：

- **图片**：卡片缩略图墙（懒加载）→ 点击全屏灯箱浏览，支持键盘 / 触屏滑动切换
- **视频**：页面内 HTML5 在线播放，可拖拽进度、倍速、全屏；浏览器无法解码的编码自动识别并给出下载兜底
- **整体**：群晖 / 极空间风格的暗色主题，移动端 / 平板 / 桌面全适配

样式、图标全部本地化、无后台进程；`nas.js` 需通过**外链**加载才能生效（详见[注意事项](#注意事项)），开启 Everything 的 HTTP 服务器即可使用。

---

## 功能特性

### 图片处理
- 卡片模式下图片以缩略图网格展示，`IntersectionObserver` 懒加载，滚动才加载，图片多也不卡
- 点击任意缩略图进入**全屏灯箱**：
  - `←` / `→` 或触屏左右滑动切换上一张 / 下一张
  - `Esc` 或点击遮罩 / ✕ 关闭
  - 顶部显示文件名与当前序号（如 `3 / 120`）
- 列表模式保持原生干净列表，不打扰纯文件浏览

### 视频处理
- 支持浏览器原生解码的格式（`mp4 / m4v / webm / mov / mpg / mpeg / ogv / avi / 3gp` 等）**在线播放**
- 自定义**影院模式**播放器：
  - 画面点击播放/暂停，双击全屏
  - 可拖拽进度条（支持触屏），显示缓冲进度
  - 倍速切换 `0.5x → 1x → 1.25x → 1.5x → 2x`
  - 音量调节、静音一键切换
  - 鼠标静止 3 秒自动隐藏控制条，全屏黑场观影
  - 右上角直接下载
- 视频卡片以**首帧作为海报**（`<video preload="metadata" src="#t=0.1">`），无需缩略图服务
- **编码兜底**：H.265/HEVC、HDR、10bit、超高码率等浏览器无法解码的视频（`mkv / ts / m2ts / wmv / flv / rmvb / rm / vob / asf / f4v / mts / divx / xvid`），自动检测并提示下载，配合 PotPlayer / VLC 观看

### 视图与浏览
- **列表 / 卡片**一键切换，选择记忆在 `localStorage`，刷新、翻页、搜索后依然保持
- 卡片视图下文件夹、普通文件、返回上级入口同样卡片化（CSS 绘制图标，无图片依赖）
- 普通文件点击新窗口打开 / 下载

### 界面
- 暗色 NAS 主题：渐变星空背景、毛玻璃卡片、主题色高亮
- 响应式布局：桌面 4 列 → 平板 3 列 → 手机 2 列；手机上表格自动转为卡片流
- 搜索框、分页、排序均保留服务器原生能力

---

## 文件结构

```
HTTP Server/
├── http_server_strings.ini   # 核心模板：定制服务器生成的 HTML 结构
├── main.css                  # 暗色 NAS 主题样式（含灯箱/播放器/卡片视图）
├── nas.js                    # 前端增强逻辑（视图切换/灯箱/播放器/懒加载）
├── logo.png                  # 页面 Logo
├── favicon.ico               # 站点图标
├── folder.gif                # 文件夹图标
├── file.gif                  # 文件图标
├── updir.gif                 # 上级目录图标
├── up.gif                    # 升序排序图标
├── down.gif                  # 降序排序图标
└── everything.gif            # Everything 徽标
```

> 其中 `main.css`、`nas.js`、`logo.png` 为模板新增资源；`*.gif` 与 `favicon.ico` 用于覆盖服务器默认图标。`main.css` / `logo.png` 走本地加载，`nas.js` 必须走外链（本地不渲染）。

---

## 安装配置

### 1. 放置模板文件

将整个 `HTTP Server` 文件夹放到 Everything 安装目录下（本机为 `D:\Program Files\Everything\`），与 `Everything.exe` 同级：

```
D:\Program Files\Everything\
├── Everything.exe
├── HTTP Server\          ← 模板目录
│   ├── http_server_strings.ini
│   ├── main.css
│   ├── nas.js
│   └── ...
```

Everything 启动后会自动**优先加载**该目录下的自定义资源，而不是内置默认界面。

### 2. 启用自定义模板字符串

在 Everything 搜索框中输入以下命令并回车，指定模板文件路径：

```
/http_server_strings="D:\Program Files\Everything\HTTP Server\http_server_strings.ini"
```

或在 `Everything.ini` 的 `[Everything]` 段中手动设置：

```ini
http_server_strings=D:\Program Files\Everything\HTTP Server\http_server_strings.ini
```

### 3. 启用 HTTP 服务器

1. 打开 Everything → **工具 → 选项** → **HTTP 服务器**
2. 勾选 **启用 HTTP 服务器**
3. 设置端口（如 `8080`），按需设置用户名 / 密码
4. 点击 **确定**

> 修改模板后需重启 HTTP 服务器（取消勾选 → 应用 → 重新勾选 → 确定），并在浏览器按住 `Shift + F5` 强制刷新缓存。

### 4. 访问

浏览器打开 `http://<本机IP>:8080`（局域网内任意设备均可访问）。

---

## 使用说明

| 场景 | 操作 |
|---|---|
| 列表 ↔ 卡片切换 | 搜索框下方 **列表 / 卡片** 按钮 |
| 图片预览 | 卡片模式点击缩略图 → 灯箱大图 |
| 灯箱上一张 / 下一张 | `←` / `→` 或触屏滑动 |
| 关闭灯箱 | `Esc` / 点击遮罩 / ✕ |
| 视频播放 / 暂停 | 点击画面、大播放按钮或空格 |
| 视频快进 / 快退 | `←` / `→`（±5 秒） |
| 音量增减 | `↑` / `↓` |
| 全屏 | `F` 或双击画面 |
| 静音 | `M` |
| 视频下载 | 播放器右上角 ⤓ |

---

## 工作原理

Everything 内置 HTTP 服务器的页面是**服务器端生成的 HTML**，无法直接替换整个页面。模板通过两层机制实现定制：

1. **`http_server_strings.ini`** — Everything 官方支持的自定义模板字符串，可改写服务器输出页面的 HTML 骨架（`<head>`、Logo、搜索表单、结果表格、分页等），在其中注入本地 `/main.css`，以及**外链**加载的 `nas.js`（外链 URL 可替换为你自己的地址）。

2. **静态资源覆盖** — 服务器会优先从 `HTTP Server` 目录加载同名资源文件，因此放入自定义的 `main.css`、`logo.png` 即可完全接管样式与品牌图标（`nas.js` 例外，见注意事项）。

`nas.js` 在页面加载后解析服务器渲染出的结果表格，提取每个条目的类型（文件夹 / 图片 / 视频 / 普通文件）与链接，再构建卡片墙、灯箱、播放器等增强 UI，全程**不改动服务器逻辑**。

---

## 注意事项

- **版本兼容**：适用于 Everything 内置 HTTP 服务器（当前使用 Everything 1.4.1.1023 验证通过）；
- **`nas.js` 必须外链加载**：Everything 内置 HTTP 服务器对本地脚本的响应存在限制，引用 `/nas.js` 不会渲染增强 UI。`head_end` 中默认使用外链 `https://everythingnas.pages.dev/nas.js`（Cloudflare Pages 免费托管）。两种用法：
  - **使用默认外链**：保持 `head_end` 配置不变即可，由维护者统一更新脚本
  - **自建外链**：把 `HTTP Server\nas.js` 上传到你自己的个人服务器 / 对象存储 / CDN，得到可访问的 URL（如 `https://你的域名/nas.js`），替换 `head_end` 中 `<script defer src="...">` 的地址即可
- **视频编码**：`mkv` 等封装格式即使编码支持，部分浏览器也可能无法播放，会走下载兜底提示，属正常现象
- **范围请求**：Everything 支持 HTTP Range Request，视频拖拽进度条依赖此能力，请勿在服务器端代理中禁用
- **移动端**：推荐现代浏览器（Chrome / Edge / Safari），老版本浏览器可能缺少 `IntersectionObserver`、`pointer events` 支持（均有降级处理）

---

## 许可

本项目为个人 NAS 用途编写，可自由使用、修改与分发。

**Everything** © voidtools — [官方网站](https://www.voidtools.com/)
