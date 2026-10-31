# 讲练 · 拍照备课 MVP

在保留原有英语题库基础上，加入“手机采集 → 视觉模型整理 → 老师校对 → 保存 → 白板演示”。需求详见 [需求与MVP范围.md](需求与MVP范围.md)。

## 本机启动

需要 Node.js 22 或更新版本。

```sh
cd 英语拍照讲练_MVP
npm start
```

也可以在 Finder 中双击本目录的 `启动讲练.command`。

本机模式使用 Node 内置能力，无需先安装云端依赖。打开：

**http://127.0.0.1:8787**

电脑本机自动进入工作台。点击右上角“手机连接”，查看局域网地址与课堂访问码。手机、电脑、白板须在可以互访的同一网络，手机和白板用课堂访问码进入。

- 模型设置仅可在电脑的 localhost 入口修改；手机不需要填写密钥。
- 在“模型设置”填入国内服务商给出的 **HTTPS API基础地址**、**视觉模型ID**、**API Key**，选择“OpenAI兼容Chat”。地址通常以 `/v1` 结尾，不要重复加 `/chat/completions`。
- 模型必须同时支持图片输入和文本输出；纯OCR模型可能只会转写而不擅长生成教学解析。建议选择具备文本推理的通用视觉模型。
- JSON Mode默认关闭，以兼容更多服务商；服务商明确支持时再启用。
- “保存配置”仅保存设置，不代表已验证连通性；上传后首次识别会真实调用模型并产生服务商费用。
- 可以先点“先体验编辑与演示”，完整体验校对保存和白板演示，不调用模型、不伪装OCR。

首次运行自动建立 `data/config.json`，包含本机课堂访问码和会话密钥。模型Key也只写在此服务端文件中（权限600）。不要上传此文件；`.gitignore`已忽略 `data/` 和 `.env`。

局域网HTTP仅适合可信的同一Wi-Fi；公网使用Vercel提供的HTTPS。学校Wi-Fi若隔离终端，需要换一个可互访的网络或后续公网部署。

默认监听 `0.0.0.0:8787`，仅供本机使用可设置 `HOST=127.0.0.1`。可用 `PORT` 修改端口。环境变量覆盖网页中的本机配置，示例见 `.env.example`。

## 手机与图片顺序

窄屏端只保留大号“拍照上传”“上传本地图片”入口；选择后显示缩略图、左右调整和上传按钮。上传后显示保存/识别进度，不在手机上展示完整题库管理及编辑表单。

每份支持最多10张图片，分小请求逐张保存。遇到上传中断，已成功保存的图片保留，保持选择再次点击可继续。照片中的题号、页码和阅读材料续接关系用于推断顺序；电脑编辑页展示建议页序和每题来源图片。无法确定顺序时保留上传顺序并提示核对。

## 保存与备份

- `seed/lessons.json`：51份原有题库，共1570项；只读，不在网页直接覆盖。
- `data/lessons/`：你的新资料、草稿和收起资料；按资料原子写入JSON，带版本冲突检查。
- `data/images/`：压缩后实际发送给模型的照片。浏览器会把手机原照片转换为JPEG，所以不是手机相机原始文件的无损备份。
- `data/config.json`：本机配置；不要分享或提交Git。
- JSON导出只包含题目和解析，不包含照片。完整本机备份请在停止服务后复制整个 `data/`，妥善保管其中配置。
- 页面刷新不会丢已保存资料；尚未保存的编辑会在离开前提示。编辑不是自动保存，请点击保存草稿。

## Vercel 部署

逐步配置请看 [Vercel部署指南.md](Vercel部署指南.md)。仓库根目录就是应用，Vercel Root Directory保持根目录。

## 部署配置

已提供 `vercel.json`、`api/index.mjs`、Neon与私有Blob适配。此次不执行公网发布。

1. 将本MVP目录作为独立仓库或Vercel项目Root Directory；不要把相邻的旧版HTML目录或本机data上传。
2. 执行 `npm ci`，确保使用已锁定依赖。
3. 在 Vercel 连接 Neon PostgreSQL 和**私有** Vercel Blob，并设置环境变量：

| 变量 | 作用 |
| --- | --- |
| `DATABASE_URL` | Neon提供的PostgreSQL连接串；首次请求会创建classroom_lessons表，需要建表权限 |
| `BLOB_READ_WRITE_TOKEN` | 私有Blob存储令牌 |
| `MODEL_BASE_URL` | 国内视觉模型的兼容API基础地址 |
| `MODEL_API_KEY` | 服务商密钥 |
| `MODEL_ID` | 支持图片输入的模型ID |
| `MODEL_API_MODE` | `chat`（默认）或`responses` |
| `MODEL_JSON_MODE` | 仅在兼容Chat服务支持时设为`true` |
| `CLASSROOM_ACCESS_CODE` | 至少8位随机字母数字的课堂访问码 |
| `SESSION_SECRET` | 至少32字符的独立随机会话签名密钥 |

4. 部署后通过HTTPS链接访问。云端只从环境变量读取密钥，网页不允许修改配置。
5. 手机和白板登录同一站点，即共享数据库中的资料。本机data不会自动迁移至云端，可先导出JSON再导入；这只迁移题目，不迁移照片。原有51份内置题库已随代码包含，无需迁移。

Vercel API单次函数最大执行时间在配置中为300秒；模型请求在180秒超时，实际可用时长仍依套餐配置。MVP每份最多10张，每张压缩后小于1MB，浏览器逐张保存，单次请求低于Vercel的4.5MB限制。模型结合题号、页码与材料续接识别阅读顺序，保留来源图片编号与排序说明。更大批次后续应采用客户端直传对象存储及后台队列。

参考官方文档：
- [Vercel Functions限制](https://vercel.com/docs/functions/limitations)
- [Vercel Blob SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk)
- [Neon Serverless Driver](https://neon.com/docs/serverless/serverless-driver)
- [阿里云视觉模型兼容接口](https://help.aliyun.com/en/model-studio/qwen-vl-compatible-with-openai)
- [OpenAI图片输入](https://developers.openai.com/api/docs/guides/images-vision)

## 检查

```sh
npm run check
npm test
```

测试包括：原题库数量、单选校验、缺陷题不计分、上传与模型兼容HTTP协议、照片持久保存、人工校对门槛、课堂状态、版本冲突、来源检查和未认证访问。使用临时目录与本地模拟模型，不调用外部付费服务。

当前限制：尚无用户真实模型Key，未实测真实OCR质量、实体手机相机/翻页笔或实际Vercel/Neon/Blob云环境。网页与本机API可独立运行，填写真实视觉模型配置后才可识别照片。
