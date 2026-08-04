import { Button } from 'antd';
import {
  CheckOutlined,
  FileImageOutlined,
  FolderOpenOutlined,
} from '@ant-design/icons';

const FORMAT_LABELS = {
  png: 'PNG',
  jpg: 'JPEG',
  webp: 'WEBP',
  ico: 'ICO',
  avif: 'AVIF',
  heic: 'HEIC',
};

const QUALITY_LABELS = {
  '100': '原品质',
  '75': '高质量',
  '50': '均衡',
};

/**
 * 批量任务配置确认模态框
 * 复用 ProgressModal 的视觉风格
 * 当批量上传超过阈值时弹出，用户确认后才开始处理
 */
export default function ConfirmModal({
  showConfirmModal,
  setShowConfirmModal,
  pendingFileList,
  config,
  onConfirm,
  onCancel,
}) {
  if (!showConfirmModal) return null;

  const total = pendingFileList.length;
  const qualityLabel =
    config.qualityType === 'custom'
      ? `自定义 ${config.customQuality || 75}%`
      : QUALITY_LABELS[config.qualityPreset] || '高质量';
  const scaleLabel =
    config.scaleType === 'custom'
      ? `自定义 ${config.customScale || 80}%`
      : `${config.scalePreset}%`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/25 backdrop-blur-md apple-transition"
        onClick={onCancel}
      />
      <div className="relative bg-white/95 backdrop-blur-2xl rounded-3xl p-6 max-w-2xl w-full text-left apple-shadow-lg border border-black/[0.04] flex flex-col max-h-[85vh] z-10 apple-transition">
        {/* 头部 */}
        <div className="flex items-center justify-between pb-4 border-b border-black/[0.05]">
          <div>
            <h3 className="text-[17px] font-semibold text-[#1d1d1f]">
              确认批量处理
            </h3>
            <p className="text-[14px] text-[#86868b] mt-0.5">
              即将处理 {total} 个文件，请确认以下配置
            </p>
          </div>
        </div>

        {/* 配置摘要 */}
        <div className="py-4 border-b border-black/[0.05]">
          <div className="grid grid-cols-2 gap-3">
            <SummaryItem
              icon={<FileImageOutlined style={{ fontSize: 16, color: '#007AFF' }} />}
              label="导出格式"
              value={FORMAT_LABELS[config.targetFormat] || config.targetFormat}
            />
            <SummaryItem
              icon={<CheckOutlined style={{ fontSize: 16, color: '#34C759' }} />}
              label="图片压缩"
              value={qualityLabel}
            />
            <SummaryItem
              icon={<CheckOutlined style={{ fontSize: 16, color: '#FF9500' }} />}
              label="图片缩放"
              value={scaleLabel}
            />
            <SummaryItem
              icon={<FolderOpenOutlined style={{ fontSize: 16, color: '#5856D6' }} />}
              label="智能擦除"
              value={[
                config.enableRemoveBg ? '去背景' : null,
                config.enableRemoveWatermark ? '去水印' : null,
              ].filter(Boolean).join(' · ') || '未启用'}
            />
          </div>
        </div>

        {/* 文件列表预览 */}
        <div className="flex-1 overflow-y-auto custom-scroll my-3 pr-1 space-y-2 min-h-[80px] max-h-[260px]">
          {pendingFileList.slice(0, 20).map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-3 rounded-xl bg-[#f5f5f7]/60 hover:bg-[#f5f5f7] apple-transition text-[14px]"
            >
              <div className="flex items-center gap-2.5 truncate mr-3">
                <FileImageOutlined style={{ fontSize: 16, color: '#86868b', flexShrink: 0 }} />
                <span className="text-[#1d1d1f] truncate" title={item.file.name}>
                  {item.file.name}
                </span>
              </div>
              <span className="text-[12px] text-[#86868b] flex-shrink-0">
                {formatFileSize(item.file.size)}
              </span>
            </div>
          ))}
          {total > 20 && (
            <div className="text-center text-[12px] text-[#86868b] py-2">
              还有 {total - 20} 个文件未显示
            </div>
          )}
        </div>

        {/* 底部操作 */}
        <div className="pt-3 border-t border-black/[0.05] flex gap-3">
          <Button
            block
            onClick={onCancel}
            style={{
              height: 44,
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 500,
              background: '#FFFFFF',
              border: '1px solid #E5E5EA',
              color: '#1D1D1F',
            }}
            className="apple-transition apple-active hover:!border-[#007AFF] hover:!text-[#007AFF]"
          >
            取消
          </Button>
          <Button
            type="primary"
            block
            onClick={onConfirm}
            style={{
              height: 44,
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 600,
              background: '#007AFF',
              border: 'none',
              boxShadow: '0 2px 8px rgba(0,122,255,0.22), 0 1px 3px rgba(0,122,255,0.12)',
            }}
            className="apple-transition apple-active hover:!bg-[#0A84FF]"
          >
            继续 · 处理 {total} 个文件
          </Button>
        </div>
      </div>
    </div>
  );
}

function SummaryItem({ icon, label, value }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-[#f5f5f7]/60">
      <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[12px] text-[#86868b] leading-[1.4]">{label}</div>
        <div className="text-[14px] text-[#1d1d1f] font-medium truncate leading-[1.4]">
          {value}
        </div>
      </div>
    </div>
  );
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
