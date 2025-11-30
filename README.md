# Business Gemini Pool 管理系统

一个基于 Flask 的 Google Gemini Enterprise API 代理服务，支持多账号轮训、OpenAI 兼容接口和 Web 管理控制台。

## 项目结构

```
business-gemini-pool-main/
├── gemini.py                    # 后端服务主程序
├── business_gemini_session.json  # 配置文件（运行时生成）
├── requirements.txt             # Python 依赖
├── templates/                   # HTML 模板目录
│   ├── index.html              # 管理控制台
│   ├── login.html              # 登录页面
│   ├── chat_history.html       # 聊天记录页面
│   └── account_extractor.html  # 账号提取工具
├── static/                     # 静态资源目录（CSS、JS、图片等）
├── image/                      # 图片缓存目录（运行时生成）
├── video/                      # 视频缓存目录（运行时生成）
└── README.md                   # 项目文档
```

## 快速请求

### 发送聊天请求

```bash
curl --location --request POST 'http://127.0.0.1:8000/v1/chat/completions' \
--header 'Content-Type: application/json' \
--data-raw '{
    "model": "gemini-enterprise-2",
    "messages": [
        {
            "role": "user",
            "content": "你好"
        }
    ],
    "safe_mode": false
}'
```

## 功能特性

### 核心功能
- **多账号轮训**: 支持配置多个 Gemini 账号，自动轮训使用
- **OpenAI 兼容接口**: 提供与 OpenAI API 兼容的接口格式
- **流式响应**: 支持 SSE (Server-Sent Events) 流式输出
- **全链路媒体支持**: 文本、图片与视频生成一应俱全，生成结果自动生成公网 URL
- **流式文件处理**: 大尺寸图片/视频使用分块下载并直接写入缓存，避免内存飙升
- **cfbed 上传集成**: 支持将生成的图片/视频自动上传到 cfbed 服务，返回公网可访问的 URL
- **代理支持**: 支持 HTTP/HTTPS 代理配置
- **JWT 自动管理**: 自动获取和刷新 JWT Token
- **Cookie 自动刷新**: 每30分钟自动检查过期 Cookie，使用临时邮箱自动登录刷新
  - **双模式登录流程**: 支持 API 方式和浏览器方式两种独立的登录流程，自动切换
  - **智能重试机制**: API 方式失败时自动切换到浏览器方式，确保登录成功率
- **Web 登录系统**: 独立登录页与 HttpOnly Cookie 结合，保护所有管理页面

### 管理功能
- **Web 控制台**: 美观的 Web 管理界面，支持明暗主题切换
- **账号管理**: 添加、编辑、删除、启用/禁用账号
- **Cookie 自动刷新**: 支持为每个账号配置临时邮箱，自动刷新过期 Cookie
- **模型配置**: 自定义模型参数配置
- **代理测试**: 在线测试代理连接状态
- **配置导入/导出**: 支持配置文件的导入导出

### 登录流程
1. 首次访问 `http://<host>:8000/` 会被重定向至 `/login`
2. 输入后台密码（第一次登录会自动设置密码）
3. 登录成功后，服务端下发 HttpOnly Cookie，并自动跳转到管理面板
4. 登出会清除 Cookie 并返回登录页，所有管理接口均需登录后才能访问

## 项目结构

```
business-gemini-pool-main/
├── gemini.py                    # 后端服务主程序
├── business_gemini_session.json  # 配置文件（运行时生成）
├── requirements.txt             # Python 依赖
├── templates/                   # HTML 模板目录
│   ├── index.html              # 管理控制台
│   ├── login.html              # 登录页面
│   ├── chat_history.html      # 聊天记录页面
│   └── account_extractor.html  # 账号提取工具
├── static/                     # 静态资源目录（CSS、JS、图片等）
├── image/                      # 图片缓存目录（运行时生成）
├── video/                      # 视频缓存目录（运行时生成）
└── docs/                       # 文档目录
    ├── README.md
    ├── 部署指南.md
    └── 配置文件说明.md
```

## 📚 使用文档

- [首次使用指南](./docs/guides/getting-started.md) - **新用户必读**：快速开始，无需创建 JSON 文件
- [部署指南](./docs/guides/deployment.md) - 项目部署说明
- [API密钥管理](./docs/guides/api-keys.md) - API 密钥创建和使用

