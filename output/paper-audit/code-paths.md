# 计算与界面口径代码证据

审查日期：2026-10-22。仅新增审查材料，未修改业务代码、归档或论文。未运行抓取、模型调用或服务启动。检查了 `/AGENTS.md`、`/Users/AGENTS.md`、`/Users/lvyueqi/AGENTS.md`、`/Users/lvyueqi/Desktop/AGENTS.md`、项目根目录及项目内的 `AGENTS.md`，未发现适用文件。本文为主审查报告的代码证据附件，不把当前源码自动视为论文实验时源码；历史版本是否一致须另见快照溯源。

## 必须修正的当前实现与论文描述差异

### C01 相关评估没有实现真实模型过滤或每家至少两篇

- `server/src/eval/eval.ts:26–39`：按配置读取全归档，JSON 解析失败的行静默跳过；不做 URL 去重、时间截断、快照选择或 schema 验证。
- `server/src/eval/eval.ts:140–146`：唯一进入条件为 `r.analysis`；不检查 `analysis_status`、provider、model、Critic 或有效标签。每条有 analysis 的归档记录使 n 增加 1。
- `server/src/eval/eval.ts:148`：资格是参考评分文件中存在，且 n > 0；不是 n ≥ 2，也不存在低样本权重。
- `server/src/eval/eval.ts:42–49`：`left=-1, lean-left=-0.5, lean-right=0.5, right=1`，其他值全部为 0，包括 `center`、`not-determinable`、缺失 rating 值和异常字符串。若 `bias_rating` 整个对象缺失，会在 143 行读取时报错，而非排除。当前数据中是否实际出现该情况应由独立脚本计数决定。
- 论文最小修改：说明实际使用的 provider/有效标签/最低样本规则及其分步计数，并用同一快照复算。若论文坚持排除 mock 且每家至少两篇，现有 `buildEvalReport` 不是该结果的充分出处。
- 实现修复建议（本轮未执行）：在计数前使用明确且可审计的来源和有效标签条件；之后再按纳入数判断资格。不得仅为了接近论文值选择排除规则。未知 provider 应保留为未知，不能自动改成 mock。

### C02 相关系数使用舍入后的均值，公式不含文章数权重

- `server/src/eval/eval.ts:149–160`：逐媒体均值在 154 行先 `round2(sum/n)`，再进入 Pearson/Spearman。四舍五入会改变 Pearson 和并列秩。
- `server/src/eval/eval.ts:231–235`：输出相关系数再舍入两位。样本单位是媒体行，`bias_correlation.n=outletRows.length`，不是文章数。
- `server/src/eval/metrics.ts:8–23`：标准、未加权 Pearson，r = Σ(x−x̄)(y−ȳ) / √[Σ(x−x̄)²Σ(y−ȳ)²]。
- `server/src/eval/metrics.ts:26–41`：数值升序；相等数值取平均秩；Spearman 为秩的 Pearson。没有按文章 n 加权，媒体输入的配对保持同一 outletRows 顺序。
- 论文最小修改：表注写“Each qualifying outlet contributes one equally weighted pair; article counts affect the precision of its mean, but are not correlation weights.” 若历史算法确实加权，必须提供该历史脚本和实际权重，当前实现不能支持该说法。
- 实现修复建议：完整精度均值用于计算，最终显示时才舍入；保留用于计算的完整精度媒体表。不得静默替换既有报告结果。

### C03 verification score 是模型直接输出的 scalar，不是程序确定的字段比例

