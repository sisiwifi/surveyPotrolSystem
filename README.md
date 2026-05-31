# picTagView

picTagView 是一个本地图片与外业数据管理系统，后端基于 FastAPI + SQLModel + PostgreSQL，前端基于 Vue 3 + Vue CLI，并已切换到 MapLibre GL JS 作为地图主引擎。项目当前支持图片导入、日期与相册浏览、标签管理、收藏夹、搜索、回收站、缩略图缓存、统一鉴权，以及 SHP / CSV 矢量数据、超大栅格影像的导入与地图展示。

本项目以内置 PostgreSQL 作为固定运行架构，数据库运行时属于项目本体的一部分，而不是部署时再选择的可替换组件。是否已经在当前机器建立好这套内置运行时，只是部署状态问题，不是数据库类型选择问题。

本文档重点说明：**如何在完全空的工程拉取后，从零开始安装依赖并启动整个项目**。

## 功能与代码速查

如果你只是想快速定位代码，而不是从头读完整文档，可以先按下面的映射找入口：

| 关注点 | 先看哪里 | 深入文档 |
| --- | --- | --- |
| 首页、图库、搜索、标签、设置等一级页 | `frontend/src/pages/*.vue` 文件头说明 | `frontend/Frontend_README.md` |
| 月份、标签、收藏、搜索结果、回收站等二级浏览 | `frontend/src/pages/BrowsePage/index.vue` 文件头说明 | `frontend/commonBrowsePage.md` |
| 前端路由入口 | `frontend/src/router/index.js` | `frontend/Frontend_README.md` |
| 后端接口职责与端点 | `backend/app/api/**/*.py` 文件头说明 | `backend/api_services.md` |
| 后端结构、运行目录与服务层 | `backend/app/main.py`、`backend/app/services/*` | `backend/techReadme.md` |

推荐的阅读顺序是：先看目标文件头注释，再看对应专题文档；这样通常不需要把整份说明书从头翻到尾。

## 当前重构状态

- 统一数据库已经从多 SQLite 切到单一 PostgreSQL 主库，默认库名为 `survey_potrol_system`。
- 前端地图页已经从 Leaflet 切到 MapLibre，底图仍使用天地图配置，但矢量图层展示改走后端 GeoJSON 接口。
- `/vectors` 页面已支持服务路径导入 SHP / CSV / ZIP；其中 SHP 会由服务端自动补齐同目录同名 `.prj/.shx/.dbf` 等侧车文件，并在导入时校验经纬度范围、自动纠正常见轴序颠倒；旧错误数据需删除后重导，浏览器上传入口则收敛为 CSV / ZIP。
- `/rasters` 页面已切到服务路径预检 + 后台任务导入模式，浏览器不再直接上传超大栅格影像；导入模式可在库内副本上构建真实概览金字塔，`load_only` 可选服务端瓦片缓存，地图页会反馈栅格“加载中 / 已就绪 / 加载失败”状态。
- 前端路由守卫已改为进入受保护页面前先调用 `/api/auth/me` 验证登录态。
- 默认测试账号会在后端初始化时自动创建：`admin / 123456`、`guest / qwerty`。

## 1. 环境要求

在开始之前，请先准备以下环境：

- Windows 10 / Windows 11
- Python 3.10 或更高版本
- Node.js 16 或更高版本
- npm（随 Node.js 一起安装）
- Git

当前仓库已经开始接入“项目自管运行时”模式：

- 后端与启动脚本会读取 `backend/runtime_config.json`
- 本工程只支持内置 PostgreSQL；`build/start_project.bat` 启动前会检查 `backend/runtime/postgresql/bin` 是否完整
- 当前仓库**尚未直接附带** PostgreSQL / PostGIS 二进制；如果当前机器缺少项目所需的内置运行时，启动脚本会明确报出“缺少内置 PostgreSQL 运行时”
- 修复脚本会自动发现本机 PostgreSQL 安装并复制到项目运行时目录；如果 `5432` 已被占用，会自动把内置库改到空闲端口

建议使用 PowerShell 或命令提示符执行下面的命令。

## 2. 拉取工程

先把仓库克隆到本地，然后进入项目根目录：

```powershell
git clone <你的仓库地址>
cd surveyPotrolSystem_main
```

如果你已经把代码下载到了本地，只需要进入工程根目录即可。

## 3. 安装依赖

项目由后端和前端两部分组成，需要分别安装依赖。

### 3.1 创建后端虚拟环境

项目约定使用**根目录下的** `.venv` 作为后端 Python 虚拟环境。注意不是 `backend\.venv`。

```powershell
python -m venv .venv
```

如果你机器上 `python` 不是你想要的版本，请改用对应的 Python 启动器，比如 `py -3.11 -m venv .venv`。

### 3.2 安装后端依赖

