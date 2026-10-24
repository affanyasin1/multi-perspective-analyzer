# 论文数据、评估代码与结果一致性审查

日期：2026-10-22。对象：`News_Agreegator_6___Shared-4.pdf` 全 16 页、本地原始归档、Git 历史、日志、当前计算及前端源码。未找到适用的 AGENTS.md。本轮只新增独立脚本和审查产物；未修改业务代码、原始归档、参考评分或 PDF，未抓取新闻或调用模型。输入 SHA-256 及环境版本见 [run-manifest.json](run-manifest.json)。

**结论：可以复现现有原始归档的统计运算，不能从现有材料定位并复现论文所称的历史实验快照。** 同样输入下，SciPy 与项目 Pearson/Spearman 函数计算一致；论文与实现的问题主要在筛选、统计单位、版本追踪、提前舍入及指标解释。不能将“当前结果不同”直接认定为“历史结果计算错误”，也不能将表内算出 0.76 当成原始数据复现。

本轮发现实际归档存在重复 URL，补正了上一轮初查未充分区分记录数与唯一文章数的问题；本报告及本轮逐记录产物应作为本次结论依据。

## 一、必须修正的问题

下列条目附最小论文修改建议；建议的计算逻辑修复单列在第六节，均未执行。

### 1. 真实模型筛选、最低样本门槛与论文方法不一致

论文第 10–11 页说排除 mock，采用至少两篇真实分析的媒体；实际 `server/src/eval/eval.ts:140–148` 只要求 analysis 存在、媒体 n>0。不按 URL 去重，不排 mock，不校验状态、模型或历史版本。验证均值第 217–226 行也不检查 Analyst/Critic 来源。现有代码不能直接作为论文所述实验筛选的出处。

**最小修改：** 给出实际使用的独立筛选脚本及逐步计数。如果没有，改为如实描述当前所有 analysis 记录的计算口径；不能在不重做评估的情况下只把文字改成理想规则。

### 2. 表 2 的 697 条与 1,330 条分析之间没有可追溯对账

表 2 的 n 合计 697，差额 633。已从现有原始记录检查所有 232 个连续 crawl 批次边界及 8 个事先明确的单位/筛选分支，共 1,856 项检查，没有任何一项完整复现表 2 的 15 家媒体计数向量。这个结果仅否定被检查的现存归档前缀假设，不能穷尽未保留的历史处理。

不能认定 633 条来自去重、有效标签排除、不同快照或表格漏行，因为没有逐记录证据。当前按真实来源保留所有版本是 1,440 行；按 URL 保留真实分析首次/末次是 1,099 个 URL；仅保留有序倾向标签是 832 行、14 家媒体。这些分支均不解释论文 697 条，**没有据数字接近程度选择分支**。

更直接的反证是 IRNA：现存全部 104 条 DeepSeek IRNA 分析都为 not-determinable，项目映射为 0；全归档其他来源的 IRNA 分析也没有正标签。因此现存 IRNA 任意子集都不能按该映射产生表 2 的 n=2、mean=+0.25。Global Times 有 100 条归档记录但没有任何 analysis；“TASS、Global Times、Mehr News 为强一致案例”的结果表述没有当前分析子集支持。

**最小修改：** 补表 2 的完整纳入 ID、633 条排除记录及原因。无法补齐时，应标为历史结果来源无法验证；删除当前材料不支持的 Global Times 案例。IRNA 若来自另一快照或映射，必须提供该原始证据，不能补造记录。

### 3. 表注的权重解释错误，提前舍入影响 Spearman

`server/src/eval/metrics.ts:8–41` 是普通未加权 Pearson，以及平均并列秩的 Spearman。每家媒体贡献一对值，相关分析单位是 **15 家媒体**，不是 1,330 篇文章；文章 n 不是相关权重。表注称“小样本媒体权重小、样本充分媒体主导相关”没有公式依据，也与正文“少于两篇排除”相冲突。

`eval.ts:154–160` 先把媒体均值舍入两位，再算相关，改变并列秩。当前全部 analysis 口径的 Spearman，完整精度是 0.510923251127，先舍入则是 0.555192892821，最终显示 0.56。此差异已在同一原始记录集合上隔离验证。

**最小修改：** 表注改为“每家合格媒体在相关计算中等权；文章数影响其均值估计的不确定性，不作为相关权重”。公开用于计算的完整精度均值，说明历史计算是否提前舍入。论文 rho=0.65 的实际来源仍未知，不能仅凭可见表格的 rho≈0.6631 就断言它由舍入造成。