## 文件说明

### gemini.py

后端服务主程序，基于 Flask 框架开发。

#### 主要类和函数

| 名称 | 类型 | 说明 |
|------|------|------|
| `AccountManager` | 类 | 账号管理器，负责账号加载、保存、状态管理和轮训选择 |
| `load_config()` | 方法 | 从配置文件加载账号和配置信息 |
| `save_config()` | 方法 | 保存配置到文件 |
| `get_next_account()` | 方法 | 轮训获取下一个可用账号 |
| `mark_account_unavailable()` | 方法 | 标记账号为不可用状态 |
| `create_jwt()` | 函数 | 创建 JWT Token |
| `create_chat_session()` | 函数 | 创建聊天会话 |
| `stream_chat()` | 函数 | 发送聊天请求并获取响应 |
| `check_proxy()` | 函数 | 检测代理是否可用 |

#### API 接口

**OpenAI 兼容接口**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/v1/models` | 获取可用模型列表 |
| POST | `/v1/chat/completions` | 聊天对话接口（支持图片、视频） |
| POST | `/v1/files` | 上传文件 |
| GET | `/v1/files` | 获取文件列表 |
| GET | `/v1/files/<id>` | 获取文件信息 |
| DELETE | `/v1/files/<id>` | 删除文件 |
| GET | `/health` | 健康检查 |
| GET | `/image/<filename>` | 获取缓存图片 |
| GET | `/video/<filename>` | 获取缓存视频 |

**账号管理接口**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/accounts` | 获取账号列表（包含配额信息） |
| POST | `/api/accounts` | 添加账号 |
| PUT | `/api/accounts/<id>` | 更新账号 |
| DELETE | `/api/accounts/<id>` | 删除账号 |
| POST | `/api/accounts/<id>/toggle` | 切换账号状态（启用/停用） |
| POST | `/api/accounts/<id>/refresh-cookie` | 手动刷新账号 Cookie |
| POST | `/api/accounts/<id>/auto-refresh-cookie` | 使用临时邮箱自动刷新 Cookie |
| GET | `/api/accounts/<id>/test` | 测试账号连接 |
| GET | `/api/accounts/<id>/quota` | 获取账号配额信息（冗余，配额已包含在账号列表中） |

**模型管理接口**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/models` | 获取模型配置列表 |
| POST | `/api/models` | 添加模型配置 |
| PUT | `/api/models/<id>` | 更新模型配置 |
| DELETE | `/api/models/<id>` | 删除模型配置 |

**配置管理接口**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/config` | 获取完整配置（包含账号信息） |
| PUT | `/api/config` | 更新配置 |
| GET | `/api/config/export` | 导出配置（备份） |
| POST | `/api/config/import` | 导入配置（恢复） |

**API 密钥管理接口**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/api-keys` | 获取 API 密钥列表 |
| POST | `/api/api-keys` | 创建 API 密钥 |
| DELETE | `/api/api-keys/<id>` | 删除 API 密钥 |
| POST | `/api/api-keys/<id>/revoke` | 撤销 API 密钥 |
| GET | `/api/api-keys/<id>/stats` | 获取密钥使用统计 |
| GET | `/api/api-keys/<id>/logs` | 获取密钥调用日志 |
| GET | `/api/api-logs` | 获取所有 API 调用日志（冗余，前端未使用） |

**系统管理接口**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/status` | 获取系统状态（包含代理状态） |
| GET | `/api/logging` | 获取日志级别 |
| POST | `/api/logging` | 设置日志级别 |
| POST | `/api/proxy/test` | 测试代理连接 |
| GET | `/api/proxy/status` | 获取代理状态（冗余，状态已包含在 `/api/status` 中） |

**认证接口**

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 管理员登录 |
| POST | `/api/auth/logout` | 注销登录 |

**页面路由**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 返回管理页面（需登录） |
| GET | `/login` | 登录页面 |
| GET | `/chat_history.html` | 聊天记录页面 |
| GET | `/account_extractor.html` | 账号提取工具页面 |

> **注意**：标记为"冗余"的接口功能已包含在其他接口中，前端未使用，但保留用于未来扩展或其他客户端使用。详细说明请参考 `前端后端接口一致性检查报告.md`。

