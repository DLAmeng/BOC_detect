import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SystemState, SystemConfig, RateData } from './types.ts';
import { fetchRealRate } from './utils/api.ts';
import { processRateData, createErrorAlert } from './utils/alertLogic.ts';
import { DashboardCard } from './components/DashboardCard.tsx';
import { RateChart } from './components/RateChart.tsx';
import { AdminPage } from './components/AdminPage.tsx';
import { AlertLogView } from './components/AlertLogView.tsx';
import { ArchitectureDocs } from './components/ArchitectureDocs.tsx';
import {
    Activity,
    ShieldCheck,
    ShieldAlert,
    ServerCrash,
    Play,
    Square,
    LayoutDashboard,
    Settings,
    Eye,
    EyeOff
} from 'lucide-react';
import { format } from 'date-fns';

const INITIAL_CONFIG: SystemConfig = {
    currency: 'AUD',
    targetRate: 4.66,
    checkIntervalSeconds: 10,
    isRunning: false,
    webhookUrl: '',
    telegramBotToken: '',
    telegramChatId: ''
};

const MAX_HISTORY_POINTS = 2000;

const App: React.FC = () => {
    const [state, setState] = useState<SystemState>({
        currentRate: null,
        previousRate: null,
        history: [],
        alerts: [],
        config: INITIAL_CONFIG,
        lastError: null,
        lastAlertedRate: null
    });

    const [isFetching, setIsFetching] = useState(false);
    const [view, setView] = useState<'dashboard' | 'admin'>('dashboard');
    const [showLogs, setShowLogs] = useState(true);

    const stateRef = useRef(state);
    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    const runCheck = useCallback(async () => {
        const currentState = stateRef.current;
        if (!currentState.config.isRunning || isFetching) {
            return;
        }

        setIsFetching(true);
        try {
            const newRateData: RateData = await fetchRealRate(currentState.config.currency);

            const { alerts, updatedLastAlertedRate } = processRateData(
                newRateData,
                currentState.currentRate,
                currentState.config,
                currentState.lastAlertedRate
            );

            setState((prev) => {
                const hasNewPoint =
                    newRateData.rawSellingRate !== prev.currentRate?.rawSellingRate ||
                    newRateData.pubTime !== prev.currentRate?.pubTime;
                const updatedHistory = hasNewPoint
                    ? [...prev.history, newRateData].slice(-MAX_HISTORY_POINTS)
                    : prev.history;

                return {
                    ...prev,
                    previousRate: hasNewPoint ? prev.currentRate : prev.previousRate,
                    currentRate: newRateData,
                    history: updatedHistory,
                    alerts: [...alerts, ...prev.alerts].slice(0, 100),
                    lastAlertedRate: updatedLastAlertedRate,
                    lastError: null
                };
            });
        } catch (error: any) {
            const message = error?.message || '未知错误';
            const errorAlert = createErrorAlert(currentState.config.currency, message);
            setState((prev) => ({
                ...prev,
                lastError: message,
                alerts: [errorAlert, ...prev.alerts].slice(0, 100)
            }));
        } finally {
            setIsFetching(false);
        }
    }, [isFetching]);

    useEffect(() => {
        let intervalId: number | undefined;

        if (state.config.isRunning) {
            runCheck();
            intervalId = window.setInterval(runCheck, state.config.checkIntervalSeconds * 1000);
        }

        return () => {
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    }, [state.config.isRunning, state.config.checkIntervalSeconds, runCheck]);

    const handleSaveConfig = (newConfig: SystemConfig) => {
        setState((prev) => {
            const isCurrencyChanged = prev.config.currency !== newConfig.currency;

            const newAlerts = isCurrencyChanged
                ? [
                      {
                          id: Math.random().toString(36).substring(2, 9),
                          type: 'info' as const,
                          timestamp: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
                          read: false,
                          message: `[系统提示] 已切换监控币种为 ${newConfig.currency}，历史数据已重置。`
                      },
                      ...prev.alerts
                  ].slice(0, 100)
                : prev.alerts;

            return {
                ...prev,
                config: newConfig,
                alerts: newAlerts,
                ...(isCurrencyChanged
                    ? {
                          currentRate: null,
                          previousRate: null,
                          history: [],
                          lastAlertedRate: null,
                          lastError: null
                      }
                    : {})
            };
        });
    };

    const handleToggleRun = () => {
        setState((prev) => ({
            ...prev,
            config: { ...prev.config, isRunning: !prev.config.isRunning }
        }));
    };

    const handleClearAlerts = () => {
        setState((prev) => ({ ...prev, alerts: [] }));
    };

    return (
        <div className="min-h-screen p-3 sm:p-4 md:p-8 max-w-7xl mx-auto">
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
                                真实后端
                            </span>
                        </p>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3 w-full md:w-auto justify-between md:justify-end">
                        <div
                            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border text-xs sm:text-sm ${
                                state.config.isRunning
                                    ? state.lastError
                                        ? 'bg-red-900/20 border-red-500/30 text-red-400'
                                        : 'bg-green-900/20 border-green-500/30 text-green-400'
                                    : 'bg-gray-800 border-gray-700 text-gray-400'
                            }`}
                        >
                            {!state.config.isRunning ? (
                                <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                            ) : state.lastError ? (
                                <ServerCrash className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                            ) : (
                                <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                            )}
                            <span className="font-medium truncate max-w-[120px] sm:max-w-none">
                                {!state.config.isRunning
                                    ? '已停止'
                                    : state.lastError
                                      ? '后端异常'
                                      : `监控中 (${state.config.currency})`}
                            </span>
                        </div>
                        <button
                            onClick={handleToggleRun}
                            className={`flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-medium text-xs sm:text-sm transition-colors flex-shrink-0 ${
                                state.config.isRunning
                                    ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20'
                                    : 'bg-green-500/10 text-green-500 hover:bg-green-500/20 border border-green-500/20'
                            }`}
                        >
                            {state.config.isRunning ? (
                                <>
                                    <Square className="w-3 h-3 sm:w-4 sm:h-4" /> 停止
                                </>
                            ) : (
                                <>
                                    <Play className="w-3 h-3 sm:w-4 sm:h-4" /> 启动
                                </>
                            )}
                        </button>
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
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">
                        <div
                            className={`space-y-4 md:space-y-6 transition-all duration-300 ${
                                showLogs ? 'lg:col-span-8' : 'lg:col-span-12'
                            }`}
                        >
                            <DashboardCard
                                currentRate={state.currentRate}
                                previousRate={state.previousRate}
                                targetRate={state.config.targetRate}
                                currency={state.config.currency}
                            />
                            <RateChart
                                history={state.history}
                                targetRate={state.config.targetRate}
                                currency={state.config.currency}
                            />
                        </div>

                        {showLogs && (
                            <div className="lg:col-span-4 space-y-4 md:space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                <AlertLogView alerts={state.alerts} onClear={handleClearAlerts} />
                            </div>
                        )}
                    </div>

                    <ArchitectureDocs />
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
