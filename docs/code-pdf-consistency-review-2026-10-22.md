# 代码与论文一致性审查

审查日期：2026-10-22。对象：`News_Agreegator_6___Shared-4.pdf`（16 页）、当前 TypeScript 源码、README、设计文档和本地归档。本文是审查结果，不表示问题已修复；未改动业务代码、原 PDF 或归档。PDF 页码均为纸面页码。

结论：目前不能宣称论文与代码完全一致。媒体配置与基础聚类方法基本吻合，但验证后合成、可复现基础设施和实验筛选口径有实质性缺口。

## 1. 必须优先处理的问题

### F01 严重：Reporter 没有执行“只合成 Critic 接受的内容”

- PDF：第 2 页贡献 2、第 3–4 页架构说明及图 2、第 7 页 §3.4，声称只把验证通过的材料交给 Reporter。
- 代码：`server/src/index.ts:125` 的 `generateBriefing()` 只筛选 `a.analysis`，没有检查 `verification`、`unsupported_fields` 或阈值；直接传递所有分析的情绪、偏向以及 `consensus_facts` 和 divergence。
- `server/src/analyze.ts` 的聚类比较在 Critic 之前生成；`server/src/pipeline.ts:19` 到 `21` 也清楚显示此顺序。Critic 返回的 corrections 不会被应用到分析或聚类摘要。
- 影响：未验证、验证失败或有不支持字段的材料都能进入简报。提示词写“verified”并不构成过滤。
- 建议：按字段过滤并重新生成受支持的聚类摘要，保留证据来源；或把论文表述改为“记录 Critic 诊断，Reporter 基于未过滤的聚类摘要合成”。图 2 和摘要必须同步修改。

### F02 严重：论文把设计计划写成已实现的可复现机制

- PDF：摘要、贡献 3、§4.1（第 8–9 页）声称已有 SHA-256 prompt fingerprint、内容寻址快照与索引、逐记录 temperature、schema_version、旧版读取策略、changelog 和完整 codebook。
- 代码：`server/src/archive.ts:5` 和 `66` 的类型与序列化字段均不含 prompt_hash、temperature、schema_version。源码未发现指纹生成或提示词快照持久化；仓库也没有所述 codebook/changelog。
- 这些内容出现在 `docs/superpowers/specs/2026-10-11-reproducibility-and-evaluation-design.md` 的待实施设计中，不能据此认定已实现。
- `server/src/llm/providers.ts:30` 仅在兼容接口请求中硬编码 temperature=0；Anthropic 分支未显式设置温度，也没有逐分析归档温度。
- 建议：实现并验证这些机制后再保留现有说法；否则将其标为未来工作。不能为历史记录补造未知的 prompt 或 temperature。

### F03 严重：实际 evaluation harness 不排除 mock，也不要求每家至少两篇

- PDF：第 10–11 页 §5 明确说排除 mock，仅采用至少两篇真实模型分析的媒体。
- 代码：`server/src/eval/eval.ts:140` 只检查 analysis 是否存在；第 148 行的门槛是 n>0。验证均值第 220 行也只检查 score 非空，没有限制 Analyst 或 Critic 的 provider/model。
- 影响：界面 evaluation 的结果不能代表论文规定的真实模型实验；Insights 的 provider 计数并不能替代 evaluation 的筛选。
- 建议：明确筛选 provider、model、成功状态、快照区间、最低样本数，分别报告真实 Analyst/真实 Critic 的交集数量；将这些参数与数据哈希写入报告。

### F04 高：论文实验快照与当前数据不一致，且无法唯一重建旧快照

当前归档有 3,633 行，`analysis_provider` 分布为 DeepSeek 1,440、mock 555、空字符串 1,091、缺失 547。缺失/空值应记为来源未知，不能直接断言都是 mock。归档 crawl 时间为 UTC 2026-10-10T21:24:25.429Z 至 2026-10-20T18:12:13.101Z。

