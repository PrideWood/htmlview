# GitHub → Vercel 部署与配置

本仓库根目录就是应用，不需要上传旧HTML目录或在本机运行。内置51份题库、1570项已经随代码包含。以下服务需由你在自己的账号创建，密钥只填Vercel，不写进GitHub。

## 1. 导入仓库

Vercel → Add New → Project → 导入 PrideWood/htmlview。

- Framework Preset：Other（仓库vercel.json也已显式设置framework为null，关闭框架自动推断）
- Root Directory：保持根目录（`.`），不要选public
- Node.js：22.x
- Install Command：npm ci
- Build Command：node scripts/build.mjs（vercel.json已提供）
- Output Directory：public（vercel.json已提供）

可以先创建项目再连接存储；变量全部配好后重新部署。此项目包含服务端API，不能只部署public静态文件。

## 2. Neon数据库：保存题目、解析与草稿

在Vercel项目的Storage / Marketplace中添加Neon PostgreSQL，并连接此项目。也可以在Neon官网创建项目，再在Connect中取得连接串。

检查Vercel Settings → Environment Variables中是否有名称完全一致的 `DATABASE_URL`。如果集成只生成了其他名称，把其PostgreSQL连接串复制为此变量。连接串通常以 `postgresql://` 开头并带SSL参数，完整复制，不拆分、不加引号。

不需要手工导入1570题，也不需要另建用户表。应用第一次访问资料库时会自动创建：

```sql
CREATE TABLE IF NOT EXISTS classroom_lessons (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  data JSONB NOT NULL
);
```

连接账号需有建表和读写权限。Neon自动生成的项目owner连接通常可用。当前驱动针对Neon，不要直接换成普通自建PostgreSQL或Supabase连接串。

官方步骤：https://neon.com/docs/guides/vercel-managed-integration

## 3. 私有Vercel Blob：保存上传图片

Vercel项目 → Storage → Create Database / Create Store → Blob，创建时选择 **Private**，并连接此项目。

确认自动添加了 `BLOB_READ_WRITE_TOKEN`；若使用自定义变量前缀，需另设这个准确名称。代码按私有方式读写，不能用Public类型存储代替。只创建数据库而不创建Blob，仍然无法上传照片。

官方说明：https://vercel.com/docs/vercel-blob/private-storage

## 4. 视觉模型：识别、排序并生成解析

去你选择的国内模型服务商控制台开通API、创建API Key，确认账户可用额度及模型权限。必须支持OpenAI兼容Chat接口、图片输入（含base64图片）及多图理解。普通纯文本模型或仅OCR转写模型无法完成全部流程。

若使用阿里云百炼：在控制台选择地域与业务空间，创建对应Key，在视觉模型调用示例中复制实际Base URL和模型名称。不要把阿里云账号AccessKey当成百炼API Key。不同地域/业务空间的地址和密钥必须匹配；以你的控制台示例为准，不照搬其他地域地址。

在Vercel填写：

| 名称 | 填什么 |
| --- | --- |
| MODEL_BASE_URL | 服务商兼容API基础地址，通常到 `/v1`，不追加 `/chat/completions` |
| MODEL_API_KEY | 服务商创建的API Key |
| MODEL_ID | 控制台列出的可用视觉模型ID，完整原样复制 |
| MODEL_API_MODE | `chat` |
| MODEL_JSON_MODE | `false`，兼容性优先；确认服务支持后可改为true |

不用另配OCR API Key：同一个视觉模型负责读图、题序判断和解析生成。初次先上传1张清晰照片测试，再测多图和乱序照片。

阿里云视觉接口与Key说明：
- https://help.aliyun.com/zh/model-studio/vision
- https://help.aliyun.com/zh/model-studio/get-api-key

## 5. 访问码与会话密钥

还必须设置两个独立的环境变量：

- `CLASSROOM_ACCESS_CODE`：8—64位随机字母数字，供自己的手机和白板登录。建议至少16位，勿使用示例或简单密码。
- `SESSION_SECRET`：至少32字符的独立随机值，建议用密码管理器生成64位随机字母数字。它只给服务器签名使用，不提供给登录用户。