### business_gemini_session.json

> **重要提示**：系统现在主要使用**数据库**（`geminibusiness.db`）存储配置，JSON 配置文件主要用于**备份和恢复**。
> 
> 首次启动时，系统会自动检测并迁移 JSON 配置到数据库。之后配置修改会优先保存到数据库。
> 
> 详细说明请参考：[数据库使用说明.md](./数据库使用说明.md)

配置文件，JSON 格式（主要用于备份），包含以下字段：

```json
{
    "proxy": "http://127.0.0.1:7890",
    "accounts": [
        {
            "team_id": "团队ID",
            "secure_c_ses": "安全会话Cookie",
            "host_c_oses": "主机Cookie",
            "csesidx": "会话索引",
            "user_agent": "浏览器UA",
            "available": true
        }
    ],
    "models": [
        {
            "id": "模型ID",
            "name": "模型名称",
            "description": "模型描述",
            "context_length": 32768,
            "max_tokens": 8192,
            "price_per_1k_tokens": 0.0015
        }
    ]
}
```

#### 配置字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `proxy` | string | HTTP 代理地址 |
| `accounts` | array | 账号列表 |
| `accounts[].team_id` | string | Google Cloud 团队 ID |
| `accounts[].secure_c_ses` | string | 安全会话 Cookie |
| `accounts[].host_c_oses` | string | 主机 Cookie |
| `accounts[].csesidx` | string | 会话索引 |
| `accounts[].user_agent` | string | 浏览器 User-Agent |
| `accounts[].available` | boolean | 账号是否可用 |
| `accounts[].tempmail_url` | string | 临时邮箱 URL（用于自动刷新 Cookie） |
| `accounts[].tempmail_name` | string | 临时邮箱名称（用于显示） |
| `models` | array | 模型配置列表 |
| `models[].id` | string | 模型唯一标识 |
| `models[].name` | string | 模型显示名称 |
| `models[].description` | string | 模型描述 |
| `models[].context_length` | number | 上下文长度限制 |
| `models[].max_tokens` | number | 最大输出 Token 数 |

### index.html

Web 管理控制台前端，单文件 HTML 应用。

#### 功能模块

1. **仪表盘**: 显示系统概览、账号统计、代理状态
2. **账号管理**: 账号的增删改查、状态切换、JWT 测试
3. **模型配置**: 模型的增删改查
4. **系统设置**: 代理配置、配置导入导出

#### 界面特性

- 响应式设计，适配不同屏幕尺寸
- 支持明暗主题切换
- Google Material Design 风格
- 实时状态更新

## 快速开始

> **首次使用？** 请参考 [首次使用指南.md](./首次使用指南.md) - **无需创建 JSON 文件**，系统会自动初始化数据库，所有配置都可以通过 Web 界面完成。

### 环境要求

- Python 3.7+
- Flask
- requests
- Playwright (用于 Cookie 自动刷新功能)

### 安装依赖

```bash
pip install -r requirements.txt

# 安装 Playwright 浏览器（用于 Cookie 自动刷新）
playwright install chromium
```

### 配置账号

**方式一：通过 Web 界面配置（推荐）**

1. 启动服务后，访问 `http://localhost:8000`
2. 首次访问会要求设置管理员密码
3. 登录后，在「账号管理」标签页添加账号

**方式二：使用 JSON 配置文件（从旧版本迁移）**

编辑 `business_gemini_session.json` 文件，添加你的 Gemini 账号信息（系统会自动迁移到数据库）：

```json
{
    "proxy": "http://your-proxy:port",
    "accounts": [
        {
            "team_id": "your-team-id",
            "secure_c_ses": "your-secure-c-ses",
            "host_c_oses": "your-host-c-oses",
            "csesidx": "your-csesidx",
            "user_agent": "Mozilla/5.0 ...",
            "available": true
        }
    ],
    "models": []
}
```

### 启动服务

```bash
# 默认启动（Windows: 127.0.0.1:8000, Linux: 0.0.0.0:8000）
python gemini.py

# 指定端口
python gemini.py --port 8001

# 指定主机和端口
python gemini.py --host 127.0.0.1 --port 8000
```

