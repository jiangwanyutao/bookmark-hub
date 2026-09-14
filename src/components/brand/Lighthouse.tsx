interface Props {
  className?: string;
  /** 两侧的光束，用 currentColor 半透明绘制，跟随所在区块的文字色 */
  beam?: boolean;
}

/** 品牌吉祥物：按 logo 画的灯塔。纯装饰，对读屏隐藏。 */
export function Lighthouse({ className, beam = false }: Props) {
  return (
    <svg viewBox={beam ? '0 0 160 150' : '40 0 80 150'} className={className} aria-hidden focusable="false">
      {beam && (
        <g fill="currentColor" opacity="0.14">
          <path d="M80 39 L0 20 L0 60 Z" />
          <path d="M80 39 L160 20 L160 60 Z" />
        </g>
      )}
      <circle cx="80" cy="12" r="5" fill="var(--brand-coral)" />
      <path d="M58 31 Q80 6 102 31 Z" fill="var(--brand-coral)" />
      <rect x="62" y="29" width="36" height="19" rx="4" fill="var(--brand-cream)" />
      <rect x="54" y="46" width="52" height="10" rx="5" fill="var(--brand-coral)" />
      <path d="M60 56 L100 56 L108 138 L52 138 Z" fill="var(--brand-cream)" />
      <path d="M56.1 98 L103.9 98 L105.5 114 L54.5 114 Z" fill="var(--brand-coral)" />
      <circle cx="72" cy="74" r="2.8" fill="var(--brand-ink)" />
      <circle cx="88" cy="74" r="2.8" fill="var(--brand-ink)" />
      <path d="M75 81 Q80 86 85 81" fill="none" stroke="var(--brand-ink)" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="66" cy="80" r="3.2" fill="var(--brand-coral)" opacity="0.35" />
      <circle cx="94" cy="80" r="3.2" fill="var(--brand-coral)" opacity="0.35" />
      <rect x="44" y="136" width="72" height="10" rx="5" fill="var(--brand-mint-deep)" />
    </svg>
  );
}
