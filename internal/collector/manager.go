package collector

import (
	"context"
	"sync/atomic"
	"time"

	"github.com/ygelfand/power-dash/internal/store"
	"go.uber.org/zap"
)

type Manager struct {
	store        *store.Store
	collectors   []Collector
	interval     time.Duration
	logger       *zap.Logger
	stopCh       chan struct{}
	isCollecting atomic.Bool
}

func NewManager(store *store.Store, interval time.Duration, logger *zap.Logger) *Manager {
	return &Manager{
		store:    store,
		interval: interval,
		logger:   logger,
		stopCh:   make(chan struct{}),
	}
}

func (m *Manager) Register(c Collector) {
	m.collectors = append(m.collectors, c)
}

func (m *Manager) Start() {
	delay := m.getStartupDelay()

	go func() {
		if delay > 0 {
			m.logger.Info("Delaying first collection based on last poll", zap.Duration("delay", delay))
			select {
			case <-time.After(delay):
			case <-m.stopCh:
				return
			}
		}

		// Initial run or immediate run if delay was 0
		m.runCollection()

		ticker := time.NewTicker(m.interval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				m.runCollection()
			case <-m.stopCh:
				return
			}
		}
	}()
}

func (m *Manager) Stop() {
	close(m.stopCh)
}

type CollectionResult struct {
	Name     string `json:"name"`
	Success  bool   `json:"success"`
	Message  string `json:"message,omitempty"`
	Error    string `json:"error,omitempty"`
	Duration string `json:"duration"`
}

type RunReport struct {
	Timestamp time.Time          `json:"timestamp"`
	Duration  string             `json:"duration"`
	Results   []CollectionResult `json:"results"`
}

func (m *Manager) ForceRun(ctx context.Context) RunReport {
	start := time.Now()
	report := RunReport{
		Timestamp: start,
		Results:   make([]CollectionResult, 0, len(m.collectors)),
	}

	for _, c := range m.collectors {
		res := m.runOne(ctx, c)
		report.Results = append(report.Results, res)
	}

	report.Duration = time.Since(start).String()
	return report
}

func (m *Manager) ForceRunOne(ctx context.Context, name string) *CollectionResult {
	for _, c := range m.collectors {
		if c.Name() == name {
			res := m.runOne(ctx, c)
			return &res
		}
	}
	return nil
}

func (m *Manager) runOne(ctx context.Context, c Collector) CollectionResult {
	cStart := time.Now()
	msg, err := c.Collect(ctx, m.store)
	res := CollectionResult{
		Name:     c.Name(),
		Success:  err == nil,
		Message:  msg,
		Duration: time.Since(cStart).String(),
	}
	if err != nil {
		res.Error = err.Error()
	}
	return res
}

func (m *Manager) getStartupDelay() time.Duration {
	last, err := m.store.GetLastTimestamp("power_dash_collection_mark")
	if err != nil {
		m.logger.Warn("Could not determine last poll time", zap.Error(err))
		return 0
	}

	if last == 0 {
		return 0
	}

	elapsed := time.Since(time.Unix(last, 0))
	if elapsed >= m.interval {
		return 0
	}

	return m.interval - elapsed
}

func (m *Manager) runCollection() {
	if !m.isCollecting.CompareAndSwap(false, true) {
		m.logger.Warn("Previous collection cycle still in progress, skipping")
		return
	}
	defer m.isCollecting.Store(false)

	m.logger.Debug("Collection cycle started")
	start := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	for _, c := range m.collectors {
		m.logger.Debug("Running collector", zap.String("collector", c.Name()))
		_, err := c.Collect(ctx, m.store)
		if err != nil {
			m.logger.Error("Error collecting metrics", zap.Error(err), zap.String("collector", c.Name()))
			continue
		}
	}

	// Record collection mark
	_ = m.store.InsertCollectionMark(start)

	if err := m.store.Flush(); err != nil {
		m.logger.Warn("Failed to flush store", zap.Error(err))
	}

	m.logger.Info("Collection cycle completed", zap.Duration("duration", time.Since(start)))
}
