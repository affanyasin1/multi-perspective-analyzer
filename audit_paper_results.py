#!/usr/bin/env python3
"""Read-only raw-data audit. No scraping/model requests, no business-data mutation.

Run from repo root: python3 scripts/audit_paper_results.py
All sensitivity branches are predefined here, never chosen by closeness to paper values.
The paper table is checked separately and is never substituted for raw observations.
"""
from __future__ import annotations

import argparse
import collections
import csv
import datetime as dt
import hashlib
import json
import math
import platform
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
import scipy
from scipy import stats

ROOT = Path(__file__).resolve().parents[1]
SCALE = {'left': -1.0, 'lean-left': -0.5, 'center': 0.0, 'lean-right': 0.5, 'right': 1.0}
VALID = set(SCALE) | {'not-determinable'}
# Transcribed from PDF p.11, Table 2. Used ONLY for internal table checking/deltas.
PAPER = [
    ('almonitor', 123, -.50, -.03), ('anadolu', 34, .50, .00),
    ('dailynewsegypt', 18, .00, .03), ('ecns', 10, .50, .10),
    ('france24', 81, .00, -.07), ('indianexpress', 34, -.50, .03),
    ('irna', 2, 1.00, .25), ('mehrnews', 29, 1.00, .29),
    ('npr', 23, -.50, -.28), ('skynews', 3, .00, -.33),
    ('tass', 98, 1.00, .50), ('thenational', 172, .00, .06),
    ('yonhap', 55, .00, .00), ('allafrica', 11, .00, -.09),
    ('dohanews', 4, .00, -.13),
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def signature(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                     separators=(',', ':')).encode()).hexdigest()


def dump(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False, allow_nan=False) + '\n')


def write_csv(path, rows, fields=None):
    rows = list(rows)
    fields = fields or (list(rows[0]) if rows else ['empty'])
    with path.open('w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for row in rows:
            w.writerow({k: json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v
                        for k, v in row.items()})


def label(r):
    return ((r.get('analysis') or {}).get('bias_rating') or {}).get('rating')


def has_analysis(r):
    return isinstance(r.get('analysis'), dict) and bool(r['analysis'])


def is_deepseek(r):
    return has_analysis(r) and r.get('analysis_provider') == 'deepseek' and r.get('analysis_model') == 'deepseek-chat'


def score(r):
    v = r.get('verification_score')
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) else None


def js_round2(v):
    return math.floor(v * 100 + .5) / 100  # JS Math.round, including negative halfway cases.


def correlations(xs, ys):
    if len(xs) < 2 or len(set(xs)) < 2 or len(set(ys)) < 2:
        return {'n_outlets': len(xs), 'pearson_r': None, 'spearman_rho': None}
    return {'n_outlets': len(xs), 'pearson_r': float(stats.pearsonr(xs, ys).statistic),
            'spearman_rho': float(stats.spearmanr(xs, ys).statistic),
            'x_average_tie_ranks': stats.rankdata(xs, method='average').tolist(),
            'y_average_tie_ranks': stats.rankdata(ys, method='average').tolist()}


def pick_urls(rows, latest=False):
    # Preserve archive line order. "Latest" means last line, not inferred call time.
    out = {}
    for r in rows:
        if latest or r['url'] not in out:
            out[r['url']] = r
    return list(out.values())


def table(rows, gt, minimum=2, zero_undetermined=True, round_before=False):
    groups = collections.defaultdict(list)
    for r in rows:
        if has_analysis(r):
            if not zero_undetermined and label(r) not in SCALE:
                continue
            groups[r.get('outlet')].append(r)
    out = []
    for outlet, ref in gt['outlets'].items():
        group = groups.get(outlet, [])
        if len(group) < minimum:
            continue
        values = [SCALE.get(label(r), 0.0) for r in group]
        mean = math.fsum(values) / len(values)
        out.append({'outlet': outlet, 'reference_rating': ref['rating'],
                    'reference_lean': gt['scale'][ref['rating']], 'n_records': len(group),
                    'n_unique_urls': len({r['url'] for r in group}),
                    'n_directional_labels': sum(label(r) in SCALE for r in group),
                    'n_not_determinable': sum(label(r) == 'not-determinable' for r in group),
                    'model_mean_full_precision': mean,
                    'model_mean_js_rounded_2dp': js_round2(mean),
                    'correlation_input_mean': js_round2(mean) if round_before else mean})
    return out


