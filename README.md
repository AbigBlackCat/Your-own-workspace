# Barry 工作台

Barry 工作台是一个面向个人的工作与生活控制台：在同一个界面里安排今天、推进创作和开发工作、维护咨询项目，并记录训练、饮食与阅读。它运行在飞书妙搭（Miaoda）全栈环境中，使用 React 前端、NestJS 服务端和妙搭托管的 PostgreSQL 数据库。

> 这是个人数据工作台。代码可以放入 GitHub，但数据库导出、环境变量、授权令牌、私人计划、客户资料和真实生产数据绝不能提交。

## 工作台用途

它解决的不是“再加一个待办清单”，而是把一件事的**行动安排**和它的**业务上下文**放回同一个系统：今日计划负责什么时候做；各业务模块负责事情本身的记录、状态和历史。

| 模块 | 用途 |
| --- | --- |
| 首页与今日计划 | 汇总当天时间线、优先级、待办、提醒、快速备忘和复盘。 |
| 自媒体 | 管理内容灵感、制作流程、发布安排与内容数据。 |
| 开发工作 | 管理项目、里程碑、需求、Bug、技术问题和开发记录。 |
| 咨询工作 | 维护客户、沟通、交付物、后续跟进和投入时长。 |
| 健身与饮食 | 安排训练、记录动作与完成情况，并追踪餐次和营养目标。 |
| 阅读桌面 | 回顾书架、进度、划线和阅读想法，让阅读与日程同处一个节奏。 |
| 数据与设置 | 查看云端数据保护状态、导出个人数据、调整界面与管理私有集成。 |

推荐的节奏是：早上在首页决定今天的重点；工作中进入对应模块维护上下文，并把下一步行动加入今日计划；晚上完成、延期或复盘事项。这样既不会为任务重复录入细节，也不会让长期项目脱离每天的实际安排。

## 数据与隐私边界

- 妙搭 Serverless PostgreSQL 是当前唯一主数据库；历史 SQLite 文件只作为只读迁移存档。
- 数据访问受行级安全（RLS）与妙搭运行时访问范围共同保护。
- 密钥仅放在妙搭私有环境变量中，不写入前端代码、Git、日志或数据导出包。
- Git 忽略规则必须持续覆盖 `.env*`、数据库转储、备份、下载文件、构建产物和本机数据目录。

## 本地开发

```bash
npm install
npm run dev
```

常用检查：

```bash
npm run lint
npm run type:check
npm run build
```

## 飞书妙搭部署流程

该项目是已初始化的妙搭全栈应用；应用标识位于 `.spark/meta.json`，部署源码使用 `sprint/default` 分支。不要通过妙搭 AI 对话或应用内 AI 节点发布本项目；以下流程只使用本地代码、Git 和妙搭发布能力。

1. 确认飞书 CLI 身份与权限：

   ```bash
   lark-cli profile list
   lark-cli --profile <profile> whoami
   lark-cli --profile <profile> auth status --verify --json
   ```

2. 在本地实现并验证改动，随后只暂存本次需要发布的文件：

   ```bash
   git status
   npm run lint
   npm run type:check
   npm run build
   git add <相关文件>
   git commit -m "feat: 描述本次改动"
   ```

3. 推送到妙搭的发布分支。若 Git 凭据失效，先为**当前应用**刷新妙搭的 URL 范围凭据，再重试；不要输入飞书密码到 Git Credential Manager 弹窗：

   ```bash
   lark-cli apps +git-credential-init --app-id <当前应用 app_id> --as user
   git push origin sprint/default
   ```

4. 由已推送的 commit 创建发布并轮询结果。只有状态为 `finished` 才算上线；`publishing` 或 `failed` 都需要先排查，不能重复创建发布来掩盖问题：

   ```bash
   lark-cli apps +release-create --app-id <当前应用 app_id> --branch sprint/default --as user
   lark-cli apps +release-get --app-id <当前应用 app_id> --release-id <release_id> --as user
   ```

5. 回读实际访问范围，并在桌面与手机上分别验证正式链接、登录权限和关键操作：

   ```bash
   lark-cli apps +access-scope-get --app-id <当前应用 app_id> --as user
   ```

这条路径不调用妙搭 AI 对话，因此不会消耗妙搭 AI 系统搭建额度；它并不承诺所有平台资源、网络或第三方服务永久免费。

## GitHub 镜像仓库

GitHub 仓库仅用于保存源码与变更历史；飞书妙搭的 `origin` 远端仍是部署源，不能替换或删除。创建 GitHub 仓库后，将它添加为第二个远端并推送同一份分支：

```bash
git remote add github https://github.com/<GitHub 用户名>/barry-workspace.git
git push -u github sprint/default
```

之后每次发布前，建议先提交同一个 commit 到两个远端：

```bash
git push github sprint/default
git push origin sprint/default
```

先推 GitHub 只是在镜像源码；真正的妙搭上线仍必须执行“飞书妙搭部署流程”中的 release 步骤。
