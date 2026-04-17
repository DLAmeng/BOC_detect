import React, { useState, useEffect } from 'react';
import { SystemConfig } from '../types.ts';
import { AVAILABLE_CURRENCIES, buildCurrencyConfig } from '../constants/currencies.ts';
import { Save, CheckSquare, Square, Server, Bell, Target, Database } from 'lucide-react';

interface Props {
    config: SystemConfig;
    onSave: (newConfig: SystemConfig) => void;
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

    const handleTargetRateChange = (currencyCode: string, targetRate: number) => {
        setLocalConfig((prev) => ({
            ...prev,
            monitoredCurrencies: prev.monitoredCurrencies.map((item) =>
                item.currency === currencyCode ? { ...item, targetRate } : item
            )
        }));

        setIsDirty(true);
        setSaveMessage('');
        setValidationMessage('');
    };

    const handleSave = () => {
        if (localConfig.monitoredCurrencies.length === 0) {
            setValidationMessage('请至少选择一个要监控的币种。');
            return;
        }

        onSave({
            ...localConfig,
            monitoredCurrencies: sortCurrencyConfigs(localConfig.monitoredCurrencies)
        });
        setIsDirty(false);
        setSaveMessage('配置已成功保存。');
        setValidationMessage('');
        window.setTimeout(() => setSaveMessage(''), 3000);
    };

    return (
        <div className="space-y-4 md:space-y-6 max-w-5xl mx-auto pb-8 md:pb-12 animate-in fade-in duration-300">
            <div className="px-1">
                <h2 className="text-xl md:text-2xl font-bold text-white mb-1 md:mb-2">系统管理与配置</h2>
                <p className="text-gray-400 text-xs md:text-sm">当前版本支持同时监控多种货币；每个币种都有自己的目标价和独立告警状态。</p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-6 shadow-sm">
                <h3 className="text-base md:text-lg font-semibold text-white flex items-center gap-2 mb-4 md:mb-6 pb-3 md:pb-4 border-b border-gray-800">
                    <Database className="w-4 h-4 md:w-5 md:h-5 text-blue-400" />
                    数据源设置
                </h3>

                <div className="bg-gray-950 p-4 md:p-5 rounded-lg border border-gray-800">
                    <div className="flex items-center gap-3 md:gap-4">
                        <div className="p-2 md:p-3 rounded-lg bg-blue-900/30">
                            <Server className="w-5 h-5 md:w-6 md:h-6 text-blue-400" />
                        </div>
                        <div>
                            <p className="text-sm md:text-base font-medium text-gray-200">真实后端模式</p>
                            <p className="text-[10px] md:text-sm text-gray-500 mt-0.5 md:mt-1">
                                前端会按选中的币种逐个请求 `/api/rates`，从 Node.js 后端抓取中国银行官网实时汇率。
                            </p>
                        </div>
                    </div>
                </div>
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
                                                <p className="text-[10px] text-gray-500 mt-1">默认目标价 ¥{currency.defaultTarget.toFixed(4)}</p>
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

                    <div>
                        <label className="block text-xs md:text-sm font-medium text-gray-400 mb-3">每个币种的目标汇率</label>
                        {localConfig.monitoredCurrencies.length === 0 ? (
                            <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4 text-sm text-red-300">
                                请先选择至少一个监控币种。
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {localConfig.monitoredCurrencies.map((currencyConfig) => (
                                    <div key={currencyConfig.currency} className="bg-gray-950 border border-gray-800 rounded-lg p-4">
                                        <label className="block text-xs md:text-sm font-medium text-gray-300 mb-2">
                                            目标汇率 (1 {currencyConfig.currency} = 人民币)
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">¥</span>
                                            <input
                                                type="number"
                                                step="0.0001"
                                                value={currencyConfig.targetRate}
                                                onChange={(event) => handleTargetRateChange(currencyConfig.currency, Number(event.target.value))}
                                                className="w-full bg-gray-900 border border-gray-700 rounded-lg py-2.5 pl-8 pr-3 text-sm md:text-base text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                                            />
                                        </div>
                                        <p className="text-[10px] md:text-xs text-gray-500 mt-2">当 {currencyConfig.currency} 的真实汇率 ≤ 此值时触发提醒。</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-xs md:text-sm font-medium text-gray-400 mb-1.5 md:mb-2">检查间隔 (秒)</label>
                        <input
                            type="number"
                            name="checkIntervalSeconds"
                            min="5"
                            value={localConfig.checkIntervalSeconds}
                            onChange={handleChange}
                            className="w-full md:w-1/2 bg-gray-950 border border-gray-700 rounded-lg py-2 md:py-2.5 px-3 md:px-4 text-sm md:text-base text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                        />
                        <p className="text-[10px] md:text-xs text-gray-500 mt-1.5 md:mt-2">同一轮询周期内会按选中币种逐个抓取，建议设置为 10 秒或更长。</p>
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
