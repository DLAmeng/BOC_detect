import React from 'react';
import { AlertLog } from '../types.ts';
import { Bell, AlertTriangle, Info, CheckCircle2, Trash2 } from 'lucide-react';

interface Props {
    alerts: AlertLog[];
    onClear: () => void;
}

export const AlertLogView: React.FC<Props> = ({ alerts, onClear }) => {
    const getIcon = (type: string) => {
        switch (type) {
            case 'target_hit': return <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5 text-green-500 mt-0.5 flex-shrink-0" />;
            case 'error': return <AlertTriangle className="w-4 h-4 md:w-5 md:h-5 text-red-500 mt-0.5 flex-shrink-0" />;
            case 'info': return <Info className="w-4 h-4 md:w-5 md:h-5 text-purple-500 mt-0.5 flex-shrink-0" />;
            default: return <Info className="w-4 h-4 md:w-5 md:h-5 text-blue-500 mt-0.5 flex-shrink-0" />;
        }
    };

    const getBgColor = (type: string) => {
        switch (type) {
            case 'target_hit': return 'bg-green-500/5 border-green-500/20';
            case 'error': return 'bg-red-500/5 border-red-500/20';
            case 'info': return 'bg-purple-500/5 border-purple-500/20';
            default: return 'bg-gray-800/50 border-gray-700/50';
        }
    };

    const getTypeName = (type: string) => {
        switch (type) {
            case 'target_hit': return '到价提醒';
            case 'error': return '异常';
            case 'update': return '更新';
            case 'info': return '系统提示';
            default: return type;
        }
    };

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl flex flex-col h-[400px] md:h-[700px]">
            <div className="p-3 md:p-4 border-b border-gray-800 flex items-center justify-between bg-gray-900/50 rounded-t-xl">
                <h3 className="text-base md:text-lg font-semibold text-white flex items-center gap-2">
                    <Bell className="w-4 h-4 md:w-5 md:h-5 text-gray-400" />
                    通知日志
                    <span className="bg-gray-800 text-gray-400 text-[10px] md:text-xs py-0.5 px-2 rounded-full ml-1 md:ml-2">
                        {alerts.length}
                    </span>
                </h3>
                <button 
                    onClick={onClear}
                    className="text-gray-500 hover:text-red-400 transition-colors p-1.5 rounded-md hover:bg-gray-800"
                    title="清空日志"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
            
            <div className="flex-grow overflow-y-auto p-3 md:p-4 space-y-2 md:space-y-3">
                {alerts.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-600">
                        <Bell className="w-6 h-6 md:w-8 md:h-8 mb-2 opacity-20" />
                        <p className="text-sm md:text-base">暂无报警日志。</p>
                        <p className="text-[10px] md:text-xs mt-1">启动监控以查看日志。</p>
                    </div>
                ) : (
                    alerts.map((alert) => (
                        <div 
                            key={alert.id} 
                            className={`p-2.5 md:p-3 rounded-lg border flex gap-2 md:gap-3 ${getBgColor(alert.type)}`}
                        >
                            {getIcon(alert.type)}
                            <div className="flex-grow min-w-0">
                                <div className="flex justify-between items-start mb-1">
                                    <span className="text-[10px] md:text-xs font-medium text-gray-400 uppercase tracking-wider">
                                        {getTypeName(alert.type)}
                                    </span>
                                    <span className="text-[10px] md:text-xs text-gray-500 font-mono whitespace-nowrap ml-2">
                                        {alert.timestamp.split(' ')[1]}
                                    </span>
                                </div>
                                <pre className="text-xs md:text-sm text-gray-300 font-mono whitespace-pre-wrap break-words leading-relaxed">
                                    {alert.message}
                                </pre>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