| 指标 | PDF §5 | 当前数据独立重算：DeepSeek Analyst |
|---|---:|---:|
| 全部归档记录 | 3,174 | 3,633 |
| DeepSeek 分析 | 1,330 | 1,440 |
| 至少两篇的参考媒体 | 15 | 15 |
| Pearson r，使用未舍入的每媒体均值 | 0.76 | 0.6967554966 |
| Spearman rho，使用未舍入的每媒体均值 | 0.65 | 0.5661303711 |
| 有 Critic score 的真实 Analyst 记录 | 856 | 946 |
| 上述 score 均值 | 0.52 | 0.5169695560 |

当前源码 `buildEvalReport()` 实际运行结果是 r=0.57、rho=0.56、verification_rate=0.51，n=15；它混合所有有分析的来源，并在相关计算前把媒体均值舍入两位。它与上表独立重算的口径不同。

数据增长可以解释一部分差异，不能仅凭当前数据判定旧实验数字虚假。但仓库没有可唯一定位论文快照的截止点、筛选脚本和哈希，因此目前无法验证旧结果。建议保留旧快照及原始结果文件，或明确改报当前快照，不能混用。

### F05 高：表 2 与实验叙述缺少样本对账

- 第 11 页表 2 的 15 个 n 合计 **697**，而正文说真实分析有 1,330 条，未解释其余 633 条去向。
- 正文举 Global Times 为强一致案例，但表 2 不含该媒体。当前真实 DeepSeek 数据也没有该媒体的可用分析。
- 按表 2 显示的 15 对数值重算：r=0.7604336485（与 0.76 一致），rho=0.6631061923（约 0.66，不是 0.65）。未舍入原始均值可能改变并列名次，因此 rho 的差异应要求原始数据核实，而不是直接认定算错。
- 建议：补实验筛选流程和排除原因，统一表中样本数与叙述；提供未舍入均值并由程序直接生成表格。

### F06 高：表注错误解释了相关系数的权重

- 第 11 页表 2 表注称样本少的媒体权重小、相关系数主要由样本多的媒体决定。
- `eval.ts:159`、`232` 给每家媒体一个均值点，使用普通 Pearson/Spearman；每家媒体等权，不按文章数加权。
- 建议改为：每家媒体在相关计算中等权，样本量不同影响其均值估计的不确定性。若要文章数加权，需明确另立方法和重算结果。

### F07 高：单篇 Analyst 没有获得跨媒体参照

- PDF §3.3 声称偏向是相对同簇其他媒体，omissions 是其他媒体有而本篇没有的信息。
- `server/src/llm/prompts.ts:19` 的 articlePrompt 只传本篇 outlet、headline、summary、body。其他媒体的原文、分析或事实没有输入。Single-source 也调用相同分析接口。
- 影响：提示词要求相对比较，但模型没有真实比较材料；omissions 可能是推断或背景知识，不能当成已执行的跨媒体证据比较。
- 建议：将遗漏比较移到可读取多篇原文与来源位置的聚类阶段；为 single-source 明确不适用字段。论文应如实披露当前输入。

### F08 高：“每条主张都有逐字证据”只是提示词要求

- PDF 第 1、6–8 页多次称每条分析主张可追溯到逐字引文。
- 实际 schema 仅 loaded_language 有 quote 字段；framing、bias、sentiment、omissions 没有证据片段或原文位置。`sanitizeAnalysis()` 不验证 quote 是否为原文子串。
- 前端 `client/src/components/AnalysisTabs.tsx` 能展开 loaded-language 引文，也为部分 verdict 显示引文，但没有实现每条主张到专属证据的一对一链接。
- Critic 是另一次模型判断；其 score 是模型直接返回的数，不是程序按预定义字段分母计算的覆盖率。
- 建议：论文区分“prompt 约束”“模型核查结果”和“程序保证”。若要保留强保证，需证据结构、原文匹配及明确评分分母。

## 2. 其他实现与方法缺口

### F09 高：feed 失败不保证保留上次有效数据

