# 经纬工厂控制台前端

Vue 3 单页应用，默认通过同源 `/api/v1` 访问后端。开发服务器把 `/api` 代理到
`VITE_DEV_API_TARGET`，生产环境应由网关提供同源路由或明确的来源白名单，不依赖通配 CORS。

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
