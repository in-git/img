import { App as AntdApp, ConfigProvider as AntdConfigProvider } from 'antd';
import { ArrowDownOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import UploadPanel from './components/UploadPanel';
import ConfigPanel from './components/ConfigPanel';
import ProgressModal from './components/ProgressModal';
import ConfirmModal from './components/ConfirmModal';
import { ConfigProvider, useConfigStore } from './context/ConfigContext';
import { traverseFileTree } from './utils/fileTraverse';

const BATCH_CONFIRM_THRESHOLD = 5;

function AppContent() {
  const { message } = AntdApp.useApp();
  const config = useConfigStore();
  const setConfig = config.setConfig;
  const [fileList, setFileList] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const dragCounter = useRef(0);

  const [showProgressModal, setShowProgressModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingItems, setPendingItems] = useState([]);
  const [currentTaskIds, setCurrentTaskIds] = useState([]);
  const [currentClientId, setCurrentClientId] = useState('');
  const [progressInfo, setProgressInfo] = useState({
    current: 0,
    total: 0,
    message: '',
  });
  const isStoppedRef = useRef(false);

  const handleAddFiles = useCallback((newFiles) => {
    const validImages = Array.from(newFiles).filter(
      (f) =>
        f.type.startsWith('image/') ||
        /\.(jpg|jpeg|png|webp|avif|bmp|ico|gif|svg|heic)$/i.test(f.name),
    );
    if (validImages.length === 0) return;
    const newItems = validImages.map((file) => ({
      id: Math.random().toString(36).substr(2, 9) + '-' + Date.now(),
      file: file,
      originalPreview: URL.createObjectURL(file),
      processedUrl: null,
      status: 'waiting',
      errorMessage: '',
    }));
    setFileList((prev) => [...prev, ...newItems]);
  }, []);

  useEffect(() => {
    const handleDragEnter = (e) => {
      e.preventDefault();
      dragCounter.current++;
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0)
        setIsDragging(true);
    };
    const handleDragLeave = (e) => {
      e.preventDefault();
      dragCounter.current--;
      if (dragCounter.current === 0) setIsDragging(false);
    };
    const handleDragOver = (e) => e.preventDefault();
    const handleDrop = async (e) => {
      e.preventDefault();
      setIsDragging(false);
      dragCounter.current = 0;
      const items = e.dataTransfer.items;
      if (items && items.length > 0) {
        const entryPromises = [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.webkitGetAsEntry) {
            const entry = item.webkitGetAsEntry();
            if (entry) entryPromises.push(traverseFileTree(entry));
          }
        }
        if (entryPromises.length > 0) {
          const results = await Promise.all(entryPromises);
          const extractedFiles = results.flat();
          if (extractedFiles.length > 0) {
            handleAddFiles(extractedFiles);
            return;
          }
        }
      }
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleAddFiles(e.dataTransfer.files);
      }
    };
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [handleAddFiles]);

  const handleRemoveItem = (id) => {
    setFileList((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target && target.originalPreview)
        URL.revokeObjectURL(target.originalPreview);
      return prev.filter((item) => item.id !== id);
    });
  };

  const handleClearAll = () => {
    fileList.forEach((item) => {
      if (item.originalPreview) URL.revokeObjectURL(item.originalPreview);
    });
    setFileList([]);
  };

  const getFinalQuality = () => {
    if (config.qualityType === 'custom') {
      const num = parseInt(config.customQuality, 10);
      if (isNaN(num)) return '75';
      return Math.max(1, Math.min(100, num)).toString();
    }
    return config.qualityPreset;
  };

  const getFinalScale = () => {
    if (config.scaleType === 'custom') {
      const num = parseInt(config.customScale, 10);
      if (isNaN(num)) return '100';
      return Math.max(0, Math.min(100, num)).toString();
    }
    return config.scalePreset;
  };

  const getFinalScaleMode = () => 'percent';

  const stopRender = async (clientId) => {
    try {
      await fetch('/api/stop-render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      isStoppedRef.current = true;
      setFileList((prev) =>
        prev.map((item) => {
          if (currentTaskIds.includes(item.id)) {
            return { ...item, status: 'error', errorMessage: '用户手动停止' };
          }
          return item;
        }),
      );
      setIsProcessing(false);
    } catch (e) {
      console.error('停止失败:', e);
    }
  };

  const executeBatchProcess = async (waitingItems) => {
    if (!waitingItems || waitingItems.length === 0) return;
    const ids = waitingItems.map((i) => i.id);
    setCurrentTaskIds(ids);
    setShowConfirmModal(false);
    setShowProgressModal(true);
    setIsProcessing(true);
    isStoppedRef.current = false;
    const clientId = 'client_' + Date.now();
    setCurrentClientId(clientId);
    const eventSource = new EventSource(`/api/progress?clientId=${clientId}`);
    eventSource.onmessage = (event) => {
      if (isStoppedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        setProgressInfo({
          current: data.current,
          total: data.total,
          message: data.message,
        });
        if (data.current > 0 && waitingItems.length > 0) {
          const completedIds = waitingItems
            .slice(0, data.current)
            .map((item) => item.id);
          const currentId = waitingItems[data.current]?.id;
          setFileList((prev) =>
            prev.map((item) => {
              if (completedIds.includes(item.id)) {
                return { ...item, status: 'done' };
              }
              if (item.id === currentId && item.status !== 'done') {
                return { ...item, status: 'processing' };
              }
              return item;
            }),
          );
        }
      } catch (e) {
        console.error('进度解析异常:', e);
      }
    };
    eventSource.onerror = () => eventSource.close();
    const waitingIds = new Set(ids);
    setFileList((prev) =>
      prev.map((item) =>
        waitingIds.has(item.id)
          ? { ...item, status: 'processing', errorMessage: '' }
          : item,
      ),
    );
    const formData = new FormData();
    waitingItems.forEach((item) => formData.append('images', item.file));
    formData.append('removeBg', config.enableRemoveBg ? 'true' : 'false');
    formData.append(
      'removeWatermark',
      config.enableRemoveWatermark ? 'true' : 'false',
    );
    formData.append('format', config.targetFormat);
    formData.append('quality', getFinalQuality());
    formData.append('scale', getFinalScale());
    formData.append('scaleMode', getFinalScaleMode());
    formData.append('clientId', clientId);
    try {
      const response = await fetch('/api/remove-bg-batch', {
        method: 'POST',
        body: formData,
      });
      if (isStoppedRef.current) {
        eventSource.close();
        return;
      }
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/zip')) {
        const processedCount =
          parseInt(response.headers.get('x-processed-count')) ||
          waitingItems.length;
        const blob = await response.blob();
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `Processed_Images_${processedCount}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(downloadUrl);
        if (!isStoppedRef.current) {
          setFileList((prev) =>
            prev.map((item) =>
              waitingIds.has(item.id) ? { ...item, status: 'done' } : item,
            ),
          );
        }
      } else if (contentType.startsWith('image/')) {
        const blob = await response.blob();
        const previewUrl = URL.createObjectURL(blob);
        const fileName = `${waitingItems[0].file.name.substring(0, waitingItems[0].file.name.lastIndexOf('.')) || waitingItems[0].file.name}_processed.${config.targetFormat}`;
        const a = document.createElement('a');
        a.href = previewUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        if (!isStoppedRef.current) {
          setFileList((prev) =>
            prev.map((item) =>
              waitingIds.has(item.id)
                ? { ...item, processedUrl: previewUrl, status: 'done' }
                : item,
            ),
          );
        }
      } else if (!response.ok) {
        if (!isStoppedRef.current) {
          const errMsg = `服务器错误: ${response.status}`;
          setFileList((prev) =>
            prev.map((item) =>
              waitingIds.has(item.id)
                ? { ...item, status: 'error', errorMessage: errMsg }
                : item,
            ),
          );
        }
      } else {
        if (!isStoppedRef.current) {
          const errMsg = '服务器返回了无效响应';
          setFileList((prev) =>
            prev.map((item) =>
              waitingIds.has(item.id)
                ? { ...item, status: 'error', errorMessage: errMsg }
                : item,
            ),
          );
        }
      }
    } catch (err) {
      if (!isStoppedRef.current) {
        console.error('连接服务异常:', err);
        setFileList((prev) =>
          prev.map((item) =>
            waitingIds.has(item.id)
              ? { ...item, status: 'error', errorMessage: '服务器未能响应' }
              : item,
          ),
        );
      }
    } finally {
      eventSource.close();
      setIsProcessing(false);
      // 关闭进度模态框并复位状态
      setShowProgressModal(false);
      setCurrentTaskIds([]);
      setCurrentClientId('');
      setProgressInfo({ current: 0, total: 0, message: '' });
      // Toast 提示用户已完成（手动停止不提示）
      if (!isStoppedRef.current) {
        message.success('处理完成');
      }
    }
  };

  const handleStartBatchProcess = async () => {
    const waitingItems = fileList.filter(
      (item) =>
        item.status === 'waiting' ||
        item.status === 'error' ||
        item.status === 'done',
    );
    if (waitingItems.length === 0) return;
    // 超过阈值则弹配置确认框
    if (waitingItems.length > BATCH_CONFIRM_THRESHOLD) {
      setPendingItems(waitingItems);
      setShowConfirmModal(true);
      return;
    }
    executeBatchProcess(waitingItems);
  };

  const handleConfirmBatchProcess = () => {
    executeBatchProcess(pendingItems);
    setPendingItems([]);
  };

  const handleCancelConfirm = () => {
    setShowConfirmModal(false);
    setPendingItems([]);
  };

  const modalTasks = fileList.filter((item) =>
    currentTaskIds.includes(item.id),
  );
  const isAllTasksCompleted =
    modalTasks.length > 0 &&
    modalTasks.every((t) => t.status === 'done' || t.status === 'error');
  const isAllTasksSuccess =
    modalTasks.length > 0 && modalTasks.every((t) => t.status === 'done');

  return (
    <div
      className="w-full h-full flex flex-col justify-between overflow-hidden selection:bg-[#007AFF] selection:text-white relative h-screen"
      style={{ fontSize: '14px' }}
    >
      {/* 拖拽 Modal Overlay */}
      <div
        className={`fixed inset-0 bg-black/20 backdrop-blur-xl z-50 flex flex-col items-center justify-center apple-transition ${isDragging ? 'opacity-100 pointer-events-auto scale-100' : 'opacity-0 pointer-events-none scale-98'}`}
      >
        <div
          className="w-20 h-20 rounded-full bg-white/90 flex items-center justify-center mb-6"
          style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.05)' }}
        >
          <ArrowDownOutlined style={{ fontSize: 32, color: '#007AFF' }} />
        </div>
        <p className="text-[16px] text-[#1D1D1F] font-medium">释放以导入图像</p>
        <p className="text-[14px] text-[#86868B] mt-1">
          支持批量拖入图像文件或层级文件夹
        </p>
      </div>
      {/* 全屏左右布局主容器 */}
      <main className="flex-1 w-full flex flex-col md:flex-row overflow-hidden h-full">
        {/* 左侧上传区 */}
        <UploadPanel
          fileList={fileList}
          isDragging={isDragging}
          isProcessing={isProcessing}
          handleRemoveItem={handleRemoveItem}
          handleClearAll={handleClearAll}
          targetFormat={config.targetFormat}
        />
        {/* 右侧配置面板 */}
        <ConfigPanel
          config={config}
          setConfig={setConfig}
          fileList={fileList}
          isProcessing={isProcessing}
          handleStartBatchProcess={handleStartBatchProcess}
        />
      </main>
      <ProgressModal
        showProgressModal={showProgressModal}
        setShowProgressModal={setShowProgressModal}
        modalTasks={modalTasks}
        isAllTasksCompleted={isAllTasksCompleted}
        isAllTasksSuccess={isAllTasksSuccess}
        isProcessing={isProcessing}
        currentClientId={currentClientId}
        progressInfo={progressInfo}
        stopRender={stopRender}
      />
      <ConfirmModal
        showConfirmModal={showConfirmModal}
        setShowConfirmModal={setShowConfirmModal}
        pendingFileList={pendingItems}
        config={config}
        onConfirm={handleConfirmBatchProcess}
        onCancel={handleCancelConfirm}
      />
    </div>
  );
}

export default function App() {
  return (
    <ConfigProvider>
      <AntdConfigProvider
        theme={{
          token: {
            // 主色：苹果系统蓝
            colorPrimary: '#007AFF',
            colorInfo: '#007AFF',
            colorSuccess: '#34C759',
            colorWarning: '#FF9500',
            colorError: '#FF3B30',
            // 中性色
            colorText: '#1D1D1F',
            colorTextSecondary: '#6E6E73',
            colorTextPlaceholder: '#86868B',
            colorBorder: '#E5E5EA',
            colorBgLayout: '#F5F5F7',
            colorBgContainer: '#FFFFFF',
            // 圆角
            borderRadius: 10,
            borderRadiusLG: 12,
            borderRadiusSM: 6,
            // 字体
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'PingFang SC', 'Helvetica Neue', Arial, sans-serif",
            fontSize: 14,
            fontSizeSM: 12,
            fontSizeLG: 16,
            // 字重
            fontWeightStrong: 600,
            // 阴影
            boxShadow: '0 2px 8px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)',
            boxShadowSecondary: '0 1px 3px rgba(0,0,0,0.05)',
            // 动效
            motionDurationMid: '0.2s',
            motionDurationFast: '0.2s',
          },
          components: {
            Button: {
              controlHeight: 38,
              controlHeightLG: 48,
              fontWeight: 500,
              primaryShadow: '0 2px 8px rgba(0,122,255,0.18), 0 1px 3px rgba(0,122,255,0.10)',
              defaultBorderColor: '#E5E5EA',
              defaultBg: '#FFFFFF',
            },
            Card: {
              headerFontSize: 16,
              headerHeight: 48,
              paddingLG: 16,
            },
            Segmented: {
              itemSelectedBg: '#FFFFFF',
              itemSelectedColor: '#1D1D1F',
              trackBg: '#ECECF0',
            },
            Checkbox: {
              colorPrimary: '#007AFF',
              colorPrimaryHover: '#007AFF',
            },
            Slider: {
              trackBg: '#007AFF',
              handleColor: '#FFFFFF',
            },
            InputNumber: {
              borderColor: '#E5E5EA',
              hoverBorderColor: '#007AFF',
              activeBorderColor: '#007AFF',
            },
          },
        }}
      >
        <AntdApp>
          <AppContent />
        </AntdApp>
      </AntdConfigProvider>
    </ConfigProvider>
  );
}
