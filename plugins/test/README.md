# SDK 测试插件

测试使用宿主 `v0.0.1-dev` 镜像和同次构建的 SDK `1.0.0`。SDK 压缩包固定在仓库的 `vendor/`，安装和构建无需链接本体源码。格式化继续共用本体的 `@nexus-terminal/format` 工具。

- [发布流水线的 SDK 构建产物](https://github.com/0honus0/nexus-terminal/actions/runs/44474495877/artifacts/14505364246)
- SDK 压缩包 SHA-256 为 `43da6341e7a2bad88498db0a47910f4ddf02b870f325e4cbe84c0d1e584c9f68`
- 默认镜像为 `ghcr.io/0honus0/nexus-terminal:v0.0.1-dev`，可用 `NEXUS_TEST_IMAGE` 指定兼容镜像

## 运行

在插件仓库根目录执行。

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm check
pnpm test:sdk
```

测试启动临时 Docker 宿主和 HTTP 插件仓库，通过市场安装测试插件及其依赖。认证夹具只有在测试宿主收到一次性随机凭证时才登记登录方式。结束时删除临时容器和数据卷。

## 覆盖

| 入口                        | 用例                                                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nexus-terminal/node`       | 插件激活、依赖服务和作用域清理、数据库迁移和读写、本地与密码加解密及失败契约、日志来源校验、HTTP 校验和二进制传输、WebSocket、状态登记与更新、备份和认证扩展   |
| `nexus-terminal/browser`    | JSON 和原始 HTTP、业务错误类型、状态订阅和撤销、任务结果与取消、文本和二进制 WebSocket、日志、依赖服务、登录贡献、窗口状态、标签及动作、关闭检查和视图资源清理 |
| `nexus-terminal/browser/ui` | 每个运行时导出均有检查，组件在宿主内实际挂载。验证表单、菜单、标签、进度、弹窗、缩放、通知、过渡、主题和 CSS 变量                                              |

公开的类型契约由实际前后端测试源码的 `vue-tsc` 检查覆盖。E2E 用例验证 API 能力，组件属性及第三方库选项的全部组合由各自的单元测试负责。
