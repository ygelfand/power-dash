package store

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/prometheus/model/labels"
	"github.com/prometheus/prometheus/storage"
	"github.com/prometheus/prometheus/tsdb"
	"github.com/prometheus/prometheus/tsdb/chunkenc"
	"go.uber.org/zap"
)

type Label struct {
	Name  string
	Value string
}

type DataPoint struct {
	Timestamp int64   `json:"t"`
	Value     float64 `json:"v"`
}

// Internal Reading structs for collectors
type MeterReading struct {
	Timestamp time.Time
	Site      string
	Phase     *string
	Power     *float64
	Reactive  *float64
	Apparent  *float64
	Voltage   *float64
	Current   *float64
	Frequency *float64
	Imported  *float64
	Exported  *float64
}

type InverterReading struct {
	Timestamp     time.Time
	InverterIndex int
	Type          string // "battery" or "solar"
	Power         *float64
	Frequency     *float64
	Voltage1      *float64
	Voltage2      *float64
	Voltage3      *float64
}

type SolarReading struct {
	Timestamp     time.Time
	InverterIndex int
	StringID      string
	Voltage       *float64
	Current       *float64
	Power         *float64
}

type BatteryReading struct {
	Timestamp       time.Time
	PodIndex        int
	SOE             *float64
	EnergyRemaining *float64
	EnergyCapacity  *float64
}

type SystemStatus struct {
	Timestamp      time.Time
	GridStatus     *float64
	ServicesActive *bool
}

type EnvironmentalReading struct {
	Timestamp      time.Time
	MsaIndex       int
	AmbientTemp    *float64
	FanSpeedActual *float64
	FanSpeedTarget *float64
}

type Alert struct {
	Timestamp time.Time
	Source    string
	Name      string
}

type Store struct {
	db     *tsdb.DB
	logger *zap.Logger
}

type Config struct {
	DataPath          string
	Retention         time.Duration
	PartitionDuration time.Duration
}

func NewStore(cfg Config, logger *zap.Logger) (*Store, error) {
	if err := os.MkdirAll(cfg.DataPath, 0o755); err != nil {
		return nil, fmt.Errorf("failed to create data path: %w", err)
	}

	slogger := slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelDebug}))

	opts := tsdb.DefaultOptions()
	opts.RetentionDuration = int64(cfg.Retention / time.Millisecond)
	// Enable OOO support for historical imports (10 years window)
	opts.OutOfOrderTimeWindow = 10 * 365 * 24 * 60 * 60 * 1000

	if cfg.PartitionDuration > 0 {
		// MinBlockDuration controls when Head is flushed to disk. Keep it small (2h) for safety.
		// MaxBlockDuration controls how large blocks can grow via compaction (reducing directory count).
		defaultMin := int64(12 * time.Hour / time.Millisecond)
		targetMax := int64(cfg.PartitionDuration / time.Millisecond)

		opts.MinBlockDuration = min(defaultMin, targetMax)
		opts.MaxBlockDuration = targetMax
	}

	logger.Info("Initializing TSDB",
		zap.String("path", cfg.DataPath),
		zap.Duration("retention", cfg.Retention),
		zap.Duration("partition", cfg.PartitionDuration),
	)

	db, err := tsdb.Open(cfg.DataPath, slogger, prometheus.NewRegistry(), opts, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to open tsdb: %w", err)
	}

	return &Store{db: db, logger: logger}, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) Queryable() storage.Queryable {
	return s.db
}

func (s *Store) GetLastTimestamp(metric string) (int64, error) {
	q, err := s.db.Querier(time.Now().Add(-30*24*time.Hour).UnixMilli(), time.Now().UnixMilli())
	if err != nil {
		return 0, err
	}
	defer q.Close()

	ss := q.Select(context.Background(), false, nil, labels.MustNewMatcher(labels.MatchEqual, labels.MetricName, metric))
	var lastTs int64
	for ss.Next() {
		it := ss.At().Iterator(nil)
		for it.Next() == chunkenc.ValFloat {
			t, _ := it.At()
			if t > lastTs {
				lastTs = t
			}
		}
	}
	return lastTs / 1000, nil
}

