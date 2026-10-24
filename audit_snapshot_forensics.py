#!/usr/bin/env python3
"""Read-only snapshot forensics; never assert a prefix is the paper's snapshot.

Run: python3 scripts/audit_snapshot_forensics.py
Stdlib only. Writes audit products, never the protected source data.
"""
from __future__ import annotations

import collections
import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/paper-audit'
# PDF p.11 Table 2 counts, used only to falsify a full-vector prefix hypothesis.
PAPER_N = dict(almonitor=123, anadolu=34, dailynewsegypt=18, ecns=10,
               france24=81, indianexpress=34, irna=2, mehrnews=29, npr=23,
               skynews=3, tass=98, thenational=172, yonhap=55,
               allafrica=11, dohanews=4)
SCALE = {'left': -1, 'lean-left': -.5, 'center': 0,
         'lean-right': .5, 'right': 1, 'not-determinable': 0}


def real(r):
    return bool(r.get('analysis')) and r.get('analysis_provider') == 'deepseek' \
        and r.get('analysis_model') == 'deepseek-chat'


def label(r):
    return ((r.get('analysis') or {}).get('bias_rating') or {}).get('rating')


def scored(r):
    return isinstance(r.get('verification_score'), (int, float)) \
        and not isinstance(r.get('verification_score'), bool)


def urls(rows, last=False):
    chosen = {}
    for r in rows:
        if last or r['url'] not in chosen:
            chosen[r['url']] = r
    return list(chosen.values())


def branches(prefix):
    ds = [r for r in prefix if real(r)]
    return {
        'deepseek_rows': ds,
        'deepseek_done_rows': [r for r in ds if r.get('analysis_status') == 'done'],
        'deepseek_ordinal_only_rows': [r for r in ds if label(r) in SCALE and label(r) != 'not-determinable'],
        'deepseek_then_first_url': urls(ds),
        'deepseek_then_last_url': urls(ds, last=True),
        'first_url_then_deepseek': [r for r in urls(prefix) if real(r)],
        'last_url_then_deepseek': [r for r in urls(prefix, last=True) if real(r)],
        'project_all_analysis_rows': [r for r in prefix if r.get('analysis')],
    }


def main():
    archive = ROOT / 'data/archive.jsonl'
    before = hashlib.sha256(archive.read_bytes()).hexdigest()
    records = [json.loads(l) for l in archive.read_text().splitlines() if l.strip()]
    OUT.mkdir(parents=True, exist_ok=True)
    groups = collections.defaultdict(list)
    for line, record in enumerate(records, 1):
        groups[record['url']].append((line, record))
    schema_groups = []
    previous = None
    for line, record in enumerate(records, 1):
        keys = tuple(sorted(record))
        if keys != previous:
            schema_groups.append(dict(first_line=line, first_crawled_at=record['crawled_at'], keys=keys))
            previous = keys
        schema_groups[-1]['last_line'] = line
        schema_groups[-1]['last_crawled_at'] = record['crawled_at']
    for group in schema_groups:
        part = records[group['first_line'] - 1:group['last_line']]
        group.update(rows=len(part), unique_urls=len({r['url'] for r in part}),
                     provider_counts=dict(collections.Counter(str(r.get('analysis_provider')) for r in part)))

    boundaries = [i for i in range(1, len(records) + 1)
                  if i == len(records) or records[i]['crawled_at'] != records[i - 1]['crawled_at']]
    detail = []
    full_matches = []
    count_matches = []
    for end in boundaries:
        prefix = records[:end]
        ds = [r for r in prefix if real(r)]
        if len(prefix) == 3174 and len(ds) == 1330 and sum(scored(r) for r in ds) == 856:
            count_matches.append(end)
        for name, selected in branches(prefix).items():
            counts = collections.Counter(r['outlet'] for r in selected if label(r) in SCALE)
            eligible = {o: n for o, n in counts.items() if n >= 2}
            match = eligible == PAPER_N
            if match:
                full_matches.append(dict(end_line=end, branch=name, crawled_at=prefix[-1]['crawled_at']))
            detail.append(dict(end_line=end, crawled_at=prefix[-1]['crawled_at'], branch=name,
                               selected_rows=len(selected), eligible_outlets=len(eligible),
                               eligible_count_sum=sum(eligible.values()),
                               all_15_counts_and_eligibility_match=match,
                               counts_json=json.dumps(eligible, sort_keys=True)))
    with (OUT / 'snapshot_boundary_checks.csv').open('w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=list(detail[0]))
        w.writeheader()
        w.writerows(detail)

    prefixes = []
    for end in [3168, 3174, 3175, 3177, 3184, 3633]:
        prefix = records[:end]
        ds = [r for r in prefix if real(r)]
        scores = [r['verification_score'] for r in ds if scored(r)]
        prefixes.append(dict(end_line=end, last_crawled_at=prefix[-1]['crawled_at'],
                             natural_crawl_boundary=end in boundaries, unique_urls=len({r['url'] for r in prefix}),
                             deepseek_rows=len(ds), real_scored_rows=len(scores),
                             mean_score=sum(scores) / len(scores) if scores else None))
    irna = [dict(line=i, provider=r.get('analysis_provider'), model=r.get('analysis_model'),
                 rating=label(r), url=r['url'], crawled_at=r['crawled_at'])
            for i, r in enumerate(records, 1) if r['outlet'] == 'irna' and r.get('analysis')]
    summary = dict(
        archive_sha256=before, rows=len(records), unique_urls=len(groups),
        url_multiplicity=dict(collections.Counter(len(v) for v in groups.values())),
        duplicate_url_groups=sum(len(v) > 1 for v in groups.values()),
        excess_url_rows=len(records)-len(groups), schema_groups=schema_groups,
        natural_crawl_boundaries=len(boundaries), fixed_sensitivity_branches=8,
        complete_table2_count_vector_matches=full_matches,
        simultaneous_paper_count_matches_at_natural_boundaries=count_matches,
        diagnostic_prefixes=prefixes, irna_analyzed_records=irna,
        caveat='Absence of a match falsifies only tested extant-archive prefix hypotheses; it does not identify or disprove an unavailable historical snapshot.')
    (OUT / 'snapshot_forensics.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == before
    print(json.dumps({k: summary[k] for k in ['rows', 'unique_urls', 'natural_crawl_boundaries',
          'complete_table2_count_vector_matches', 'simultaneous_paper_count_matches_at_natural_boundaries']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