当前MVP是共享课堂空间，知道访问码的人可以查看、编辑资料并调用模型。不要将访问码发给学生或公开张贴。公网模型配置通过Vercel环境变量修改，网页中不能修改Key。

## 6. 保存变量并重新部署

上面共9个变量，其中7个是必要配置，另2个模式变量建议显式填写。给正式测试勾选Production；如要测试Preview，也给Preview配置。数据库和Blob的连接环境同样要勾选对应环境。

Settings → Environment Variables保存后，Deployments → 最新部署 → Redeploy。环境变量变更不会自动修改已经部署的实例。

不需要设置PORT、HOST、DATA_DIR或VERCEL；不需要OpenAI账号密钥。不使用NEXT_PUBLIC_或VITE_前缀，也不要把密钥填进前端代码、截图或聊天。

## 7. 上线后的检查顺序

1. 打开Vercel HTTPS地址，输入课堂访问码。
2. 确认看到原有51份题库，打开一份进入演示。
3. 上传1张清晰题目照片，确认能识别并保存草稿。
4. 上传多张题目照片，故意打乱选图顺序，检查建议页序、题号及来源图片。老师确认后再发布。
5. 编辑并保存，刷新页面、用白板打开同一网址，确认资料和照片仍可读取。

故障排查：

| 现象 | 优先检查 |
| --- | --- |
| 无法登录/提示配置访问码与会话密钥 | 两变量长度、环境范围、是否已Redeploy |
| 提示DATABASE_URL未配置 | 变量名称准确、Neon已连接项目 |
| 数据库连接失败/建表失败 | 使用Neon连接串、SSL参数和数据库权限 |
| 上传失败/私有存储提示 | 私有Blob已创建，令牌属于该Store且已Redeploy |
| 模型401/403 | Key、地域/业务空间、模型权限与账户额度 |
| 模型404 | Base URL未重复追加路径，MODEL_ID准确 |
| 模型400或识别失败 | 模型支持多图和base64，先保持JSON_MODE=false，用单张清晰照片重试 |
| 模型超时 | 先减少图片数；模型请求180秒超时，函数配置300秒，实际还取决于套餐 |

可在Vercel项目Logs查看错误状态。反馈报错时不要提供环境变量值或密钥。当前尚未连接真实云数据库、私有Blob与视觉模型，云端首次测试仍需完成以上检查。

## 修复 document is not defined / FUNCTION_INVOCATION_FAILED

若日志指向 `/var/task/app.js` 并提示 `document is not defined`，说明浏览器脚本被当成Node函数执行。不要删掉前端代码中的document，它是网页正常需要的浏览器API。

在Vercel项目 Settings → Build and Deployment 中检查：

- Root Directory：必须为仓库根目录（默认留空或显示`.`），**不能是public**。根目录包含package.json、vercel.json、api、lib和public。
- Framework Preset：Other，不能选择Node.js、Express或其他后端框架。
- Build Command：node scripts/build.mjs。
- Output Directory：public。它只用于静态输出，不是Root Directory。
- 不要把public/app.js设为函数入口；唯一云端函数入口是api/index.mjs。

保存设置后从Git main分支部署最新提交；如果点旧部署的Redeploy，要注意它可能仍使用旧提交。必要时禁用构建缓存后重试。修改后首页应该是HTML，/app.js应该以静态JavaScript返回，/api/session才是API。

## 使用现有免费额度测试

若账号有qwen3.8-flash额度，可将MODEL_ID设为qwen3.8-flash，其余保持MODEL_API_MODE=chat、MODEL_JSON_MODE=false。程序对Qwen3.5—3.8的Flash/Plus/Max系列Chat请求显式关闭思考，以减少同步识别的等待；其他服务商模型请求不添加此参数。实际试卷识别质量仍须验证。额度、有效期以自己控制台显示为准，测试时可开启对应模型的“用完即停”。
