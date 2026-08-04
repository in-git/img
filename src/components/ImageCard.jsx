import { CloseOutlined, ArrowDownOutlined } from '@ant-design/icons';

/**
 * 图片卡片组件
 * Apple Human Interface Guidelines 风格
 * - 白底、10px 圆角、轻薄微阴影
 * - 状态色：就绪#6E6E73、计算中#007AFF、完成#34C759、异常#FF3B30
 * - hover 提亮、active 下压 0.88、0.2s ease 过渡
 */
export default function ImageCard({ item, onRemove, formatFileSize, targetFormat }) {
  const { file, originalPreview, processedUrl, status, errorMessage } = item;
  const displayImg = processedUrl || originalPreview;
  const downloadName = `${file.name.substring(0, file.name.lastIndexOf('.')) || file.name}_processed.${targetFormat}`;

  // 状态徽标配置
  const badgeConfig = {
    waiting: { bg: '#6E6E73', text: '#FFFFFF', label: '就绪', dot: null },
    processing: { bg: 'rgba(0,122,255,0.10)', text: '#007AFF', label: '计算中', dot: '#007AFF' },
    done: { bg: 'rgba(52,199,89,0.10)', text: '#34C759', label: '完成', dot: null },
    error: { bg: 'rgba(255,59,48,0.10)', text: '#FF3B30', label: '异常', dot: null },
  };
  const badge = badgeConfig[status] || badgeConfig.waiting;

  return (
    <div
      className="bg-white rounded-[10px] overflow-hidden apple-transition flex flex-col group relative apple-active"
      style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)' }}
    >
      {/* 左上状态徽标 */}
      <div className="absolute top-2.5 left-2.5 z-10">
        <span
          className="px-2.5 py-1 rounded-full text-[12px] font-medium backdrop-blur-md flex items-center gap-1 leading-[1.4]"
          style={{ background: badge.bg, color: badge.text }}
        >
          {badge.dot && (
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: badge.dot }}
            />
          )}
          {badge.label}
        </span>
        {status === 'error' && errorMessage && (
          <span className="sr-only">{errorMessage}</span>
        )}
      </div>

      {/* 右上删除按钮 */}
      {status !== 'processing' && (
        <button
          onClick={() => onRemove(item.id)}
          className="absolute top-2.5 right-2.5 z-10 w-7 h-7 rounded-full bg-white/80 backdrop-blur-md text-[#86868B] hover:text-[#FF3B30] flex items-center justify-center opacity-0 group-hover:opacity-100 apple-transition cursor-pointer"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
        >
          <CloseOutlined style={{ fontSize: 14 }} />
        </button>
      )}

      {/* 图片预览区 */}
      <div
        className={`h-40 relative flex items-center justify-center p-3 ${processedUrl ? 'bg-checkerboard' : 'bg-[#F5F5F7]/60'}`}
      >
        <img
          src={displayImg}
          alt={file.name}
          className="max-h-full max-w-full object-contain apple-transition group-hover:scale-[1.02]"
        />
      </div>

      {/* 底部信息区 */}
      <div className="p-3 bg-white flex flex-col justify-between flex-1 space-y-2">
        <div>
          <div
            className="text-[14px] font-medium text-[#1D1D1F] truncate leading-[1.5]"
            title={file.name}
          >
            {file.name}
          </div>
          <div className="text-[12px] text-[#86868B] mt-0.5 leading-[1.5]">
            {formatFileSize(file.size)}
          </div>
        </div>
        {processedUrl && (
          <a
            href={processedUrl}
            download={downloadName}
            className="w-full bg-[#F5F5F7] hover:bg-[#007AFF] text-[#1D1D1F] hover:text-white rounded-[8px] py-2 text-[14px] font-medium apple-transition flex items-center justify-center gap-1.5 mt-1 cursor-pointer apple-active"
          >
            <ArrowDownOutlined style={{ fontSize: 14 }} />
            <span>保存</span>
          </a>
        )}
      </div>
    </div>
  );
}
