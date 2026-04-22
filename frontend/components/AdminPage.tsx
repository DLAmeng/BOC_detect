import React, { useState, useEffect } from 'react';
import { SystemConfig } from '../types.ts';
import { AVAILABLE_CURRENCIES, buildCurrencyConfig } from '../constants/currencies.ts';
import { sendTelegramNotifications } from '../utils/api.ts';
import { Save, CheckSquare, Square, Bell, Target, Send } from 'lucide-react';

interface Props {
    config: SystemConfig;
    onSave: (newConfig: SystemConfig) => Promise<void> | void;
}

const sortCurrencyConfigs = (currencies: SystemConfig['monitoredCurrencies']) =>
    [...currencies].sort((left, right) => {
        const leftIndex = AVAILABLE_CURRENCIES.findIndex((item) => item.code === left.currency);
        const rightIndex = AVAILABLE_CURRENCIES.findIndex((item) => item.code === right.currency);
        return leftIndex - rightIndex;
    });

export const AdminPage: React.FC<Props> = ({ config, onSave }) => {
    const [localConfig, setLocalConfig] = useState<SystemConfig>(config);
    const [isDirty, setIsDirty] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');
    const [validationMessage, setValidationMessage] = useState('');
    const [testSending, setTestSending] = useState(false);
    const [testResult, setTestResult] = useState<{ type: 'success' | 'warn' | 'error'; text: string } | null>(null);

    useEffect(() => {
        setLocalConfig(config);
        setIsDirty(false);
        setValidationMessage('');
    }, [config]);


    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type } = e.target;

        setLocalConfig((prev) => ({
            ...prev,
            [name]: type === 'number' ? Number(value) : value
        }));

        setIsDirty(true);
        setSaveMessage('');
        setValidationMessage('');
    };

    const handleToggleCurrency = (currencyCode: string) => {
        setLocalConfig((prev) => {
            const exists = prev.monitoredCurrencies.some((item) => item.currency === currencyCode);

            const monitoredCurrencies = exists
                ? prev.monitoredCurrencies.filter((item) => item.currency !== currencyCode)
                : sortCurrencyConfigs([...prev.monitoredCurrencies, buildCurrencyConfig(currencyCode)]);

            return {
                ...prev,
                monitoredCurrencies
            };
        });

        setIsDirty(true);
        setSaveMessage('');
        setValidationMessage('');
    };


    const handleTestTelegram = async () => {
        setTestSending(true);
        setTestResult(null);
        try {
            const result = await sendTelegramNotifications({
                messages: ['[BOC 测试] Telegram 连接正常 ✓'],
                botToken: localConfig.telegramBotToken,
                chatId: localConfig.telegramChatId
            });
            if (result.skipped) {
                setTestResult({ type: 'warn', text: '未配置 Token 或 Chat ID，无法发送。' });
            } else if (result.success) {
                setTestResult({ type: 'success', text: '测试消息已发送，请查看 Telegram。' });
            } else {
                setTestResult({ type: 'error', text: result.reason || '发送失败' });
            }
        } catch (error: any) {
            setTestResult({ type: 'error', text: error?.message || '发送失败' });
        } finally {
            setTestSending(false);
        }
    };

    const handleSave = async () => {
        if (localConfig.monitoredCurrencies.length === 0) {
            setValidationMessage('请至少选择一个要监控的币种。');
            return;
        }

        try {
            await onSave({
                ...localConfig,
                monitoredCurrencies: sortCurrencyConfigs(localConfig.monitoredCurrencies)
            });
            setIsDirty(false);
            setSaveMessage('配置已成功保存。');
            setValidationMessage('');
            window.setTimeout(() => setSaveMessage(''), 3000);
        } catch (error) {
            // App.tsx has handled the alert, so we don't need to do anything here except console log
            console.error('Save failed', error);
            setValidationMessage('保存配置到服务器失败，请重试');
        }
    };

    return (
        <div className="space-y-4 md:space-y-6 max-w-5xl mx-auto pb-8 md:pb-12 animate-in fade-in duration-300">
            <div className="px-1">
                <h2 className="text-xl md:text-2xl font-bold text-white mb-1 md:mb-2">系统管理与配置</h2>
                <p className="text-gray-400 text-xs md:text-sm">当前版本支持同时监控多种货币；每个币种都有自己的目标价和独立告警状态。</p>
            </div>


            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-6 shadow-sm">
                <h3 className="text-base md:text-lg font-semibold text-white flex items-center gap-2 mb-4 md:mb-6 pb-3 md:pb-4 border-b border-gray-800">
                    <Target className="w-4 h-4 md:w-5 md:h-5 text-green-400" />
                    监控目标设置
                </h3>

                <div className="space-y-6">
                    <div>
                        <label className="block text-xs md:text-sm font-medium text-gray-400 mb-3">选择要同时监控的币种</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {AVAILABLE_CURRENCIES.map((currency) => {
                                const selected = localConfig.monitoredCurrencies.some((item) => item.currency === currency.code);

                                return (
                                    <button
                                        key={currency.code}
                                        type="button"
                                        onClick={() => handleToggleCurrency(currency.code)}
                                        className={`rounded-xl border p-4 text-left transition-colors ${
                                            selected
                                                ? 'bg-blue-500/10 border-blue-500/40 text-blue-100'
                                                : 'bg-gray-950 border-gray-800 text-gray-300 hover:border-gray-700'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-medium">{currency.name}</p>
                                            </div>
                                            {selected ? (
                                                <CheckSquare className="w-5 h-5 text-blue-400 flex-shrink-0" />
                                            ) : (
                                                <Square className="w-5 h-5 text-gray-600 flex-shrink-0" />
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        <p className="text-[10px] md:text-xs text-gray-500 mt-2">建议只勾选你真正需要的币种，减少对源站的请求压力。</p>
                    </div>


                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs md:text-sm font-medium text-gray-400 mb-1.5 md:mb-2">检查间隔 (秒)</label>
                            <input
                                type="number"
                                name="checkIntervalSeconds"
                                min="5"
                                value={localConfig.checkIntervalSeconds}
                                onChange={handleChange}
                                className="w-full bg-gray-950 border border-gray-700 rounded-lg py-2 md:py-2.5 px-3 md:px-4 text-sm md:text-base text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                            />
                            <p className="text-[10px] md:text-xs text-gray-500 mt-1.5 md:mt-2">建议设置为 10 秒或更长。</p>
                        </div>
                        <div>
                            <label className="block text-xs md:text-sm font-medium text-gray-400 mb-1.5 md:mb-2">计算窗口天数</label>
                            <input
                                type="number"
                                name="calculationWindowDays"
                                min="1"
                                max="365"
                                value={localConfig.calculationWindowDays}
                                onChange={handleChange}
                                className="w-full bg-gray-950 border border-gray-700 rounded-lg py-2 md:py-2.5 px-3 md:px-4 text-sm md:text-base text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                            />
                            <p className="text-[10px] md:text-xs text-gray-500 mt-1.5 md:mt-2">用于动态百分位算法计算 Best/Good 区间的历史窗口（默认 14 天）。</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-6 shadow-sm">
                <h3 className="text-base md:text-lg font-semibold text-white flex items-center gap-2 mb-4 md:mb-6 pb-3 md:pb-4 border-b border-gray-800">
                    <Bell className="w-4 h-4 md:w-5 md:h-5 text-purple-400" />
                    通知设置 (Telegram)
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                    <div>
                        <label className="block text-xs md:text-sm font-medium text-gray-400 mb-1.5 md:mb-2">Telegram 机器人 Token</label>
                        <input
                            type="password"
                            name="telegramBotToken"
                            value={localConfig.telegramBotToken}
                            onChange={handleChange}
                            placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                            className="w-full bg-gray-950 border border-gray-700 rounded-lg py-2 md:py-2.5 px-3 md:px-4 text-sm md:text-base text-white focus:outline-none focus:border-blue-500 transition-colors"
                        />
                        <p className="text-[10px] md:text-xs text-gray-500 mt-1.5 md:mt-2">用于发送多币种到价提醒；若后端已配置环境变量，这里可以留空。</p>
                    </div>
                    <div>
                        <label className="block text-xs md:text-sm font-medium text-gray-400 mb-1.5 md:mb-2">Telegram 聊天 ID</label>
                        <input
                            type="text"
                            name="telegramChatId"
                            value={localConfig.telegramChatId}
                            onChange={handleChange}
                            placeholder="@mychannel 或 123456789"
                            className="w-full bg-gray-950 border border-gray-700 rounded-lg py-2 md:py-2.5 px-3 md:px-4 text-sm md:text-base text-white focus:outline-none focus:border-blue-500 transition-colors"
                        />
                        <p className="text-[10px] md:text-xs text-gray-500 mt-1.5 md:mt-2">多个币种在同一轮触发时会分别发送对应消息；异常通知仍会去重。</p>
                    </div>
                </div>

                <div className="mt-4 md:mt-5 flex flex-col sm:flex-row sm:items-center gap-3">
                    <button
                        type="button"
                        onClick={handleTestTelegram}
                        disabled={testSending}
                        className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs md:text-sm font-medium transition-colors border ${
                            testSending
                                ? 'bg-gray-800 text-gray-500 border-gray-800 cursor-not-allowed'
                                : 'bg-purple-500/10 text-purple-300 border-purple-500/30 hover:bg-purple-500/20'
                        }`}
                    >
                        <Send className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        {testSending ? '发送中…' : '发送测试消息'}
                    </button>
                    {testResult && (
                        <span
                            className={`text-xs md:text-sm font-medium ${
                                testResult.type === 'success'
                                    ? 'text-green-400'
                                    : testResult.type === 'warn'
                                      ? 'text-yellow-300'
                                      : 'text-red-400'
                            }`}
                        >
                            {testResult.text}
                        </span>
                    )}
                </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 md:gap-4 pt-2 md:pt-4">
                {validationMessage && <span className="text-red-400 text-xs md:text-sm font-medium">{validationMessage}</span>}
                {saveMessage && <span className="text-green-400 text-xs md:text-sm font-medium animate-in fade-in">{saveMessage}</span>}
                <button
                    onClick={handleSave}
                    disabled={!isDirty}
                    className={`w-full sm:w-auto flex items-center justify-center gap-2 px-6 md:px-8 py-2.5 md:py-3 rounded-lg text-sm md:text-base font-medium transition-all ${
                        isDirty
                            ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-900/20'
                            : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                    }`}
                >
                    <Save className="w-4 h-4 md:w-5 md:h-5" />
                    保存所有配置
                </button>
            </div>
        </div>
    );
};
