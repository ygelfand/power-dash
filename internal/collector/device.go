package collector

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/ygelfand/power-dash/internal/powerwall"
	"github.com/ygelfand/power-dash/internal/store"
	"github.com/ygelfand/power-dash/internal/utils"
)

type DeviceCollector struct {
	pwr *powerwall.PowerwallGateway
}

func NewDeviceCollector(pwr *powerwall.PowerwallGateway) *DeviceCollector {
	return &DeviceCollector{pwr: pwr}
}

func (c *DeviceCollector) Name() string {
	return "DeviceCollector"
}

func (c *DeviceCollector) Collect(ctx context.Context, s *store.Store) (string, error) {
	ctrl, err := c.pwr.FetchController()
	if err != nil {
		return "", fmt.Errorf("failed to fetch controller: %w", err)
	}

	now := time.Now().Truncate(time.Second)

	// Solar Strings
	var solar []store.SolarReading
	validIdx := 0
	for _, pvac := range ctrl.EsCan.Bus.Pvac {
		if pvac.PVACLogging.IsMIA {
			continue
		}
		add := func(id string, current, voltage float64) {
			if current == 0 && voltage == 0 {
				return
			}
			p := current * voltage
			solar = append(solar, store.SolarReading{
				Timestamp:     now,
				InverterIndex: validIdx,
				StringID:      id,
				Current:       utils.ToPtr(current),
				Voltage:       utils.ToPtr(voltage),
				Power:         utils.ToPtr(p),
			})
		}
		add("A", pvac.PVACLogging.PVACPVCurrentA, pvac.PVACLogging.PVACPVMeasuredVoltageA)
		add("B", pvac.PVACLogging.PVACPVCurrentB, pvac.PVACLogging.PVACPVMeasuredVoltageB)
		add("C", pvac.PVACLogging.PVACPVCurrentC, pvac.PVACLogging.PVACPVMeasuredVoltageC)
		add("D", pvac.PVACLogging.PVACPVCurrentD, pvac.PVACLogging.PVACPVMeasuredVoltageD)
		validIdx++
	}
	_ = s.InsertSolarReadings(solar)

	var solarInverters []store.InverterReading
	validIdx = 0
	for _, pvac := range ctrl.EsCan.Bus.Pvac {
		if pvac.PVACLogging.IsMIA {
			continue
		}
		solarInverters = append(solarInverters, store.InverterReading{
			Timestamp:     now,
			InverterIndex: validIdx,
			Type:          "solar",
			Power:         utils.ToPtr(pvac.PVACStatus.PVACPout),
			Frequency:     utils.ToPtr(pvac.PVACStatus.PVACFout),
			Voltage1:      utils.ToPtrIfNonZero(pvac.PVACLogging.PVACVL1Ground),
			Voltage2:      utils.ToPtrIfNonZero(pvac.PVACLogging.PVACVL2Ground),
		})
		validIdx++
	}
	_ = s.InsertInverterReadings(solarInverters)

	// Fans and Temps
	var env []store.EnvironmentalReading
	validTempIdx := 0
	for _, msa := range ctrl.Components.Msa {
		r := store.EnvironmentalReading{Timestamp: now, MsaIndex: validTempIdx}
		found := false
		for _, signal := range msa.Signals {
			if signal.Value != nil && signal.Name == "THC_AmbientTemp" {
				r.AmbientTemp = utils.ToPtr(float64(*signal.Value))
				found = true
			}
		}
		if found {
			env = append(env, r)
			validTempIdx++
		}
	}

	validFanIdx := 0
	for _, msa := range ctrl.Components.Msa {
		r := store.EnvironmentalReading{Timestamp: now, MsaIndex: validFanIdx}
		found := false
		for _, signal := range msa.Signals {
			if signal.Value == nil {
				continue
			}
			switch signal.Name {
			case "PVAC_Fan_Speed_Actual_RPM":
				r.FanSpeedActual = utils.ToPtr(float64(*signal.Value))
				found = true
			case "PVAC_Fan_Speed_Target_RPM":
				r.FanSpeedTarget = utils.ToPtr(float64(*signal.Value))
				found = true
			}
		}
		if found {
			env = append(env, r)
			validFanIdx++
		}
	}

	_ = s.InsertEnvironmentalReadings(env)

	// Inverters
	var inverters []store.InverterReading
	validIdx = 0
	for _, pinv := range ctrl.EsCan.Bus.Pinv {
		if pinv.PINVAcMeasurements.IsMIA {
			continue
		}
		inverters = append(inverters, store.InverterReading{
			Timestamp:     now,
			InverterIndex: validIdx,
			Type:          "battery",
			Power:         utils.ToPtr(pinv.PINVStatus.PINVPout),
			Frequency:     utils.ToPtr(pinv.PINVStatus.PINVFout),
			Voltage1:      utils.ToPtrIfNonZero(pinv.PINVAcMeasurements.PINVVSplit1),
			Voltage2:      utils.ToPtrIfNonZero(pinv.PINVAcMeasurements.PINVVSplit2),
			Voltage3:      utils.ToPtrIfNonZero(pinv.PINVAcMeasurements.PINVVSplit3),
		})
		validIdx++
	}
	_ = s.InsertInverterReadings(inverters)

	// Pods
	var battery []store.BatteryReading
	validIdx = 0
	for _, pod := range ctrl.EsCan.Bus.Pod {
		if pod.PODEnergyStatus.IsMIA {
			continue
		}
		battery = append(battery, store.BatteryReading{
			Timestamp:       now,
			PodIndex:        validIdx,
			EnergyRemaining: utils.ToPtr(float64(pod.PODEnergyStatus.PODNomEnergyRemaining)),
			EnergyCapacity:  utils.ToPtr(float64(pod.PODEnergyStatus.PODNomFullPackEnergy)),
		})
		validIdx++
	}
	// System SOE
	if ctrl.Control.SystemStatus.NominalFullPackEnergyWh != 0 {
		soe := float64(ctrl.Control.SystemStatus.NominalEnergyRemainingWh) / float64(ctrl.Control.SystemStatus.NominalFullPackEnergyWh) * 100
		battery = append(battery, store.BatteryReading{
			Timestamp:       now,
			PodIndex:        -1,
			SOE:             utils.ToPtr(soe),
			EnergyRemaining: utils.ToPtr(float64(ctrl.Control.SystemStatus.NominalEnergyRemainingWh)),
			EnergyCapacity:  utils.ToPtr(float64(ctrl.Control.SystemStatus.NominalFullPackEnergyWh)),
		})
	}
	_ = s.InsertBatteryReadings(battery)

	// Meters
	var meters []store.MeterReading
	for _, meter := range ctrl.Control.MeterAggregates {
		siteName := strings.ToLower(meter.Location)
		meters = append(meters, store.MeterReading{Timestamp: now, Site: siteName, Power: utils.ToPtr(meter.RealPowerW)})
	}
	_ = s.InsertMeterReadings(meters)

	// Alerts
	var alerts []store.Alert
	addAlerts := func(source string, names []string) {
		for _, name := range names {
			alerts = append(alerts, store.Alert{Timestamp: now, Source: source, Name: name})
		}
	}
	addAlerts("control", ctrl.Control.Alerts.Active)
	for i, pinv := range ctrl.EsCan.Bus.Pinv {
		addAlerts(fmt.Sprintf("pinv_%d", i), pinv.Alerts.Active)
	}
	for i, pvac := range ctrl.EsCan.Bus.Pvac {
		addAlerts(fmt.Sprintf("pvac_%d", i), pvac.Alerts.Active)
	}
	for i, pvs := range ctrl.EsCan.Bus.Pvs {
		addAlerts(fmt.Sprintf("pvs_%d", i), pvs.Alerts.Active)
	}
	for i, msa := range ctrl.Components.Msa {
		var names []string
		for _, a := range msa.ActiveAlerts {
			names = append(names, a.Name)
		}
		addAlerts(fmt.Sprintf("msa_%d", i), names)
	}
	_ = s.InsertAlerts(alerts)

	var neurioMeters []store.MeterReading
	for _, reading := range ctrl.Neurio.Readings {
		if reading.Serial == "" {
			continue
		}
		for i, data := range reading.DataRead {
			if data.VoltageV == 0 && data.RealPowerW == 0 {
				continue
			}
			neurioMeters = append(neurioMeters, store.MeterReading{
				Timestamp: now,
				Site:      fmt.Sprintf("neurio_%s", strings.ToLower(reading.Serial)),
				Phase:     utils.ToPtr(fmt.Sprint(i + 1)),
				Voltage:   utils.ToPtr(data.VoltageV),
				Power:     utils.ToPtr(data.RealPowerW),
				Current:   utils.ToPtr(data.RealPowerW / data.VoltageV), // Fallback if currentA missing
				Reactive:  utils.ToPtr(data.ReactivePowerVAR),
			})
		}
	}
	_ = s.InsertMeterReadings(neurioMeters)

	if !ctrl.EsCan.Bus.Islander.ISLANDAcMeasurements.IsMIA {
		isl := ctrl.EsCan.Bus.Islander.ISLANDAcMeasurements
		var gridReadings []store.MeterReading

		if isl.ISLANDVL1NMain != 0 {
			gridReadings = append(gridReadings, store.MeterReading{Timestamp: now, Site: "site", Phase: utils.ToPtr("1"), Voltage: utils.ToPtr(isl.ISLANDVL1NMain)})
		}
		if isl.ISLANDVL2NMain != 0 {
			gridReadings = append(gridReadings, store.MeterReading{Timestamp: now, Site: "site", Phase: utils.ToPtr("2"), Voltage: utils.ToPtr(isl.ISLANDVL2NMain)})
		}

		if isl.ISLANDFreqL1Main != 0 {
			gridReadings = append(gridReadings, store.MeterReading{Timestamp: now, Site: "site", Phase: utils.ToPtr("1"), Frequency: utils.ToPtr(isl.ISLANDFreqL1Main)})
		}
		if isl.ISLANDFreqL2Main != 0 {
			gridReadings = append(gridReadings, store.MeterReading{Timestamp: now, Site: "site", Phase: utils.ToPtr("2"), Frequency: utils.ToPtr(isl.ISLANDFreqL2Main)})
		}

		if isl.ISLANDVL1NLoad != 0 {
			gridReadings = append(gridReadings, store.MeterReading{Timestamp: now, Site: "load", Phase: utils.ToPtr("1"), Voltage: utils.ToPtr(isl.ISLANDVL1NLoad)})
		}
		if isl.ISLANDVL2NLoad != 0 {
			gridReadings = append(gridReadings, store.MeterReading{Timestamp: now, Site: "load", Phase: utils.ToPtr("2"), Voltage: utils.ToPtr(isl.ISLANDVL2NLoad)})
		}
		if isl.ISLANDFreqL1Load != 0 {
			gridReadings = append(gridReadings, store.MeterReading{Timestamp: now, Site: "load", Phase: utils.ToPtr("1"), Frequency: utils.ToPtr(isl.ISLANDFreqL1Load)})
		}
		if isl.ISLANDFreqL2Load != 0 {
			gridReadings = append(gridReadings, store.MeterReading{Timestamp: now, Site: "load", Phase: utils.ToPtr("2"), Frequency: utils.ToPtr(isl.ISLANDFreqL2Load)})
		}

		_ = s.InsertMeterReadings(gridReadings)
	}

	// MSA, Sync, Neurio, Islander (Standardized)
	if !ctrl.EsCan.Bus.Msa.METERZAcMeasurements.IsMIA {
		msa := ctrl.EsCan.Bus.Msa.METERZAcMeasurements
		msaMeters := []store.MeterReading{
			{Timestamp: now, Site: "grid_msa", Phase: utils.ToPtr("1"), Voltage: utils.ToPtr(msa.MeterZVl1G), Power: utils.ToPtr(float64(msa.METERZCTAInstRealPower))},
			{Timestamp: now, Site: "grid_msa", Phase: utils.ToPtr("2"), Voltage: utils.ToPtr(msa.MeterZVl2G), Power: utils.ToPtr(float64(msa.METERZCTBInstRealPower))},
		}
		_ = s.InsertMeterReadings(msaMeters)
	}

	msg := fmt.Sprintf("Processed %d solar strings, %d inverters, %d batteries, %d neurio channels", len(solar), len(inverters)+len(solarInverters), len(battery), len(neurioMeters))
	return msg, nil
}
