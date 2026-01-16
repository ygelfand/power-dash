package collector

import (
	"context"

	"github.com/ygelfand/power-dash/internal/store"
)

type Collector interface {
	Name() string
	Collect(ctx context.Context, s *store.Store) (string, error)
}

var gridmap = map[string]float64{
	"SystemGridConnected":      1,
	"SystemIslandedActive":     0,
	"SystemTransitionToGrid":   0.5,
	"SystemTransitionToIsland": 0.5,
	"SystemIslandedReady":      0.1,
	"SystemMicroGridFaulted":   -1,
	"SystemWaitForUser":        -2,
}
