import React, { useState, useEffect } from 'react';
import { SystemConfig } from '../types.ts';
import { Save, Globe, Server, Bell, Target, Database } from 'lucide-react';

interface Props {
    config: SystemConfig;
    onSave: (newConfig: SystemConfig) => void;
}

const CURRENCIES = [
    { code: 'AUD', name: '澳元 (AUD)', defaultTarget: 4.66 },
    { code: 'USD', name: '美元 (USD)', defaultTarget: 7.15 },
    { code: 'EUR', name: '欧元 (EUR)', defaultTarget: 7.75 },
    { code: 'GBP', name: '英镑 (GBP)', defaultTarget: 9.0 },
    { code: 'JPY', name: '日元 (JPY)', defaultTarget: 0.047 },
    { code: 'HKD', name: '港币 (HKD)', defaultTarget: 0.91 },
];

export const AdminPage: React.FC<Props> = ({ config, onSave }) => {
    const [localConfig, setLocalConfig] = useState<SystemConfig>(config);
    const [isDirty, setIsDirty] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');

    useEffect(() => {
        setLocalConfig(config);
        setIsDirty(false);
    }, [config]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target as HTMLInputElement;

        if (name === 'currency') {
            const defaultTarget = CURRENCIES.find((currency) => currency.code === value)?.defaultTarget || 0;
            setLocalConfig((prev) => ({
                ...prev,
                currency: value,
                targetRate: defaultTarget
            }));
        } else {
            setLocalConfig((prev) => ({
                ...prev,
                [name]: type === 'number' ? Number(value) : value
            }));
        }

        setIsDirty(true);
        setSaveMessage('');
    };

    const handleSave = () => {
        onSave(localConfig);
        setIsDirty(false);
        setSaveMessage('配置已成功保存。');
        window.setTimeout(() => setSaveMessage(''), 3000);
    };

    return (
        <div className="space-y-4 md:space-y-6 max-w-4xl mx-auto pb-8 md:pb-12 animate-in fade-in duration-300">
            <div className="px-1">
                <h2 className="text-xl md:text-2xl font-bold text-white mb-1 md:mb-2">系统管理与配置</h2>
                <p className="text-gray-400 text-xs md:text-sm">当前版本仅连接真实后端服务，不再生成任何模拟汇率数据；历史采样会由后端持久化保存。</p>
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
                                前端会通过 `/api/rates` 从 Node.js 后端抓取中国银行官网实时汇率。
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                    <div>
                        <label className="block text-xs md:text-sm font-medium text-gray-400 mb-1.5 md:mb-2 flex items-center gap-1">
                            <Globe className="w-3 h-3 md:w-4 md:h-4" /> 监控币种
                        </label>
                        <select
                            name="currency"
                            value={localConfig.currency}
                            onChange={handleChange}
                            className="w-full bg-gray-950 border border-gray-700 rounded-lg py-2 md:py-2.5 px-3 md:px-4 text-sm md:text-base text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors appearance-none"
                        >
                            {CURRENCIES.map((currency) => (
                                <option key={currency.code} value={currency.code}>
                                    {currency.name}
                                </option>
                            ))}
                        </select>
                        <p className="text-[10px] md:text-xs text-gray-500 mt-1.5 md:mt-2">切换币种会清空当前会话内已采样的真实数据。</p>
                    </div>

                    <div>
                        <label className="block text-xs md:text-sm font-medium text-gray-400 mb-1.5 md:mb-2">目标汇率 (1 {localConfig.currency} = 人民币)</label>
                        <div className="relative">
                            <span className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm md:text-base">¥</span>
                            <input
                                type="number"
                                name="targetRate"
                                step="0.0001"
                                value={localConfig.targetRate}
                                onChange={handleChange}
                                className="w-full bg-gray-950 border border-gray-700 rounded-lg py-2 md:py-2.5 pl-8 md:pl-10 pr-3 md:pr-4 text-sm md:text-base text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                            />
                        </div>
                        <p className="text-[10px] md:text-xs text-gray-500 mt-1.5 md:mt-2">当抓取到的真实汇率 ≤ 此值时触发提醒。</p>
                    </div>

                    <div className="md:col-span-2">
                        <label className="block text-xs md:text-sm font-medium text-gray-400 mb-1.5 md:mb-2">检查间隔 (秒)</label>
                        <input
                            type="number"
                            name="checkIntervalSeconds"
                            min="5"
                            value={localConfig.checkIntervalSeconds}
                            onChange={handleChange}
                            className="w-full md:w-1/2 bg-gray-950 border border-gray-700 rounded-lg py-2 md:py-2.5 px-3 md:px-4 text-sm md:text-base text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                        />
                        <p className="text-[10px] md:text-xs text-gray-500 mt-1.5 md:mt-2">建议设置为 10 秒或更长，避免对源站产生过高请求频率。</p>
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
                        <p className="text-[10px] md:text-xs text-gray-500 mt-1.5 md:mt-2">用于发送到价提醒；若后端已配置环境变量，这里可以留空。</p>
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
                        <p className="text-[10px] md:text-xs text-gray-500 mt-1.5 md:mt-2">系统会优先发送到价提醒；同一错误只会在错误信息变化时再次通知。</p>
                    </div>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 md:gap-4 pt-2 md:pt-4">
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
