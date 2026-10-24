import fs from 'node:fs';
import path from 'node:path';

export interface GroundTruthOutlet {
  rating: string;
  country: string;
  ownership: string;
}

export interface GroundTruth {
  source: string;
  updated_at: string;
  scale: Record<string, number>;
  outlets: Record<string, GroundTruthOutlet>;
}

const FILE = path.resolve(__dirname, '..', '..', '..', 'data', 'groundtruth.json');

export function loadGroundTruth(): GroundTruth {
  return JSON.parse(fs.readFileSync(FILE, 'utf-8')) as GroundTruth;
}

export function leanValue(gt: GroundTruth, outlet: string): number {
  const o = gt.outlets[outlet];
  if (!o) return 0;
  return gt.scale[o.rating] ?? 0;
}
