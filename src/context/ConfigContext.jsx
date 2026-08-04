import { createContext, useState, useEffect, useCallback, useContext } from 'react'

export const ConfigContext = createContext(null)
export const CONFIG_STORAGE_KEY = 'img_config_v1'
export const DEFAULT_CONFIG = {
  enableRemoveBg: true,
  enableRemoveWatermark: false,
  targetFormat: 'png',
  qualityType: 'preset',
  qualityPreset: '75',
  customQuality: '75',
  scaleType: 'preset',
  scalePreset: '100',
  customScale: '80',
}

function loadConfigFromStorage() {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_CONFIG }
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_CONFIG, ...parsed }
  } catch (e) {
    console.warn('读取本地配置失败:', e)
    return { ...DEFAULT_CONFIG }
  }
}

export function ConfigProvider({ children }) {
  const [config, setConfig] = useState(loadConfigFromStorage)

  useEffect(() => {
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config))
    } catch (e) {
      console.warn('写入本地配置失败:', e)
    }
  }, [config])

  const setConfigValue = useCallback((key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }))
  }, [])

  const toggleRemoveBg = useCallback(() => {
    setConfig(prev => ({ ...prev, enableRemoveBg: !prev.enableRemoveBg }))
  }, [])

  const toggleRemoveWatermark = useCallback(() => {
    setConfig(prev => ({ ...prev, enableRemoveWatermark: !prev.enableRemoveWatermark }))
  }, [])

  const value = { ...config, setConfig: setConfigValue, toggleRemoveBg, toggleRemoveWatermark }
  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>
}

export function useConfigStore() {
  const context = useContext(ConfigContext)
  if (!context) {
    throw new Error('useConfigStore must be used within ConfigProvider')
  }
  return context
}
