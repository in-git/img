import { Button, Progress, Tag } from 'antd';
import {
  FileImageOutlined,
  LoadingOutlined,
  CheckOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';

export default function ProgressModal({
  showProgressModal,
  setShowProgressModal,
  modalTasks,
  isAllTasksCompleted,
  isAllTasksSuccess,
  isProcessing,
  currentClientId,
  progressInfo,
  stopRender,
}) {
  if (!showProgressModal) return null;

  const percent =
    progressInfo.total > 0
      ? Math.round((progressInfo.current / progressInfo.total) * 100)
      : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/25 backdrop-blur-md apple-transition"
        onClick={() => {
          if (isAllTasksCompleted) setShowProgressModal(false);
        }}
      />
      <div className="relative bg-white/95 backdrop-blur-2xl rounded-3xl p-6 max-w-2xl w-full text-left apple-shadow-lg border border-black/[0.04] flex flex-col max-h-[85vh] z-10 apple-transition">
        <div className="flex items-center justify-between pb-4 border-b border-black/[0.05]">
          <div>
            <h3 className="text-[17px] font-semibold text-[#1d1d1f]">
              {isAllTasksCompleted
                ? (isAllTasksSuccess ? '渲染完成' : '处理结束 (含失败)')
                : '图像渲染中...'}
            </h3>
            <p className="text-[14px] text-[#86868b] mt-0.5">
              {isAllTasksSuccess
                ? `所有 ${modalTasks.length} 个文件均已成功处理完毕`
                : `包含 ${modalTasks.length} 个任务，正实时协同运算`}
            </p>
          </div>
          {isProcessing ? (
            <Button
              danger
              type="primary"
              
              onClick={() => stopRender(currentClientId)}
              title="停止渲染"
            >
              停止
            </Button>
          ) : (
            <Button
              
              onClick={() => setShowProgressModal(false)}
            >
              关闭
            </Button>
          )}
        </div>
        <div className="py-4 border-b border-black/[0.05]">
          <div className="flex justify-between items-center text-[14px] mb-1.5">
            <span className="text-[#86868b] truncate max-w-[280px]">
              {progressInfo.message || (isAllTasksCompleted ? '处理已结束' : '正在准备任务队列...')}
            </span>
            <span className="text-[#1d1d1f] font-medium ml-2">
              {progressInfo.total > 0 ? progressInfo.current : 0} / {progressInfo.total > 0 ? progressInfo.total : modalTasks.length}
            </span>
          </div>
          <Progress
            percent={percent}
            strokeColor="#1280FF"
            showInfo={false}
          />
        </div>
        <div className="flex-1 overflow-y-auto custom-scroll my-3 pr-1 space-y-2 min-h-[160px] max-h-[300px]">
          {modalTasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between p-3 rounded-xl bg-[#f5f5f7]/60 hover:bg-[#f5f5f7] apple-transition text-[14px]"
            >
              <div className="flex items-center gap-2.5 truncate mr-3">
                <FileImageOutlined style={{ fontSize: 16, color: '#86868b', flexShrink: 0 }} />
                <span className="text-[#1d1d1f] truncate" title={task.file.name}>
                  {task.file.name}
                </span>
              </div>
              <div className="flex-shrink-0 flex items-center gap-1.5">
                {task.status === 'waiting' && (
                  <Tag>等待中</Tag>
                )}
                {task.status === 'processing' && (
                  <Tag color="processing" icon={<LoadingOutlined spin />}>处理中</Tag>
                )}
                {task.status === 'done' && (
                  <Tag color="success" icon={<CheckOutlined />}>成功</Tag>
                )}
                {task.status === 'error' && (
                  <Tag color="error" icon={<ExclamationCircleOutlined />} title={task.errorMessage}>失败</Tag>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="pt-3 border-t border-black/[0.05]">
          <Button
            type="primary"
            block
            onClick={() => setShowProgressModal(false)}
          >
            关闭
          </Button>
        </div>
      </div>
    </div>
  );
}