func (s *Store) GetLastPoint(metric string, tags map[string]string) (*DataPoint, error) {
	// Look back 24 hours to ensure we find data even after gaps
	end := time.Now().UnixMilli()
	start := end - 24*60*60*1000

	q, err := s.db.Querier(start, end)
	if err != nil {
		return nil, err
	}
	defer q.Close()

	matchers := []*labels.Matcher{labels.MustNewMatcher(labels.MatchEqual, labels.MetricName, metric)}
	for k, v := range tags {
		if v != "" {
			matchers = append(matchers, labels.MustNewMatcher(labels.MatchEqual, k, v))
		}
	}

	ss := q.Select(context.Background(), false, nil, matchers...)
	var lastPoint *DataPoint
	var lastTs int64

	for ss.Next() {
		it := ss.At().Iterator(nil)
		for it.Next() == chunkenc.ValFloat {
			t, v := it.At()
			if lastPoint == nil || t > lastTs {
				lastTs = t
				lastPoint = &DataPoint{Timestamp: t / 1000, Value: v}
			}
		}
	}
	return lastPoint, nil
}

func (s *Store) Select(metric string, tags map[string]string, start, end, step int64, function string) ([]*DataPoint, error) {
	q, err := s.db.Querier(start*1000, end*1000)
	if err != nil {
		return nil, err
	}
	defer q.Close()

	matchers := []*labels.Matcher{labels.MustNewMatcher(labels.MatchEqual, labels.MetricName, metric)}
	for k, v := range tags {
		if v != "" {
			matchers = append(matchers, labels.MustNewMatcher(labels.MatchEqual, k, v))
		}
	}

	ss := q.Select(context.Background(), false, nil, matchers...)
	var results []*DataPoint

	type bucketData struct {
		sum   float64
		count int
		min   float64
		max   float64
		set   bool
	}
	buckets := make(map[int64]*bucketData)

	for ss.Next() {
		it := ss.At().Iterator(nil)
		var prevT int64 = 0
		for it.Next() == chunkenc.ValFloat {
			t, v := it.At()
			tSec := t / 1000

			if step > 0 {
				// Align buckets to local timezone offset
				_, offset := time.Unix(tSec, 0).In(time.Local).Zone()
				bucketTs := ((tSec+int64(offset))/step)*step - int64(offset)

				b, ok := buckets[bucketTs]
				if !ok {
					b = &bucketData{min: v, max: v, set: true}
					buckets[bucketTs] = b
				}

				if function == "integral" {
					if prevT > 0 {
						dt := (t - prevT) / 1000
						// Sanity check for dt to avoid massive spikes on gaps (2+min)
						if dt > 0 && dt <= 120 {
							b.sum += v * float64(dt)
						}
					}
					b.count++ // Count points
				} else {
					b.sum += v
					b.count++
				}

				if v < b.min {
					b.min = v
				}
				if v > b.max {
					b.max = v
				}
			} else {
				results = append(results, &DataPoint{Timestamp: tSec, Value: v})
			}
			prevT = t
		}
	}

	if step > 0 {
		for t, b := range buckets {
			var val float64
			switch function {
			case "sum":
				val = b.sum
			case "integral":
				val = b.sum // Already integrated (Watt-seconds)
			case "min":
				val = b.min
			case "max":
				val = b.max
			case "delta":
				val = b.max - b.min
			default:
				val = b.sum / float64(b.count) // Default to avg
			}
			results = append(results, &DataPoint{
				Timestamp: t,
				Value:     val,
			})
		}
	}

	sort.Slice(results, func(i, j int) bool {
		if results[i].Timestamp == results[j].Timestamp {
			return results[i].Value < results[j].Value
		}
		return results[i].Timestamp < results[j].Timestamp
	})
	return results, nil
}