### 4. verification score 不是可确定重算的“主张支持比例”

`server/src/llm/critic.ts:18–35,65–74` 由模型直接输出 scalar，程序只转换数字、对非有限值置 0、夹到 [0,1]。未定义固定字段全集、适用性、空值、数组子项、重叠、去重或计数分母。verified_fields/unsupported_fields 不决定该数值。现存 956 个评分中，839 个不等于两数组条目数形成的简单比例；该诊断仅说明不能以数组比例重算，未用它替换任何 score。

均值是逐评分记录的 scalar 算术平均，不是所有字段合并的比例，亦非新闻事实准确率。当前有 10 条 mock Analyst 输出接受了真实 DeepSeek Critic 评分；所有 956 条评分的 Critic 元数据均为 DeepSeek，没有观测到 mock Critic，但代码在无 key 时可以返回固定 mock score=0.75。

**最小修改：** 使用“mean model-assigned article-grounding score”，并写明纳入条件、评分覆盖率和非独立判断。删除把 0.52 直接解释成“约一半所有主张获支持”的数量结论，除非提供确定的字段规则和相应原始判定。论文第 4 页对“来源支持不等于事实正确”的限制应在摘要和结果解释中同样贯彻。

### 5. 字段级结论和配图缺少对应实验支持

论文第 11 页说 bias 通常可验证，loaded language、omissions、tone 更常不支持。没有找到对应历史 856 条的字段统计。当前 946 条真实评分的记录级父字段统计反而显示：

| 字段 | 出现在 verified 的记录数 | 出现在 unsupported 的记录数 | 两侧均有的记录数 |
|---|---:|---:|---:|
| sentiment | 722 | 223 | 0 |
| bias_rating | 352 | 554 | 0 |
| framing | 771 | 175 | 0 |
| loaded_language | 789 | 279 | 125 |
| omissions | 740 | 264 | 60 |
| tone_keywords | 718 | 228 | 2 |
| fact_vs_opinion | 453 | 493 | 0 |
| insufficient_evidence_flags | 399 | 136 | 0 |

分母是 946 个评分记录；数组索引折为父字段。一条分析的不同子项可以出现在两侧，部分字段也可能未列出。这不是固定八字段二分类覆盖率，不得据此回推原 score。全文统计在 [verification_field_counts_deepseek_rows.csv](verification_field_counts_deepseek_rows.csv)，另提供 last-URL 口径。

视觉核对全部相关页面后，确认这些图文差异：

| 位置 | PDF 实际内容 | 与结果的关系 |
|---|---|---|
| p10 Figure 7 | r=0.60、rho=0.53、15 家、verification=0.52；只显示媒体表前 13 行 | 与正文 0.76/0.65 不同；不能补造截图缺失两行 |
| p8 Figure 5 | verification=0.46，110 articles | Newsroom 代码使用当前 store，与归档 Evaluation 的样本范围不同 |
| p12 Figure 9 | 3174 total、17 outlets、16 clusters、1577 analyzed、50% | Dashboard 只查 analysis 是否存在，包括 mock；不能与 1330 真实分析互换 |
| p12 Figure 8 | 文章量、每日媒体量、trending topics | 没有图注所称 model-vs-reference lean、Critic per-field breakdown |
| p12 Figure 9 图注 | 声称包含 verification scores | 完整截图没有对应分数图 |
| p5 Figure 3 | Indian Express = Center | 与表 1/2 及 groundtruth.json 的 lean-left/−0.5 不同；现有前端元数据亦如此 |

**最小修改：** 对历史字段结论补对应原始子集统计；否则删除该概括。截图若仅为功能演示，逐图注明日期、数据范围及非实验结果；若为结果证据，应换为同一冻结快照生成的图。重写图 8/9 的错误图注，统一参考评分来源。

### 6. 方法中的验证门控和可复现机制没有实施证据

论文图 2、正文及 Reporter 方法反复说只传 Critic 接受的材料。实际 `pipeline.ts:19–21` 的 cluster comparison 在 Critic 前生成；`index.ts:125–145` 只要求 analysis 存在，不看 verification、unsupported_fields 或 corrections。Reporter prompt 把输入称 verified 并不构成过滤。

