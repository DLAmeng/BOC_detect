import { RateData, AlertLog, MonitoredCurrencyConfig } from '../types.ts';
import { DynamicThresholds } from './rateStats.ts';
import { format } from 'date-fns';

const generateId = () => Math.random().toString(36).substring(2, 9);

export const processRateData = (
    newRateData: RateData,
    currentState: RateData | null,
    currencyConfig: MonitoredCurrencyConfig,
    thresholds: DynamicThresholds | null
): { alerts: AlertLog[] } => {
    
    const alerts: AlertLog[] = [];
    const currency = currencyConfig.currency;
    const fetchTime = newRateData.fetchTime;
    const calculatedRate = newRateData.calculatedRate;
    const rawRate = newRateData.rawSellingRate;
    const pubTime = newRateData.pubTime;
    const source = newRateData.source === 'Yahoo + BOC' ? 'Yahoo Finance' : (newRateData.source || 'BOC');

    // 1. Check for Dynamic Thresholds
    if (thresholds) {
        if (calculatedRate <= thresholds.bestZoneUpper) {
            alerts.push({
                currency,
                id: generateId(),
                type: 'target_hit',
                timestamp: fetchTime,
                read: false,
                message: `📉 [${currency}] 进入强烈换汇区\n当前汇率: ${calculatedRate.toFixed(4)}\n适合优先换汇 (≤${thresholds.bestZoneUpper.toFixed(4)})`
            });
        } else if (calculatedRate <= thresholds.goodZoneUpper) {
            alerts.push({
                currency,
                id: generateId(),
                type: 'target_hit',
                timestamp: fetchTime,
                read: false,
                message: `✅ [${currency}] 进入适合换汇区\n当前汇率: ${calculatedRate.toFixed(4)}\n可考虑分批换汇 (≤${thresholds.goodZoneUpper.toFixed(4)})`
            });
        }
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

    return { alerts };
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
