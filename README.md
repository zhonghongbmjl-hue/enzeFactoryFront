# 经纬工厂控制台前端

Vue 3 单页应用，默认通过同源 `/api/v1` 访问后端。开发服务器把 `/api` 代理到
`VITE_DEV_API_TARGET`，生产环境应由网关提供同源路由或明确的来源白名单，不依赖通配 CORS。

## 后端切换

前端已提供两个具名模式，业务代码始终请求同源 `/api/v1`，仅由 Vite 代理切换实际后端：

```shell
# 默认：连接当前目录同级 backend（http://127.0.0.1:8080）
corepack pnpm dev
# 与默认命令等价
corepack pnpm dev:local

# 连接接入前使用的原后端（http://192.168.0.197:8080）
corepack pnpm dev:original

# Codex 联调检查同样默认走本地；需要时可显式检查原后端
corepack pnpm test:codex
corepack pnpm test:codex:original
```

对应配置分别保存在 `.env.backend-local` 与 `.env.backend-original`。如需临时覆盖本地模式的地址，
可复制 `.env.example` 为不会提交的 `.env.backend-local.local`，再修改 `VITE_DEV_API_TARGET`。
预览构建时可使用 `preview:local` / `preview:original` 做同样切换。

本地后端位于前端项目同级的 `../backend`，使用 Spring Boot 默认端口 `8080`；启动后再运行前端。
后端源码与原后端连接配置均保持独立，不需要在切换时改动源码。

## 固定工具链

- Node.js `24.19.0` LTS（Krypton）
- pnpm `11.22.0`
- Windows x64 Node 官方压缩包 SHA-256：
  `57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73`

启用 Corepack 后执行：

```shell
corepack pnpm install --frozen-lockfile
corepack pnpm test:unit --run
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm build
corepack pnpm exec playwright install chromium
corepack pnpm test:e2e
```

登录使用后端 `/api/v1/auth/login`、`/api/v1/auth/me` 与 `/api/v1/auth/logout`。
JWT 仅保存在 Pinia 内存与带版本、有效期的 `sessionStorage` 会话中。页面恢复会话后，首次进入
受保护路由前必须通过 `/auth/me` 单次并发验证；网络故障停留在安全重试页，凭证失效才清除会话。
每次认证边界变化都会递增仅存于内存的会话代次，旧请求迟到的 401 不会清除新会话。
401、退出及租户切换会清除认证状态，以及 `sessionStorage`、`localStorage` 中已注册的租户缓存。

## API 请求约定

业务接口统一通过 `src/api/http` 导出的 `request` 调用。请求拦截器负责注入当前会话的
`Authorization`；响应拦截器校验统一 JSON 结构、处理 401，并把网络错误、HTTP 错误和业务错误转换为
`ApiClientError`。业务 API 只获得 `data`，不需要读取 Axios 的 `response.data.data`。

```ts
const product = await request.get<Product>(`/products/${id}`)
const created = await request.post<Product>('/products', input)
```

后端成功和失败响应都必须使用以下 JSON 结构：

```json
{
  "success": true,
  "code": "OK",
  "message": "success",
  "data": {},
  "traceId": "01H...",
  "timestamp": "2026-09-01T00:00:00Z"
}
```

下载文件等非 JSON 请求可使用底层 `http`，并在请求配置中设置 `skipResponseEnvelope: true`。

`src/api` 按领域组织：每个业务域通过目录 `index.ts` 保持 `@/api/<领域>` 的稳定入口；HTTP
基础设施按 `client`、`request`、`errors` 和 `idempotency` 分离。产品、生产和发货域的较大接口实现
进一步按资源职责拆分，测试与对应领域共置。
