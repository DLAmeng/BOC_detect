import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SystemState, SystemConfig, RateData, AlertLog, MonitoredCurrencyConfig } from './types.ts';
import { DEFAULT_MONITORED_CURRENCIES } from './constants/currencies.ts';
import { fetchDashboardData, clearBackendAlerts, fetchRateHistory, fetchMonitorConfig, saveMonitorConfig } from './utils/api.ts';
import { DashboardCard } from './components/DashboardCard.tsx';
import { RateChart } from './components/RateChart.tsx';
import { CurrencyConverter } from './components/CurrencyConverter.tsx';
import { AdminPage } from './components/AdminPage.tsx';
import { AlertLogView } from './components/AlertLogView.tsx';
import {
    Activity,
    ShieldCheck,
    ServerCrash,
    LayoutDashboard,
    Settings,
    Eye,
    EyeOff,
    Clock
} from 'lucide-react';
import { format } from 'date-fns';

const INITIAL_CONFIG: SystemConfig = {
    monitoredCurrencies: DEFAULT_MONITORED_CURRENCIES,
    checkIntervalSeconds: 10,
    calculationWindowDays: 14,
    trendComparisonMinutes: 60,
    isRunning: true,
    webhookUrl: '',
    telegramBotToken: '',
    telegramChatId: ''
};

const STORAGE_KEY = 'boc_monitor_config';
const TZ_STORAGE_KEY = 'boc_monitor_timezone';

const TIMEZONES = [
    { value: 'auto', label: '🤖 自动 (本地)' },
    { value: 'Asia/Shanghai', label: '🇨🇳 北京 (UTC+8)' },
    { value: 'Australia/Sydney', label: '🇦🇺 悉尼 (UTC+10/11)' },
    { value: 'America/New_York', label: '🇺🇸 纽约 (UTC-5/4)' },
    { value: 'Europe/London', label: '🇬🇧 伦敦 (UTC+0/1)' },
    { value: 'Asia/Tokyo', label: '🇯🇵 东京 (UTC+9)' }
];

const loadConfigFromStorage = (): SystemConfig => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return INITIAL_CONFIG;
        const saved = JSON.parse(raw);
        return { ...INITIAL_CONFIG, ...saved, isRunning: true };
    } catch {
        return INITIAL_CONFIG;
    }
};

const MAX_HISTORY_POINTS = 10000;

const getCurrencyCodes = (monitoredCurrencies: MonitoredCurrencyConfig[]) =>
    monitoredCurrencies.map((item) => item.currency);

const syncRateMap = (
    source: Record<string, RateData | null>,
    monitoredCurrencies: MonitoredCurrencyConfig[]
) =>
    Object.fromEntries(
        getCurrencyCodes(monitoredCurrencies).map((currency) => [currency, source[currency] ?? null])
    );

const syncHistoryMap = (
    source: Record<string, RateData[]>,
    monitoredCurrencies: MonitoredCurrencyConfig[]
) =>
    Object.fromEntries(
        getCurrencyCodes(monitoredCurrencies).map((currency) => [currency, source[currency] ?? []])
    );

const syncErrorMap = (
    source: Record<string, string | null>,
    monitoredCurrencies: MonitoredCurrencyConfig[]
) =>
    Object.fromEntries(
        getCurrencyCodes(monitoredCurrencies).map((currency) => [currency, source[currency] ?? null])
    );

const syncAlertedRateMap = (
    source: Record<string, number | null>,
    monitoredCurrencies: MonitoredCurrencyConfig[]
) =>
    Object.fromEntries(
        getCurrencyCodes(monitoredCurrencies).map((currency) => [currency, source[currency] ?? null])
    );

const joinCurrencyCodes = (monitoredCurrencies: MonitoredCurrencyConfig[]) =>
    monitoredCurrencies.map((item) => item.currency).join(', ');

const getStatusClasses = (errorCount: number, totalCount: number) => {
    if (errorCount === 0) {
        return 'bg-green-900/20 border-green-500/30 text-green-400';
    }

    if (errorCount === totalCount) {
        return 'bg-red-900/20 border-red-500/30 text-red-400';
    }

    return 'bg-yellow-900/20 border-yellow-500/30 text-yellow-300';
};