func (s *Store) GetSeries(metric string) [][]Label {
	q, err := s.db.Querier(time.Now().Add(-24*time.Hour).UnixMilli(), time.Now().UnixMilli())
	if err != nil {
		return nil
	}
	defer q.Close()

	ss := q.Select(context.Background(), false, nil, labels.MustNewMatcher(labels.MatchEqual, labels.MetricName, metric))
	var results [][]Label
	for ss.Next() {
		lset := ss.At().Labels()
		var resLabels []Label
		lset.Range(func(l labels.Label) {
			if l.Name != labels.MetricName {
				resLabels = append(resLabels, Label{Name: l.Name, Value: l.Value})
			}
		})
		results = append(results, resLabels)
	}
	return results
}

func (s *Store) GetAllSeries() map[string]map[string][]Label {
	q, err := s.db.Querier(time.Now().Add(-30*24*time.Hour).UnixMilli(), time.Now().UnixMilli())
	if err != nil {
		return nil
	}
	defer q.Close()

	metricNames, _, err := q.LabelValues(context.Background(), labels.MetricName, nil)
	if err != nil {
		return nil
	}

	result := make(map[string]map[string][]Label)
	for _, name := range metricNames {
		result[name] = make(map[string][]Label)

		matchers := []*labels.Matcher{
			labels.MustNewMatcher(labels.MatchEqual, labels.MetricName, name),
		}
		ss := q.Select(context.Background(), false, nil, matchers...)
		for ss.Next() {
			lset := ss.At().Labels()
			var resLabels []Label
			var parts []string
			lset.Range(func(l labels.Label) {
				if l.Name != labels.MetricName {
					resLabels = append(resLabels, Label{Name: l.Name, Value: l.Value})
					parts = append(parts, fmt.Sprintf("%s=%s", l.Name, l.Value))
				}
			})
			sort.Strings(parts)
			key := strings.Join(parts, ",")
			result[name][key] = resLabels
		}
	}

	return result
}

func (s *Store) CompactOOO() error {
	s.logger.Info("Triggering manual compaction (OOO)")
	err := s.db.CompactOOOHead(context.Background())
	if err != nil {
		s.logger.Error("Manual compaction (OOO) failed", zap.Error(err))
	}
	return err
}

func (s *Store) Flush() error {
	s.logger.Info("Triggering manual compaction (Flush)")
	err := s.db.Compact(context.Background())
	if err != nil {
		s.logger.Error("Manual compaction (Flush) failed", zap.Error(err))
	}
	return err
}

func (s *Store) Checkpoint() error {
	s.logger.Info("Triggering manual compaction (Checkpoint)")
	err := s.db.Compact(context.Background())
	if err != nil {
		s.logger.Error("Manual compaction (Checkpoint) failed", zap.Error(err))
	}
	return err
}

func (s *Store) insertData(fn func(app storage.Appender) error) error {
	app := s.db.Appender(context.Background())
	if err := fn(app); err != nil {
		if rbErr := app.Rollback(); rbErr != nil {
			s.logger.Error("Failed to rollback appender", zap.Error(rbErr))
		}
		return err
	}
	if err := app.Commit(); err != nil {
		s.logger.Error("Failed to commit data batch", zap.Error(err))
		return err
	}
	return nil
}

func (s *Store) safeAppend(app storage.Appender, metric string, lset labels.Labels, t int64, v float64) error {
	b := labels.NewBuilder(lset)
	b.Set(labels.MetricName, metric)
	_, err := app.Append(0, b.Labels(), t, v)
	if err != nil {
		s.logger.Error("Append failed", zap.String("metric", metric), zap.Error(err))
	}
	return err
}

