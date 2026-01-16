package collector

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/ygelfand/power-dash/internal/powerwall"
	"github.com/ygelfand/power-dash/internal/store"
	"github.com/ygelfand/power-dash/internal/utils"
)

type AggregatesCollector struct {
	pwr *powerwall.PowerwallGateway
}

func NewAggregatesCollector(pwr *powerwall.PowerwallGateway) *AggregatesCollector {
	return &AggregatesCollector{pwr: pwr}
}

func (c *AggregatesCollector) Name() string {
	return "AggregatesCollector"
}

func (c *AggregatesCollector) Collect(ctx context.Context, s *store.Store) (string, error) {
	data, err := c.pwr.MakeAPIRequest("GET", "meters/aggregates", nil)
	if err != nil {
		return "", fmt.Errorf("failed to get aggregates: %w", err)
	}

	var resp map[string]struct {
		LastCommunicationTime time.Time `json:"last_communication_time"`
		InstantPower          float64   `json:"instant_power"`
		InstantReactivePower  float64   `json:"instant_reactive_power"`
		InstantApparentPower  float64   `json:"instant_apparent_power"`
		Frequency             float64   `json:"frequency"`
		EnergyExported        float64   `json:"energy_exported"`
		EnergyImported        float64   `json:"energy_imported"`
		InstantAverageVoltage float64   `json:"instant_average_voltage"`
		InstantAverageCurrent float64   `json:"instant_average_current"`
		IACurrent             float64   `json:"i_a_current"`
		IBCurrent             float64   `json:"i_b_current"`
		ICCurrent             float64   `json:"i_c_current"`
		VAVoltage             float64   `json:"v_a_voltage"`
		VBVoltage             float64   `json:"v_b_voltage"`
		VCVoltage             float64   `json:"v_c_voltage"`
	}

	if err := json.Unmarshal(data, &resp); err != nil {
		return "", fmt.Errorf("failed to parse aggregates: %w", err)
	}

	var readings []store.MeterReading
	now := time.Now().Truncate(time.Second)

	for site, meter := range resp {
		siteName := strings.ToLower(site)

		r := store.MeterReading{
			Timestamp: now,
			Site:      siteName,
			Power:     utils.ToPtr(meter.InstantPower),
			Reactive:  utils.ToPtr(meter.InstantReactivePower),
			Apparent:  utils.ToPtr(meter.InstantApparentPower),
			Voltage:   nil,
			Current:   utils.ToPtr(meter.InstantAverageCurrent),
			Frequency: utils.ToPtr(meter.Frequency),
			Imported:  utils.ToPtr(meter.EnergyImported),
			Exported:  utils.ToPtr(meter.EnergyExported),
		}
		readings = append(readings, r)

		if meter.VAVoltage != 0 {
			readings = append(readings, store.MeterReading{Timestamp: now, Site: siteName, Phase: utils.ToPtr("1"), Voltage: utils.ToPtr(meter.VAVoltage)})
		}
		if meter.VBVoltage != 0 {
			readings = append(readings, store.MeterReading{Timestamp: now, Site: siteName, Phase: utils.ToPtr("2"), Voltage: utils.ToPtr(meter.VBVoltage)})
		}
		if meter.VCVoltage != 0 {
			readings = append(readings, store.MeterReading{Timestamp: now, Site: siteName, Phase: utils.ToPtr("3"), Voltage: utils.ToPtr(meter.VCVoltage)})
		}

		// Create virtual sites for import/export to match UI expectations
		if siteName == "site" || siteName == "battery" {
			importVal, exportVal := 0.0, 0.0
			if meter.InstantPower > 0 {
				importVal = meter.InstantPower
			} else {
				exportVal = -meter.InstantPower
			}
			readings = append(readings, store.MeterReading{Timestamp: now, Site: siteName + "_import", Power: utils.ToPtr(importVal)})
			readings = append(readings, store.MeterReading{Timestamp: now, Site: siteName + "_export", Power: utils.ToPtr(exportVal)})
		}
	}

	_ = s.InsertMeterReadings(readings)
	return fmt.Sprintf("Processed %d meter aggregate readings", len(readings)), nil
}
