# picTagView

picTagView 是一个本地图片管理系统，后端基于 FastAPI + SQLModel + SQLite，前端基于 Vue 3 + Vue CLI。项目支持图片导入、日期与相册浏览、标签管理、收藏夹、搜索、回收站、缩略图缓存和元数据编辑等本地图库工作流。

本文档重点说明：**如何在完全空的工程拉取后，从零开始安装依赖并启动整个项目**。

## 功能与代码速查

如果你只是想快速定位代码，而不是从头读完整文档，可以先按下面的映射找入口：

| 关注点 | 先看哪里 | 深入文档 |
| --- | --- | --- |
| 首页、图库、搜索、标签、设置等一级页 | `frontend/src/pages/*.vue` 文件头说明 | `frontend/Frontend_README.md` |
| 月份、标签、收藏、搜索结果、回收站等二级浏览 | `frontend/src/pages/BrowsePage.vue` 文件头说明 | `frontend/commonBrowsePage.md` |
| 前端路由入口 | `frontend/src/router/index.js` | `frontend/Frontend_README.md` |
| 后端接口职责与端点 | `backend/app/api/**/*.py` 文件头说明 | `backend/api_services.md` |
| 后端结构、运行目录与服务层 | `backend/app/main.py`、`backend/app/services/*` | `backend/techReadme.md` |

推荐的阅读顺序是：先看目标文件头注释，再看对应专题文档；这样通常不需要把整份说明书从头翻到尾。

## 1. 环境要求

在开始之前，请先准备以下环境：

- Windows 10 / Windows 11
- Python 3.10 或更高版本
- Node.js 16 或更高版本
- npm（随 Node.js 一起安装）
- Git

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

1. 使用根目录 `.venv` 启动后端 `uvicorn app.main:app --reload`
2. 检查后端是否能响应 `http://127.0.0.1:8000/`
3. 在前端目录执行 `npm run serve`

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

## 5. 启动后访问地址

默认情况下：

- 后端地址：`http://127.0.0.1:8000`
- 前端地址：`http://localhost:8080`

如果一切正常，浏览器打开前端地址后就可以进入应用。

## 6. 首次启动时会自动创建的目录

后端启动时会自动创建运行所需目录，包括：

- `backend/data`
- `backend/temp`
- `backend/data/cache`
- `backend/data/viewer_icons`
- `media`
- `trash`

因此从空工程开始时，不需要手工提前创建这些目录。

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

### 7.4 端口被占用

后端默认占用 `8000`，前端默认占用 `8080`。如果提示端口冲突，先关闭占用这两个端口的旧进程，再重新启动。

## 8. 目录结构概览

```text
surveyPotrolSystem_main/
├── backend/                # FastAPI 后端
│   ├── app/                # API、模型、服务和配置
│   ├── data/               # SQLite 数据、缓存和运行数据
│   ├── temp/               # 临时缩略图与月份封面
│   └── requirements.txt    # 后端依赖
├── frontend/               # Vue 前端
│   ├── src/                # 页面、组件、路由和工具
│   └── package.json        # 前端依赖与脚本
├── build/
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

如果不想使用批处理脚本，也可以在两个终端里分别运行后端和前端命令。

## 10. 说明

- 后端入口文件是 `backend/app/main.py`
- 前端开发服务由 Vue CLI 提供
- 项目没有配置前端代理，前端默认直连 `http://127.0.0.1:8000`
- 数据库和运行目录会在后端首次启动时自动初始化

如果你只是想快速验证项目能跑起来，优先执行 `build\start_project.bat`。