现存 3,633 条均没有 prompt_hash、schema_version 或 temperature。源码未实施所述 SHA-256 提示词快照/索引及 schema fallback；设计文件仍为 Draft，不能作为运行证据。调用请求硬编码 temperature=0 也不等于逐记录可追溯版本。单篇 Analyst 的输入也没有其他媒体的原文，不能把 omissions 和相对偏向当成实际读取跨媒体参照后产生的计算结果。

**最小修改：** 如实写为“Critic 提供单独记录的诊断，当前并不门控 Reporter 输入”，同步修改图 2 的箭头及方框。把未实现的可复现机制写成计划。将相对偏向/omissions 的表述限制为模型任务指令，或提供实际跨媒体输入的历史实现。

### 7. 时间、harness 和参考评分用词需要统一

引言 p2 的“数小时”与 §5 p10 的“约两周”未区分快照。当前可观测 crawl 区间是 UTC 2026-10-10 21:24 至 2026-10-20 18:12，跨度 9 天 20:47:47.672；北京时间为 10 月 11 日 05:24 至 10 月 21 日 02:12。它不能替代未知的论文采集区间，发布日期坐标也不能证明采集时长。

§4 已实现 harness 与 p13“未来实现 harness”冲突。`groundtruth.json` 自称 approximate、verify before citing，更新时间 2026-10-12；设计说明是 best-effort MBFC/AllSides knowledge，没有逐媒体外部评级原文、人工映射依据或责任记录。可以核验当前文件的数值运算，不能称其为已证实客观的独立 ground truth。

**最小修改：** 用明确快照起止时间统一两处；将未来工作改为增强现有 harness；统一称“approximate hand-assigned reference ratings”，补来源与映射版本。Availability 的 `<owner>` 占位仓库链接也需换成实际可定位版本。

## 二、证据不足：论文原始快照未找到

只读检查了 Git 的 16 次提交、分支/标签、reflog、不可达对象、archive/store、日志及 briefing。原始数据被 gitignore 排除；Git 没有保留可还原的论文数据。当前 HEAD 是 `8821483ab8eb9e2c9d03aa1e3e35df35ebeaab4e`，最早归档早于初始提交，逐记录也不含 commit，不能确定全部历史执行版本。

| 可追溯项目 | 状态 |
|---|---|
| 论文原始文件、hash、截止点、成员 ID | 缺少材料，无法验证 |
| 论文代码 commit 和实际运行环境配置 | 缺少材料，无法验证；部分参数可见于提交和日志 |
| 当前真实记录的 provider/model | DeepSeek/deepseek-chat；无法确认供应商不可变模型版本 |
| 论文全部 Analyst 的相同模型版本 | 论文只说 DeepSeek；图 5 deepseek-chat 是 Reporter 元数据，不足以证明全部 Analyst |
| 历史 prompt fingerprint、schema_version | 原始记录全缺失，不能重建当时实际值 |
| 参考评分原始出处及人工映射版本 | 有当前文件和更新日期；无逐项出处、责任人与实验绑定 |
| 633 条排除记录、856 条评分成员与缺评分原因 | 缺少材料，无法验证 |
| 人工标注、Cohen kappa、ARI、FM 实验 | annotations.csv 缺失，无法从原始人工数据复算，保持 pending |

关键前缀检验如下；中途碰到目标数字不构成快照来源：

| 结束行 | 完整批次边界 | 真实分析记录 | 真实 Analyst 有评分记录 |
|---:|:---:|---:|---:|
| 3168 | 是 | 1323 | 847 |
| 3174 | 否 | 1329 | 853 |
| 3175 | 否 | 1330 | 854 |
| 3177 | 否 | 1332 | 856 |
| 3184 | 是 | 1339 | 863 |

日志从 3168 跳到 3184；3169–3184 属同一 crawl 时间。没有任何完整批次或单一前缀同时符合 3174/1330/856。完整证据及范围限制见 [snapshot-forensics.md](snapshot-forensics.md)。

## 三、当前原始数据的独立复算

### 3.1 统计单位和数量对账

