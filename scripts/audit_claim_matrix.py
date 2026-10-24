#!/usr/bin/env python3
"""Join manually inspected paper claims to independently generated raw audit outputs."""
import csv
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/paper-audit'
load=lambda n:json.loads((OUT/n).read_text())
paper=load('paper-claims.json')
overview=load('raw_overview.json')
results=load('correlations_and_subsets.json')
actual=load('project_comparison.json')
ver=load('verification_summary.json')
R='已由原始数据复现'
T='仅通过论文表格内部复算'
X='与论文不一致'
U='缺少材料，无法验证'
archive='data/archive.jsonl；raw_record_inventory.csv（原始行号）'
base='analysis存在且provider=deepseek、model=deepseek-chat；保留记录版本；ND映射0；随后每媒体n≥2'
hist='历史快照未定位；当前数据仅作明确标注的对照，不能替代论文快照'
# Each tuple: observed result, status, source, filtering, exact code location, minimum paper edit.
e={
'P01':('配置17媒体；当前归档也观测17个ID',R,'server/src/config.ts；原始归档','配置去重outlet计数；不等于每次抓取成功','server/src/config.ts:13–33','保留17，注明配置范围与实际有效分析仅15家。'),
'P02':('配置19条，全部kind=rss；API处理分支未配置',R,'server/src/config.ts','直接计FEEDS条目','server/src/config.ts:13–33','写明此配置为19个RSS feeds；勿等同成功feed数。'),
'P03':('Sky/NPR各2，其他各1，与配置吻合',R,'server/src/config.ts','按outlet和section分组','server/src/config.ts:14–32','保留为配置声明。'),
'P04':('当前3633行、2859唯一URL；未找到3174历史快照',U,archive+'；snapshot_forensics.json',hist,'server/src/archive.ts:41–49,61–85','补历史文件hash/截止点；分别报告记录数与唯一URL。'),
'P05':('当前1440个DeepSeek分析对象、1099 URL、1386不同URL+分析内容签名；历史1330未定位',U,archive,base,'server/src/eval/eval.ts:140–148','明确统计单位、版本和筛选；不把记录数直接称独立文章/调用次数。'),
'P06':('1844仅为3174−1330推导；当前mock555、来源空/缺1638，其中41有分析',U,archive,'精确provider原值计数，未知不改成mock','server/src/insights.ts:434–436','删除“余者均mock”，除非提供逐记录出处对账。'),
'P07':('当前真实记录与表2媒体ID同为15家，但当前实现门槛n>0，无real筛选',X,archive+'；source eval','区分论文声称的筛选与现有项目实际筛选','server/src/eval/eval.ts:140–148','说明真实实施的资格步骤；另列历史每家纳入ID。'),
'P08':('表2合计697，差633；232个自然边界×8预定分支无完整计数向量匹配',T,'PDF p11；snapshot_boundary_checks.csv','只作显示表加总和现有前缀可证伪检查，不反向选规则','scripts/audit_snapshot_forensics.py:22–104','提供633条逐项排除清单；当前原因必须标无法验证。'),
'P09':('当前真实r=0.696755496555；现代码输出0.57；表内0.760433648534',U,archive+'；paper_table_internal_check.json',base+'；表内复算分开','server/src/eval/eval.ts:149–160,231–235；server/src/eval/metrics.ts:8–23','补同快照完整精度输入；不能把表内0.76当作原始数据复现。'),
'P10':('当前真实rho=0.566130371136；现代码0.56；表内0.663106192277；历史0.65来源未知',U,archive+'；paper_table_internal_check.json',base+'；平均并列秩；完整精度与先舍入分别报告','server/src/eval/metrics.ts:26–41；server/src/eval/eval.ts:154–160','公布未舍入均值及代码版本；勿认定0.65只由舍入造成。'),
'P11':('当前946真实评分记录、813 URL、942种URL+verification签名；历史856未定位',U,archive,'Analyst与Critic均deepseek-chat；score数值有限','server/src/analyze.ts:157–167；server/src/eval/eval.ts:217–226','提供实际856纳入行号及未评分原因，不能凭缺score推断调用失败。'),
'P12':('当前真实946条均值0.516969556025，四舍五入0.52；全部956条均值0.513261715481；历史均值未定位',U,archive,'逐评分记录算术平均；不以字段列表比例替代','server/src/eval/eval.ts:217–226','0.52数值舍入吻合不证明856条历史样本复现；注明单位和分母。'),
'P13':('模型直接给scalar；956条中839条不等于verified条目/(verified+unsupported条目)',X,archive+'；verification_records.csv','条目比例仅作诊断，未替换原score','server/src/llm/critic.ts:18–35,65–74','改称mean model-assigned grounding score，删除“恰有约一半主张获支持”的量化解释。'),
'P14':('跨媒体cosine≥0.25 OR Jaccard≥0.55',R,'source config/cluster','参数核验，非聚类质量验证','server/src/config.ts:58–64；server/src/cluster.ts:115–121','exceeds改reaches or exceeds；参数值保留。'),
'P15':('同媒体cosine≥0.45 OR Jaccard≥0.70',R,'source config/cluster','参数核验','server/src/config.ts:62–64；server/src/cluster.ts:119–121','保留，注明≥。'),
'P16':('文章对≤4天与方法原文相符；传递簇/历史合并无整体上限',R,'source cluster','候选边时间窗口，不能解释成最终簇最大跨度','server/src/cluster.ts:105–121,194–245','保留文章对窗口，补充传递闭包和历史链接无整体日期上限。'),
'P17':('新簇至少2媒体；单源另列',R,'source cluster','unique outlet count','server/src/cluster.ts:136–146','保留，不能由此推导缺失来源不引入偏差。'),
'P18':('服务上限36，首页先12；排序媒体数→新近→篇数',R,'source config/cluster/client','分析与archive前已限额','server/src/config.ts:45–46；server/src/cluster.ts:168–189；client/src/pages/Home.tsx:23,44','写明top36是留存上限，首页初显12；归档不是全部抓取文章。'),
'P19':('默认5小时，与图5一致；历史实际env未知',R,'source config/index','核验默认值，非证明历史每5h实际成功运行','server/src/config.ts:39；server/src/index.ts:487–493','保留default/configurable，并提供实验实际配置。'),
'P20':('引言数小时与§5约两周冲突；当前crawl跨度9天20小时47分',X,archive+'；PDF p2/p10','crawl时间而非publication日期；当前非历史认定','server/src/archive.ts:67；snapshot_forensics.json','用已定位快照真实起止时间替换两处时长。'),
'P21':('同P20；当前归档时间不能证明论文约两周',U,archive,hist,'server/src/archive.ts:67','补历史快照起止UTC/时区，勿从文章发布日期轴推断抓取时长。'),
'P22':('3633条prompt_hash/temperature均缺失；源码无fingerprint/snapshot实现',X,archive+'；source archive/providers','按原始字段检查，不为旧数据生成替代指纹','server/src/archive.ts:5–23,66–84；server/src/llm/providers.ts:28–35,87–91','把未实现机制改为计划或提供实际历史实现及产物。'),
'P23':('3633条schema_version均缺失，无声明的读取fallback/changelog机制',X,archive+'；source archive','缺字段不自动视为已实施v1.0.0策略','server/src/archive.ts:5–23,66–84','删除“schema-versioned archive”已落地断言或补可验证实现。'),
'P24':('未找到所称完整codebook；存在Draft设计',X,'docs/superpowers/specs/2026-10-11-reproducibility-and-evaluation-design.md','设计不是实现证据','docs/superpowers/specs/2026-10-11-reproducibility-and-evaluation-design.md:149–164','区分已公开字段说明和计划codebook。'),
'P25':('harness源码已存在并实际执行；自动指标可算，人工指标无数据',R,'actual source execution；project_comparison.json','原始归档；topic输入[]避免伪造历史簇','server/src/eval/eval.ts:134–245','说明已实现与尚未验证的分支，修正其筛选口径。'),
'P26':('与§4和现有harness矛盾',X,'PDF p13；source eval','不把已有实现写成未来首次实现','server/src/eval/eval.ts:134–245','改为未来增加人工验证、快照管理等确实未完成工作。'),
'P27':('Reporter不看verification；cluster summary生成在Critic之前',X,'source pipeline/index/reporter','无score阈值、字段白名单、corrections应用','server/src/pipeline.ts:19–21；server/src/index.ts:125–145；server/src/llm/reporter.ts:18,57','改为best-effort Critic diagnostic后合成未过滤digest，或另行实现gate并重测。'),
'P28':('17项参考值与Table1一致；文件日期2026-10-12；无逐项原始出处/映射证据',U,'data/groundtruth.json；design Draft','保留原参考值，不自行替换','data/groundtruth.json:2–23；server/src/eval/groundtruth.ts:19–27','统一称approximate hand-assigned reference；删独立认证ground truth暗示。'),
'P29':('Pearson/Spearman每媒体等权，文章数不作相关权重；n<2当前未排除',X,'source metrics/eval','15家媒体各1对输入，非1330个点','server/src/eval/metrics.ts:8–41；server/src/eval/eval.ts:148–160','表注改为每合格媒体等权，n影响均值不确定性，不是相关权重。'),
'P30':('Global Times100归档行但0分析；不在15家子集',X,archive,'精确outlet=globaltimes，检查analysis/provider','server/src/eval/eval.ts:140–148','删此实验强一致案例，或提供该真实历史子集原始分析。'),
'P31':('当前bias unsupported554>verified352；loaded verified789、omissions740、tone718；历史字段统计缺失',X,archive+'；verification_field_counts_deepseek_rows.csv','946真实scored，数组索引折为父字段；可两侧同时出现','server/src/llm/critic.ts:30–31','删除未证实概括，报告对应856快照逐字段分母与计数。'),
'P32':('946条实测Analyst/Critic均标deepseek-chat；它不构成独立事实真值',R,archive,'元数据一致性，可验证模型标识而非真实世界事实','server/src/llm/critic.ts:38–74','保留限制，并让摘要/结果解释与之相符。'),
'P33':('当前annotations.csv缺失；kappa/ARI/FM没有原始人工标签可复算',U,'data/annotations.csv（缺失）','不伪造gold或topic','server/src/eval/eval.ts:96–111,172–215','保持pending，勿把函数存在等同人工验证已完成。'),
'P34':('8字段、最多5条loaded/tone及数值范围吻合；附带发现fact/opinion非强制和100且0变50',R,'source prompts','schema和sanitization核验；非原始响应校验','server/src/llm/prompts.ts:28–39,160–191','保留已实施上限，分开描述非程序保证的百分比分解。'),
'P35':('URL-only缓存只读旧clusters；元数据不完整恢复；fallback mock有标记',X,'source analyze','不含body/model/prompt版本键；不覆盖旧singles','server/src/analyze.ts:11–22,43–46,75–86,111–114','准确说明缓存范围和mock标记，删“内容未变才复用”的保证。'),
'P36':('summary回退有实现；feed失败仍可save空结果并stale=false；无robots判定',X,'source ingest/pipeline','不将未强制保证推断为发生实际违规','server/src/ingest.ts:259–291；server/src/pipeline.ts:12–43','保留已实施回退；弱化旧数据保留与访问合规绝对保证。'),
'P37':('URL/content匹配存在；无时间门槛，固定顺序不保证最中立',X,'source cluster','共同URL或文本Jaccard匹配，最多60篇','server/src/cluster.ts:150–153,194–245','称固定偏好标题与启发式tracking，勿保证无framing或稳定正确ID。'),
'P38':('1–4仅prompt要求；sanitize不强制数目，mock可0',X,'source reporter','读取真实代码，未调用模型','server/src/llm/reporter.ts:25–37,45–52,60–68','改成prompt requests 1–4，非验证过的硬schema上限。'),
'P39':('图7截图0.60/0.53；正文0.76/0.65；其历史输入未找到',X,'PDF p10 rendered image；paper-claims.json','只转录可见13行，未补截图缺失2行','server/src/eval/eval.ts:140–160,231–245','标注illustrative不同快照并注明口径/日期，或换成同实验结果图。'),
'P40':('图5为0.46/110；newsroom看当前store，eval看archive，单位不同',X,'PDF p8 rendered image；source index','live store均值不等于archive实验均值','server/src/index.ts:112–122,403–409','图注注明live-store scope和截图时间，勿当作856条结果。'),
'P41':('图9为3174/17/16/1577/50%；1577包含有analysis的mock等，非1330真实分析',X,'PDF p12 rendered image；source dashboard','dashboard counts analysis presence, not real-model-only','server/src/dashboard.ts:46–126；client/src/pages/Dashboard.tsx:173–177','分别标all analyzed/real-model analyzed、records/unique URLs、当前簇。'),
'P42':('图8实际volume/trending，缺图注所称lean-reference及字段verification图',X,'PDF p12 rendered image','完整图像视觉核对','client/src/pages/Insights.tsx','重写图注或使用确实含所述内容的图。'),
'P43':('Indian Express UI Center，评分文件/表为lean-left −0.5',X,'PDF p5；data/groundtruth.json；source outlet metadata','不自行更改参考评分来匹配','client/src/outlets.ts:17；data/groundtruth.json:9','统一显示来源或明确两套标签的不同含义。'),
'P44':('repo链接仍为<owner>占位；没有可定位发布tag/快照',U,'PDF p13 Availability','不猜测作者仓库地址','PDF p13 Availability','填入真实仓库/tag、数据doi或hash及复现命令。'),
'P45':('图9截图未见图注所称verification scores，仅counts、volume、sentiment',X,'PDF p12 Figure9 rendered image','图像核验，不从正文补画面缺失数据','client/src/pages/Dashboard.tsx；server/src/dashboard.ts:113–133','删除图注verification scores或补同快照对应图。'),
}
rows=[]
for c in paper['claims']:
    v,status,source,rule,code,edit=e[c['id']]
    rows.append({'编号':c['id'],'论文位置':c['locations'],'声明':c['claim'],'类型':c['kind'],
        '报告值':json.dumps(c['reported'],ensure_ascii=False),'复算值或核验结果':v,
        '数据来源':source,'筛选规则':rule,'代码路径及行号':code,'状态':status,'最小论文修改建议':edit})
