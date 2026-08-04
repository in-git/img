import {
  Button,
  Card,
  Checkbox,
  InputNumber,
  Segmented,
  Slider,
} from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import SegmentGrid from './SegmentGrid';

/**
 * 右侧配置面板组件
 * Apple Human Interface Guidelines 风格
 * - 圆角：小控件 6px / 卡片 10px / 弹窗 12px
 * - 阴影：0 2px 8px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)
 * - 字号：12/14/16/18/20/24，行高 1.4~1.5
 * - 字重：400/500/600
 * - 配色：主色 #007AFF，文本 #1D1D1F，次要 #6E6E73，背景 #F5F5F7，卡片 #FFFFFF
 */
const ConfigPanel = ({
  config,
  setConfig,
  fileList,
  isProcessing,
  handleStartBatchProcess,
}) => {
  const formatList = [
    { label: 'PNG', value: 'png' },
    { label: 'JPEG', value: 'jpg' },
    { label: 'WEBP', value: 'webp' },
    { label: 'ICO', value: 'ico' },
    { label: 'AVIF', value: 'avif' },
    { label: 'HEIC', value: 'heic' },
  ];

  // 卡片统一样式：白底、10px 圆角、轻薄苹果阴影
  const plainCardProps = {
    variant: 'borderless',
    style: {
      borderRadius: 10,
      background: '#FFFFFF',
      boxShadow: '0 2px 8px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)',
    },
    styles: {
      header: {
        borderBottom: 'none',
        padding: '14px 16px 6px',
        minHeight: 40,
      },
      body: { padding: '8px 16px 14px' },
    },
  };

  // 带分割线标题的卡片样式
  const headerTabsCardProps = {
    variant: 'borderless',
    style: {
      borderRadius: 10,
      background: '#FFFFFF',
      boxShadow: '0 2px 8px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)',
    },
    styles: {
      header: {
        padding: '12px 16px',
        borderBottom: '1px solid #E5E5EA',
        minHeight: 48,
      },
      body: { padding: 14 },
    },
  };

  return (
    <div
      className="w-full md:w-[420px] lg:w-[460px] h-full flex flex-col bg-[#F5F5F7] border-l border-[#E5E5EA] p-5 overflow-y-auto custom-scroll flex-shrink-0 z-10"
      style={{ fontSize: '14px', lineHeight: 1.5 }}
    >
      {/* 右侧顶部页面大标题 */}
      <div className="mb-5 px-1">
        <h2 className="text-[20px] font-semibold text-[#1D1D1F] tracking-tight leading-[1.4]">
          导出设置
        </h2>
        <p className="text-[12px] text-[#6E6E73] mt-1 leading-[1.5]">
          调整图片处理参数，准备批量导出
        </p>
      </div>

      <div className="space-y-3 mb-6">
        {/* 智能擦除 */}
        <Card
          {...plainCardProps}
          title={
            <span className="text-[16px] font-semibold text-[#1D1D1F] tracking-tight">
              智能擦除
            </span>
          }
        >
          <div className="space-y-1">
            <label className="flex items-center justify-between px-3 py-2.5 rounded-[6px] hover:bg-[#F5F5F7] apple-transition cursor-pointer">
              <div>
                <span className="text-[14px] text-[#1D1D1F] font-normal block leading-[1.5]">
                  去背景
                </span>
                <span className="text-[12px] text-[#86868B] block leading-[1.5] mt-0.5">
                  自动识别主体并去除背景
                </span>
              </div>
              <Checkbox
                checked={config.enableRemoveBg}
                onChange={(e) => setConfig('enableRemoveBg', e.target.checked)}
              />
            </label>
            <label className="flex items-center justify-between px-3 py-2.5 rounded-[6px] hover:bg-[#F5F5F7] apple-transition cursor-pointer">
              <div>
                <span className="text-[14px] text-[#1D1D1F] font-normal block leading-[1.5]">
                  去豆包水印
                </span>
                <span className="text-[12px] text-[#86868B] block leading-[1.5] mt-0.5">
                  擦除图像中的豆包水印
                </span>
              </div>
              <Checkbox
                checked={config.enableRemoveWatermark}
                onChange={(e) => setConfig('enableRemoveWatermark', e.target.checked)}
              />
            </label>
          </div>
        </Card>

        {/* 导出格式 */}
        <Card
          {...plainCardProps}
          title={
            <span className="text-[16px] font-semibold text-[#1D1D1F] tracking-tight">
              导出格式
            </span>
          }
        >
          <SegmentGrid
            value={config.targetFormat}
            onChange={(v) => setConfig('targetFormat', v)}
            options={formatList.map((item) => ({ value: item.value, label: item.label }))}
            columns={3}
          />
        </Card>

        {/* 图片压缩 */}
        <Card
          {...headerTabsCardProps}
          title={
            <div className="flex items-center justify-between gap-3 w-full">
              <span className="text-[16px] font-semibold text-[#1D1D1F] tracking-tight">
                图片压缩
              </span>
              <div className="w-[140px] flex-shrink-0">
                <Segmented
                  block
                  size="small"
                  value={config.qualityType}
                  onChange={(v) => setConfig('qualityType', v)}
                  options={[
                    { value: 'preset', label: '预设' },
                    { value: 'custom', label: '精准' },
                  ]}
                />
              </div>
            </div>
          }
        >
          {config.qualityType === 'preset' ? (
            <SegmentGrid
              value={config.qualityPreset}
              onChange={(v) => setConfig('qualityPreset', v)}
              options={[
                { value: '100', label: '原品质' },
                { value: '75', label: '高质量' },
                { value: '50', label: '均衡' },
              ]}
            />
          ) : (
            <div className="flex items-center gap-3 pt-1">
              <Slider
                min={0}
                max={100}
                step={1}
                value={config.customQuality ? Number(config.customQuality) : 75}
                onChange={(v) => setConfig('customQuality', v != null ? v.toString() : '')}
                className="flex-1"
                tooltip={{ formatter: (v) => `${v}%` }}
              />
              <InputNumber
                min={0}
                max={100}
                size="small"
                value={config.customQuality ? Number(config.customQuality) : null}
                onChange={(v) => setConfig('customQuality', v != null ? v.toString() : '')}
                placeholder="0-100"
                className="w-[88px] flex-shrink-0"
                addonAfter="%"
              />
            </div>
          )}
        </Card>

        {/* 图片缩放 */}
        <Card
          {...headerTabsCardProps}
          title={
            <div className="flex items-center justify-between gap-3 w-full">
              <span className="text-[16px] font-semibold text-[#1D1D1F] tracking-tight">
                图片缩放
              </span>
              <div className="w-[140px] flex-shrink-0">
                <Segmented
                  block
                  size="small"
                  value={config.scaleType}
                  onChange={(v) => setConfig('scaleType', v)}
                  options={[
                    { value: 'preset', label: '比例' },
                    { value: 'custom', label: '自定义' },
                  ]}
                />
              </div>
            </div>
          }
        >
          {config.scaleType === 'preset' ? (
            <SegmentGrid
              value={config.scalePreset}
              onChange={(v) => setConfig('scalePreset', v)}
              options={[
                { value: '100', label: '100%' },
                { value: '75', label: '75%', badge: '推荐' },
                { value: '50', label: '50%' },
                { value: '25', label: '25%' },
              ]}
              columns={2}
            />
          ) : (
            <div className="flex items-center gap-3 pt-1">
              <Slider
                min={0}
                max={100}
                step={1}
                value={config.customScale ? Number(config.customScale) : 80}
                onChange={(v) => setConfig('customScale', v != null ? v.toString() : '')}
                className="flex-1"
                tooltip={{ formatter: (v) => `${v}%` }}
              />
              <InputNumber
                min={0}
                max={100}
                size="small"
                value={config.customScale ? Number(config.customScale) : null}
                onChange={(v) => setConfig('customScale', v != null ? v.toString() : '')}
                placeholder="0-100"
                className="w-[88px] flex-shrink-0"
                addonAfter="%"
              />
            </div>
          )}
        </Card>
      </div>

      {/* 底部开始渲染按钮 */}
      {(fileList.length > 0 || isProcessing) && (
        <div className="mt-auto pt-4">
          {fileList.length > 0 && !isProcessing && (
            <Button
              onClick={handleStartBatchProcess}
              type="primary"
              size="large"
              block
              style={{
                height: 48,
                borderRadius: 10,
                fontSize: 16,
                fontWeight: 500,
                background: '#007AFF',
                boxShadow: '0 2px 8px rgba(0,122,255,0.18), 0 1px 3px rgba(0,122,255,0.10)',
              }}
              className="apple-transition apple-active"
            >
              开始渲染
            </Button>
          )}
          {isProcessing && (
            <Button
              disabled
              size="large"
              block
              icon={<LoadingOutlined spin />}
              style={{
                height: 48,
                borderRadius: 10,
                fontSize: 16,
                fontWeight: 500,
                background: '#1D1D1F',
                opacity: 0.8,
                color: '#FFFFFF',
              }}
            >
              处理中...
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default ConfigPanel;
