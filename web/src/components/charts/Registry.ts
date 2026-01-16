import { MonthlyAnalytics, MonthlyAnalyticsDefaults } from './MonthlyAnalytics';
import { PowerFlow, PowerFlowDefaults } from './PowerFlow';
import { CurrentPowerFlow, CurrentPowerFlowDefaults } from './CurrentPowerFlow';
import { BatteryLevel, BatteryLevelDefaults } from './BatteryLevel';
import { GridFrequency, GridFrequencyDefaults } from './GridFrequency';
import { GridVoltage, GridVoltageDefaults } from './GridVoltage';
import { Temperatures, TemperaturesDefaults } from './Temperatures';
import { FanSpeed, FanSpeedDefaults } from './FanSpeed';
import { InverterPower, InverterPowerDefaults } from './InverterPower';
import { InverterVoltage, InverterVoltageDefaults } from './InverterVoltage';
import { ReactivePower, ReactivePowerDefaults } from './ReactivePower';
import { SolarStringVoltage, SolarStringVoltageDefaults } from './SolarStringVoltage';
import { SolarStringCurrent, SolarStringCurrentDefaults } from './SolarStringCurrent';
import { SolarStringPower, SolarStringPowerDefaults } from './SolarStringPower';
import { SystemAlerts, SystemAlertsDefaults } from './SystemAlerts';
import { GridHealth, GridHealthDefaults } from './GridHealth';
import { SolarEfficiency, SolarEfficiencyDefaults } from './SolarEfficiency';
import { YearlyAnalytics, YearlyAnalyticsDefaults } from './YearlyAnalytics';
import { PhaseBalance, PhaseBalanceDefaults } from './PhaseBalance';
import type { PanelConfig } from '../../data';

export const ComponentRegistry: Record<string, any> = {
    "MonthlyAnalytics": MonthlyAnalytics,
    "YearlyAnalytics": YearlyAnalytics,
    "PowerFlow": PowerFlow,
    "CurrentPowerFlow": CurrentPowerFlow,
    "BatteryLevel": BatteryLevel,
    "GridFrequency": GridFrequency,
    "GridVoltage": GridVoltage,
    "Temperatures": Temperatures,
    "FanSpeed": FanSpeed,
    "InverterPower": InverterPower,
    "InverterVoltage": InverterVoltage,
    "ReactivePower": ReactivePower,
    "SolarStringVoltage": SolarStringVoltage,
    "SolarStringCurrent": SolarStringCurrent,
    "SolarStringPower": SolarStringPower,
    "SystemAlerts": SystemAlerts,
    "GridHealth": GridHealth,
    "SolarEfficiency": SolarEfficiency,
    "PhaseBalance": PhaseBalance,
};

export const PanelDefaults: Record<string, Partial<PanelConfig>> = {
    "power-flow": PowerFlowDefaults,
    "current-power-flow": CurrentPowerFlowDefaults,
    "grid-frequency": GridFrequencyDefaults,
    "monthly-analytics": MonthlyAnalyticsDefaults,
    "battery-level": BatteryLevelDefaults,
    "grid-voltage": GridVoltageDefaults,
    "string-voltage": SolarStringVoltageDefaults,
    "string-current": SolarStringCurrentDefaults,
    "string-power": SolarStringPowerDefaults,
    "temperatures": TemperaturesDefaults,
    "fan-speed": FanSpeedDefaults,
    "inverter-power": InverterPowerDefaults,
    "inverter-voltage": InverterVoltageDefaults,
    "reactive-power": ReactivePowerDefaults,
    "yearly-analytics": YearlyAnalyticsDefaults,
    "system-alerts": SystemAlertsDefaults,
    "grid-health": GridHealthDefaults,
    "solar-efficiency": SolarEfficiencyDefaults,
    "phase-balance": PhaseBalanceDefaults,
};

export function getChartComponent(name?: string) {
    return ComponentRegistry[name || "PowerFlow"] || PowerFlow;
}