current={r['outlet']:r for r in results['deepseek_rows']['outlets']}
for p in paper['table2']:
    r=current[p['source_id']]
    rows.append({'编号':'T2-'+p['source_id'],'论文位置':'p11 Table2 '+p['outlet'],'声明':'媒体资格、n、参考值及均值',
       '类型':'原始数据逐行复算','报告值':f"n={p['n']}; ref={p['reference']}; mean={p['model_display']}",
       '复算值或核验结果':f"当前n={r['n_records']}; URL={r['n_unique_urls']}; ref={r['reference_lean']}; mean={r['model_mean_full_precision']:.17g}; ND={r['n_not_determinable']}",
       '数据来源':archive,'筛选规则':base,'代码路径及行号':'server/src/eval/eval.ts:140–160；scripts/audit_paper_results.py',
       '状态':X if p['source_id']=='irna' else U,
       '最小论文修改建议':'IRNA现存所有真实标签均ND，不可能生成+.25；需历史原始证据。' if p['source_id']=='irna' else '补论文历史快照及纳入行号；当前值不可直接覆盖历史结果。'})
fields=list(rows[0])
with (OUT/'verification-matrix.csv').open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(rows)
lines=['# 逐项核验表','',
 '状态严格区分原始数据复算、仅表内核算、明确不一致、缺少历史材料。配置参数以现有配置源码及执行输出核验，不代表历史实际运行值。',
 '当前数据的数值与历史论文不同，单独不足以否定历史结果；下面“当前”值始终保留此边界。','',
 '|'+ '|'.join(fields)+'|','|'+'|'.join('---' for _ in fields)+'|']
for r in rows:
    lines.append('|'+ '|'.join(str(r[f]).replace('|','/').replace('\n','<br>') for f in fields)+'|')
(OUT/'verification-matrix.md').write_text('\n'.join(lines)+'\n')
print(f'Wrote {len(rows)} verification rows ({len(paper["claims"])} claims + {len(paper["table2"])} outlet rows).')
