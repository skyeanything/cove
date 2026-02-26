# LLM 供应商

> **说明**：下表区分了"代码层已集成"与"当前设置 UI 已开放"两个维度。
> - **UI 已开放** — 在 **设置 → 供应商** 中可直接配置
> - **代码层支持，UI 待开放** — SDK 已接入，后续版本将在 UI 中暴露入口

---

## 设置 UI 已开放的供应商

以下供应商可在 **设置 → 供应商** 中直接配置 API Key 并使用。

| 供应商 | 所需配置 | 官网 | 说明 |
|--------|---------|------|------|
| **OpenAI** | API Key | [platform.openai.com](https://platform.openai.com) | GPT-4o、o1、o3 等系列 |
| **DeepSeek** | API Key | [platform.deepseek.com](https://platform.deepseek.com) | DeepSeek-V3、R1 推理模型 |
| **Moonshot** | API Key | [platform.moonshot.cn](https://platform.moonshot.cn) | Kimi 系列（128K 长上下文） |
| **MiniMax** | API Key | [platform.minimaxi.com](https://platform.minimaxi.com) | MiniMax-Text 系列 |
| **OpenRouter** | API Key | [openrouter.ai](https://openrouter.ai) | 统一入口，路由到 200+ 模型 |
| **阿里云 DashScope** | API Key | [dashscope.aliyuncs.com](https://dashscope.aliyuncs.com) | 通义千问系列（Qwen） |
| **腾讯云** | API Key | [cloud.tencent.com/product/hunyuan](https://cloud.tencent.com/product/hunyuan) | 混元大模型（hunyuan-turbo 等） |
| **火山引擎 Ark** | API Key | [www.volcengine.com/product/ark](https://www.volcengine.com/product/ark) | 豆包 / Doubao 系列 |
| **Ollama** | 本地地址（默认 `http://localhost:11434`） | — | 本地运行开源模型，数据不出本机 |

---

## 代码层支持、UI 待开放的供应商

以下供应商的 SDK 已在代码中集成，但当前版本的设置 UI 尚未开放配置入口，后续版本会陆续开放。

| 供应商 | 所需配置 | 官网 | 说明 |
|--------|---------|------|------|
| **Anthropic** | API Key | [console.anthropic.com](https://console.anthropic.com) | Claude 3.5 / 4 系列 |
| **Google Gemini** | API Key | [aistudio.google.com](https://aistudio.google.com) | Gemini 2.0 Flash、Pro 等 |
| **Amazon Bedrock** | AWS Access Key + Secret + Region | [aws.amazon.com/bedrock](https://aws.amazon.com/bedrock) | Claude、Llama、Titan 等多模型 |
| **Azure OpenAI** | API Key + Endpoint + Deployment | [azure.microsoft.com](https://azure.microsoft.com/products/ai-services/openai-service) | OpenAI 模型的 Azure 托管版本 |
| **Groq** | API Key | [console.groq.com](https://console.groq.com) | 超低延迟推理（Llama、Mixtral） |
| **Mistral** | API Key | [console.mistral.ai](https://console.mistral.ai) | Mistral Large、Nemo 等 |
| **xAI** | API Key | [console.x.ai](https://console.x.ai) | Grok 系列 |
| **Perplexity** | API Key | [www.perplexity.ai](https://www.perplexity.ai/settings/api) | 联网搜索增强推理 |
| **Together** | API Key | [api.together.ai](https://api.together.ai) | 开源模型托管（Llama、Qwen 等） |
| **GitHub Models** | GitHub Token | [github.com/marketplace/models](https://github.com/marketplace/models) | 通过 GitHub 访问多家模型 |
| **OpenAI 兼容端点** | Base URL + API Key（可选） | — | LM Studio、vLLM、LocalAI、自建代理等 |

---

## 配置步骤（UI 已开放供应商）

1. 打开 **设置**（侧边栏底部齿轮图标，或 `⌘,`）
2. 选择 **供应商** 标签页
3. 找到目标供应商，展开配置项
4. 填入 API Key 等凭证
5. 点击 **保存**，返回对话即可在模型选择器中看到该供应商的模型

> **安全提示**：API Key 仅存储在本地 SQLite 数据库中，不会上传到任何服务器。
