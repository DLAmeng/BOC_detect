import { RateData, AlertLog, MonitoredCurrencyConfig } from '../types.ts';
import { format } from 'date-fns';

const generateId = () => Math.random().toString(36).substring(2, 9);

export const processRateData = (
    newRateData: RateData,
    currentState: RateData | null,
    currencyConfig: MonitoredCurrencyConfig,
    lastAlertedRate: number | null
): { alerts: AlertLog[], updatedLastAlertedRate: number | null } => {
    
    const alerts: AlertLog[] = [];
    let updatedLastAlertedRate = lastAlertedRate;
    const currency = currencyConfig.currency;
    const fetchTime = newRateData.fetchTime;
    const calculatedRate = newRateData.calculatedRate;
    const rawRate = newRateData.rawSellingRate;
    const pubTime = newRateData.pubTime;
    const source = newRateData.source === 'Yahoo + BOC' ? 'Yahoo Finance' : (newRateData.source || 'BOC');

    // 1. Check for Target Hit
    if (calculatedRate <= currencyConfig.targetRate) {
        // Only alert if we haven't alerted yet, OR if the price has dropped further since the last alert
        if (lastAlertedRate === null || calculatedRate < lastAlertedRate) {
            alerts.push({
                currency,
                id: generateId(),
                type: 'target_hit',
                timestamp: fetchTime,
                read: false,
                message: `🔔 [${currency}/CNY 到价提醒]\n当前汇率: ${calculatedRate.toFixed(4)}\n目标阈值: ${currencyConfig.targetRate.toFixed(4)}\n数据来源: ${source}\n发布时间: ${pubTime}`
            });
            updatedLastAlertedRate = calculatedRate;
        }
    } else {
        // Reset alert state if price goes back above target
        updatedLastAlertedRate = null;
    }

    // 2. Check for General Update (if rate or pub time changed)
    if (currentState) {
        if (currentState.rawSellingRate !== rawRate || currentState.pubTime !== pubTime) {
            alerts.push({
                currency,
                id: generateId(),
                type: 'update',
                timestamp: fetchTime,
                read: false,
                message: `📈 [${currency}/CNY 更新]\n当前汇率: ${calculatedRate.toFixed(4)}\n上次值: ${currentState.calculatedRate.toFixed(4)}\n数据来源: ${source}\n发布时间: ${pubTime}`
            });
        }
    } else {
        // Initial fetch
         alerts.push({
            currency,
            id: generateId(),
            type: 'update',
            timestamp: fetchTime,
            read: false,
            message: `📡 [${currency}/CNY 初始抓取]\n当前汇率: ${calculatedRate.toFixed(4)}\n数据来源: ${source}\n发布时间: ${pubTime}`
        });
    }

    return { alerts, updatedLastAlertedRate };
};

export const createErrorAlert = (currency: string, errorMessage: string): AlertLog => {
    return {
        currency,
        id: generateId(),
        type: 'error',
        timestamp: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
        read: false,
        message: `❌ [${currency}/CNY 监控异常]\n原因: ${errorMessage}\n时间: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`
    };
};

export const createInfoAlert = (message: string, currency?: string): AlertLog => {
    return {
        currency,
        id: generateId(),
        type: 'info',
        timestamp: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
        read: false,
        message
    };
};
