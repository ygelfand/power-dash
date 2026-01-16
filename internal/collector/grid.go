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

type GridCollector struct {
	pwr *powerwall.PowerwallGateway
}

func NewGridCollector(pwr *powerwall.PowerwallGateway) *GridCollector {
	return &GridCollector{pwr: pwr}
}

func (c *GridCollector) Name() string {
	return "GridCollector"
}

func (c *GridCollector) Collect(ctx context.Context, s *store.Store) (string, error) {
	status, err := c.pwr.MakeAPIRequest("GET", "system_status/grid_status", nil)
	if err != nil {
		return "", fmt.Errorf("failed to get grid status: %w", err)
	}

	var statusResp struct {
		GridStatus         string `json:"grid_status"`
		GridServicesActive bool   `json:"grid_services_active"`
	}
	if err := json.Unmarshal(status, &statusResp); err != nil {
		return "", fmt.Errorf("failed to parse grid status: %w", err)
	}

	now := time.Now().Truncate(time.Second)

	_ = s.InsertSystemStatus([]store.SystemStatus{{
		Timestamp:      now,
		GridStatus:     utils.ToPtr(gridmap[statusResp.GridStatus]),
		ServicesActive: utils.ToPtr(statusResp.GridServicesActive),
	}})

	return fmt.Sprintf("Grid Status: %s, Services Active: %v", statusResp.GridStatus, statusResp.GridServicesActive), nil
}
