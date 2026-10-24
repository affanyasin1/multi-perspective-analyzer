import type { Outlet } from './types';

export interface OutletMeta {
  country: string;
  ownership: string;
  lean: string;
  url: string;
}

// Reference metadata for each outlet in the project. Lean labels are
// approximate, editorially-assigned reference points (Media Bias/Fact Check
// style), not absolute or scientific judgments.
export const OUTLET_META: Record<Outlet, OutletMeta> = {
  skynews: { country: 'United Kingdom', ownership: 'Sky Group (Comcast)', lean: 'Center', url: 'https://news.sky.com' },
  france24: { country: 'France', ownership: 'France Médias Monde (state-funded)', lean: 'Center', url: 'https://www.france24.com' },
  npr: { country: 'United States', ownership: 'Non-profit, public funding', lean: 'Left-Center', url: 'https://www.npr.org' },
  indianexpress: { country: 'India', ownership: 'Indian Express Group', lean: 'Center', url: 'https://indianexpress.com' },
  irna: { country: 'Iran', ownership: 'State media', lean: 'State (pro-gov)', url: 'https://en.irna.ir' },
  mehrnews: { country: 'Iran', ownership: 'State-aligned', lean: 'State (pro-gov)', url: 'https://en.mehrnews.com' },
  thenews: { country: 'Pakistan', ownership: 'Jang Group', lean: 'Center', url: 'https://www.thenews.com.pk' },
  dohanews: { country: 'Qatar', ownership: 'Independent', lean: 'Center', url: 'https://dohanews.co' },
  almonitor: { country: 'United States (Middle East focus)', ownership: 'Independent', lean: 'Left-Center', url: 'https://www.al-monitor.com' },
  thenational: { country: 'United Arab Emirates', ownership: 'International Media Investments', lean: 'Pro-gov (center)', url: 'https://www.thenationalnews.com' },
  yonhap: { country: 'South Korea', ownership: 'National news agency', lean: 'Center', url: 'https://en.yna.co.kr' },
  anadolu: { country: 'Turkey', ownership: 'State news agency', lean: 'State (pro-gov)', url: 'https://www.aa.com.tr' },
  dailynewsegypt: { country: 'Egypt', ownership: 'Independent', lean: 'Center', url: 'https://www.dailynewsegypt.com' },
  allafrica: { country: 'Pan-Africa (US-based)', ownership: 'Independent aggregator', lean: 'Center', url: 'https://allafrica.com' },
  tass: { country: 'Russia', ownership: 'State news agency', lean: 'State (pro-gov)', url: 'https://tass.com' },
  globaltimes: { country: 'China', ownership: "People's Daily (state)", lean: 'State (pro-gov)', url: 'https://www.globaltimes.cn' },
  ecns: { country: 'China', ownership: 'State news service', lean: 'State (pro-gov)', url: 'http://www.ecns.cn' },
};