def describe(rows):
    scored = [r for r in rows if score(r) is not None]
    scores = [score(r) for r in scored]
    return {'n_selected_records': len(rows), 'n_analysis_records': sum(has_analysis(r) for r in rows),
            'n_unique_analysis_urls': len({r['url'] for r in rows if has_analysis(r)}),
            'n_scored_records': len(scored), 'n_unique_scored_urls': len({r['url'] for r in scored}),
            'coverage': len(scored) / len(rows) if rows else None,
            'coverage_denominator': 'all selected records (analysis-only for analysis branches)',
            'missing_score': len(rows) - len(scored), 'mean_per_record_score': math.fsum(scores) / len(scores) if scores else None,
            'min_score': min(scores) if scores else None, 'max_score': max(scores) if scores else None,
            'outside_0_1': sum(not 0 <= s <= 1 for s in scores),
            'analyst_providers': dict(collections.Counter(str(r.get('analysis_provider')) for r in rows)),
            'critic_providers': dict(collections.Counter(str((r.get('verification') or {}).get('provider')) for r in scored))}


def field_stats(rows):
    counts = collections.defaultdict(collections.Counter)
    for r in rows:
        ver = r.get('verification') or {}
        by_side = {}
        for side in ('verified_fields', 'unsupported_fields'):
            names = [str(x) for x in ver.get(side, [])]
            by_side[side] = set(re.sub(r'\[\d+\]', '', x).split('.')[0] for x in names)
            for name in by_side[side]:
                counts[name][side + '_records'] += 1
        for name in by_side['verified_fields'] & by_side['unsupported_fields']:
            counts[name]['both_sides_records'] += 1
    return [dict(field=k, **{f: v.get(f, 0) for f in ('verified_fields_records', 'unsupported_fields_records', 'both_sides_records')},
                 scored_record_denominator=len(rows)) for k, v in sorted(counts.items())]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--archive', type=Path, default=ROOT/'data/archive.jsonl')
    ap.add_argument('--out', type=Path, default=ROOT/'output/paper-audit')
    args = ap.parse_args()
    archive, out = args.archive.resolve(), args.out.resolve()
    if archive == out or out == archive.parent:
        raise ValueError('Output must not be the archive or its directory')
    out.mkdir(parents=True, exist_ok=True)
    protected = [archive, ROOT/'data/groundtruth.json', ROOT/'data/store.json', ROOT/'News_Agreegator_6___Shared-4.pdf']
    before = {str(p.relative_to(ROOT)) if p.is_relative_to(ROOT) else str(p): digest(p) for p in protected if p.exists()}
    gt = json.loads((ROOT/'data/groundtruth.json').read_text())
    rows, malformed, blank = [], [], 0
    for line_number, line in enumerate(archive.read_text().splitlines(), 1):
        if not line.strip():
            blank += 1
            continue
        try:
            r = json.loads(line)
            if not isinstance(r, dict):
                raise ValueError('not an object')
            r['_line'] = line_number
            rows.append(r)
        except (ValueError, TypeError) as exc:
            malformed.append({'line': line_number, 'error': str(exc)})
    groups = collections.defaultdict(list)
    for r in rows:
        groups[r.get('url')].append(r)
    dup = {u: g for u, g in groups.items() if len(g) > 1}
    analyzed = [r for r in rows if has_analysis(r)]
    deep = [r for r in rows if is_deepseek(r)]
    done = [r for r in deep if r.get('analysis_status') == 'done']
    def keys_count(key):
        return dict(collections.Counter('<missing>' if key not in r else str(r[key]) for r in rows))
    overview = {
        'valid_object_rows': len(rows), 'blank_lines': blank, 'malformed_lines': malformed,
        'unique_exact_urls': len(groups), 'duplicate_url_groups': len(dup),
        'excess_url_records': len(rows)-len(groups),
        'url_multiplicities': dict(collections.Counter(len(g) for g in groups.values())),
        'identical_full_records_excess': len(rows)-len({signature({k:v for k,v in r.items() if k != '_line'}) for r in rows}),
        'analysis_present': len(analyzed), 'analysis_absent': len(rows)-len(analyzed),
        'analysis_provider': keys_count('analysis_provider'), 'analysis_status': keys_count('analysis_status'),
        'analysis_model': keys_count('analysis_model'), 'outlet_rows': keys_count('outlet'),
        'unknown_outlets': sorted({r.get('outlet') for r in rows if r.get('outlet') not in gt['outlets']}),
        'bias_labels_in_analyses': dict(collections.Counter(str(label(r)) for r in analyzed)),
        'missing_or_invalid_bias_labels': sum(label(r) not in VALID for r in analyzed),
        'schema_version_present': sum('schema_version' in r for r in rows),
        'prompt_hash_present': sum(bool(r.get('prompt_hash')) for r in rows),
        'temperature_present': sum('temperature' in r for r in rows),
        'crawl_min': min(r['crawled_at'] for r in rows), 'crawl_max': max(r['crawled_at'] for r in rows),
        'archive_order_time_reversals': sum(rows[i]['crawled_at']<rows[i-1]['crawled_at'] for i in range(1,len(rows))),
        'unique_url_analysis_signatures': len({(r['url'], signature(r['analysis'])) for r in analyzed}),
        'deepseek_unique_url_analysis_signatures': len({(r['url'], signature(r['analysis'])) for r in deep}),
        'unique_url_body_signatures': len({(r['url'], signature(r.get('body_text'))) for r in rows}),
        'real_deepseek_analyses': describe(deep),
        'note': 'Rows and stored analysis objects are observable; actual model-call counts are not reconstructible from URL deduped output records.',
    }
    # All branches predeclared by unit/filter semantics; none selected using reported targets.
    branches = [
        ('project_current_rows', analyzed, 1, True, True,
         'all analysis-present rows; raw outlet; any provider/status; unknown/ND=>0; n>=1; round outlet means BEFORE correlations'),
        ('deepseek_rows', deep, 2, True, False,
         'provider=deepseek AND model=deepseek-chat AND analysis present; retain archive versions; ND=>0; per-outlet n>=2 after filters'),
        ('deepseek_done_rows', done, 2, True, False,
         'deepseek_rows plus explicit analysis_status=done; missing legacy status excluded'),
        ('deepseek_first_eligible_url', pick_urls(deep), 2, True, False,
         'filter DeepSeek first, retain first eligible archive line per exact URL; ND=>0; then outlet n>=2'),
        ('deepseek_last_eligible_url', pick_urls(deep, True), 2, True, False,
         'filter DeepSeek first, retain last eligible archive line per exact URL; no inferred analysis timestamp; ND=>0; then n>=2'),
        ('archive_first_url_then_deepseek', [r for r in pick_urls(rows) if is_deepseek(r)], 2, True, False,
         'retain first archive line per exact URL before filtering DeepSeek; ND=>0; then n>=2'),
        ('archive_last_url_then_deepseek', [r for r in pick_urls(rows,True) if is_deepseek(r)], 2, True, False,
         'retain last archive line per exact URL before filtering DeepSeek; ND=>0; then n>=2'),
        ('deepseek_ordinal_labels_only', [r for r in deep if label(r) in SCALE], 2, False, False,
         'sensitivity only: DeepSeek rows, exclude ND/missing/invalid labels before per-outlet n>=2; no deduplication'),
    ]
    branch_results, bridge_pairs, ledgers, tables, verification = {}, [], [], {}, {}
    for name, selection, minimum, zero, rounding, rule in branches:
        t = table(selection, gt, minimum, zero, rounding)
        tables[name] = t
        xs=[r['reference_lean'] for r in t]; ys=[r['correlation_input_mean'] for r in t]
        eligible = {r['outlet'] for r in t}
        used = [r for r in selection if r['outlet'] in eligible]
        d = {'rule': rule, 'archive_start': len(rows), 'selected_records_before_outlet_eligibility': len(selection),
             'excluded_before_outlet_eligibility': len(rows)-len(selection),
             'excluded_outlet_not_in_reference': sum(r['outlet'] not in gt['outlets'] for r in selection),
             'excluded_insufficient_outlet_records': sum(r['outlet'] in gt['outlets'] and r['outlet'] not in eligible for r in selection),
             'included_records_after_outlet_eligibility': len(used),
             'included_unique_urls_after_outlet_eligibility': len({r['url'] for r in used}),
             'statistics_unit': 'outlet mean; equal weight per eligible outlet; archive rows used within each mean',
             'correlations': correlations(xs,ys), 'verification': describe(selection), 'outlets': t}
        branch_results[name] = d
        bridge_pairs.append({'name': name, 'x':xs,'y':ys})
        write_csv(out/f'table2_{name}.csv', t)
        verification[name] = describe(selection)
        selected_ids = {r['_line'] for r in selection}
        used_ids = {r['_line'] for r in used}
        # One row per original record per branch: disjoint include/exclude accounting.
        for r in rows:
            reason = ('included' if r['_line'] in used_ids else
                      'excluded_by_provider_status_label_or_url_selection' if r['_line'] not in selected_ids else
                      'excluded_outlet_not_in_reference' if r['outlet'] not in gt['outlets'] else
                      'excluded_outlet_below_minimum')
            ledgers.append({'branch':name,'archive_line':r['_line'],'url':r.get('url'),'outlet':r.get('outlet'),'decision':reason})
        assert len(used)+d['excluded_before_outlet_eligibility']+d['excluded_outlet_not_in_reference']+d['excluded_insufficient_outlet_records']==len(rows)
    # Separate precise-versus-rounded experiments, with all other inputs held constant.
    for base in ('project_current_rows','deepseek_rows'):
        t=tables[base];x=[r['reference_lean'] for r in t]
        for suffix,key in [('full_precision','model_mean_full_precision'),('rounded_2dp','model_mean_js_rounded_2dp')]:
            name=f'{base}_{suffix}';y=[r[key] for r in t]
            branch_results[name]={'rule':'same membership as '+base,'correlations':correlations(x,y)}
            bridge_pairs.append({'name':name,'x':x,'y':y})
    table_check = correlations([r[2] for r in PAPER],[r[3] for r in PAPER])
    table_check.update({'source':'PDF p11 Table2 displayed values ONLY; not original-data reproduction',
                        'n_sum':sum(r[1] for r in PAPER),'reported_real_analyses_minus_table_n':1330-sum(r[1] for r in PAPER)})
    bridge_pairs.append({'name':'paper_display_values_only','x':[r[2] for r in PAPER],'y':[r[3] for r in PAPER]})
    comparison=[]
    current_by={r['outlet']:r for r in tables['deepseek_rows']}
    for o,n,g,m in PAPER:
        cur=current_by.get(o,{})
        comparison.append({'outlet':o,'paper_n':n,'paper_reference':g,'paper_displayed_mean':m,
                           'current_deepseek_n':cur.get('n_records'),'current_unique_url_n':cur.get('n_unique_urls'),
                           'current_reference':cur.get('reference_lean'),'current_mean_full_precision':cur.get('model_mean_full_precision'),
                           'n_delta':cur.get('n_records',0)-n,
                           'status':'缺少材料，无法验证论文历史快照；当前可用归档已独立复算'})
    write_csv(out/'table2_paper_vs_current.csv',comparison)
    write_csv(out/'selection_ledger.csv',ledgers)
    write_csv(out/'raw_record_inventory.csv',({
        'archive_line':r['_line'],'url':r.get('url'),'outlet':r.get('outlet'),'crawled_at':r.get('crawled_at'),
        'analysis_present':has_analysis(r),'analysis_provider':r.get('analysis_provider'),
        'analysis_model':r.get('analysis_model'),'analysis_status':r.get('analysis_status'),
        'bias_label':label(r),'lean_under_project_mapping':SCALE.get(label(r),0) if has_analysis(r) else None,
        'verification_score':score(r),'critic_provider':(r.get('verification') or {}).get('provider'),
        'analysis_content_sha256':signature(r['analysis']) if has_analysis(r) else None,
        'body_content_sha256':signature(r.get('body_text')),
    } for r in rows))
    duplicate_rows=[]
    for url,g in dup.items():
        base=g[0]
        for r in g:
            duplicate_rows.append({'url':url,'group_size':len(g),'archive_line':r['_line'],
                'first_line':base['_line'],'crawled_at':r.get('crawled_at'),'outlet':r.get('outlet'),
                'analysis_provider':r.get('analysis_provider'),'analysis_model':r.get('analysis_model'),
                'bias_label':label(r),'verification_score':score(r),
                'same_analysis_as_first':r.get('analysis')==base.get('analysis'),
                'same_body_as_first':r.get('body_text')==base.get('body_text'),
                'analysis_sha256':signature(r['analysis']) if has_analysis(r) else None})
    write_csv(out/'duplicate_url_records.csv',duplicate_rows)
    all_scored=[r for r in rows if score(r) is not None]
    deep_scored=[r for r in deep if score(r) is not None]
    raw_score_nonfinite=[r['_line'] for r in rows if r.get('verification_score') is not None and score(r) is None]
    ver_rows=[]
    for r in all_scored:
        ver=r.get('verification') or {}
        vf=ver.get('verified_fields',[]);uf=ver.get('unsupported_fields',[])
        fraction=len(vf)/(len(vf)+len(uf)) if len(vf)+len(uf)>0 else None
        ver_rows.append({'archive_line':r['_line'],'url':r['url'],'analyst_provider':r.get('analysis_provider'),
            'analyst_model':r.get('analysis_model'),'analyst_status':r.get('analysis_status'),
            'critic_provider':ver.get('provider'),'critic_model':ver.get('model'),'stored_score':score(r),
            'nested_score':ver.get('score'),'verified_entries':len(vf),'unsupported_entries':len(uf),
            'entry_fraction_diagnostic_only':fraction,
            'difference_from_entry_fraction':score(r)-fraction if fraction is not None else None,
            'verified_fields':vf,'unsupported_fields':uf,'corrections':ver.get('corrections',[]),
            'real_analyst_and_critic':is_deepseek(r) and ver.get('provider')=='deepseek' and ver.get('model')=='deepseek-chat'})
    write_csv(out/'verification_records.csv',ver_rows)
    write_csv(out/'verification_field_counts_deepseek_rows.csv',field_stats(deep_scored))
    write_csv(out/'verification_field_counts_deepseek_last_url.csv',field_stats([r for r in pick_urls(deep,True) if score(r) is not None]))
    verification['all_archive_rows']=describe(rows)
    verification['all_scored_rows']=describe(all_scored)
    verification['quality']={
        'non_numeric_or_nonfinite_lines':raw_score_nonfinite,
        'score_and_nested_score_disagree_lines':[r['_line'] for r in all_scored if score(r)!=(r.get('verification') or {}).get('score')],
        'model_score_differs_from_field_entry_fraction_count':sum(v['entry_fraction_diagnostic_only'] is not None and abs(v['difference_from_entry_fraction'])>1e-9 for v in ver_rows),
        'deepseek_scored_unique_url_and_verification_content':len({(r['url'],signature(r.get('verification'))) for r in deep_scored}),
        'non_deepseek_analyst_scored_lines':[r['_line'] for r in all_scored if not is_deepseek(r)],
        'missing_score_reason':'No per-analysis attempt_id/error/time is archived; score absence alone cannot distinguish not attempted, failure, old schema or later scoring never appended.',
        'paper_nominal_coverage_856_over_1330':856/1330,
        'note':'Entry-count fractions are diagnostic only; score is generated directly by model, never recomputed or substituted here.'}
    # Time batch ledger does not trim to any reported target.
    batches=collections.defaultdict(list)
    for r in rows:batches[r['crawled_at']].append(r)
    write_csv(out/'crawl_batches.csv',({'crawled_at':k,'n_rows':len(v),'n_unique_urls':len({r['url'] for r in v}),
        'deepseek_rows':sum(is_deepseek(r) for r in v),'all_analysis_rows':sum(has_analysis(r) for r in v),
        'deepseek_scored_rows':sum(is_deepseek(r) and score(r) is not None for r in v),
        'archive_lines':[r['_line'] for r in v]} for k,v in sorted(batches.items())))
    node_result=subprocess.run(['node',str(ROOT/'scripts/audit_project_bridge.cjs')],
        input=json.dumps({'archive':str(archive),'pairs':bridge_pairs}),text=True,capture_output=True,cwd=ROOT)
    if node_result.returncode:
        bridge={'error':node_result.stderr,'returncode':node_result.returncode}
    else:
        bridge=json.loads(node_result.stdout)
        for c in bridge['comparisons']:
            expected=table_check if c['name']=='paper_display_values_only' else branch_results[c['name']]['correlations']
            c['absolute_pearson_difference_from_scipy']=abs(c['pearson']-expected['pearson_r']) if c['pearson'] is not None else None
            c['absolute_spearman_difference_from_scipy']=abs(c['spearman']-expected['spearman_rho']) if c['spearman'] is not None else None
            assert c['absolute_pearson_difference_from_scipy'] is None or c['absolute_pearson_difference_from_scipy']<1e-12
            assert c['absolute_spearman_difference_from_scipy'] is None or c['absolute_spearman_difference_from_scipy']<1e-12
        expected_project=branch_results['project_current_rows']['correlations']
        actual_project=bridge['actual_report']
        assert actual_project['bias_correlation']['pearson_r']==js_round2(expected_project['pearson_r'])
        assert actual_project['bias_correlation']['spearman_rho']==js_round2(expected_project['spearman_rho'])
        assert actual_project['bias_correlation']['n']==expected_project['n_outlets']
        assert actual_project['verification_rate']==js_round2(verification['all_archive_rows']['mean_per_record_score'])
    dump(out/'project_comparison.json',bridge)
    dump(out/'verification_summary.json',verification)
    dump(out/'raw_overview.json',overview)
    dump(out/'correlations_and_subsets.json',branch_results)
    dump(out/'paper_table_internal_check.json',table_check)
    # Plain Markdown numbers generated directly from raw records.
    lines=['# 从当前原始归档重建的表 2 与 verification 汇总','',
        '这不是已确认的论文历史快照。记录版本按原归档保留，ND 按项目映射为 0。',
        '筛选：analysis 存在、provider=deepseek、model=deepseek-chat；筛选后每家至少两条记录。','',
        '|媒体|原始记录 n|唯一 URL|ND 数|参考值|完整精度模型均值|', '|---|---:|---:|---:|---:|---:|']
    for r in tables['deepseek_rows']:
        lines.append(f"|{r['outlet']}|{r['n_records']}|{r['n_unique_urls']}|{r['n_not_determinable']}|{r['reference_lean']:+.2f}|{r['model_mean_full_precision']:.17g}|")
    lines += ['', '|分支|纳入记录|唯一 URL|媒体数|Pearson r|Spearman rho|评分数|评分覆盖率|评分均值|',
              '|---|---:|---:|---:|---:|---:|---:|---:|---:|']
    for name,_,_,_,_,_ in branches:
        r=branch_results[name];c=r['correlations'];v=r['verification']
        lines.append(f"|{name}|{r['included_records_after_outlet_eligibility']}|{r['included_unique_urls_after_outlet_eligibility']}|{c['n_outlets']}|{c['pearson_r']:.12g}|{c['spearman_rho']:.12g}|{v['n_scored_records']}|{v['coverage']:.12g}|{v['mean_per_record_score']:.12g}|")
    lines += ['','评分覆盖率分母为该分支筛选后的分析记录数；当前所有分支无媒体资格剔除。',
              '各分支是明确标注的单位/缺失值敏感性检查，不选择最接近论文数字的结果。','']
    (out/'reconstructed-results.md').write_text('\n'.join(lines))
    after = {str(p.relative_to(ROOT)) if p.is_relative_to(ROOT) else str(p): digest(p) for p in protected if p.exists()}
    assert before==after, 'Protected input changed during audit'
    commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    versions={'python':platform.python_version(),'scipy':scipy.__version__,'numpy':np.__version__,
              'node':bridge.get('node'),'typescript':bridge.get('typescript')}
    manifest={'generated_utc':dt.datetime.now(dt.timezone.utc).isoformat(), 'git_head':commit,
        'inputs_sha256_before':before,'inputs_sha256_after':after,'protected_inputs_unchanged':before==after,
        'dependencies':versions,'scripts_sha256':{p.name:digest(p) for p in [Path(__file__), ROOT/'scripts/audit_project_bridge.cjs']},
        'sources_sha256':{str(p.relative_to(ROOT)):digest(p) for d in (ROOT/'server/src',ROOT/'client/src')
                          for p in d.rglob('*') if p.suffix in ('.ts','.tsx')},
        'paper_snapshot_identification':'unconfirmed; current archive is not asserted to equal paper snapshot',
        'run_command':'python3 scripts/audit_paper_results.py'}
    manifest['audit_script_sha256']={p.name:digest(p) for p in sorted((ROOT/'scripts').glob('audit_*')) if p.is_file()}
    manifest['context_input_sha256']={str(p.relative_to(ROOT)):digest(p) for p in
        [ROOT/'data/server.log',ROOT/'data/crawl.log',ROOT/'data/world-briefing.json',out/'paper-claims.json'] if p.exists()}
    dump(out/'run-manifest.json',manifest)
    print(json.dumps({'rows':len(rows),'unique_urls':len(groups),'deepseek':len(deep),'output':str(out),
                      'project_scipy_comparisons':len(bridge.get('comparisons',[])),
                      'protected_inputs_unchanged':True},ensure_ascii=False))


if __name__=='__main__':
    main()
