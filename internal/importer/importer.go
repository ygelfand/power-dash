package importer

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	client "github.com/influxdata/influxdb1-client/v2"
	"github.com/ygelfand/power-dash/internal/store"
	"github.com/ygelfand/power-dash/internal/utils"
	"go.uber.org/zap"
)

type Config struct {
	Host              string   `json:"host"`
	Database          string   `json:"database"`
	User              string   `json:"user"`
	Password          string   `json:"password"`
	Measurements      []string `json:"measurements"`
	RetentionPolicies []string `json:"retention_policies"`
}

type Importer struct {
	config Config
	store  *store.Store
	logger *zap.Logger
}

func NewImporter(cfg Config, s *store.Store, l *zap.Logger) *Importer {
	if len(cfg.Measurements) == 0 {
		cfg.Measurements = []string{"http", "alerts", "soe", "vitals", "pwfans", "pwtemps"}
	}
	if len(cfg.RetentionPolicies) == 0 {
		cfg.RetentionPolicies = []string{"autogen", "strings", "pwtemps", "vitals", "pod", "pwfans", "alerts"}
	}
	if l == nil {
		l = zap.NewNop()
	}
	return &Importer{config: cfg, store: s, logger: l}
}

func (imp *Importer) TestConnection() error {
	c, err := client.NewHTTPClient(client.HTTPConfig{
		Addr:     imp.config.Host,
		Username: imp.config.User,
		Password: imp.config.Password,
		Timeout:  5 * time.Second,
	})
	if err != nil {
		return fmt.Errorf("failed to create client: %w", err)
	}
	defer c.Close()

	_, _, err = c.Ping(2 * time.Second)
	if err != nil {
		return fmt.Errorf("ping failed: %w", err)
	}

	// Check if DB exists
	q := client.NewQuery("SHOW DATABASES", "", "")
	resp, err := c.Query(q)
	if err != nil {
		return fmt.Errorf("failed to query databases: %w", err)
	}
	if resp.Error() != nil {
		return resp.Error()
	}

	found := false
	for _, res := range resp.Results {
		for _, series := range res.Series {
			for _, val := range series.Values {
				if val[0] == imp.config.Database {
					found = true
					break
				}
			}
		}
	}

	if !found {
		return fmt.Errorf("database '%s' not found", imp.config.Database)
	}

	return nil
}

func (imp *Importer) RunImport(ctx context.Context, start, end time.Time, progress chan<- string) error {
	c, err := client.NewHTTPClient(client.HTTPConfig{
		Addr:     imp.config.Host,
		Username: imp.config.User,
		Password: imp.config.Password,
	})
	if err != nil {
		return err
	}
	defer c.Close()

	chunkSize := 24 * time.Hour
	for chunkStart := start; chunkStart.Before(end); chunkStart = chunkStart.Add(chunkSize) {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		chunkEnd := chunkStart.Add(chunkSize)
		if chunkEnd.After(end) {
			chunkEnd = end
		}

		if progress != nil {
			progress <- fmt.Sprintf("Processing %s to %s", chunkStart.Format("2006-01-02"), chunkEnd.Format("2006-01-02"))
		}

		var allSeries []seriesInfo
		for _, rp := range imp.config.RetentionPolicies {
			for _, measurement := range imp.config.Measurements {
				queryStr := fmt.Sprintf("SELECT * FROM \"%s\".\"%s\" WHERE time >= '%s' AND time < '%s' GROUP BY * ORDER BY time ASC",
					rp, measurement, chunkStart.Format(time.RFC3339), chunkEnd.Format(time.RFC3339))

				q := client.NewQuery(queryStr, imp.config.Database, "ns")
				response, err := c.Query(q)
				if err != nil || response.Error() != nil {
					continue
				}

				for _, result := range response.Results {
					for _, row := range result.Series {
						allSeries = append(allSeries, seriesInfo{rp: rp, measurement: measurement, tags: row.Tags, columns: row.Columns, values: row.Values})
					}
				}
			}
		}

		if len(allSeries) > 0 {
			imp.logger.Info("Importing data chunk", zap.Int("series_count", len(allSeries)), zap.Time("start", chunkStart), zap.Time("end", chunkEnd))
			processSeries(imp.store, allSeries, imp.logger)
			_ = imp.store.Checkpoint()
		} else {
			imp.logger.Debug("No data found in chunk", zap.Time("start", chunkStart), zap.Time("end", chunkEnd))
		}
	}

	imp.logger.Info("Import complete, flushing storage")
	return imp.store.Flush()
}

// Internal helper logic moved from CLI