PDF §3.1（第 4–5 页）称死 feed 会保留旧数据并显示 stale。`ingest()` 吞下逐 feed 错误并返回剩余结果；`pipeline.ts:39` 仍 save 新结果、stale=false。所有 feed 失败时也可能写空 clusters/singles。`mergeWithHistory()` 只保留与本轮簇匹配的历史数据，未匹配旧簇会消失。逐媒体 crawl_health 有错误记录，但不等于保留旧数据或设置全局 stale。

建议：实现全失败保护与逐来源的旧数据保留/过期策略；论文删除“单一媒体掉线不会悄然影响语料偏差”的保证。两家媒体门槛不能消除缺失来源偏差。

### F10 中：robots.txt 和付费墙保证没有对应检查

PDF §3.1 与 README 断言不违反 robots.txt。`server/src/ingest.ts` 直接 fetch 正文和图片，没有 robots 获取/解析或允许访问判定。没有专门的付费墙检测，主要按 HTTP 状态和文本长度回退；登录提示等长文本也可能被标成完整正文。

这是“代码未强制保证”，不等于发现实际违规。应实现检查，或改成准确的设计意图与现有回退行为。

### F11 中：JSONL 不是所有聚类历史的完整真相来源

PDF §4.1 称全部 analyses、cluster memberships 和 verification scores 都进入版本化归档，evaluation 只读该归档。

`archive.ts` 只存 source_count，不存 cluster_id 或成员关系；按 URL 去重后不更新，首次存成 mock/未验证的 URL 后续升级不会回写。`eval.ts:200` 的 topic 评估使用传入的当前 clusters，而不是历史归档成员关系。`pipeline.ts` 仅归档已选中的前 36 簇及最多 40 singles，并非摄取到的全部原始文章。

建议明确“经筛选的、按 URL 保留首次版本的文章归档”，或引入分析版本、聚类运行及验证运行的独立记录。

### F12 中：缓存不等于“相同内容且可追溯的缓存”

`analyze.ts:13` 缓存只有 URL→Analysis，pipeline 只从旧 clusters 加载，不加载旧 singles。缓存未以正文、prompt、provider/model 为键，无法识别文章内容更新，也可能继续复用 mock。缓存命中分支没有一并恢复 provider/model；历史匹配保留旧对象时可能保留这些字段，但新对象仅命中 URL 时不保证保留。

建议修正文档缓存范围，并为内容版本与分析元数据建立一致的缓存键和恢复行为。

### F13 中：四天约束仅针对新文章对，不是整个最终簇

PDF §3.2 的四天窗口与新文章对判定一致，但 union-find 的传递连接可能形成跨度超过四天的簇；`cluster.ts` 的 `storySimilar()`/`mergeWithHistory()` 没有日期门槛。历史簇最多保留 60 篇，文章集合变化后也不重新按媒体数排序。

建议写明“新文章对的时间差≤4天”；固定偏好顺序选出的 headline 也不能保证是最中立标题或消除原媒体 framing，需弱化这类结论。

### F14 中：人工标注评估有行对齐与边界错误

- `eval.ts:173` 到 `178` 对两个标注者各自 filter(Boolean)。如果两人漏标在不同记录上，长度仍可能相等，错误地把不同文章配成一对。应先按同一行成对筛选。
- 第 188 行强制 sentiment_1 存在才进入后续 bias 对比，使只有 bias 标注的有效行被排除。
- `metrics.ts` 的 adjustedRandIndex 在分母为 0 时返回 0。已实际调用验证：两个完全一致的单例划分、两个完全一致的单簇划分都返回 0；这些完全一致划分应返回 1。因此论文“标准指标 unchanged”的说法需在边界修复后成立。
- 当前无 annotations.csv，此问题尚不影响已报告的自动指标，但会影响未来人工评估。

### F15 中：无法判定的偏向被当成 center

`eval.ts` 的 leanOf() 默认返回 0，包括 not-determinable。PDF 将“六类映射到[-1,1]”但没有披露此处理。它会把不可判定输出作为中立样本计入媒体平均值。建议明确缺失策略，报告比例并对排除该类别做敏感性分析。

## 3. 文档内部矛盾及发布信息

