package collector

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/ygelfand/power-dash/internal/powerwall"
	"github.com/ygelfand/power-dash/internal/store"
	"github.com/ygelfand/power-dash/internal/utils"
)

type SoeCollector struct {
	pwr *powerwall.PowerwallGateway
}

func NewSoeCollector(pwr *powerwall.PowerwallGateway) *SoeCollector {
	return &SoeCollector{pwr: pwr}
}

func (c *SoeCollector) Name() string {
	return "SoeCollector"
}

func (c *SoeCollector) Collect(ctx context.Context, s *store.Store) (string, error) {
	data, err := c.pwr.MakeAPIRequest("GET", "system_status/soe", nil)
	if err != nil {
		return "", fmt.Errorf("failed to get soe: %w", err)
	}

	var resp struct {
		Percentage float64 `json:"percentage"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return "", fmt.Errorf("failed to parse soe: %w", err)
	}

	_ = s.InsertBatteryReadings([]store.BatteryReading{{
		Timestamp: time.Now().Truncate(time.Second),
		PodIndex:  -1,
		SOE:       utils.ToPtr(resp.Percentage),
	}})

	return fmt.Sprintf("System SOE: %.1f%%", resp.Percentage), nil
}