- `server/src/llm/critic.ts:6–12,65–71`：提示词要求模型输出“fraction of fields”及字段名数组，但没有定义固定字段全集、计数单位、空字段、不适用、重叠及去重规则。
- `server/src/llm/critic.ts:18–35`：`Number(a.verification_score ?? a.score ?? 0)`；非有限数置 0，再夹到 [0,1]；`verified_fields` / `unsupported_fields` 仅转字符串数组，未与 scalar 交叉校验，也不去重或规范字段名。因此没有可从数组唯一恢复的程序分子、分母。
- `server/src/llm/critic.ts:47–55`：Mock Critic 固定 score=0.75、四个 verified_fields、零个 unsupported_fields，这本身也不满足四除以四=0.75。mock 不是实测支持比例。
- `server/src/analyze.ts:157–167`：所有 done analysis（包括 mock Analyst）均送当前 provider 的 Critic；失败只记录日志，不添加 score、不标失败原因、不清除可能已有的 verification。Critic 不会在真实模型调用失败后自动改用 mock。Analyst fallback 为 mock 不等于 Critic provider 为 mock。
- `server/src/eval/eval.ts:217–226`：归档中任何非 null `verification_score` 都进入均值，无分析存在性、真实来源、有限数、范围或嵌套 score 一致性检查。计算的是逐记录 scalar 算术平均，不是所有字段合并比例。
- 论文最小修改：使用“mean model-assigned article-grounding score”及实际纳入条件；删除将其直接换算成“roughly half of claims”的断言，除非给出明确字段计数规则及验证证据。该指标不能表述为新闻事实准确率或独立人工事实核查。
- 实现修复建议：若研究要测确定性字段比例，先预定义可适用字段和计数规则，记录每字段判定，再计算分子/分母并明确逐分析平均或合并比例；这属于新指标，不能追溯覆盖历史 scalar。

### C04 Reporter 接收数据时没有 Critic 通过过滤

- `server/src/pipeline.ts:19–21`：先 Analyst 和 cluster summary，再 Critic。Critic 后没有重做 cluster consensus/divergence。
- `server/src/index.ts:125–145`：`generateBriefing()` 只要求簇中至少两篇 `analysis`，直接发送所有分析的 sentiment/bias 和簇 consensus/divergence。没有 score 阈值、verification 必须存在、verified_fields 白名单、unsupported_fields 去除或 corrections 应用。
- `server/src/llm/prompts.ts:43–55`：clusterPrompt 也仅按 analysis 存在性取摘要。
- `server/src/llm/reporter.ts:18,57`：提示词把输入称为 verified summaries，不构成程序过滤。
- `client/src/pages/Newsroom.tsx:146,164`：UI 同样宣称 verified world briefing / verified coverage；`Newsroom.tsx:69` 的 “All claims grounded ✓” 是随机闲聊固定字符串，与 Critic 实际结果无绑定。
- 论文最小修改：表述为“Reporter summarizes analyzed story digests after a best-effort Critic pass; Critic results are recorded separately and do not gate input.” 若要保留仅通过验证材料的说法，需要另行实现可定义的过滤及重新评估。

### C05 当前代码意图按首次 URL 归档，但实际文件有重复，且不等于分析调用日志

- `server/src/ingest.ts:129–148,151–164,191–197`：outlet 标识直接来自 `FEEDS`，没有从自由名称自动推断归一；当前 crawl 按 `outlet|url` 精确字符串去重。URL 仅 firstString trim，没有 canonical URL、查询参数或 fragment 规范化。
- `server/src/archive.ts:41–49,61–85`：当前代码意图按 URL 精确字符串跨 crawl 去重；已有 URL 不更新。这是当前实现意图，不能代替对现存文件的实际去重检查。未记录独立 analysis ID、尝试时间、retry、body hash、cluster membership、prompt 指纹、schema 版本。
- 实际文件检查：`raw_overview.json` 和 `duplicate_url_records.csv` 共同确认 3,633 条有效归档记录只有 2,859 个精确 URL，存在 772 个重复 URL 组、774 条 excess；重复明细有 1,546 条记录（770 组各两条、2 组各三条）。没有完整相同记录的重复。重复的实际产生过程不能仅由当前 append 逻辑反推；逐行统计及首次/末次 URL 策略必须分别报告，不能将这 3,633 条统称唯一文章。
- `server/src/cluster.ts:141–146,181–189`：单源同组只保留最新代表，最多 40 条；多源最多 36 簇。
- `server/src/pipeline.ts:14–35`：上述截断发生在分析和归档之前，归档并不包含所有成功 ingest 的文章。首次未分析/mock/无 Critic 的记录以后即使 live store 升级，也不会回写。
- `server/src/analyze.ts:11–22,43–46,111–114`：缓存是 URL→Analysis；仅从旧 clusters 构造，不从旧 singles 构造；不缓存 provider/model/prompt/body 指纹，缓存命中不恢复这些元数据。
- `server/src/cluster.ts:223–244`：history merge 优先保留历史同 URL 对象，仅可刷新图片，每簇最多 60 篇。
- 论文最小修改：分别报告“archived records”与经指定去重策略得到的“unique exact URLs”，说明归档对象来自选中故事和单源代表，另列可验证的真实模型分析记录数。没有调用日志，归档行数、有 analysis 的行数乃至不同分析内容数都不能当作实际独立模型调用/分析尝试次数。