- 第 2 页说数据来自“几小时”，第 10 页说“约两周”；当前归档 crawl 时间跨度约 9.87 天。应分清实际 crawl 记录跨度、文章发布时间跨度和历史论文快照。
- 第 13 页称未来才要实现 harness，而 §4 已说 harness 实现，源码也存在。应改为未来增强、人工验证或其他确实尚未实现的工作。
- 第 13 页说数据以 CC-BY-NC、代码以相应非商业许可发布；当前仓库未找到 LICENSE 文件。论文还称 open-source，与非商业代码限制的术语存在冲突。需要作者明确授权版本及许可文件；不能代作者决定许可。
- 首页仍有 Author Five 和 University Three 等占位信息。
- 第 11 页对“sentiment/bias/framing 通常支持、其他字段更常不支持”的定性结论，不能由总分 0.52 单独推出；应提供对应实验子集的逐字段统计与分母。

## 4. README 与代码不一致

| 位置 | 当前文字 | 当前实现 / 建议 |
|---|---|---|
| 开头及 Sources | BBC、Reuters、AP、Guardian | 当前配置为 Sky News 等 17 家；不含上述四家 |
| How it works 第 1 项 | 3 outlets | 17 outlets / 19 feeds |
| How it works 第 2 项 | entity matching 参与聚类 | 聚类判定仅使用 cosine/Jaccard/日期；entities 用于 single 的国际属性等 |
| How it works 第 3 项 | top 10 | 配置 topN=36，首页初始显示 12 |
| REFRESH_INTERVAL_MIN | 默认 30 | 默认 60，服务器最低有效间隔 15 |
| GUARDIAN_API_KEY 及相关排障 | 正在使用 Guardian | 配置没有 Guardian feed，fetchGuardian 分支留存不代表启用 |
| 安装命令 | 根 npm install 安装三个目录依赖 | 根 package.json 无 workspaces/postinstall；需分别安装根、server、client |
| 离线运行 | fully runnable offline | mock 分析不需模型网络，但抓取仍需网络；seed 只提供示例，不能代表实时抓取离线可用 |

## 5. 已确认吻合的内容

- 配置恰为 17 家媒体、19 个 feed；Sky News/NPR 各两个，其他一个，均配置为 RSS。
- TF-IDF unigram/bigram、headline Jaccard、union-find；跨媒体阈值 0.25/0.55，同媒体 0.45/0.70；比较使用 >=，论文的 exceeds 更准确应为 reaches/exceeds。
- 至少两家媒体构成新簇，单源组件取最新文章单列；新簇按媒体数、时间、文章数排序，最多 36 簇。
- Analyst 八类字段、loaded-language 上限 5、tone 词上限 5、并发受限、调用失败回退 mock 的基本行为。
- Analyst、Critic、Reporter 是任务角色，同一 provider 可以执行多个角色；论文对此区分是合理的。
- 简报默认间隔 5 小时、Express/React/Vite/Tailwind 技术栈及三 tab 展示基本相符。
- 当前确实没有人工标注文件，人工一致性和 topic 指标 pending 与实现相符。
- groundtruth.json 的 17 家参考标签与表 1 一致，但文件自称 approximate、verify before citing；它不是外部机构逐项可追溯的认证结果。

## 6. 验证范围与建议顺序

已提取完整 PDF 正文，并渲染 PDF，视觉核对第 11 页表格，避免把提取错误误判为论文错误。已运行 npm run build，前后端均通过；Vite 仅提示大 bundle。已直接调用编译后的 buildEvalReport 和 ARI 函数，并用 Python 独立核算真实模型子集及表 2。

本审查未进行实时抓取或付费模型调用；未对参考文献和媒体真实所有权作外部事实核验。构建成功不证明论文方法正确。历史快照的原始未舍入数据、许可授权和作者信息无法由代码推断。

建议先统一 F01–F08 的论文主张与实际实现，再冻结可复现数据快照并自动生成结果表，最后同步摘要、图 2、实验段落、README 和发布许可。仅润色 PDF 无法修复实际评估口径与验证链路问题。