var (
	solarStringRegex = regexp.MustCompile(`^([A-Z])(\d*)_(Voltage|Current|Power)$`)
	pwIndexRegex     = regexp.MustCompile(`^PW(\d+)_`)
	fanFieldRegex    = regexp.MustCompile(`(?i)^([A-Z])(\d*)_(actual|target)_rpm$`)
)

type seriesInfo struct {
	rp          string
	measurement string
	tags        map[string]string
	columns     []string
	values      [][]interface{}
}

func parseNumber(val interface{}) (float64, bool) {
	if val == nil {
		return 0, false
	}
	switch v := val.(type) {
	case json.Number:
		f, err := v.Float64()
		return f, err == nil
	case float64:
		return v, true
	case int64:
		return float64(v), true
	case string:
		f, err := strconv.ParseFloat(v, 64)
		return f, err == nil
	default:
		return 0, false
	}
}

func isStatusField(col string) bool {
	lower := strings.ToLower(col)
	return strings.Contains(lower, "status") ||
		strings.Contains(lower, "connected") ||
		strings.Contains(lower, "active") ||
		strings.Contains(lower, "alert")
}

func processSeries(st *store.Store, allSeries []seriesInfo, logger *zap.Logger) {
	var meters []store.MeterReading
	var batteries []store.BatteryReading
	var system []store.SystemStatus
	var inverters []store.InverterReading
	var solar []store.SolarReading
	var env []store.EnvironmentalReading
	var alerts []store.Alert
	for _, info := range allSeries {
		measurement, columns, values := info.measurement, info.columns, info.values
		colMap := make(map[string]int)
		for i, col := range columns {
			colMap[col] = i
		}
		for _, rowValues := range values {
			tsNs, _ := parseNumber(rowValues[0])
			ts := time.Unix(0, int64(tsNs))
			if ts.IsZero() {
				continue
			}

			for colName, colIdx := range colMap {
				if colName == "time" {
					continue
				}
				floatVal, ok := parseNumber(rowValues[colIdx])
				if !ok && measurement != "alerts" && !strings.Contains(colName, "GridConnected") {
					continue
				}
				if floatVal == 0 && !isStatusField(colName) && measurement != "alerts" {
					continue
				}
				switch {
				case colName == "percentage" || colName == "value" && measurement == "soe":
					if floatVal < 1.01 {
						floatVal *= 100
					}
					batteries = append(batteries, store.BatteryReading{Timestamp: ts, PodIndex: -1, SOE: utils.ToPtr(floatVal)})
				case colName == "home" || colName == "load":
					meters = append(meters, store.MeterReading{Timestamp: ts, Site: "load", Power: utils.ToPtr(floatVal)})
				case colName == "solar":
					meters = append(meters, store.MeterReading{Timestamp: ts, Site: "solar", Power: utils.ToPtr(floatVal)})
				case colName == "from_grid":
					meters = append(meters, store.MeterReading{Timestamp: ts, Site: "site_import", Power: utils.ToPtr(floatVal)})
					meters = append(meters, store.MeterReading{Timestamp: ts, Site: "site", Power: utils.ToPtr(floatVal)})
				case colName == "to_grid":
					meters = append(meters, store.MeterReading{Timestamp: ts, Site: "site_export", Power: utils.ToPtr(floatVal)})
					meters = append(meters, store.MeterReading{Timestamp: ts, Site: "site", Power: utils.ToPtr(-floatVal)})
				case colName == "from_pw":
					meters = append(meters, store.MeterReading{Timestamp: ts, Site: "battery_export", Power: utils.ToPtr(floatVal)})
					meters = append(meters, store.MeterReading{Timestamp: ts, Site: "battery", Power: utils.ToPtr(floatVal)})
				case colName == "to_pw":
					meters = append(meters, store.MeterReading{Timestamp: ts, Site: "battery_import", Power: utils.ToPtr(floatVal)})
					meters = append(meters, store.MeterReading{Timestamp: ts, Site: "battery", Power: utils.ToPtr(-floatVal)})
				case strings.Contains(colName, "ISLAND_VL1N_Main") || colName == "grid_voltage_l1":
					meters = append(meters, store.MeterReading{Timestamp: ts, Site: "site", Phase: utils.ToPtr("1"), Voltage: utils.ToPtr(floatVal)})
				case strings.Contains(colName, "ISLAND_VL2N_Main") || colName == "grid_voltage_l2":
					meters = append(meters, store.MeterReading{Timestamp: ts, Site: "site", Phase: utils.ToPtr("2"), Voltage: utils.ToPtr(floatVal)})
				case strings.Contains(colName, "ISLAND_VL1N_Load") || colName == "load_voltage_l1":
					meters = append(meters, store.MeterReading{Timestamp: ts, Site: "load", Phase: utils.ToPtr("1"), Voltage: utils.ToPtr(floatVal)})
				case strings.Contains(colName, "ISLAND_VL2N_Load") || colName == "load_voltage_l2":
					meters = append(meters, store.MeterReading{Timestamp: ts, Site: "load", Phase: utils.ToPtr("2"), Voltage: utils.ToPtr(floatVal)})
				case strings.Contains(colName, "ISLAND_FreqL1_Main") || colName == "grid_frequency_l1":
					meters = append(meters, store.MeterReading{Timestamp: ts, Site: "site", Phase: utils.ToPtr("1"), Frequency: utils.ToPtr(floatVal)})
				case strings.Contains(colName, "ISLAND_FreqL2_Main") || colName == "grid_frequency_l2":
					meters = append(meters, store.MeterReading{Timestamp: ts, Site: "site", Phase: utils.ToPtr("2"), Frequency: utils.ToPtr(floatVal)})
				case strings.Contains(colName, "ISLAND_FreqL3_Main") || colName == "grid_frequency_l3":
					meters = append(meters, store.MeterReading{Timestamp: ts, Site: "site", Phase: utils.ToPtr("3"), Frequency: utils.ToPtr(floatVal)})
				case strings.Contains(colName, "ISLAND_FreqL1_Load") || colName == "load_frequency_l1":
					meters = append(meters, store.MeterReading{Timestamp: ts, Site: "load", Phase: utils.ToPtr("1"), Frequency: utils.ToPtr(floatVal)})
				case strings.Contains(colName, "ISLAND_FreqL2_Load") || colName == "load_frequency_l2":
					meters = append(meters, store.MeterReading{Timestamp: ts, Site: "load", Phase: utils.ToPtr("2"), Frequency: utils.ToPtr(floatVal)})
				case strings.Contains(colName, "ISLAND_FreqL3_Load") || colName == "load_frequency_l3":
					meters = append(meters, store.MeterReading{Timestamp: ts, Site: "load", Phase: utils.ToPtr("3"), Frequency: utils.ToPtr(floatVal)})
				case strings.Contains(colName, "ISLAND_Freq_Main") || colName == "grid_frequency":
					meters = append(meters, store.MeterReading{Timestamp: ts, Site: "site", Frequency: utils.ToPtr(floatVal)})
				case strings.Contains(colName, "ISLAND_Freq_Load") || colName == "load_frequency":
					meters = append(meters, store.MeterReading{Timestamp: ts, Site: "load", Frequency: utils.ToPtr(floatVal)})
				case colName == "PVAC_Fan_Speed_Actual_RPM" || colName == "pvac_fan_speed_actual_rpm" || colName == "fan_speed":
					idx := 0
					if v, ok := info.tags["index"]; ok {
						idx, _ = strconv.Atoi(v)
					} else if v, ok := info.tags["pvac"]; ok {
						idx, _ = strconv.Atoi(v)
					}
					env = append(env, store.EnvironmentalReading{Timestamp: ts, MsaIndex: idx, FanSpeedActual: utils.ToPtr(floatVal)})
				case colName == "PVAC_Fan_Speed_Target_RPM" || colName == "pvac_fan_speed_target_rpm" || colName == "fan_target":
					idx := 0
					if v, ok := info.tags["index"]; ok {
						idx, _ = strconv.Atoi(v)
					} else if v, ok := info.tags["pvac"]; ok {
						idx, _ = strconv.Atoi(v)
					}
					env = append(env, store.EnvironmentalReading{Timestamp: ts, MsaIndex: idx, FanSpeedTarget: utils.ToPtr(floatVal)})
				case fanFieldRegex.MatchString(colName):
					m := fanFieldRegex.FindStringSubmatch(colName)
					letter := strings.ToUpper(m[1])
					numStr := m[2]
					isTarget := strings.ToLower(m[3]) == "target"

					idx := int(letter[0] - 'A')
					if numStr != "" {
						n, _ := strconv.Atoi(numStr)
						idx += n
					}

					r := store.EnvironmentalReading{Timestamp: ts, MsaIndex: idx}
					if isTarget {
						r.FanSpeedTarget = utils.ToPtr(floatVal)
					} else {
						r.FanSpeedActual = utils.ToPtr(floatVal)
					}
					env = append(env, r)
				case solarStringRegex.MatchString(colName):
					m := solarStringRegex.FindStringSubmatch(colName)
					idx := 0
					if m[2] != "" {
						idx, _ = strconv.Atoi(m[2])
					}
					metricType := m[3]

					r := store.SolarReading{Timestamp: ts, InverterIndex: idx, StringID: m[1]}
					switch metricType {
					case "Voltage":
						r.Voltage = utils.ToPtr(floatVal)
					case "Current":
						r.Current = utils.ToPtr(floatVal)
					case "Power":
						r.Power = utils.ToPtr(floatVal)
					}
					solar = append(solar, r)
				case pwIndexRegex.MatchString(colName):
					m := pwIndexRegex.FindStringSubmatch(colName)
					idx, _ := strconv.Atoi(m[1])
					if idx > 0 {
						idx--
					}
					suffix := colName[len(m[0]):]
					switch suffix {
					case "temp":
						env = append(env, store.EnvironmentalReading{Timestamp: ts, MsaIndex: idx, AmbientTemp: utils.ToPtr(floatVal)})
					case "PVAC_Fan_Speed_Actual_RPM":
						env = append(env, store.EnvironmentalReading{Timestamp: ts, MsaIndex: idx, FanSpeedActual: utils.ToPtr(floatVal)})
					case "PVAC_Fan_Speed_Target_RPM":
						env = append(env, store.EnvironmentalReading{Timestamp: ts, MsaIndex: idx, FanSpeedTarget: utils.ToPtr(floatVal)})
					case "PINV_Fout":
						inverters = append(inverters, store.InverterReading{Timestamp: ts, InverterIndex: idx, Type: "battery", Frequency: utils.ToPtr(floatVal)})
					case "p_out":
						inverters = append(inverters, store.InverterReading{Timestamp: ts, InverterIndex: idx, Type: "battery", Power: utils.ToPtr(floatVal)})
					case "PINVVSplit1", "PINV_VSplit1":
						inverters = append(inverters, store.InverterReading{Timestamp: ts, InverterIndex: idx, Type: "battery", Voltage1: utils.ToPtrIfNonZero(floatVal)})
					case "PINVVSplit2", "PINV_VSplit2":
						inverters = append(inverters, store.InverterReading{Timestamp: ts, InverterIndex: idx, Type: "battery", Voltage2: utils.ToPtrIfNonZero(floatVal)})
					case "PINVVSplit3", "PINV_VSplit3":
						inverters = append(inverters, store.InverterReading{Timestamp: ts, InverterIndex: idx, Type: "battery", Voltage3: utils.ToPtrIfNonZero(floatVal)})
					case "POD_nom_energy_remaining":
						batteries = append(batteries, store.BatteryReading{Timestamp: ts, PodIndex: idx, EnergyRemaining: utils.ToPtr(floatVal)})
					case "POD_nom_full_pack_energy":
						batteries = append(batteries, store.BatteryReading{Timestamp: ts, PodIndex: idx, EnergyCapacity: utils.ToPtr(floatVal)})
					}
				case colName == "ISLAND_GridConnected" || colName == "grid_status":
					val := floatVal
					if s, sOk := rowValues[colIdx].(string); sOk {
						if s == "Connected" {
							val = 1.0
						} else {
							val = 0.0
						}
					}
					system = append(system, store.SystemStatus{Timestamp: ts, GridStatus: utils.ToPtr(val)})
				case measurement == "alerts":
					alertName := strings.TrimPrefix(colName, "max_")
					if alertName == "value" || alertName == "alerts" {
						continue
					}
					if floatVal >= 1.0 {
						alerts = append(alerts, store.Alert{Timestamp: ts, Source: "control", Name: alertName})
					}
				}
			}
		}
	}
	if len(meters) > 0 {
		logger.Debug("Inserting meter readings", zap.Int("count", len(meters)))
		_ = st.InsertMeterReadings(meters)
	}
	if len(batteries) > 0 {
		logger.Debug("Inserting battery points", zap.Int("count", len(batteries)))
		_ = st.InsertBatteryReadings(batteries)
	}
	if len(system) > 0 {
		logger.Debug("Inserting system status", zap.Int("count", len(system)))
		_ = st.InsertSystemStatus(system)
	}
	if len(inverters) > 0 {
		logger.Debug("Inserting inverter readings", zap.Int("count", len(inverters)))
		_ = st.InsertInverterReadings(inverters)
	}
	if len(solar) > 0 {
		logger.Debug("Inserting solar readings", zap.Int("count", len(solar)))
		_ = st.InsertSolarReadings(solar)
	}
	if len(env) > 0 {
		logger.Debug("Inserting environmental data", zap.Int("count", len(env)))
		_ = st.InsertEnvironmentalReadings(env)
	}
	if len(alerts) > 0 {
		logger.Debug("Inserting alerts", zap.Int("count", len(alerts)))
		_ = st.InsertAlerts(alerts)
	}
	logger.Info("Chunk processing complete",
		zap.Int("meters", len(meters)),
		zap.Int("batteries", len(batteries)),
		zap.Int("inverters", len(inverters)),
		zap.Int("solar", len(solar)),
		zap.Int("alerts", len(alerts)))
}