## 页面与导出之间的口径差异

| 输出 | 实际数据 / 进入条件 | 关键证据 | 对论文 / 截图的影响 |
|---|---|---|---|
| Evaluation 倾向 | 全 archive，所有有 analysis 记录，参考文件中 n>0 的媒体 | `server/src/eval/eval.ts:134–160` | 混入 mock 和未知来源；不是声称的真实模型子集 |
| Evaluation verification | 全 archive，任何非 null scalar | `server/src/eval/eval.ts:217–226` | 不要求真实 Analyst / Critic |
| Newsroom verification | 当前 live store clusters + singles，非 null scalar | `server/src/index.ts:112–122,403–409` | 与 Evaluation 的历史归档均值、n 不同，不能互换 |
| Dashboard | 全 archive，总数是记录数；有 analysis 就算 analyzed | `server/src/dashboard.ts:46–99,113–126` | `client/src/pages/Dashboard.tsx:173` 将 mock 同样称“with LLM analysis”；177 行“Unique articles”与实际归档的重复 URL 不符，当前 append 的去重意图不能证明历史文件唯一 |
| Insights real/mock | provider 非空且不是 mock 计 real；provider 缺失且有 analysis 强认 mock | `server/src/insights.ts:420–452` | 缺失来源应判未知；real 判断也未要求 analysis 存在；pct_real 分母为全部归档 |
| Insights sentiment / drift | 所有有 analysis 的 archive 记录 | `server/src/insights.ts:216–235,493–522` | 包括 mock；所谓“3-day rolling”是前后各一个有数据日期，不保证连续三日 |
| reliability | 有 analysis 视作 independently corroborated；按发布时间 7 天半衰期加权 | `server/src/dashboard.ts:152–184` | 单源已分析也被计 corroborated |
| authenticity | 归档优先以 source_count≥2 判 corroborated，旧数据 fallback 到有 analysis；结合当前簇 sentiment deviation | `server/src/insights.ts:317–378` | 与 reliability 口径不同；当前簇与全部归档混用；未知 deviation 默认 consistency=.5 |
| corroboration tiers | today 按 live story 数；all-time 按 archive article 记录数 | `server/src/insights.ts:455–469` | 同一图表两个部分统计单位不同 |
| CSV export | 全 archive，每记录一行，仅导出部分 analysis 字段及 provider/model | `server/src/insights.ts:595–619`; 路由 `server/src/index.ts:366–371` | 缺 body_text、verification/score/fields、source_count、analysis_status、schema/prompt 指纹；无法单靠 CSV 复现核心 verification 或字段证据 |
| annotations sample | 所有有 analysis 的 archive 记录，按媒体轮询取样 | `server/src/eval/eval.ts:254–285` | 未排 mock、未按文中真实模型子集抽样 |