| 单位 | 当前可观测数量 | 解释 |
|---|---:|---|
| JSONL 对象记录 | 3633 | 无空行、无解析坏行；不是唯一文章数 |
| 精确 URL | 2859 | 772 个重复 URL 组，774 条重复增量；不做猜测性 canonical URL 合并 |
| 有 analysis 的记录 | 2036 | DeepSeek 1440 + mock 555 + 来源缺失 41 |
| 无 analysis 的记录 | 1597 | 包括来源空白或缺失，不能统称 mock |
| DeepSeek 分析记录 | 1440 | 1099 URL；1356 显式 done，84 旧记录缺 status |
| DeepSeek 不同 URL+analysis 内容签名 | 1386 | 同内容可复用；不等于实际模型调用次数 |
| DeepSeek 五级有序标签记录 | 832 | center600、lean-right148、lean-left61、right23、left0 |
| DeepSeek not-determinable | 608 | 当前项目映射为0；它不代表模型实际判断为center |
| 缺失/异常 bias 标签 | 0 | 在当前所有 analysis 对象中未观测到；不证明原始模型响应有效 |
| 全部 Critic score 记录 | 956 | 823 URL，952 种 URL+verification 内容签名 |
| 真实 Analyst/真实 Critic score 记录 | 946 | 813 URL，942 种 URL+verification 内容签名 |

归档有四种连续字段形态，重复记录都在各字段区块内部，无完全相同的整行 JSON。当前代码意图首次 URL 去重，实际文件却有重复；无跨进程锁、历史迁移或其他机制均可能影响，现有证据不能确定成因。没有调用 ID、原始请求日志和完成时间，不能认定“分析对象数=分析调用次数”或“评分记录数=Critic 调用次数”。

原始媒体均为 FEEDS 中的规范 ID，未知 ID 数为0。采集代码直接赋 FEEDS 的 ID，前端显示名仅作映射；评估不做自由媒体名称归一。URL 是精确字符串，未去 tracking 参数/fragment，也未查询 canonical URL；本轮保留此原始标识规则。

### 3.2 筛选分支及相关结果

主对照分支固定为：analysis 存在且 provider=deepseek、model=deepseek-chat；保留所有归档版本；按现有映射 ND→0；筛选后每家 n≥2；使用完整精度均值和当前参考文件；每媒体等权。其起始 3633 行排除非真实或无分析 2193 行，保留1440，无媒体资格剔除，共15家。**这不是已找到的论文历史快照。**

| 分支 | 纳入记录 | URL | 媒体 | Pearson r | Spearman rho |
|---|---:|---:|---:|---:|---:|
| 当前项目实际评估：全 analysis、先舍入 | 2036 | 1666 | 15 | 0.566488702306 | 0.555192892821 |
| 当前 DeepSeek 所有记录、完整精度 | 1440 | 1099 | 15 | 0.696755496555 | 0.566130371136 |
| 进一步显式 status=done | 1356 | 1035 | 15 | 0.690094250922 | 0.566640168962 |
| 先筛真实分析，再按 URL 保留首次 | 1099 | 1099 | 15 | 0.677337524225 | 0.566130371136 |
| 先筛真实分析，再按 URL 保留末次 | 1099 | 1099 | 15 | 0.680447550806 | 0.566130371136 |
| 先全归档 URL 首次，再筛真实分析 | 1069 | 1069 | 15 | 0.679274853189 | 0.585191999794 |
| 先全归档 URL 末次，再筛真实分析 | 1085 | 1085 | 15 | 0.685953705912 | 0.576179565746 |
| 仅五级有序标签，排 ND（敏感性） | 832 | 669 | 14 | 0.769872485735 | 0.619081023023 |

末次指归档最后出现的行，不能认作有已验证调用时间的最新分析。最后一个分支排除 IRNA，证明把 ND 当0与排除 ND 会改变测量对象；本轮没有选择更接近论文 r=0.76 的结果。每条原始记录在每个分支的互斥决策见 [selection_ledger.csv](selection_ledger.csv)，各分支起始与纳入/排除计数均有守恒断言。

SciPy pearsonr/spearmanr 与项目函数在同一输入上的13项比较均在 1e−12 内一致。项目实际 `buildEvalReport([])` 也被从当前 TS 源码内存转译后执行，返回 r=0.57、rho=0.56、n=15、verification=0.51，与独立仿真一致；没有启动服务或调用模型。测试输入 `[]` 只表示本轮不伪造当前/历史 topic 人工评估。

### 3.3 从原始记录重建表 2

[reconstructed-results.md](reconstructed-results.md) 展示全部15家当前原始 n、唯一URL、ND、参考评分及17位精度均值；可计算表为 [table2_deepseek_rows.csv](table2_deepseek_rows.csv)。逐行与原表对照为 [table2_paper_vs_current.csv](table2_paper_vs_current.csv)，其余每个预定义分支也各有一份表。

