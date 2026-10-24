# 论文声明与全位置清单（独立摘录）

来源：`News_Agreegator_6___Shared-4.pdf`，共16页；页码为PDF打印页码。先逐页提取全文，再以Ghostscript渲染16页联系表，并高分辨率检查Figures3、5、7、8、9。没有改动PDF、业务代码或归档。本文件只做声明及论文内部核对；与原始记录/代码的最终状态由主审报告合并。

适用AGENTS检查：`/AGENTS.md`、`/Users/AGENTS.md`、`/Users/lvyueqi/AGENTS.md`、`/Users/lvyueqi/Desktop/AGENTS.md`、项目根，均未发现。递归项目未发现AGENTS.md。已读取pdf skill并执行只读检查。

## 必须修正的论文内部冲突

1. **正文与Figure7的相关系数不同**：p1摘要、p11结果及表2、p13结论报告r=0.76（摘要/p11同时rho=0.65）；p10 Figure7实际界面是r=0.60、rho=0.53、15outlets，verification=0.52。不能因为15及0.52相同就认定同一评估子集。最小修改：更换成同一冻结快照/筛选分支的截图，或图注明确标示截图不同时间、范围和非论文结果。

2. **评估harness同时被描述为已实现和未来实现**：p1摘要、p2贡献3、p9 §4.2、p11 human agreement、p13结论/Availability称已存在；p13 Ethics末段又称未来实现。最小修改：以实际已运行功能和缺失功能区分现状与未来，并删除笼统未来实现句。

3. **不足2篇的处理互相冲突**：p10 §5明确只有至少2篇真实分析的15家媒体纳入；p11表注称少于2篇的媒体权重很小，且多文章媒体主导相关性。表注暗示纳入或加权，正文描述排除。最小修改：若代码未加权，写清每家合格媒体等权；若历史加权则需找回公式和权重。

4. **Global Times结论超出表2**：p11称最强一致包括TASS、Global Times、Mehr News；Global Times未出现在p11表2。最小修改：仅对实际纳入媒体作此归因；没有实际子集证据不得补造Global Times行。

5. **Figure8图注不对应图片**：p12图注称显示模型lean对reference及Critic逐字段统计；实际图片为Insights每日文章量、分媒体每日量和14天趋势故事。最小修改：将图注改为实际图像含义，或提供真正的偏向及字段统计图。不能把该截图当作字段级统计证据。

6. **采集时长冲突**：p2引言称约数小时采集的1330分析快照，p10结果称约两周。论文未给两个快照标识/分别用途。最小修改：找到采集批次和时间戳后统一起止时间；找不到时明示快照采集时长不可验证。发布日期图轴可早于采集窗口，不能拿其跨年范围直接认定采集多年。

7. **参考标准命名及界面值不统一**：p5表1使用ground truth，p10 Figure7称independent ground truth，却同处又写approximate；p12限制称人工赋值、非gold standard。p5 Figure3的Indian Express=Center，表1=lean-left、表2=-0.50。最小修改：统一称approximate hand-assigned reference ratings，并注明UI说明性标签与评估数值映射的区别或统一显示。

8. **界面口径缺说明**：p8 Figure5 verification=0.46（110文章），正文0.52（856分析）；p12 Figure9分析数1577（50%）与正文1330不同，虽归档数均3174。数字可来自不同子集/模型/mock/快照；单凭截图不能断言原因。最小修改：每图注明数据快照、过滤口径及记录单位，或者统一替换为论文冻结子集。

## 逐项声明（含重复出现位置）

类型区分配置范围、实际观测、计算结果、实现参数、方法及界面。数值是否可由原始记录重现，见主报告和独立脚本结果。

