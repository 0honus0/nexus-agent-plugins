# Remote Tools

纯 Node 扩展。调用方先通过 SSH 服务建立连接并验证主机身份，再用依赖或会话作用域绑定 Remote Tools。

```ts
import type {} from '@nexus-terminal/remote-tools/remote-tools-api';

ctx.use({ remoteTools: ['@nexus-terminal/remote-tools', 'remoteTools'] }, (scope) => {
	const remote = scope.plugin.remoteTools.bind(connection, scope);
	// 使用 remote.execute、remote.inspect、remote.getStatus 等能力。
});
```

绑定失效时释放命令通道、采样状态和提示符集成。调用方持有 SSH 连接和 PTY。业务可以提前 `await remote.close()`。命令取消或超时会关闭当前通道，远端退出结果仍可能未知。

- `execute` 区分 stdout 和 stderr，限制总输出并保留远端退出状态。
- `inspect` 探测系统和工具可用性。
- `getStatus` 使用 Linux 采样数据，首个样本和计数器重置后省略变化率。
- `openShell` 集成 Bash/Zsh 提示符和目录同步。
- `archives` 支持 ZIP、加密 ZIP、tar.gz 和 tar.bz2，验证归档条目后发布结果。
- `copyFiles` 支持同机复制和跨机传输，写入调用方的暂存目录。只有复制派发前返回 `unavailable` 才可选择 SFTP 中转。

普通命令、探测、状态、归档和传输共用 `RemoteCommandExecutor`。插件通过服务注入提供运行时 API，包的共享契约入口可供调用方构建时引用。
