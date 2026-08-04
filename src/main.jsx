import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import 'antd/dist/reset.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1280FF',
          colorInfo: '#1280FF',
          colorSuccess: '#34c759',
          colorError: '#ff3b30',
          colorWarning: '#ff9500',
          colorText: '#1d1d1f',
          colorTextSecondary: '#86868b',
          colorBgContainer: '#ffffff',
          colorBgLayout: '#f2f2f7',
          borderRadius: 12,
          borderRadiusLG: 16,
          borderRadiusSM: 10,
          fontFamily: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", Arial, sans-serif`,
          fontSize: 14,
          controlHeight: 32,
          controlHeightSM: 28,
          controlHeightLG: 40,
          wireframe: false,
        },
        components: {
          Tabs: {
            itemColor: '#86868b',
            itemHoverColor: '#1d1d1f',
            itemSelectedColor: '#1d1d1f',
            inkBarColor: '#1280FF',
          },
          Switch: { colorPrimary: '#34c759' },
          Button: { primaryShadow: 'none', defaultShadow: 'none' },
          Checkbox: { borderRadiusSM: 4, wireframe: false },
        },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>,
);
