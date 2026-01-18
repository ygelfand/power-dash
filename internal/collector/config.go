package collector

import (
	"context"
	"fmt"
	"time"

	"github.com/ygelfand/power-dash/internal/powerwall"
	"github.com/ygelfand/power-dash/internal/store"
	"go.uber.org/zap"
)

type ConfigCollector struct {
	pwr           *powerwall.PowerwallGateway
	lastFetch     time.Time
	currentConfig *powerwall.ConfigResponse
	logger        *zap.Logger
}

func NewConfigCollector(pwr *powerwall.PowerwallGateway, logger *zap.Logger) *ConfigCollector {
	return &ConfigCollector{
		pwr:    pwr,
		logger: logger,
	}
}

func (c *ConfigCollector) Name() string {
	return "ConfigCollector"
}

func (c *ConfigCollector) Collect(ctx context.Context, s *store.Store) (string, error) {
	now := time.Now()

	// Fetch config if needed (every hour)
	if c.currentConfig == nil || time.Since(c.lastFetch) > 1*time.Hour {
		cfg, err := c.pwr.FetchConfig()
		if err != nil {
			return "", fmt.Errorf("failed to fetch config: %w", err)
		}
		c.currentConfig = cfg
		c.lastFetch = now
		c.logger.Info("Updated system config", zap.String("vin", cfg.Vin))
	}

	if c.currentConfig == nil || c.currentConfig.SiteInfo.TariffContent.Code == "" {
		return "No tariff config available", nil
	}

	rate, periodName := c.getCurrentRate(now, c.currentConfig)
	if periodName == "" {
		return "No active rate found", nil
	}

	// Insert Price Metric
	// Store expects seconds for Insert()
	err := s.Insert("energy_price_usd", []store.Label{{Name: "period", Value: periodName}}, rate, now.Unix())
	if err != nil {
		return "", fmt.Errorf("failed to insert price metric: %w", err)
	}

	return fmt.Sprintf("Recorded rate $%.4f (%s)", rate, periodName), nil
}

func (c *ConfigCollector) getCurrentRate(t time.Time, cfg *powerwall.ConfigResponse) (float64, string) {
	tariff := cfg.SiteInfo.TariffContent

	month := int(t.Month())
	day := t.Day()

	inSeason := func(sStartM, sStartD, sEndM, sEndD int) bool {
		if sStartM == 0 {
			return false
		} // Empty/Zero config
		start := sStartM*100 + sStartD
		end := sEndM*100 + sEndD
		curr := month*100 + day
		if start <= end {
			return curr >= start && curr <= end
		}
		return curr >= start || curr <= end
	}

	// Helper to check time in period
	dow := int(t.Weekday()) // 0=Sun, 6=Sat
	hour := t.Hour()
	minute := t.Minute()

	inTime := func(pStartD, pEndD, pHourS, pMinS, pHourE, pMinE int) bool {
		// Day of week check
		if dow < pStartD || dow > pEndD {
			return false
		}
		// Time check
		startMin := pHourS*60 + pMinS
		endMin := pHourE*60 + pMinE
		currMin := hour*60 + minute

		if startMin <= endMin {
			return currMin >= startMin && currMin < endMin
		}
		return currMin >= startMin || currMin < endMin
	}

	// Iterate over all defined seasons
	for seasonName, seasonCfg := range tariff.Seasons {
		if inSeason(seasonCfg.FromMonth, seasonCfg.FromDay, seasonCfg.ToMonth, seasonCfg.ToDay) {
			// Found current season

			// Iterate over periods in this season (e.g. ON_PEAK, OFF_PEAK)
			for periodName, periods := range seasonCfg.TouPeriods {
				for _, p := range periods {
					if inTime(p.FromDayOfWeek, p.ToDayOfWeek, p.FromHour, p.FromMinute, p.ToHour, p.ToMinute) {
						// Found active period
						// Lookup rate in EnergyCharges
						if seasonRates, ok := tariff.EnergyCharges[seasonName]; ok {
							if rate, ok := seasonRates[periodName]; ok {
								return rate, periodName
							}
						}
						// Try finding in "All" or similar if specific season rate not found?
						// Usually structure is strict.
					}
				}
			}
		}
	}

	// Fallback to "All" -> "All"
	if allRates, ok := tariff.EnergyCharges["ALL"]; ok {
		if rate, ok := allRates["ALL"]; ok && rate != 0 {
			return rate, "Flat"
		}
	}
	// Or maybe "All" -> "All" is nested in "All" key
	if allRates, ok := tariff.EnergyCharges["All"]; ok {
		if rate, ok := allRates["All"]; ok && rate != 0 {
			return rate, "Flat"
		}
	}

	return 0, ""
}
