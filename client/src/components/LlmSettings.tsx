import { useEffect, useState } from 'react';
import { fetchLlmSettings, saveLlmSettings, type LlmSettings } from '../api';

export default function LlmSettings() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<LlmSettings | null>(null);
  const [provider, setProvider] = useState('openai');
  const [model, setModel] = useState('gpt-4o-mini');
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    fetchLlmSettings()
      .then((s) => {
        setSettings(s);
        setProvider(s.provider);
        setModel(s.model);
        setApiKey('');
      })
      .catch(() => {});
  };

  useEffect(() => {
    load();
  }, []);

  const currentProvider = settings?.providers.find((p) => p.id === provider);

  const onProviderChange = (id: string) => {
    setProvider(id);
    const p = settings?.providers.find((x) => x.id === id);
    if (p && p.models.length) setModel(p.models[0]);
  };

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await saveLlmSettings({ provider, model, apiKey: apiKey.trim() || undefined });
      setStatus(
        res.testOk
          ? { ok: true, msg: `✓ Working — ${res.provider} · ${res.model} (${res.latency_ms}ms)` }
          : { ok: false, msg: `Saved, but couldn't verify: ${res.error}. Check the key has no extra characters, and that this network can reach the provider's API.` },
      );
      setApiKey('');
      load();
    } catch (e) {
      setStatus({ ok: false, msg: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-6 rounded border border-line bg-white p-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between font-serif text-lg font-semibold"
      >
        <span>LLM settings</span>
        <span className="text-sm text-muted">
          {settings && settings.hasKey ? (
            <span className="text-green-700">{settings.provider} · {settings.model}</span>
          ) : (
            <span className="text-amber-700">Mock (no key)</span>
          )}
          <span className="ml-2 text-xs">{open ? '▴' : '▾'}</span>
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          <p className="text-xs text-muted">
            Pick a provider + model, paste the key, then Save &amp; test. Stored locally in{' '}
            <code className="rounded bg-stone-100 px-1">server/.env</code> and never shown back.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Provider</label>
              <select
                value={provider}
                onChange={(e) => onProviderChange(e.target.value)}
                className="w-full rounded border border-line bg-white px-3 py-2 text-sm focus:border-ink focus:outline-none"
              >
                {(settings?.providers ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded border border-line bg-white px-3 py-2 text-sm focus:border-ink focus:outline-none"
              >
                {(currentProvider?.models ?? [model]).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={settings?.hasKey ? '•••••••• (paste a new key to replace)' : 'Paste your API key'}
            className="w-full rounded border border-line px-3 py-2 text-sm focus:border-ink focus:outline-none"
          />

          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="rounded border border-ink px-3 py-1.5 text-sm font-medium hover:bg-ink hover:text-paper disabled:opacity-50"
            >
              {saving ? 'Testing…' : 'Save & test'}
            </button>
            {status && <p className={`text-xs ${status.ok ? 'text-green-700' : 'text-red-700'}`}>{status.msg}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