先激活虚拟环境，再安装后端依赖：

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt
```

当前 `backend/requirements.txt` 已固定 `rasterio==1.5.0`，用于兼容 Windows 上的 Python 3.14 环境；不要回退到 `1.4.3`，否则会再次遇到缺少可用 wheel 的安装失败问题。

后端依赖装完后，请确认 `backend/runtime_config.json` 可用。该文件定义项目内置 PostgreSQL 的主机、端口、运行时目录和集群目录；当前仓库中的默认值是 `127.0.0.1:55432`，但修复脚本会在端口冲突时自动回写新的空闲端口。

代码内部仍保留 `SURVEY_DB_*` 与 `DATABASE_URL` 的解析兼容入口，用于配置装载和排查场景；它们属于实现细节，不构成“可切换为外部 PostgreSQL” 的项目运行模式。

本工程必须使用内置 PostgreSQL。如果当前机器还没有建立这套运行时，可自行执行：

```powershell
build\repair_embedded_pg.bat
```

如果自动发现不到本机 PostgreSQL 安装，可以显式指定来源目录：

```powershell
build\repair_embedded_pg.bat -SourceRoot "C:\Program Files\PostgreSQL\17"
```

这个修复脚本会完成四件事：

1. 强制把 `database.embedded` 维持为 `true`
2. 自动发现并复制本机 PostgreSQL 运行时到 `backend/runtime/postgresql`
3. 如果 `5432` 已被其他 PostgreSQL 占用，自动把内置库端口改写为一个空闲端口
4. 初始化 `backend/data/postgresql/cluster`，为后续一键启动做好准备

如果你的系统禁止执行 PowerShell 脚本，可以改用 cmd：

```bat
.\.venv\Scripts\activate.bat
python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt
```

### 3.3 安装前端依赖

进入前端目录并安装 npm 依赖：

```powershell
cd frontend
npm install
cd ..
```

如果你后面重新拉取依赖或清理过 `node_modules`，再次执行 `npm install` 即可。

## 4. 启动项目

### 4.1 一键启动

仓库提供了 Windows 批处理脚本，可以同时启动后端和前端：

```powershell
build\start_project.bat
```

这个脚本会做下面几件事：

1. 读取 `backend/runtime_config.json` 中的后端与数据库运行时配置
2. 先执行一次旧实例清理，关闭上次残留的后端 / 前端窗口，并尝试停止内置 PostgreSQL
3. 检查内置 PostgreSQL 运行时；如果缺失，则明确提示当前机器缺少项目要求的内置 PostgreSQL 运行时，并给出可选的补齐方式
4. 检查当前终端是否是管理员权限；如果是，只把内置 PostgreSQL 启动步骤转发到标准用户会话，再回到当前会话继续拉起后端和前端
5. 调用 `build/pg_runtime.ps1 start` 启动 `backend/runtime/postgresql/bin` 下的内置 PostgreSQL
6. 使用根目录 `.venv` 按配置端口启动后端 `uvicorn app.main:app --reload`
7. 检查后端是否能响应当前配置端口
8. 在前端目录执行 `npm run serve`，并把 `VUE_APP_API_BASE` 注入为当前后端地址

如果当前还没有建立内置 PostgreSQL 运行时，启动脚本会直接以“缺少内置 PostgreSQL 运行时”的前置错误退出；如果你决定在当前机器补齐该运行时，可执行 `build\repair_embedded_pg.bat`，完成后再重新运行 `build\start_project.bat`。

后端首次启动会自动完成以下动作：

1. 连接 PostgreSQL 管理库并在缺失时创建 `survey_potrol_system`
2. 创建全部业务表、用户表和矢量数据表
3. 尝试启用 PostGIS 扩展；如果本机数据库未安装扩展，会自动回退为普通 JSON 几何存储
4. 补齐种子账号与默认主分类

### 4.2 手动启动

如果你希望手动分别启动，也可以打开两个终端窗口。

后端：

```powershell
cd backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

前端：

```powershell
cd frontend
npm run serve
```

嵌入式 PostgreSQL 运行时：

```powershell
build\pg_runtime.ps1 start
build\pg_runtime.ps1 status
build\pg_runtime.ps1 stop
```

如果你已经放好了便携式 PostgreSQL/PostGIS 二进制，建议先用上面的命令确认运行时状态，再启动前后端。

## 5. 启动后访问地址

默认情况下：

- 后端地址：`http://127.0.0.1:8000`
- 前端地址：`http://localhost:8080`

如果一切正常，浏览器打开前端地址后就可以进入应用。

默认测试账号：

- 管理员：`admin / 123456`
- 访客：`guest / qwerty`

## 6. 首次启动时会自动创建的目录

后端启动时会自动创建运行所需目录，包括：

- `backend/data`
- `backend/temp`
- `backend/data/cache`
- `backend/data/viewer_icons`
- `media`
- `trash`

因此从空工程开始时，不需要手工提前创建这些目录。注意：当前业务主库已经不再存放在 `backend/data/*.db`，`backend/data` 主要保留运行时设置、缓存和兼容清理用的旧文件位置。

## 7. 常见问题

### 7.1 提示找不到 `.venv`

`build\start_project.bat` 默认只认**根目录**的 `.venv`。如果你把虚拟环境建在了 `backend\.venv`，脚本会失败。