| ID | 全部相关位置 | 类型 | 声明/报告值 | 单位或限定 |
|---|---|---|---|---|
| P01 | p1 摘要；p4 Figure2及§3.1；p5 Table1、Figure3；p10 §5 collection scope；p12 Figure9 | 配置范围 | 17 outlets | 媒体 |
| P02 | p4 §3.1；p10 §5 collection scope | 配置范围 | 19 official RSS/API feeds | feeds |
| P03 | p4 §3.1 | 配置范围 | Sky News、NPR各有world/politics feeds；其余为world feeds | feed类型 |
| P04 | p10 §5 archived records；p12 Figure8、Figure9 | 实际观测 | 3,174 archived article records / 3174 unique articles | 归档记录/界面称唯一文章 |
| P05 | p1 摘要；p2 引言末；p10 §5 archived records；p11 verification subset | 实际观测 | 1,330 real model analyses；§5 specifies DeepSeek | 文章/分析，待确定 |
| P06 | p10 §5 archived records | 推导数量 | remaining outputs mock；3174−1330=1844 | 推导mock记录，论文未直接打印1844 |
| P07 | p1 摘要；p2 引言末；p10 §5 bias subset；p11 Table2及结果；p12 §6 | 实际观测/筛选 | 15 outlets with >=2 real-model analyzed articles | 媒体 |
| P08 | p11 Table2 | 表格观测 | 逐行n合计697；与1330差633 | 文章/分析待确定 |
| P09 | p1 摘要；p11 bias结果；p11 Table2末行；p13 §7结论 | 计算结果 | Pearson r=0.76 | 15家媒体，无加权公式 |
| P10 | p1 摘要；p11 bias结果；p11 Table2末行 | 计算结果 | Spearman rho=0.65 | 15家媒体 |
| P11 | p11 §5 verification subset、verification rate | 实际观测 | 856 scored real-model analyses | Critic评分分析 |
| P12 | p1 摘要；p11 verification rate；p13 §7结论；p10 Figure7 UI | 计算结果 | mean verification score / rate=0.52 | 逐已评分分析平均 |
| P13 | p1 摘要；p3 RelatedWork；p7 §3.4；p11 verification结果 | 方法解释 | roughly half of analyst claims; fraction of grounded fields | claim与field并非自动相同 |
| P14 | p6 §3.2（延续p5） | 实现参数 | cross-outlet TF-IDF cosine>0.25 OR headline Jaccard>0.55 | 阈值，原文exceeds |
| P15 | p6 §3.2 | 实现参数 | same-outlet stricter 0.45 / 0.70 | 阈值 |
| P16 | p6 §3.2 | 实现参数 | four-day publication window | 天，发表时间 |
| P17 | p4 Figure2 Cluster方框；p6 §3.2 | 实现参数 | >=2 distinct outlets per story | 媒体 |
| P18 | p6 §3.2 | 实现参数 | top36 stories; outlet count desc then recency then size | 故事 |
| P19 | p7 §3.4 Reporter；p8 Figure5 UI | 实现参数 | five hours default; configurable cadence; every5h | 小时 |
| P20 | p2 引言末 | 采集时间 | snapshot of roughly few hours of crawling | 采集时长 |
| P21 | p10 §5 Results首段 | 采集时间 | approximately two weeks of crawling | 采集时长 |
| P22 | p1 摘要；p2 contributions；p7 §3.3；p9 §4.1 | 实现声明 | every analysis prompt fingerprint SHA-256(system+schema), temperature, content-addressed snapshots+index | 可复现元数据 |
| P23 | p1 摘要；p2 contributions；p9 §4.1；p13 §7结论 | 实现声明 | semantic schema_version; missing=>1.0.0; changelog; schema-versioned JSONL | 归档版本 |
| P24 | p2 contributions；p9 §4.1 | 实现声明 | documented codebook for archive/store/CSV fields, labels, flags | 文档 |
| P25 | p1 摘要；p2 contributions；p8 §3.5；p9 §4.2；p10 Fig7；p11 human agreement；p13结论及Availability | 实现声明 | working evaluation harness computes four measurements | harness状态 |
| P26 | p13 §6 Ethics末段 | 未来计划 | plan to implement a harness in future work | harness状态 |
| P27 | p2 contribution2；p3 §3；p4 Figure2图注及正文；p7 §3.4 Reporter；p8 Figure5 UI | 实现声明 | Reporter receives only Critic-accepted material / verified digests | 过滤链路 |
| P28 | p5 Table1图注；p9 §4.2；p10 Fig7 UI；p12 §6；p13 Ethics | 测量定义 | reference lean derived MBFC-style; approximate hand-assigned vs ground truth | 人工评分 |
| P29 | p11 Table2图注 | 加权解释 | outlets fewer than2 carry little weight; correlation dominated by well-sampled outlets | 权重 |
| P30 | p11 bias结果首段 | 结果归因 | strongest agreements TASS, Global Times, Mehr News | Global Times缺席Table2 |
| P31 | p11 verification结果 | 结果归因 | sentiment,bias,framing usually grounded; loaded language,omissions,tone often unsupported | 需字段级统计 |
| P32 | p4 §3正文 | 效度限制 | same model Analyst/Critic not independent; support by supplied text not factual correctness | 测量效度 |
| P33 | p10 §4.2末；p11 Human agreement | 实际观测 | no annotation file current snapshot; kappa/ARI/FM pending | 人工标注 |
| P34 | p6-p7 §3.3 Analyst | 实现参数 | eight analysis fields; loaded_language<=5,tone_keywords<=5; sentiment[-1,1],bias confidence[0,1] | schema |
| P35 | p7 §3.3 Analyst | 实现声明 | URL cache unchanged avoids model reinvoke; deterministic mock transparently tagged on individual failure | 缓存/回退 |
| P36 | p4 §3.1；p5 §3.1延续 | 实现声明 | body fetch fallback summary+body_incomplete; retain last good data; staleness surfaced; no paywall/robots bypass | 采集保障 |
| P37 | p6 §3.2 | 实现声明 | cross-crawl URL/content story tracking stable ids; topic headline neutral outlet preference | 聚类追踪 |
| P38 | p7 §3.4 Reporter | 实现参数 | briefing headline/summary/1-4 coverage divergences/implications | schema |
| P39 | p10 Figure7 UI | 界面观测 | Pearson0.60,Spearman0.53,15outlets,verification0.52 | 截图快照未标识 |
| P40 | p8 Figure5 UI | 界面观测 | Verification rate0.46 (110 articles) | 当前store或归档待核对 |
| P41 | p12 Figure9 UI | 界面观测 | 3174 total;17 outlets;16 clusters; analyzed50%,1577 with LLM analysis | 截图口径未标识 |
| P42 | p12 Figure8 图注与截图 | 图文一致性 | caption claims lean comparison+Critic per-field; actual image volume charts+trending topics | 图像内容 |
| P43 | p5 Figure3 UI vs Table1/Table2 | 参考评分一致性 | Indian Express UI=Center vs Table1 lean-left/Table2=-0.50 | UI与参考标准 |
| P44 | p13 Availability脚注 | 复现入口 | https://github.com/<owner>/same-story-different-lens | 占位URL，非可定位发布版本 |