`client/src/pages/Evaluation.tsx:57–59,80,86,94,103` 使用 independent ground truth / external standard / enough analyzed articles，但现有参考只是人工近似值、门槛仅一篇。`client/src/outlets.ts:10–12` 明确称 editorially assigned reference；其中 Indian Express 显示 Center（17 行），`data/groundtruth.json:9` 却是 lean-left（−0.5），是可确定的界面—评分文件不一致。其他 State(pro-gov) 文字也不是数字左右量尺的逐值同义词，必须说明人工映射而非自动等同。

## 实现参数和测量边界

- `server/src/config.ts:13–33`：19 条 feed 定义、17 个 outlet，当前所有 feed.kind 都是 rss；guardian API 路径存在但未配置。配置数不能等同每次成功抓取来源数。
- `server/src/config.ts:35–65`：默认刷新 60 min、最小 15 min、health 30 min、briefing 5 h；topN=36、singles=40；不同媒体 cosine≥0.25 **或** headline Jaccard≥0.55；同媒体 cosine≥0.45 **或** Jaccard≥0.7；pair maxDaySpan=4。
- `server/src/cluster.ts:105–121`：四天是建图边的文章对约束，union-find 的整个簇可经链式连接跨度超过四天；`cluster.ts:194–245` 的历史合并没有日期约束。论文若把四天说成最终簇绝对跨度，应改为 pairwise candidate window 并说明历史合并。
- `client/src/pages/Home.tsx:23,44`：首页默认显示 12 个故事，逐步扩展；36 是服务保留与返回上限，不是首次渲染数。
- `server/src/index.ts:475–493`：实际 refresh 是 max(15, 配置 refresh)，briefing 单独每配置小时定时；`autoSync=false` 只阻止 refresh 定时回调，没有阻止 briefing timer。环境值可能覆写默认；本轮没有把当前默认值当成历史实验实值。
- `server/src/llm/providers.ts:28–35,87–91`：兼容 OpenAI 路径 temperature=0；Anthropic 路径没有显式 temperature。没有每条归档 temperature 记录。
- `server/src/llm/prompts.ts:19–39`：Analyst 只收该篇 outlet/headline/summary/body，正文最多 30,000 字符；没收到其他媒体原文，尽管系统提示称“relative to other outlets”，omissions 又要求别家报道有而本篇缺的事实。Single source 也用同一接口。不能把这一调用称为读取同故事全部报道后计算的相对偏向。
- `server/src/llm/prompts.ts:160–191`：sanitization 不保存原始模型响应；缺/异常 bias 标签变 not-determinable，缺/异常 sentiment label 变 neutral，数值默认值与模型原始有效值不能再区分。`factual/opinion` 独立夹值且 0 因 `||50` 变 50，未强制和=100；这影响该字段的测量解释，应单列实现修复，不能静默改历史记录。

## 证据不足与可选改进

1. `docs/superpowers/specs/2026-10-11-reproducibility-and-evaluation-design.md:4` 明示 Draft，22–24 行称参考值来自 best-effort MBFC/AllSides knowledge。其 prompt artifact/schema 设计（40–92 行）不是已实施证据。`archive.ts`、`types.ts`、CSV 和源码搜索未发现相应落地字段；不能用当前 prompt 的哈希替代历史每次调用的 prompt fingerprint。
2. 现有 `data/groundtruth.json:2–3` 给近似说明与更新日期，未给逐媒体 URL、原始评分摘录、人工映射责任者/规则或版本引用。可以验证本文件计算的一致性，不能验证其客观正确性。不要为匹配论文更换参考值。
3. 可选人工评估分支存在独立 bug：`eval.ts:173–178` 分别过滤两标注者非空值后再配对，缺失发生在不同记录时可能错配；186–194 行把 bias 的配对嵌套在 sentiment_1 非空条件中；topic 比较使用当前 clusters（199–209），不是历史归档 cluster membership。若论文没有报告这些指标，不应把它们当作已有实验结果。
4. 完整复现需要固定输入文件 hash、代码 commit、精确纳入 ID 列表和未舍入媒体均值，另保存每个异常/排除原因。统计正确性只能验证数据到数字的运算；参考评分有效性和 Critic 判定质量仍需独立测量证据。
