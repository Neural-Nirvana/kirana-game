export interface LiveShopFrame {
  id: string;
  label: string;
  caption: string;
  src: string;
}

export const LIVE_SHOP_FRAMES: LiveShopFrame[] = [
  {
    id: 'morning',
    label: 'Morning opening',
    caption: 'Shelves open, regulars walk in',
    src: new URL('./morning.webp', import.meta.url).href,
  },
  {
    id: 'afternoon',
    label: 'Afternoon rush',
    caption: 'Customers pick staples and snacks',
    src: new URL('./afternoon.webp', import.meta.url).href,
  },
  {
    id: 'evening',
    label: 'Evening billing',
    caption: 'Rush hour sales hit the counter',
    src: new URL('./evening.webp', import.meta.url).href,
  },
  {
    id: 'closing',
    label: 'Closing balance',
    caption: 'Stock, khata, and cash are counted',
    src: new URL('./closing.webp', import.meta.url).href,
  },
];