原表逐项参考评分与当前 groundtruth.json 一致。当前模型均值不得未经历史定位就静默覆盖论文；表 2 每家成员 n 不能仅由显示均值推回。归档的全部分析标签可对账，未发现通过改名将 Global Times 合并进其他媒体的证据。

单独使用 PDF 表 2 的显示值计算得到 r=0.760433648534、rho=0.663106192277，n=15。这一项状态严格为 **仅通过论文表格内部复算**。显示值有限精度可造成并列，但未知历史未舍入均值、筛选与程序版本；rho=0.65 的实际原因 **缺少材料，无法验证**，不能擅自改为0.66或宣称已知舍入原因。

### 3.4 verification score 汇总与覆盖率

| 范围 | 分析/起始记录 | 评分记录 | 唯一评分 URL | 覆盖率 | 逐记录均值 |
|---|---:|---:|---:|---:|---:|
| 论文声称的历史子集 | 1330 | 856 | 未知 | 64.360902%（仅数字相除） | 0.52，原样本无法验证 |
| 当前真实 Analyst/真实 Critic | 1440 | 946 | 813 | 65.694444% | 0.516969556025 |
| 当前全 analysis（含mock/未知） | 2036 | 956 | 823 | 46.954813% | 0.513261715481 |
| 真实分析首次 URL 版本 | 1099 | 785 | 785 | 71.428571% | 0.517219745223 |
| 真实分析末次 URL 版本 | 1099 | 811 | 811 | 73.794359% | 0.514911467324 |

当前所有评分有限且在[0,1]内，实际最小0、最大0.875；顶层与嵌套 score 全部一致。它们是经过 sanitization 的已保存值，无法判断原始模型是否曾输出非法值、被默认成0或夹值。

1440−946=494 条真实分析缺评分，其中437条处于不含verification字段的旧字段区块（84+353），57条处于带该字段的新区块但无score。这是结构性对账，不能据此确定437条从未运行Critic，也不能认定57条全部为调用失败：Archive 首次URL留存、历史实现、重试和失败没有可逐分析关联的日志。论文1330→856的474条缺分原因及实际覆盖率仍未被原始样本验证。

逐评分明细含原始行号、URL、Analyst/Critic来源、score、字段数组和纠正建议，见 [verification_records.csv](verification_records.csv)；机器可读汇总见 [verification_summary.json](verification_summary.json)。

## 四、逐项核验表与状态

[verification-matrix.md](verification-matrix.md) / [verification-matrix.csv](verification-matrix.csv) 含45项声明（所有重复位置）及15家表2逐行核查，共60项。列包含论文位置、声明类型、报告值、复算值、数据来源、筛选规则、代码路径与行号、状态及最小论文修改建议。完整 PDF 转录、图像数值和位置见 [paper-claims.md](paper-claims.md) / [paper-claims.json](paper-claims.json)。

状态使用以下四类：

- **已由原始数据复现**：当前指定输入的计数/公式可重跑；对配置项明确标注为当前配置源码核验，不代表历史实际运行值。
- **仅通过论文表格内部复算**：例如697合计及显示值的相关；没有把它升级为原始数据复现。
- **与论文不一致**：有明确实现、原始记录或论文内部证据反驳所述行为/解释；范围限制随行写明。
- **缺少材料，无法验证**：历史快照、成员、完整精度或出处不足；当前数值不同不等于历史结果已被否定。

## 五、配置范围、实际观测与展示范围

当前配置是17家/19条，全部 RSS；Sky/NPR分别world/politics，其余world。不同媒体阈值 cosine≥0.25 OR headline Jaccard≥0.55，同媒体0.45/0.70；四天仅约束新文章对。union-find 的传递簇可以跨更长时段，历史合并也无日期门槛。新故事需至少两家媒体，单源组件保留最新代表，最多40条；多源最多36簇，首页先12，再展开。分析与归档在截断后执行，归档不是摄取原文的完整集合。

简报默认5h，参数在当前代码、引入提交及日志可见；实际历史环境覆盖未知。五小时周期是调度，不保证每次生成成功。以上配置与论文核心参数基本吻合，应保留“配置/默认”限定。

界面不是同一统计样本：Evaluation 全 archive、Newsroom 当前 store、Dashboard analysis存在即计数、Insights 对缺来源且有analysis的旧记录强认mock。当前 store 只有14簇/40 singles/98篇，没有有值verification score；不能用它恢复论文截图。CSV导出只保留部分分析字段，缺完整正文、verification/score、source_count、status和版本元数据，不能单靠导出复算本论文全部指标。详见 [code-paths.md](code-paths.md)。