func (s *Store) safeAppendIfSet(app storage.Appender, metric string, lset labels.Labels, t int64, v *float64) error {
	if v != nil {
		return s.safeAppend(app, metric, lset, t, *v)
	}
	return nil
}

func (s *Store) InsertCollectionMark(ts time.Time) error {
	return s.insertData(func(app storage.Appender) error {
		return s.safeAppend(app, "collection_mark", labels.EmptyLabels(), ts.UnixMilli(), 1)
	})
}

func (s *Store) InsertMeterReadings(readings []MeterReading) error {
	if len(readings) == 0 {
		return nil
	}
	return s.insertData(func(app storage.Appender) error {
		for _, r := range readings {
			t := r.Timestamp.UnixMilli()
			labelsList := []string{"site", r.Site}
			if r.Phase != nil {
				labelsList = append(labelsList, "phase", *r.Phase)
			}
			l := labels.FromStrings(labelsList...)
			if err := s.safeAppendIfSet(app, "power_watts", l, t, r.Power); err != nil {
				return err
			}
			if err := s.safeAppendIfSet(app, "power_reactive_var", l, t, r.Reactive); err != nil {
				return err
			}
			if err := s.safeAppendIfSet(app, "power_apparent_va", l, t, r.Apparent); err != nil {
				return err
			}
			if err := s.safeAppendIfSet(app, "voltage_volts", l, t, r.Voltage); err != nil {
				return err
			}
			if err := s.safeAppendIfSet(app, "current_amps", l, t, r.Current); err != nil {
				return err
			}
			if err := s.safeAppendIfSet(app, "frequency_hertz", l, t, r.Frequency); err != nil {
				return err
			}
			if r.Imported != nil {
				if err := s.safeAppend(app, "energy_wh", labels.FromStrings("site", r.Site, "direction", "import"), t, *r.Imported); err != nil {
					return err
				}
			}
			if r.Exported != nil {
				if err := s.safeAppend(app, "energy_wh", labels.FromStrings("site", r.Site, "direction", "export"), t, *r.Exported); err != nil {
					return err
				}
			}
		}
		return nil
	})
}

func (s *Store) InsertInverterReadings(readings []InverterReading) error {
	if len(readings) == 0 {
		return nil
	}
	return s.insertData(func(app storage.Appender) error {
		for _, r := range readings {
			t, idx := r.Timestamp.UnixMilli(), fmt.Sprint(r.InverterIndex)
			invType := r.Type
			if invType == "" {
				invType = "battery"
			}
			l := labels.FromStrings("index", idx, "type", invType)
			if err := s.safeAppendIfSet(app, "inverter_power_watts", l, t, r.Power); err != nil {
				return err
			}
			if err := s.safeAppendIfSet(app, "inverter_frequency_hertz", l, t, r.Frequency); err != nil {
				return err
			}
			if err := s.safeAppendIfSet(app, "inverter_voltage_volts", labels.FromStrings("index", idx, "type", invType, "phase", "1"), t, r.Voltage1); err != nil {
				return err
			}
			if err := s.safeAppendIfSet(app, "inverter_voltage_volts", labels.FromStrings("index", idx, "type", invType, "phase", "2"), t, r.Voltage2); err != nil {
				return err
			}
			if err := s.safeAppendIfSet(app, "inverter_voltage_volts", labels.FromStrings("index", idx, "type", invType, "phase", "3"), t, r.Voltage3); err != nil {
				return err
			}
		}
		return nil
	})
}

func (s *Store) InsertSolarReadings(readings []SolarReading) error {
	if len(readings) == 0 {
		return nil
	}
	return s.insertData(func(app storage.Appender) error {
		for _, r := range readings {
			t, idx := r.Timestamp.UnixMilli(), fmt.Sprint(r.InverterIndex)
			l := labels.FromStrings("index", idx, "string", r.StringID)
			if err := s.safeAppendIfSet(app, "solar_voltage_volts", l, t, r.Voltage); err != nil {
				return err
			}
			if err := s.safeAppendIfSet(app, "solar_current_amps", l, t, r.Current); err != nil {
				return err
			}
			if err := s.safeAppendIfSet(app, "solar_power_watts", l, t, r.Power); err != nil {
				return err
			}
		}
		return nil
	})
}

