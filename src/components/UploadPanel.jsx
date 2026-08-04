import { Button } from 'antd';
import { PictureOutlined } from '@ant-design/icons';
import { forwardRef } from 'react';
import ImageCard from './ImageCard';
import { formatFileSize } from '../utils/format';

/**
 * 左侧上传区组件
 * Apple Human Interface Guidelines 风格
 * - 背景 #F5F5F7，卡片白底 10px 圆角 + 轻薄阴影
 * - 主色 #007AFF，字号 12/14/16/20/24，行高 1.5
 * - hover 提亮、active 下压 0.88、0.2s ease 过渡
 */
const UploadPanel = forwardRef(function UploadPanel(
  {
    fileList,
    isDragging,
    isProcessing,
    handleRemoveItem,
    handleClearAll,
    targetFormat,
  },
  dragOverlayRef,
) {
  const totalCount = fileList.length;

  return (
    <div className="flex-1 h-full flex flex-col bg-[#F5F5F7] overflow-hidden">
      <div className="flex-1 p-5 overflow-y-auto custom-scroll relative">
        {/* 顶部工具栏 */}
        <div className="absolute top-5 left-5 right-5 z-20 flex items-center justify-end pointer-events-none">
          {totalCount > 0 && (
            <div className="flex items-center gap-3 pointer-events-auto">
              <span className="text-[14px] text-[#6E6E73] leading-[1.5]">
                已选{' '}
                <span className="text-[#1D1D1F] font-medium">{totalCount}</span>{' '}
                项
              </span>
              <Button
                onClick={handleClearAll}
                type="text"
                className="hover:!text-[#FF3B30] apple-transition"
                style={{ color: '#6E6E73', fontSize: 14, fontWeight: 500 }}
              >
                清空
              </Button>
            </div>
          )}
        </div>

        {fileList.length === 0 ? (
          /* 空状态拖拽区 */
          <div
            className="group relative w-full h-full min-h-[400px] border-2 border-dashed border-[#C7C7CC] rounded-[12px] bg-white/70 hover:bg-white hover:border-[#007AFF] apple-transition p-12 text-center flex flex-col items-center justify-center overflow-hidden"
          >
            {/* 柔和高光背景 */}
            <div
              className="absolute inset-0 opacity-60 group-hover:opacity-100 apple-transition pointer-events-none"
              style={{
                background:
                  'radial-gradient(ellipse at center, rgba(0,122,255,0.06) 0%, rgba(255,255,255,0) 60%)',
              }}
            />
            <div
              className="relative w-28 h-28 rounded-full bg-gradient-to-br from-[#E8F2FF] to-[#F5F5F7] flex items-center justify-center mb-6 group-hover:scale-105 apple-transition"
              style={{ boxShadow: '0 2px 8px rgba(0,122,255,0.08), 0 1px 3px rgba(0,122,255,0.05)' }}
            >
              <PictureOutlined style={{ fontSize: 52, color: '#007AFF' }} />
            </div>
            <p className="text-[28px] font-bold text-[#1D1D1F] mb-3 tracking-tight leading-[1.1]">
              批量处理图像
            </p>
            <p className="text-[18px] text-[#6E6E73] leading-[1.5]">
              支持文件、文件夹、多个文件
            </p>
            <p className="text-[14px] text-[#86868B] mt-2 leading-[1.5]">
              智能过滤非图片文件，拖拽即可导入
            </p>
          </div>
        ) : (
          /* 图片网格 */
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pt-14">
            {fileList.map((item) => (
              <ImageCard
                key={item.id}
                item={item}
                onRemove={handleRemoveItem}
                formatFileSize={formatFileSize}
                targetFormat={targetFormat}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export default UploadPanel;