## 六、实现错误及可选改进（本轮均未修改）

必须改变计算逻辑时，应保留旧报告并新建版本，不能静默改变历史结果：

1. 在相关计算前固定快照和成员单位，明确真实/未知/mock、状态与有效标签规则，再施加媒体最低n；记录每条排除原因。去重是选择分析版本的研究决策，不应为匹配论文数字调整。
2. 媒体均值完整精度进入相关，展示层才舍入；保留均值、配对、并列秩和公式版本。ND不能在不声明时当作center；需要预先确定缺失策略并报告敏感性。
3. 分开记录 article_id、analysis/run/attempt_id、原文版本、model/prompt/schema/代码版本，保存Critic失败原因与原始评分判定。若研究需要确定性“字段比例”，预定义适用集合及计数方式，另立指标而不回写旧scalar。
4. 实施Reporter gate时需字段级筛选与可追溯的聚类摘要重算；仅加一个均分阈值并不能保证每条传递材料获支持。
5. 修复重复写入/版本记录策略后验证跨进程行为，不清除或覆盖现有重复证据。缓存键需包含内容与方法版本，缓存命中应完整保留来源元数据。

可选、未影响当前已报告自动指标的分支问题：人工标注κ分别过滤两侧缺值会错配行；bias比较被sentiment缺值连带排除；topic只用当前clusters而非归档历史成员。ARI完全一致单例/单簇边界当前返回0（常规定义应为1）。fact/opinion的0因`||50`变50且两者未强制和100。以上在 [code-paths.md](code-paths.md) 有精确行号；没有用伪造人工标签生成论文实验值。

## 七、独立脚本、运行命令与依赖

在项目根运行（使用现有依赖，不需联网）：

```bash
python3 scripts/audit_paper_results.py
python3 scripts/audit_snapshot_forensics.py
python3 scripts/audit_claim_matrix.py
```

- `audit_paper_results.py`：原始记录盘点、8个固定分支、逐记录筛选账本、完整精度表、SciPy相关、评分明细/字段计数、输入hash守恒；调用只读 Node bridge。
- `audit_project_bridge.cjs`：从当前TS源码在内存转译，调用真实metrics与buildEvalReport；不加载server入口、不运行pipeline、不调用模型。
- `audit_snapshot_forensics.py`：仅标准库，核验自然边界、固定分支、字段区块、IRNA证据；不能把命中的部分数字当已确认快照。
- `audit_claim_matrix.py`：把经全文和视觉核对的45项声明与上述计算结果连接，生成逐项核验表。

本次版本：Python3.12.2、SciPy1.16.3、NumPy2.2.6、Nodev26.4.0、TypeScript5.9.3；Python依赖清单见 [requirements-audit.txt](requirements-audit.txt)。PDF文本用Ghostscript10.06.0的txtwrite提取并渲染相关完整页作图表核对；此工具只用于审阅，原始数据统计脚本不依赖PDF解析或表格OCR。上一步build通过只能说明当前源码可构建，本轮核心证据是实际原始数据运行与独立统计比对。

文件索引：`raw_overview.json`、`raw_record_inventory.csv`、`duplicate_url_records.csv`、`crawl_batches.csv`、`selection_ledger.csv`、`correlations_and_subsets.json`、`project_comparison.json`、各`table2_*.csv`、`verification_*.csv/json`、`snapshot_*.csv/json`、`run-manifest.json`。行号均指原始JSONL物理行；没有把缺失旧字段补写进输入。

## 八、计算正确性与测量有效性

**计算正确性：** 本轮证明给定当前原始输入、明确筛选与统计单位后，计数可以对账，SciPy与项目相关公式一致，保存的score均值可以重算；也识别了与论文不一致的筛选和解释。论文历史核心结果因快照缺失仍未获得原始数据复现。

**测量有效性：** 上述运算不能证明手工近似参考评分客观正确，不能证明单篇模型完成真实跨媒体比较，不能证明同模型Critic的支持度等于独立人工事实核查。字段定义、模型偏向、来源文本真实性、样本选择和缺评分机制仍需要独立证据。0.52即使数值可重算，也不能被解释成“新闻有52%真实”或“52%全部主张经过独立事实核查”。
