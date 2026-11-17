# 账号与云同步 PRD（V2 第一期）

> 状态：已实现　｜　关联：`docs/resume-builder-prd.md`

## 背景与问题

V1 的数据只存在浏览器 IndexedDB：换电脑、清缓存、换浏览器都会丢。用户需要一个可选的云端副本，但账号不能成为编辑前提。

## 目标

- 邮箱 + 密码注册 / 登录 / 退出，会话 30 天
- 登录后可保存 / 列出 / 载入 / 删除多份云端简历
- 未登录时编辑器功能完全不受影响
- 自托管 Postgres 存储；无 Docker/数据库时用 PGlite 文件库兜底，保证本地可验证
- 密码只存 bcrypt 哈希，会话令牌只存 SHA-256 哈希

## 非目标（本期）

- 邮箱验证、找回密码、OAuth / 第三方登录
- 版本历史云同步、自动冲突合并
- 分享链接、团队协作
- 多实例共享的分布式限流

## 用户故事

| # | 故事 | 验收信号 |
|---|---|---|
| C1 | 我想注册账号，把简历放到自己的服务器 | 注册后自动登录，刷新仍保持会话 |
| C2 | 我换电脑后想取回简历 | 登录后「从云端载入」覆盖本地内容 |
| C3 | 我不想注册也能用 | 未登录时编辑、导出、自动保存全部可用 |
| C4 | 我担心密码泄露 | 数据库只存哈希；Cookie 为 HttpOnly |
| C5 | 我想退出账号 | 退出后会话失效，`/api/auth/me` 返回 null |

## 数据模型

```sql
users(id uuid PK, email text unique, password_hash text, created_at timestamptz)
sessions(token_hash text PK, user_id uuid FK, expires_at timestamptz, created_at timestamptz)
user_resumes(
  user_id uuid FK, id text, title text, doc jsonb,
  created_at timestamptz, updated_at timestamptz,
  PRIMARY KEY (user_id, id)
)
```

- `(user_id, id)` 复合主键：同一账号多份简历，且不同账号可使用相同本地 ID
- 旧的 `resumes`（单简历）与 `cloud_resumes`（过渡表）仅用于迁移，不再写入
- 文档仍遵循 `ResumeDoc.schemaVersion = 1`
- 迁移：`infra/db/migrations/0001_init.sql`，全部 `IF NOT EXISTS`

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/register` | 注册并创建会话；重复邮箱 409 |
| POST | `/api/auth/login` | 登录；错误凭证 401 |
| POST | `/api/auth/logout` | 删除会话与 Cookie |
| GET | `/api/auth/me` | 当前用户或 null |
| GET | `/api/resumes` | 云端简历列表（id / title / updatedAt） |
| GET | `/api/resumes/<id>` | 读取单份，校验归属 |
| PUT | `/api/resumes/<id>` | 按用户 + ID upsert |
| DELETE | `/api/resumes/<id>` | 删除单份 |
| GET | `/api/resume` | 兼容：最近更新的云端简历或 null |
| PUT | `/api/resume` | 兼容：按 `doc.id` 保存，服务端校验 `ResumeDoc` |

- 所有业务接口要求有效会话，否则 401
- 保存大小上限 1MB，超出 413
- 响应带 `Cache-Control: no-store`

## 安全设计

- 密码：bcrypt cost 10，要求 ≥8 位且 ≤72 字节
- 会话：32 字节随机令牌，Cookie `blazecv_session`，HttpOnly、SameSite=Lax、30 天；数据库只存 SHA-256
- `COOKIE_SECURE=true` 时仅 HTTPS 发送，生产环境建议开启
- 登录 / 注册按 IP 限流：30 次 / 10 分钟（进程内）
- 不记录密码、不把会话写日志
- JSON 请求 + SameSite Cookie，跨站表单无法直接写入

## 存储选择

| 场景 | 实现 |
|---|---|
| 生产 | `DATABASE_URL` → `pg` 连接自托管 Postgres |
| 本地 / 无数据库 | 未设置 `DATABASE_URL` → PGlite 文件库，默认 `.data/pglite` |
| 容器 | `docker-compose` 的 web 服务注入 `DATABASE_URL`，db 服务健康检查后启动 |

PGlite 是单进程文件库，适合单机与验收；多实例部署必须用 Postgres。

## 边界与异常

| 场景 | 行为 |
|---|---|
| 未登录调用简历接口 | 401 `{error:"请先登录"}` |
| 邮箱已注册 | 409，不泄露密码信息 |
| 密码错误 | 401「邮箱或密码错误」 |
| 频率超限 | 429 + `Retry-After` |
| 云端没有简历 | 返回 `resume: null`，前端提示先保存 |
| 载入覆盖本地 | 先 `confirm`，确认后写入本地并触发自动保存 |
| 文档校验失败 | 400，返回具体错误 |
| 文档超过 1MB | 413 |
| 数据库不可用 | 500；本地编辑与导出不受影响 |

## 验收标准

- [ ] 注册后自动登录，刷新页面会话保持
- [ ] 重复邮箱返回 409，错误密码返回 401
- [ ] 退出后 `/api/auth/me` 返回 `user: null`
- [ ] 登录后保存简历，GET 返回同一份 `ResumeDoc`（含中文标题）
- [ ] 同一账号可保存多份简历，列表按更新时间倒序；逐条载入与删除
- [ ] 不同账号使用相同简历 ID 时互不覆盖
- [ ] 未登录时首页与编辑器所有本地功能可用
- [ ] Cookie 具备 HttpOnly、SameSite=Lax、30 天有效期
- [ ] 会话令牌与密码在数据库中以哈希形式存在
- [ ] `npm run verify` 覆盖注册、会话、保存、载入、重复注册、退出

## 测试

- `scripts/verify.mjs`：
  - 真实浏览器 fetch 注册 → Cookie → me → PUT → GET → 重复注册 409 → logout → me=null
  - UI 注册 → 保存到云端 → 刷新 → 从云端载入 → 退出，全链路通过
  - 编辑器云端面板可打开，截图留存
- 手动：登录后保存，换浏览器登录并载入；HTTPS 下设置 `COOKIE_SECURE=true` 验证 Cookie 标记

## 部署

```bash
cp .env.example .env          # 设置 POSTGRES_PASSWORD / DATABASE_URL / COOKIE_SECURE
docker compose up -d --build  # nginx :8080 → web → db
```

- 迁移在 Postgres 首次初始化时执行
- 生产必须设置 `DATABASE_URL`；PGlite 仅用于本地或单机兜底
- 回收：停用功能只需移除登录入口与 API，不影响本地数据；数据库按 `pg_dump` 备份

## 风险与后续

| 风险 | 缓解 |
|---|---|
| 无邮箱验证，可能注册无效邮箱 | V2.1 接邮件服务；当前仅用于同步，不发送通知 |
| 无找回密码 | V2.1 增加重置流程；当前需重新注册 |
| 多份简历覆盖 | 云端列表逐条载入前确认；版本历史目前只在本机 |
| 限流为进程内 | 多实例部署时改用 Redis / 网关限流 |
| 手动同步 | 后续可加「登录后自动保存」并处理冲突 |
