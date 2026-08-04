import { useMemo } from 'react';

/**
 * Apple iOS 原生分段网格控件
 * - 均匀 grid 布局、磨砂背景
 * - 选中项白底卡片 + 苹果轻薄微阴影
 * - 圆角 8px（小控件规范）、字号 14px
 *
 * @param {Array<{value:string,label:string,badge?:string}>} options
 * @param {string} value 当前选中值
 * @param {(v:string)=>void} onChange 选择回调
 * @param {number} [columns] 自定义列数，默认按 options 长度均分
 */
export default function SegmentGrid({ options = [], value, onChange, columns }) {
  const cols = columns || options.length || 1;

  const gridStyle = useMemo(
    () => ({
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      gap: 4,
    }),
    [cols],
  );

  return (
    <div
      style={gridStyle}
      className="p-1 rounded-[10px] bg-[#ECECF0]/70 backdrop-blur-xl"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange && onChange(opt.value)}
            className={`
              relative rounded-[8px] px-2 py-3 text-[14px] leading-[1.4]
              font-medium apple-transition select-none
              ${active
                ? 'bg-white text-[#1D1D1F] font-medium shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.05)]'
                : 'bg-transparent text-[#6E6E73] hover:text-[#1D1D1F] hover:bg-white/50 font-normal'
              }
            `}
            style={{
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", "Helvetica Neue", Arial, sans-serif',
              letterSpacing: '-0.01em',
            }}
          >
            {opt.badge && (
              <span
                className="absolute -top-1.5 -right-1 text-[10px] leading-none px-1.5 py-0.5 rounded-full text-white font-medium"
                style={{ background: '#007AFF' }}
              >
                {opt.badge}
              </span>
            )}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