## Table2逐行原始抄录

此处是**PDF表格抄录，不是原始数据复现**。没有使用这些数值设定筛选或修改参考评分。

| Outlet | ID | Reference lean | Model lean（展示精度） | n |
|---|---|---:|---:|---:|
| Al-Monitor | almonitor | -0.50 | -0.03 | 123 |
| Anadolu | anadolu | +0.50 | +0.00 | 34 |
| Daily News Egypt | dailynewsegypt | +0.00 | +0.03 | 18 |
| ECNS | ecns | +0.50 | +0.10 | 10 |
| France 24 | france24 | +0.00 | -0.07 | 81 |
| Indian Express | indianexpress | -0.50 | +0.03 | 34 |
| IRNA | irna | +1.00 | +0.25 | 2 |
| Mehr News | mehrnews | +1.00 | +0.29 | 29 |
| NPR | npr | -0.50 | -0.28 | 23 |
| Sky News | skynews | +0.00 | -0.33 | 3 |
| TASS | tass | +1.00 | +0.50 | 98 |
| The National | thenational | +0.00 | +0.06 | 172 |
| Yonhap | yonhap | +0.00 | +0.00 | 55 |
| AllAfrica | allafrica | +0.00 | -0.09 | 11 |
| Doha News | dohanews | +0.00 | -0.13 | 4 |
| **合计** | | | | **697** |

正文1330与表格697相差633。表格未列The News及Global Times，不能据此自动认为缺失的633由这两家构成。表中只有2位小数的媒体均值会丢失精度；据表复算只能标“仅通过论文表格内部复算”。实际独立SciPy结果见`paper_table_internal_check.json`。

## Figures的人工视觉读数

### Figure7（p10）

四张指标卡：Pearson R=0.60；Spearman rho=0.53；Outlets=15（with enough analyzed articles）；Verification rate=0.52（Critic's mean grounding score）。原截图只可见以下13行，尾部在AllAfrica结束；不推测缺失两行。