如果仓库里还残留旧的 `backend\.venv`，可以直接删除；它不会被当前脚本使用。

正确做法是在仓库根目录创建 `.venv`：

```powershell
python -m venv .venv
```

### 7.2 后端能起，但前端编译失败

一般是前端依赖没装全，或者 `node_modules` 被删除了。回到 `frontend` 目录重新执行：

```powershell
npm install
npm run serve
```

### 7.3 PowerShell 无法执行 Activate.ps1

这是 PowerShell 的执行策略限制。你可以改用 `activate.bat`，或者临时放宽当前会话策略后再激活虚拟环境。

### 7.4 管理员终端启动失败

Windows 下的内置 PostgreSQL 不能直接从“以管理员身份运行”的终端里启动。

当前的 `build\start_project.bat` 已经会自动把“内置 PostgreSQL 启动”这一步转发到标准用户会话，所以即使你是从管理员 VS Code / 终端里点的启动脚本，也可以继续跑完整套启动流程。

只有在自动转发失败时，你才需要手工关闭管理员终端，重新打开一个**普通权限**的 PowerShell 或 cmd，再运行：

```powershell
build\start_project.bat
```

如果之前残留了旧的 backend / frontend 窗口，可以先执行：

```powershell
build\stop_project.bat
```

### 7.5 端口被占用

后端默认占用 `8000`，前端默认占用 `8080`。如果提示端口冲突，先关闭占用这两个端口的旧进程，再重新启动。

如果项目内置 PostgreSQL 当前配置端口已被其他进程占用，可以自行执行 `build\repair_embedded_pg.bat`。修复脚本会为项目内置数据库选择一个空闲端口，并把结果回写到 `backend/runtime_config.json`。

### 7.6 找不到内置 PostgreSQL 运行时

如果启动脚本提示找不到 `backend/runtime/postgresql/bin`，说明当前机器还没有建立好项目所需的内置 PostgreSQL 运行时。这不是数据库类型选择问题，而是当前机器尚未补齐项目固定运行架构所需的数据库运行时。

如果你准备在本机补齐这套运行时，可以执行：

```powershell
build\repair_embedded_pg.bat
```

如果自动发现不到本机 PostgreSQL 安装，再显式指定来源目录：

```powershell
build\repair_embedded_pg.bat -SourceRoot "C:\Program Files\PostgreSQL\17"
```

修复脚本完成后，再重新运行 `build\start_project.bat`。

## 8. 目录结构概览

```text
surveyPotrolSystem_main/
├── backend/                # FastAPI 后端
│   ├── app/                # API、模型、服务和配置
│   ├── data/               # 运行设置、缓存、查看器图标与兼容清理目录
│   ├── temp/               # 临时缩略图与月份封面
│   └── requirements.txt    # 后端依赖
├── frontend/               # Vue 前端
│   ├── src/                # 页面、组件、路由、MapLibre 地图与工具
│   └── package.json        # 前端依赖与脚本
├── build/
│   ├── pg_runtime.ps1      # 内置 PostgreSQL 生命周期脚本
│   ├── pg_runtime.bat      # 批处理入口；start_project/stop_project 通过它调用内置 PostgreSQL 生命周期
│   ├── repair_embedded_pg.bat # 内置 PostgreSQL 一键修复入口
│   ├── repair_embedded_pg.ps1 # 复制运行时、改端口并初始化集群
│   ├── run_unelevated.ps1  # 管理员终端下自动降权重放 start_project 的内部辅助脚本
│   ├── stop_project.bat    # 关闭旧的后端 / 前端窗口并停止内置数据库
│   └── start_project.bat   # 一键启动脚本
├── media/                  # 媒体目录
├── trash/                  # 回收站物理目录
└── README.md               # 本说明文件
```

## 9. 推荐启动流程

如果你是第一次在这台机器上运行这个工程，建议按下面顺序执行：

```powershell
cd surveyPotrolSystem_main
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt
cd frontend
npm install
cd ..
build\start_project.bat
```

如果在这台机器上尚未建立项目内置 PostgreSQL 运行时，可以在安装后端依赖后，自行补一条：

```powershell
build\repair_embedded_pg.bat
```

如果不想使用批处理脚本，也可以在两个终端里分别运行后端和前端命令。

## 10. 说明

- 后端入口文件是 `backend/app/main.py`
- 前端开发服务由 Vue CLI 提供
- 前端会从启动脚本注入的 `VUE_APP_API_BASE` 读取后端地址；如果你直接单独启动前端，默认仍回退到 `http://127.0.0.1:8000`
- PostgreSQL 数据库、种子账号和运行目录会在后端首次启动时自动初始化
- 项目级运行时配置文件是 `backend/runtime_config.json`
- 如果当前机器报出“缺少内置 PostgreSQL 运行时”，而你准备在本机补齐该运行时，可自行执行 `build\repair_embedded_pg.bat`
- 内置 PostgreSQL 建好后，可以用 `build\pg_runtime.ps1` 管理它

如果你只是想快速验证项目能跑起来，优先执行 `build\start_project.bat`。