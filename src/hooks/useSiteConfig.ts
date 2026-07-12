import { useState, useEffect } from 'react';

export interface BrandConfig {
  name_zh: string;
  name_en: string;
  logo_url: string;
  favicon_url: string;
  primary_color: string;
}

export interface AppVersionConfig {
  version: string;
  release_notes_zh: string;
  release_notes_en: string;
}

export interface MaintenanceBannerConfig {
  enabled: boolean;
  text_zh: string;
  text_en: string;
}

export interface FooterConfig {
  copyright: string;
  icp_number: string;
  contact_email: string;
  social_links: { name: string; url: string }[];
  terms_text: string;
  privacy_text: string;
}

export interface HomepageCopyConfig {
  hero_title_zh: string;
  hero_title_en: string;
  hero_subtitle_zh: string;
  hero_subtitle_en: string;
  cta_zh: string;
  cta_en: string;
}

export interface SiteConfig {
  brand: BrandConfig;
  app_version: AppVersionConfig;
  maintenance_banner: MaintenanceBannerConfig;
  footer: FooterConfig;
  homepage_copy: HomepageCopyConfig;
  loaded: boolean;
}

const DEFAULTS: SiteConfig = {
  brand: {
    name_zh: 'CareerAI',
    name_en: 'CareerAI',
    logo_url: '',
    favicon_url: '',
    primary_color: '#2563eb',
  },
  app_version: {
    version: 'v0.4 PRO',
    release_notes_zh: '',
    release_notes_en: '',
  },
  maintenance_banner: {
    enabled: false,
    text_zh: '',
    text_en: '',
  },
  footer: {
    copyright: '© 2026 CareerAI Executive Search. All rights reserved.',
    icp_number: '',
    contact_email: 'siounex@qq.com',
    social_links: [],
    terms_text: 'Terms of Service',
    privacy_text: 'Privacy Policy',
  },
  homepage_copy: {
    hero_title_zh: '',
    hero_title_en: '',
    hero_subtitle_zh: '',
    hero_subtitle_en: '',
    cta_zh: '',
    cta_en: '',
  },
  loaded: false,
};

const CONFIG_KEYS = ['brand', 'app_version', 'maintenance_banner', 'footer', 'homepage_copy'];

let cachedConfig: SiteConfig | null = null;

export function useSiteConfig(): SiteConfig {
  const [config, setConfig] = useState<SiteConfig>(cachedConfig ?? DEFAULTS);

  useEffect(() => {
    if (cachedConfig) { setConfig(cachedConfig); return; }
    fetch(`/api/config/public/batch?keys=${CONFIG_KEYS.join(',')}`)
      .then((r) => r.json())
      .then((data) => {
        const c = data.configs || {};
        const merged: SiteConfig = {
          brand: { ...DEFAULTS.brand, ...(c.brand || {}) },
          app_version: { ...DEFAULTS.app_version, ...(c.app_version || {}) },
          maintenance_banner: { ...DEFAULTS.maintenance_banner, ...(c.maintenance_banner || {}) },
          footer: { ...DEFAULTS.footer, ...(c.footer || {}) },
          homepage_copy: { ...DEFAULTS.homepage_copy, ...(c.homepage_copy || {}) },
          loaded: true,
        };
        cachedConfig = merged;
        setConfig(merged);
      })
      .catch(() => {
        setConfig({ ...DEFAULTS, loaded: true });
      });
  }, []);

  return config;
}