服务将在指定地址启动（默认：Windows `http://127.0.0.1:8000`，Linux `http://0.0.0.0:8000`）。

### 访问管理控制台

打开浏览器访问 `http://127.0.0.1:8000/` 即可进入 Web 管理控制台。

## API 使用示例

### 获取模型列表

```bash
curl http://127.0.0.1:8000/v1/models
```

### 聊天对话

```bash
curl -X POST http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-enterprise",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "stream": false
  }'
```

### 流式对话

```bash
curl -X POST http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-enterprise",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "stream": true
  }'
```

### 带图片对话

支持两种图片发送方式：

#### 方式1：先上传文件，再引用 file_id

```bash
# 1. 上传图片
curl -X POST http://127.0.0.1:8000/v1/files \
  -F "file=@image.png" \
  -F "purpose=assistants"
# 返回: {"id": "file-xxx", ...}

# 2. 引用 file_id 发送消息
curl -X POST http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-enterprise",
    "messages": [
      {
        "role": "user",
        "content": [
          {"type": "text", "text": "描述这张图片"},
          {"type": "file", "file_id": "file-xxx"}
        ]
      }
    ]
  }'
```

#### 方式2：内联 base64 图片（自动上传）

**OpenAI 标准格式**

```bash
curl -X POST http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-enterprise",
    "messages": [
      {
        "role": "user",
        "content": [
          {"type": "text", "text": "描述这张图片"},
          {"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}}
        ]
      }
    ]
  }'
```

**prompts 格式（files 数组）**

```bash
curl -X POST http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-enterprise",
    "prompts": [
      {
        "role": "user",
        "text": "描述这张图片",
        "files": [
          {
            "data": "data:image/png;base64,...",
            "type": "image"
          }
        ]
      }
    ]
  }'
```

> **注意**: 内联 base64 图片会自动上传到 Gemini 获取 fileId，然后发送请求。

### 视频生成

- 只需在模型配置中添加 `video` 相关模型（例如 `gemini-video`），或使用已内置的 `videos` 配额条目。
- 服务会在生成视频后自动下载并缓存到 `video/` 目录，并在响应文本末尾附加 `/video/<filename>` 链接。
- 链接可直接播放或下载，浏览器端也会自动渲染为 `<video>` 标签。

## 注意事项

1. **安全性**: 配置文件中包含敏感信息，请妥善保管，不要提交到公开仓库
2. **代理**: 如果需要访问 Google 服务，可能需要配置代理
3. **账号限制**: 请遵守 Google 的使用条款，合理使用 API
4. **JWT 有效期**: JWT Token 有效期有限，系统会自动刷新
5. **Cookie 自动刷新**: 系统每30分钟自动检查过期 Cookie，使用临时邮箱自动登录刷新。需要为账号配置 `tempmail_url` 和 `tempmail_name` 字段
   - **API 方式**: 如果临时邮箱服务支持 API，优先使用 API 方式获取验证码（更快、更稳定）
   - **浏览器方式**: API 方式失败时自动切换到浏览器方式，确保登录成功
   - **自动切换**: 系统会自动在两种方式之间切换，无需手动配置
6. **Playwright 安装**: Cookie 自动刷新功能需要安装 Playwright 浏览器：`playwright install chromium`
7. **环境变量配置**: 生产环境建议设置以下环境变量：
   - `API_KEY_ENCRYPTION_KEY`: API 密钥加密密钥（32字节）
   - `ADMIN_SECRET_KEY`: 管理员密钥（可选，系统会自动生成）

## 🙏 致谢

本项目基于以下开源项目和思路开发，特此致谢：

- **[ddcat666/business-gemini-pool](https://github.com/ddcat666/business-gemini-pool)** - 原始项目，提供了项目思路和核心代码
- **[ddCat](https://linux.do/u/ddcat)** - 提供了 Gemini Enterprise 2 API 关键 JWT 加密 key 以及流程思路
  - [Gemini Enterprise 2api 关键jwt加密key以及流程](https://linux.do/t/topic/1223671)
  - [gemini business 2api简单版](https://linux.do/t/topic/1225005)

本项目是在原项目基础上的二次开发和重构，感谢各位大佬提供的宝贵思路和代码！

## 许可证

MIT License
