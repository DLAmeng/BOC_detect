import { RateData, AlertLog, SystemConfig } from '../types.ts';
import { format } from 'date-fns';

const generateId = () => Math.random().toString(36).substring(2, 9);

export const processRateData = (
    newRateData: RateData,
    currentState: RateData | null,
    config: SystemConfig,
    lastAlertedRate: number | null
): { alerts: AlertLog[], updatedLastAlertedRate: number | null } => {
    
    const alerts: AlertLog[] = [];
    let updatedLastAlertedRate = lastAlertedRate;
    const currency = config.currency;
    const fetchTime = newRateData.fetchTime;
    const calculatedRate = newRateData.calculatedRate;
    const rawRate = newRateData.rawSellingRate;
    const pubTime = newRateData.pubTime;

    // 1. Check for Target Hit
    if (calculatedRate <= config.targetRate) {
        // Only alert if we haven't alerted yet, OR if the price has dropped further since the last alert
        if (lastAlertedRate === null || calculatedRate < lastAlertedRate) {
            alerts.push({
                id: generateId(),
                type: 'target_hit',
                timestamp: fetchTime,
                read: false,
                message: `[BOC ${currency}/CNY 到价提醒]\n当前汇率: ${calculatedRate.toFixed(4)}\n目标阈值: ${config.targetRate.toFixed(4)}\nSelling Rate(100 ${currency}): ${rawRate.toFixed(2)}\nPub Time: ${pubTime}`
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
                id: generateId(),
                type: 'update',
                timestamp: fetchTime,
                read: false,
                message: `[BOC ${currency}/CNY 更新]\nSelling Rate(100 ${currency}): ${rawRate.toFixed(2)}\n换算后(1 ${currency}): ${calculatedRate.toFixed(4)}\n上次值: ${currentState.calculatedRate.toFixed(4)}\nPub Time: ${pubTime}\n抓取时间: ${fetchTime}`
            });
        }
    } else {
        // Initial fetch
         alerts.push({
            id: generateId(),
            type: 'update',
            timestamp: fetchTime,
            read: false,
            message: `[BOC ${currency}/CNY 初始抓取]\nSelling Rate(100 ${currency}): ${rawRate.toFixed(2)}\n换算后(1 ${currency}): ${calculatedRate.toFixed(4)}\nPub Time: ${pubTime}\n抓取时间: ${fetchTime}`
        });
    }

    return { alerts, updatedLastAlertedRate };
};

export const createErrorAlert = (currency: string, errorMessage: string): AlertLog => {
    return {
        id: generateId(),
        type: 'error',
        timestamp: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
        read: false,
        message: `[BOC ${currency}/CNY 监控异常]\n原因: ${errorMessage}\n抓取时间: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`
    };
};
