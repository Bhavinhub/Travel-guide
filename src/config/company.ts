/**
 * Company-level configuration. Everything brand-facing reads from here so the
 * name "Travel Guide" is used consistently across UI, metadata and exports.
 *
 * Contact details are intentionally empty: add real, verified details before launch.
 */
export const COMPANY = {
  name: 'Travel Guide',
  tagline: 'Explore beautifully. Plan effortlessly.',
  founder: 'Bhavin',
  /** Leave empty until verified details exist — the UI shows a setup notice instead. */
  contact: {
    email: '',
    phone: '',
    address: '',
    hours: '',
  },
  /** Travel Guide service fee applied to estimates. Demo default is 0%. */
  serviceFeePct: 0,
};

/** Basis shown next to every estimate. */
export const PRICING_BASIS = {
  label: 'Illustrative sample rates — Travel Guide demo dataset v1',
  compiledOn: '2026-10-26',
  note:
    'Prices are illustrative planning figures compiled for this demo. They are not live fares, supplier quotes or confirmed availability, and exclude taxes unless stated.',
};

export const ENV = {
  quoteEndpoint: (import.meta.env.VITE_QUOTE_ENDPOINT as string | undefined) || '',
  fxEndpoint: (import.meta.env.VITE_FX_ENDPOINT as string | undefined) || '',
  disableRemoteMedia: (import.meta.env.VITE_DISABLE_REMOTE_MEDIA as string | undefined) === 'true',
};
