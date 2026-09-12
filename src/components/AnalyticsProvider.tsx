'use client';
import { useEffect, useState } from 'react';
import { initializeAnalytics, sanitizeUmamiPayload, stopAnalytics, type UmamiProvider } from '@/lib/analytics';
import { ANALYTICS_KEYS, CONSENT_EVENT, clearAnalyticsData, getAnalyticsIdentity, readAnalyticsConsent, setAnalyticsConsent, type AnalyticsConsent } from '@/lib/analyticsIdentity';

import { captureAttribution } from '@/lib/analyticsState';

type AnalyticsWindow = Window & {
  umami?: UmamiProvider;
  footquizAnalyticsBeforeSend?: typeof sanitizeUmamiPayload;
};
let loading: Promise<UmamiProvider | null> | null = null;
function loadProvider(): Promise<UmamiProvider | null> {
  if (loading) return loading;
  const src = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL;
  const website = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  if (!src || !website || !/^[0-9a-f-]{36}$/i.test(website)) return Promise.resolve(null);
  try { if (new URL(src).protocol !== 'https:') return Promise.resolve(null); } catch { return Promise.resolve(null); }
  const target = window as AnalyticsWindow;
  target.footquizAnalyticsBeforeSend = sanitizeUmamiPayload;
  loading = new Promise(resolve => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.websiteId = website;
    script.dataset.autoTrack = 'false';
    script.dataset.autoPageview = 'false';
    script.dataset.performance = 'false';
    script.dataset.beforeSend = 'footquizAnalyticsBeforeSend';
    script.dataset.excludeSearch = 'true';
    script.dataset.excludeHash = 'true';
    script.dataset.fetchCredentials = 'omit';
    script.onload = () => resolve(target.umami ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return loading;
}
export default function AnalyticsProvider() {
  const [consent, setConsent] = useState<AnalyticsConsent>('unknown');
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let revision = 0;
    const synchronize = () => {
      const current = ++revision;
      stopAnalytics();
      const next = readAnalyticsConsent();
      setConsent(next);
      setMounted(true);
      if (next !== 'accepted') {
        clearAnalyticsData();
        return;
      }
      captureAttribution();
      if (!getAnalyticsIdentity()) return;
      void loadProvider().then(candidate => {
        if (current === revision && candidate && readAnalyticsConsent() === 'accepted')
          return initializeAnalytics(candidate);
      }).catch(() => { /* Never affect the page. */ });
    };
    const storage = (event: StorageEvent) => {
      if (event.key === null || (event.key === ANALYTICS_KEYS.consent || event.key === ANALYTICS_KEYS.identity)) synchronize();
    };
    synchronize();
    window.addEventListener(CONSENT_EVENT, synchronize);
    window.addEventListener('storage', storage);
    return () => {
      revision++;
      stopAnalytics();
      window.removeEventListener(CONSENT_EVENT, synchronize);
      window.removeEventListener('storage', storage);
    };
  }, []);
  if (!mounted) return null;
  return <aside aria-label="Ustawienia analityki" className="mx-auto max-w-md p-4 text-sm">
    <button type="button" className="underline" aria-expanded={open || consent === 'unknown'}
      aria-controls="analytics-settings" onClick={() => setOpen(value => !value)}>Ustawienia analityki</button>
    {(open || consent === 'unknown') && <div id="analytics-settings" className="mt-2 rounded border bg-white p-4">
      <p>Za zgodą używamy Umami Cloud EU i losowego identyfikatora zapisanego w tej przeglądarce,
        aby mierzyć korzystanie z quizu i powroty. Zgoda jest dobrowolna. Gra działa także bez analityki.</p>
      <p className="mt-2" role="status">Stan: {consent === 'accepted' ? 'zgoda udzielona' : consent === 'rejected' ? 'brak zgody' : 'brak decyzji'}.</p>
      <div className="mt-3 flex gap-3">
        <button type="button" className="rounded border px-3 py-2" onClick={() => { setAnalyticsConsent('accepted'); setOpen(false); }}>Zezwól</button>
        <button type="button" className="rounded border px-3 py-2" onClick={() => { setAnalyticsConsent('rejected'); setOpen(false); }}>
          {consent === 'accepted' ? 'Wycofaj zgodę' : 'Odrzuć'}
        </button>
      </div>
    </div>}
  </aside>;
}