| ID | Ground-truth lean | LLM mean | Articles |
|---|---:|---:|---:|
| skynews | +0.00 | +0.00 | 34 |
| france24 | +0.00 | -0.05 | 208 |
| npr | -0.50 | -0.23 | 41 |
| indianexpress | -0.50 | +0.02 | 89 |
| irna | +1.00 | -0.01 | 100 |
| mehrnews | +1.00 | +0.04 | 130 |
| dohanews | +0.00 | -0.10 | 10 |
| almonitor | -0.50 | -0.03 | 163 |
| thenational | +0.00 | +0.06 | 308 |
| yonhap | +0.00 | +0.01 | 83 |
| anadolu | +0.50 | +0.02 | 70 |
| dailynewsegypt | +0.00 | +0.00 | 42 |
| allafrica | +0.00 | -0.04 | 28 |

标题副文：How well the LLM's bias analysis agrees with independent ground truth and human labels。其下一行：Ground truth: Media Bias/Fact Check style reference lean — approximate, verify before citing。

### Figure5（p8）

Newsroom：Verification rate: 0.46 (110 articles)；World briefing显示every5h、generated19h ago；页内生成元数据provider:deepseek、model:deepseek-chat、agent:reporter。该模型元数据属于这则Reporter简报，不能单独证明所有1330 Analyst分析采用相同模型版本。

### Figure8（p12）

Insights：3174 articles、generated6:10AM。文章量图和按媒体日期图为发表日期；可见最早日期2024-10-01及近期2026-10-17。下方trending topics文字：>=3 related articles、>=2 outlets、spanning>=2days、last14days；卡片例41articles/6days、31/7、28/8、34/4、18/8、12/5。没有bias-reference scatter或Critic字段图。

### Figure9（p12）

Data Dashboard：3174articles、generated7:17AM；Total articles3174（unique,from all crawls）；Outlets17；Story clusters16（2+outlet coverage）；Analyzed50%（1577 with LLM analysis）。图含按媒体数量、每日数量、每日平均sentiment、sentiment分布。1577/3174≈49.685%，UI50%的整数展示内部合理，但“LLM analysis”的provider/mock纳入规则需要读代码。

### Figure3（p5）

标题17sources，称lean是approximate reference points、not absolute judgments。Indian Express行lean=Center，与Table1/Table2的lean-left/-0.50不一致；Anadolu/ECNS/TASS等显示State(pro-gov)，不能直接当作同一数值lean刻度。

## Figure2静态架构图内文字（p4）

- Ingest方框也写17outlets；Cluster方框写at least two distinct outlets。
- Critic→Reporter绿色箭头写Verified material only；Reporter方框另写Use verified material only。与caption及正文合计多次重复同一过滤保证。
- Versioned Archive方框写Analyses, cluster memberships, verification scores及Prompt fingerprint+schema/model metadata；Evaluation Harness方框从Archive records接箭头，写Bias correlation+mean verification score及Human agreement/clustering: pending annotations。这些均是已存在的系统图语气，与未来implement harness冲突。
- 图9图注也包含verification scores，但整张截图未显示任何verification score；实际图内容是文章/媒体/聚类/分析数量、文章量和sentiment统计。

## 缺少的论文出处和最小方法补充

- PDF没有明确论文快照ID、原始文件SHA256、采集UTC起止时间、代码commit、模型不可变版本、实际prompt fingerprint、schema version值、表2和verification样本清单。仅说存在版本机制不等于给出此次实验可定位值。

- PDF参考[16]和[17]只是MBFC/AllSides网站总入口（accessed2026），没有逐媒体当时页面、截取日期、版本或人工映射记录。审查不得用当前网上评分替换历史参考评分。

- Availability的GitHub链接仍含`<owner>`占位，不能定位论文实验版本。

- Verification定义在p7是“fraction of fields”，p1/p11将其解释为“claims”比例。需确认字段与claim计数如何对应、score由模型直出还是程序计算、分母如何处理不适用、缺失及unsupported；若模型直出标量，应改为模型对原文支持度的总体评分，不能称确定性的逐claim支持率。

- p4明确限定Critic检查的是给定原文支持度，不保证新闻原文真实，且同模型Analyst/Critic不独立。该限定正确，须与摘要和结果中的claim/verification语言保持一致。

- 字段类型包含八个字段；bias六分类含not-determinable，但PDF未明确其数值映射、丢弃还是作0；也未定义异常/缺失标签处理与“至少两篇”判断顺序。应补精确筛选流程及每步排除数量，独立于是否碰巧符合报告数字。

- 人工参考评分的客观有效性、Critic判断能否替代人工核查属于测量有效性；数值能被重算只证明计算和来源追踪，不能自动证明以上效度。