const App: React.FC = () => {
    const initialConfig = loadConfigFromStorage();
    const [timezone, setTimezone] = useState<string>(() => {
        return localStorage.getItem(TZ_STORAGE_KEY) || 'auto';
    });

    // Pull-to-refresh state
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [pullDistance, setPullDistance] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const PULL_THRESHOLD = 80;

    const [state, setState] = useState<SystemState>({
        currentRates: syncRateMap({}, initialConfig.monitoredCurrencies),
        previousRates: syncRateMap({}, initialConfig.monitoredCurrencies),
        historyByCurrency: syncHistoryMap({}, initialConfig.monitoredCurrencies),
        alerts: [],
        config: initialConfig,
        lastErrors: syncErrorMap({}, initialConfig.monitoredCurrencies),
        lastAlertedRates: syncAlertedRateMap({}, initialConfig.monitoredCurrencies)
    });

    const [isConfigLoaded, setIsConfigLoaded] = useState(false);

    useEffect(() => {
        const loadBackendConfig = async () => {
            try {
                const backendConfig = await fetchMonitorConfig();
                
                setState((prev: SystemState) => ({
                    ...prev,
                    config: backendConfig,
                    currentRates: syncRateMap(prev.currentRates, backendConfig.monitoredCurrencies),
                    previousRates: syncRateMap(prev.previousRates, backendConfig.monitoredCurrencies),
                    historyByCurrency: syncHistoryMap(prev.historyByCurrency, backendConfig.monitoredCurrencies),
                    lastErrors: syncErrorMap(prev.lastErrors, backendConfig.monitoredCurrencies),
                    lastAlertedRates: syncAlertedRateMap(prev.lastAlertedRates, backendConfig.monitoredCurrencies)
                }));
                
                try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(backendConfig));
                } catch { /* ignore */ }
            } catch (error) {
                console.error('Failed to load config from backend, using localStorage fallback', error);
                // initialConfig is already in state, so we don't need to do anything else here
            } finally {
                setIsConfigLoaded(true);
            }
        };
        
        loadBackendConfig();
    }, []);

    const [isFetching, setIsFetching] = useState(false);
    const isFetchingRef = useRef(false);
    const [view, setView] = useState<'dashboard' | 'admin'>('dashboard');
    const [showLogs, setShowLogs] = useState(true);
    const [activeChartCurrency, setActiveChartCurrency] = useState(
        initialConfig.monitoredCurrencies[0]?.currency || ''
    );

    const stateRef = useRef(state);
    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state.config));
        } catch { /* ignore quota errors */ }
    }, [state.config]);

    useEffect(() => {
        localStorage.setItem(TZ_STORAGE_KEY, timezone);
    }, [timezone]);

    useEffect(() => {
        const monitoredCurrencies = state.config.monitoredCurrencies;
        if (monitoredCurrencies.length === 0) {
            setActiveChartCurrency('');
            return;
        }

        if (!monitoredCurrencies.some((item: MonitoredCurrencyConfig) => item.currency === activeChartCurrency)) {
            setActiveChartCurrency(monitoredCurrencies[0].currency);
        }
    }, [state.config.monitoredCurrencies, activeChartCurrency]);

    const initialLoadedRef = useRef<Set<string>>(new Set());
    useEffect(() => {
        state.config.monitoredCurrencies.forEach(async (cfg: MonitoredCurrencyConfig) => {
            if (initialLoadedRef.current.has(cfg.currency)) return;
            initialLoadedRef.current.add(cfg.currency);
            try {
                const history = await fetchRateHistory(cfg.currency, 10000);
                if (history.length === 0) return;
                const latest = history[history.length - 1];
                setState((prev: SystemState) => {
                    if (!prev.config.monitoredCurrencies.some((item: MonitoredCurrencyConfig) => item.currency === cfg.currency)) {
                        return prev;
                    }
                    const existingHistory = prev.historyByCurrency[cfg.currency] ?? [];
                    const mergedHistory = existingHistory.length > 0 ? existingHistory : history.slice(-MAX_HISTORY_POINTS);
                    const shouldSetCurrent = !prev.currentRates[cfg.currency];
                    return {
                        ...prev,
                        currentRates: shouldSetCurrent
                            ? { ...prev.currentRates, [cfg.currency]: latest }
                            : prev.currentRates,
                        historyByCurrency: { ...prev.historyByCurrency, [cfg.currency]: mergedHistory }
                    };
                });
            } catch {
                initialLoadedRef.current.delete(cfg.currency);
            }
        });
    }, [state.config.monitoredCurrencies]);

    const runCheck = useCallback(async () => {
        const currentState = stateRef.current;
        const monitoredCurrencies = currentState.config.monitoredCurrencies;

        if (!currentState.config.isRunning || isFetchingRef.current || monitoredCurrencies.length === 0) {
            return;
        }

        isFetchingRef.current = true;
        setIsFetching(true);

        try {
            const data = await fetchDashboardData();
            
            const nextCurrentRates: Record<string, RateData | null> = {};
            const nextPreviousRates: Record<string, RateData | null> = {};
            
            Object.entries(data.rates).forEach(([code, item]) => {
                nextCurrentRates[code] = item.current;
                nextPreviousRates[code] = item.previous;
            });

            setState((prev: SystemState) => {
                const liveCurrencies = prev.config.monitoredCurrencies;
                
                // Keep history updated by appending new points
                const updatedHistory = { ...prev.historyByCurrency };
                Object.entries(nextCurrentRates).forEach(([code, currentRate]) => {
                    if (!currentRate) return;
                    const history = updatedHistory[code] || [];
                    const lastHistory = history[history.length - 1];
                    
                    // Only append if it's a new timestamp to prevent redundant points
                    if (!lastHistory || lastHistory.fetchTimestampMs !== currentRate.fetchTimestampMs) {
                        updatedHistory[code] = [...history, currentRate].slice(-MAX_HISTORY_POINTS);
                    }
                });

                return {
                    ...prev,
                    currentRates: syncRateMap(nextCurrentRates, liveCurrencies),
                    previousRates: syncRateMap(nextPreviousRates, liveCurrencies),
                    historyByCurrency: syncHistoryMap(updatedHistory, liveCurrencies),
                    alerts: (data.alerts || []).slice(0, 200),
                    lastErrors: syncErrorMap({}, liveCurrencies)
                };
            });
        } catch (error: any) {
            console.error('[Frontend] runCheck failed:', error);
        } finally {
            isFetchingRef.current = false;
            setIsFetching(false);
        }
    }, []);

    useEffect(() => {
        let intervalId: number | undefined;

        if (state.config.isRunning) {
            runCheck();
            intervalId = window.setInterval(runCheck, Number(state.config.checkIntervalSeconds) * 1000);
        }

        return () => {
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    }, [state.config.isRunning, state.config.checkIntervalSeconds, runCheck]);

    const handleSaveConfig = async (newConfig: SystemConfig) => {
        try {
            const oldWindow = state.config.calculationWindowDays;
            const savedConfig = await saveMonitorConfig(newConfig);
            
            console.log(`[Frontend Debug] Config saved. WindowDays: ${oldWindow} -> ${savedConfig.calculationWindowDays}`);

            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(savedConfig));
            } catch { /* ignore */ }

            setState((prev: SystemState) => {
                const previousCodes = joinCurrencyCodes(prev.config.monitoredCurrencies);
                const nextCodes = joinCurrencyCodes(savedConfig.monitoredCurrencies);
                const didCurrencyListChange = previousCodes !== nextCodes;

                const alerts = didCurrencyListChange
                    ? [
                          {
                              id: Math.random().toString(36).substring(2, 9),
                              type: 'info' as const,
                              timestamp: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
                              read: false,
                              message: `[系统提示] 已更新监控币种：${nextCodes}。新增币种将开始独立抓取，移除的币种将停止监控。`
                          },
                          ...prev.alerts
                      ].slice(0, 150)
                    : prev.alerts;

                return {
                    ...prev,
                    config: savedConfig,
                    alerts,
                    currentRates: syncRateMap(prev.currentRates, savedConfig.monitoredCurrencies),
                    previousRates: syncRateMap(prev.previousRates, savedConfig.monitoredCurrencies),
                    historyByCurrency: syncHistoryMap(prev.historyByCurrency, savedConfig.monitoredCurrencies),
                    lastErrors: syncErrorMap(prev.lastErrors, savedConfig.monitoredCurrencies),
                    lastAlertedRates: syncAlertedRateMap(prev.lastAlertedRates, savedConfig.monitoredCurrencies)
                };
            });
        } catch (error: any) {
            alert(`保存配置失败: ${error?.message || '未知错误'}`);
            throw error; // Re-throw so the AdminPage component knows it failed
        }
    };

    const handleClearAlerts = async () => {
        try {
            await clearBackendAlerts();
            setState((prev: SystemState) => ({ ...prev, alerts: [] }));
        } catch (error: any) {
            alert('清空后端告警失败');
        }
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (window.scrollY === 0) {
            setTouchStart(e.touches[0].clientY);
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (touchStart !== null && window.scrollY === 0) {
            const currentTouch = e.touches[0].clientY;
            const distance = currentTouch - touchStart;
            if (distance > 0) {
                setPullDistance(Math.min(distance, PULL_THRESHOLD + 20));
                // Prevent scrolling when pulling
                if (distance > 10 && e.cancelable) {
                    e.preventDefault();
                }
            }
        }
    };

    const handleTouchEnd = () => {
        if (pullDistance >= PULL_THRESHOLD) {
            setIsRefreshing(true);
            // Wait for a small delay to show the refresh status then reload
            setTimeout(() => {
                window.location.reload();
            }, 500);
        }
        setTouchStart(null);
        setPullDistance(0);
    };

    const monitoredCurrencies = state.config.monitoredCurrencies;
    const activeChartConfig =
        monitoredCurrencies.find((item: MonitoredCurrencyConfig) => item.currency === activeChartCurrency) ?? monitoredCurrencies[0];
    const activeErrorCount = monitoredCurrencies.filter((item: MonitoredCurrencyConfig) => state.lastErrors[item.currency]).length;
    const statusClasses = getStatusClasses(activeErrorCount, monitoredCurrencies.length);

    const statusLabel =
        activeErrorCount === 0
            ? `监控中 (${monitoredCurrencies.length} 个币种)`
            : activeErrorCount === monitoredCurrencies.length
              ? `全部异常 (${activeErrorCount}/${monitoredCurrencies.length})`
              : `部分异常 (${activeErrorCount}/${monitoredCurrencies.length})`;

    return (
        <div 
            className="min-h-screen p-3 sm:p-4 md:p-8 max-w-7xl mx-auto relative"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* Pull to refresh indicator */}
            <div 
                className={`fixed top-0 left-0 right-0 flex justify-center items-center pointer-events-none z-50 transition-all duration-200 ${
                    pullDistance > 0 || isRefreshing ? 'opacity-100' : 'opacity-0'
                }`}
                style={{ height: `${Math.max(pullDistance, isRefreshing ? 50 : 0)}px` }}
            >
                <div className="bg-blue-600 text-white px-4 py-1.5 rounded-full text-xs font-medium shadow-lg flex items-center gap-2 animate-bounce">
                    <Clock className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    {isRefreshing ? '正在刷新页面...' : pullDistance >= PULL_THRESHOLD ? '松开即可刷新' : '下拉刷新新功能'}
                </div>
            </div>

            <header className="mb-6 md:mb-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 md:mb-6">
                    <div>
                        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white flex items-center gap-2 md:gap-3">
                            <Activity className="w-6 h-6 md:w-8 md:h-8 text-blue-500 flex-shrink-0" />
                            <span className="truncate">中国银行多币种汇率监控</span>
                        </h1>
                        <p className="text-gray-400 mt-1.5 text-xs sm:text-sm flex items-center flex-wrap gap-2">
                            自动化汇率追踪与报警系统
                            <span className="px-2 py-0.5 rounded text-[10px] sm:text-xs font-medium bg-blue-900/50 text-blue-300">
                                同时监控 {monitoredCurrencies.length} 个币种
                            </span>
                        </p>
                        <p className="text-[10px] sm:text-xs text-gray-500 mt-2">
                            当前监控列表：{joinCurrencyCodes(monitoredCurrencies)}
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full md:w-auto">
                        <div className="relative flex items-center bg-gray-900 border border-gray-700 rounded-full px-3 py-1.5 transition-colors focus-within:border-blue-500/50">
                            <Clock className="w-3.5 h-3.5 text-gray-400 mr-2" />
                            <select
                                value={timezone}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTimezone(e.target.value)}
                                className="bg-transparent text-xs text-gray-300 focus:outline-none cursor-pointer appearance-none pr-4"
                            >
                                {TIMEZONES.map(tz => (
                                    <option key={tz.value} value={tz.value} className="bg-gray-900 text-gray-300">
                                        {tz.label}
                                    </option>
                                ))}
                            </select>
                            <div className="absolute right-3 pointer-events-none border-t-2 border-r-2 border-gray-500 w-1.5 h-1.5 rotate-[135deg] mt-[-3px]"></div>
                        </div>

                        <div className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border text-xs sm:text-sm ${statusClasses}`}>
                            {activeErrorCount === 0 ? (
                                <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                            ) : (
                                <ServerCrash className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                            )}
                            <span className="font-medium truncate">{statusLabel}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between border-b border-gray-800 overflow-x-auto no-scrollbar">
                    <div className="flex flex-nowrap">
                        <button
                            onClick={() => setView('dashboard')}
                            className={`flex items-center gap-2 px-4 sm:px-6 py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                                view === 'dashboard'
                                    ? 'border-blue-500 text-blue-400'
                                    : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-700'
                            }`}
                        >
                            <LayoutDashboard className="w-4 h-4" />
                            仪表盘 (Dashboard)
                        </button>
                        <button
                            onClick={() => setView('admin')}
                            className={`flex items-center gap-2 px-4 sm:px-6 py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                                view === 'admin'
                                    ? 'border-blue-500 text-blue-400'
                                    : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-700'
                            }`}
                        >
                            <Settings className="w-4 h-4" />
                            管理设置 (Admin)
                        </button>
                    </div>

                    {view === 'dashboard' && (
                        <button
                            onClick={() => setShowLogs(!showLogs)}
                            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-gray-400 hover:text-gray-200 transition-colors whitespace-nowrap flex-shrink-0"
                            title={showLogs ? '隐藏通知日志' : '显示通知日志'}
                        >
                            {showLogs ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            <span className="hidden sm:inline">{showLogs ? '隐藏日志' : '显示日志'}</span>
                        </button>
                    )}
                </div>
            </header>

            {view === 'dashboard' ? (
                <div className="animate-in fade-in duration-300">
                    {monitoredCurrencies.length === 0 ? (
                        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-400">
                            请先在管理设置中选择至少一个要监控的币种。
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">
                            <div
                                className={`space-y-4 md:space-y-6 transition-all duration-300 ${
                                    showLogs ? 'lg:col-span-8' : 'lg:col-span-12'
                                }`}
                            >
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6">
                                    {monitoredCurrencies.map((currencyConfig: MonitoredCurrencyConfig) => (
                                        <DashboardCard
                                            key={currencyConfig.currency}
                                            currentRate={state.currentRates[currencyConfig.currency] ?? null}
                                            previousRate={state.previousRates[currencyConfig.currency] ?? null}
                                            currency={currencyConfig.currency}
                                            isActive={activeChartConfig?.currency === currencyConfig.currency}
                                            onSelect={() => setActiveChartCurrency(currencyConfig.currency)}
                                            timezone={timezone}
                                        />
                                    ))}
                                </div>

                                {activeChartConfig && (
                                    <>
                                        <CurrencyConverter
                                            currentRate={state.currentRates[activeChartConfig.currency] ?? null}
                                            previousRate={state.previousRates[activeChartConfig.currency] ?? null}
                                            currency={activeChartConfig.currency}
                                            trendComparisonMinutes={Number(state.config.trendComparisonMinutes)}
                                        />
                                        <RateChart
                                            history={state.historyByCurrency[activeChartConfig.currency] ?? []}
                                            currency={activeChartConfig.currency}
                                            windowDays={Number(state.config.calculationWindowDays)}
                                            targetRate={activeChartConfig.targetRate !== undefined ? Number(activeChartConfig.targetRate) : undefined}
                                            timezone={timezone}
                                        />
                                    </>
                                )}
                            </div>

                            {showLogs && (
                                <div className="lg:col-span-4 space-y-4 md:space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <AlertLogView
                                        alerts={state.alerts}
                                        onClear={handleClearAlerts}
                                        timezone={timezone}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                <AdminPage config={state.config} onSave={handleSaveConfig} />
            )}

            <footer className="mt-8 md:mt-12 text-center text-gray-600 text-xs pb-6 md:pb-8">
                <p>BOC Monitor Dashboard • {new Date().getFullYear()}</p>
            </footer>
        </div>
    );
};

export default App;