func (s *Store) InsertBatteryReadings(readings []BatteryReading) error {
	if len(readings) == 0 {
		return nil
	}
	return s.insertData(func(app storage.Appender) error {
		for _, r := range readings {
			t, idx := r.Timestamp.UnixMilli(), fmt.Sprint(r.PodIndex)
			if r.PodIndex == -1 {
				if r.SOE != nil {
					if err := s.safeAppend(app, "battery_soe_percent", labels.EmptyLabels(), t, *r.SOE); err != nil {
						return err
					}
				}
			} else {
				if r.EnergyRemaining != nil {
					if err := s.safeAppend(app, "battery_energy_wh", labels.FromStrings("index", idx, "type", "remaining"), t, *r.EnergyRemaining); err != nil {
						return err
					}
				}
				if r.EnergyCapacity != nil {
					if err := s.safeAppend(app, "battery_energy_wh", labels.FromStrings("index", idx, "type", "capacity"), t, *r.EnergyCapacity); err != nil {
						return err
					}
				}
			}
		}
		return nil
	})
}

func (s *Store) InsertSystemStatus(readings []SystemStatus) error {
	if len(readings) == 0 {
		return nil
	}
	return s.insertData(func(app storage.Appender) error {
		for _, r := range readings {
			t := r.Timestamp.UnixMilli()
			if r.GridStatus != nil {
				if err := s.safeAppend(app, "grid_status_code", labels.EmptyLabels(), t, *r.GridStatus); err != nil {
					return err
				}
			}
			if r.ServicesActive != nil {
				val := 0.0
				if *r.ServicesActive {
					val = 1.0
				}
				if err := s.safeAppend(app, "grid_services_active_bool", labels.EmptyLabels(), t, val); err != nil {
					return err
				}
			}
		}
		return nil
	})
}

func (s *Store) InsertEnvironmentalReadings(readings []EnvironmentalReading) error {
	if len(readings) == 0 {
		return nil
	}
	return s.insertData(func(app storage.Appender) error {
		for _, r := range readings {
			t, idx := r.Timestamp.UnixMilli(), fmt.Sprint(r.MsaIndex)
			l := labels.FromStrings("index", idx)
			if err := s.safeAppendIfSet(app, "temperature_celsius", l, t, r.AmbientTemp); err != nil {
				return err
			}
			if err := s.safeAppendIfSet(app, "fan_speed_rpm", labels.FromStrings("index", idx, "type", "actual"), t, r.FanSpeedActual); err != nil {
				return err
			}
			if err := s.safeAppendIfSet(app, "fan_speed_rpm", labels.FromStrings("index", idx, "type", "target"), t, r.FanSpeedTarget); err != nil {
				return err
			}
		}
		return nil
	})
}

func (s *Store) InsertAlerts(readings []Alert) error {
	if len(readings) == 0 {
		return nil
	}
	return s.insertData(func(app storage.Appender) error {
		for _, r := range readings {
			if err := s.safeAppend(app, "active_alert", labels.FromStrings("source", r.Source, "name", r.Name), r.Timestamp.UnixMilli(), 1.0); err != nil {
				return err
			}
		}
		return nil
	})
}

func (s *Store) Insert(metric string, lbls []Label, value float64, timestamp int64) error {
	return s.insertData(func(app storage.Appender) error {
		ls := make([]string, 0, len(lbls)*2+2)
		ls = append(ls, labels.MetricName, metric)
		for _, l := range lbls {
			ls = append(ls, l.Name, l.Value)
		}
		return s.safeAppend(app, metric, labels.FromStrings(ls...), timestamp*1000, value)
	})
}
