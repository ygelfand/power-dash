package api

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sort"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/ygelfand/power-dash/internal/config"
	"github.com/ygelfand/power-dash/internal/importer"
	"github.com/ygelfand/power-dash/internal/powerwall/queries"
	"github.com/ygelfand/power-dash/internal/store"
	"go.uber.org/zap"
	"gopkg.in/yaml.v3"
)

func (api *Api) queryMetrics(c *gin.Context) {
	if api.store == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "storage not initialized"})
		return
	}

	metric := c.Query("metric")
	if metric == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "metric is required"})
		return
	}

	startStr := c.Query("start")
	endStr := c.Query("end")
	stepStr := c.Query("step")
	function := c.Query("function")

	end := time.Now().Unix()
	start := end - 3600

	if endStr != "" {
		if val, err := strconv.ParseInt(endStr, 10, 64); err == nil {
			end = val
		}
	}
	if startStr != "" {
		if val, err := strconv.ParseInt(startStr, 10, 64); err == nil {
			start = val
		}
	}

	step := int64(0)
	if stepStr != "" {
		if val, err := strconv.ParseInt(stepStr, 10, 64); err == nil {
			step = val
		}
	}

	tags := make(map[string]string)
	for k, v := range c.Request.URL.Query() {
		if k == "metric" || k == "start" || k == "end" || k == "function" || k == "step" {
			continue
		}
		tags[k] = v[0]
	}

	points, err := api.store.Select(metric, tags, start, end, step, function)
	if err != nil {
		api.logger.Error("Query error", zap.Error(err), zap.String("metric", metric), zap.Any("tags", tags))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, points)
}

func (api *Api) getDashboards(c *gin.Context) {
	if api.dashboards == nil {
		c.JSON(http.StatusOK, []config.DashboardConfig{})
		return
	}
	c.JSON(http.StatusOK, api.dashboards)
}

type BatchQueryRequest struct {
	Metrics []struct {
		Name  string            `json:"name"`
		Label string            `json:"label"`
		Tags  map[string]string `json:"tags"`
		All   bool              `json:"all"`
	} `json:"metrics"`
	Start    int64  `json:"start"`
	End      int64  `json:"end"`
	Step     int64  `json:"step"`
	Function string `json:"function"`
}

func (api *Api) batchQueryMetrics(c *gin.Context) {
	if api.store == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "storage not initialized"})
		return
	}

	var req BatchQueryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	results := make(map[string][]*store.DataPoint)

	for _, m := range req.Metrics {
		targets := []struct {
			Key  string
			Tags map[string]string
		}{}

		baseKey := m.Label
		if baseKey == "" {
			baseKey = m.Name
		}

		if m.All {
			seriesList := api.store.GetSeries(m.Name)
			for _, sLabels := range seriesList {
				sTags := make(map[string]string)
				for _, l := range sLabels {
					sTags[l.Name] = l.Value
				}

				match := true
				for k, v := range m.Tags {
					if sTags[k] != v {
						match = false
						break
					}
				}

				if match {
					key := baseKey

					// Collect and sort keys to ensure deterministic output
					var extraKeys []string
					for k := range sTags {
						if _, ok := m.Tags[k]; !ok {
							extraKeys = append(extraKeys, k)
						}
					}
					sort.Strings(extraKeys)

					for _, k := range extraKeys {
						key += " " + sTags[k]
					}

					targets = append(targets, struct {
						Key  string
						Tags map[string]string
					}{Key: key, Tags: sTags})
				}
			}
		} else {
			targets = append(targets, struct {
				Key  string
				Tags map[string]string
			}{Key: baseKey, Tags: m.Tags})
		}

		for _, t := range targets {
			points, err := api.store.Select(m.Name, t.Tags, req.Start, req.End, req.Step, req.Function)
			if err != nil {
				api.logger.Error("Batch query error", zap.Error(err), zap.String("metric", m.Name), zap.Any("tags", t.Tags))
				continue
			}
			if points == nil {
				results[t.Key] = []*store.DataPoint{}
			} else {
				results[t.Key] = points
			}
		}
	}

	c.JSON(http.StatusOK, results)
}

type LatestQueryRequest struct {
	Metrics []struct {
		Name  string            `json:"name"`
		Label string            `json:"label"`
		Tags  map[string]string `json:"tags"`
	} `json:"metrics"`
}

func (api *Api) latestMetrics(c *gin.Context) {
	if api.store == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "storage not initialized"})
		return
	}

	var req LatestQueryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	results := make(map[string]*store.DataPoint)

	for _, m := range req.Metrics {
		key := m.Label
		if key == "" {
			key = m.Name
		}

		point, err := api.store.GetLastPoint(m.Name, m.Tags)
		if err != nil {
			api.logger.Error("Latest query error", zap.Error(err), zap.String("metric", m.Name))
			continue
		}
		if point != nil {
			results[key] = point
		}
	}

	c.JSON(http.StatusOK, results)
}

func (api *Api) getStatus(c *gin.Context) {
	if api.powerwall == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "powerwall not initialized"})
		return
	}

	compJson := api.powerwall.RunQuery("ComponentsQuery", nil)
	ctrl, err := api.powerwall.FetchController()
	statusRaw, _ := api.powerwall.MakeAPIRequest("GET", "status", nil)
	siteInfoRaw, _ := api.powerwall.MakeAPIRequest("GET", "site_info", nil)
	status := gin.H{
		"components": nil,
		"live":       nil,
		"system":     nil,
		"site":       nil,
	}
	if statusRaw != nil {
		var sys any
		if err := json.Unmarshal(statusRaw, &sys); err == nil {
			status["system"] = sys
		}
	}

	if siteInfoRaw != nil {
		var site any
		if err := json.Unmarshal(siteInfoRaw, &site); err == nil {
			status["site"] = site
		}
	}

	if compJson != nil {
		var comp any
		if err := json.Unmarshal([]byte(*compJson), &comp); err == nil {
			status["components"] = comp
		}
	}

	if err == nil {
		status["live"] = ctrl
	}

	c.JSON(http.StatusOK, status)
}

func applyDefaults(cfg *config.ProxyOptions) {
	defaults := config.NewDefaultProxyOptions()

	if cfg.CollectionInterval == 0 {
		cfg.CollectionInterval = defaults.CollectionInterval
	}
	if cfg.ListenOn == "" {
		cfg.ListenOn = defaults.ListenOn
	}
	if cfg.Storage.DataPath == "" {
		cfg.Storage.DataPath = defaults.Storage.DataPath
	}
	if cfg.Storage.PartitionDuration == "" {
		cfg.Storage.PartitionDuration = defaults.Storage.PartitionDuration
	}
	if cfg.LogLevel == "" {
		cfg.LogLevel = defaults.LogLevel
	}
	if cfg.DefaultTheme == "" {
		cfg.DefaultTheme = defaults.DefaultTheme
	}
}

func (api *Api) getSettings(c *gin.Context) {
	if api.options == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "settings not initialized"})
		return
	}

	configPath := api.options.ConfigPath
	writable := false
	var fileConfig config.ProxyOptions

	if configPath != "" {
		info, err := os.Stat(configPath)
		if err == nil {
			f, err := os.OpenFile(configPath, os.O_RDWR, info.Mode())
			if err == nil {
				writable = true
				// Try to read the file config
				dec := yaml.NewDecoder(f)
				_ = dec.Decode(&fileConfig)
				f.Close()
			}
		}
	}

	// Apply defaults to fileConfig so it matches the "Effective" baseline
	// This prevents "Defaults" from looking like "Overrides"
	applyDefaults(&fileConfig)

	overrides := computeOverrides(&fileConfig, api.options)

	c.JSON(http.StatusOK, gin.H{
		"config":    fileConfig,
		"effective": api.options,
		"path":      configPath,
		"writable":  writable,
		"overrides": overrides,
	})
}

func computeOverrides(file, effective *config.ProxyOptions) map[string]string {
	overrides := make(map[string]string)

	check := func(key string, fileVal, effVal interface{}) {
		if fileVal != effVal {
			overrides[key] = "override"
		}
	}

	check("endpoint", file.Endpoint, effective.Endpoint)
	check("password", file.Password, effective.Password)
	check("collection-interval", file.CollectionInterval, effective.CollectionInterval)
	check("auto-refresh", file.AutoRefresh, effective.AutoRefresh)
	check("default-theme", file.DefaultTheme, effective.DefaultTheme)
	check("log-level", file.LogLevel, effective.LogLevel)
	check("no-collector", file.DisableCollector, effective.DisableCollector)
	check("listen", file.ListenOn, effective.ListenOn)
	check("storage.path", file.Storage.DataPath, effective.Storage.DataPath)
	check("storage.retention", file.Storage.Retention, effective.Storage.Retention)
	check("storage.partition", file.Storage.PartitionDuration, effective.Storage.PartitionDuration)

	return overrides
}

func updateIfNotOverridden[T any](overrides map[string]string, key string, target *T, value T) {
	if _, ok := overrides[key]; !ok {
		*target = value
	}
}

func (api *Api) saveSettings(c *gin.Context) {
	var req struct {
		Config config.ProxyOptions `json:"config"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	configPath := api.options.ConfigPath
	if configPath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No config file in use, cannot save."})
		return
	}

	// Read the current file state to preserve non-overridden values
	fRead, err := os.Open(configPath)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "Could not open config file: " + err.Error()})
		return
	}
	var fileConfig config.ProxyOptions
	dec := yaml.NewDecoder(fRead)
	if err := dec.Decode(&fileConfig); err != nil && err.Error() != "EOF" {
		fRead.Close()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode existing config: " + err.Error()})
		return
	}
	fRead.Close()

	overrides := computeOverrides(&fileConfig, api.options)

	updateIfNotOverridden(overrides, "endpoint", &fileConfig.Endpoint, req.Config.Endpoint)
	updateIfNotOverridden(overrides, "password", &fileConfig.Password, req.Config.Password)
	updateIfNotOverridden(overrides, "collection-interval", &fileConfig.CollectionInterval, req.Config.CollectionInterval)
	updateIfNotOverridden(overrides, "auto-refresh", &fileConfig.AutoRefresh, req.Config.AutoRefresh)
	updateIfNotOverridden(overrides, "default-theme", &fileConfig.DefaultTheme, req.Config.DefaultTheme)
	updateIfNotOverridden(overrides, "log-level", &fileConfig.LogLevel, req.Config.LogLevel)
	updateIfNotOverridden(overrides, "no-collector", &fileConfig.DisableCollector, req.Config.DisableCollector)
	updateIfNotOverridden(overrides, "listen", &fileConfig.ListenOn, req.Config.ListenOn)
	updateIfNotOverridden(overrides, "storage.path", &fileConfig.Storage.DataPath, req.Config.Storage.DataPath)
	updateIfNotOverridden(overrides, "storage.retention", &fileConfig.Storage.Retention, req.Config.Storage.Retention)
	updateIfNotOverridden(overrides, "storage.partition", &fileConfig.Storage.PartitionDuration, req.Config.Storage.PartitionDuration)

	fileConfig.Dashboards = req.Config.Dashboards

	fWrite, err := os.OpenFile(configPath, os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "Could not open config file for writing: " + err.Error()})
		return
	}
	defer fWrite.Close()

	enc := yaml.NewEncoder(fWrite)
	enc.SetIndent(2)
	if err := enc.Encode(fileConfig); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to encode config: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "saved"})
}

func (api *Api) forceRunCollectors(c *gin.Context) {
	if api.collectorManager == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "collector is disabled"})
		return
	}

	var req struct {
		Name string `json:"name"`
	}
	_ = c.ShouldBindJSON(&req)

	if req.Name != "" {
		res := api.collectorManager.ForceRunOne(c.Request.Context(), req.Name)
		if res == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "collector not found"})
			return
		}
		c.JSON(http.StatusOK, res)
		return
	}

	report := api.collectorManager.ForceRun(c.Request.Context())
	c.JSON(http.StatusOK, report)
}

func (api *Api) debugQuery(c *gin.Context) {
	var req struct {
		Name   string `json:"name"`
		Params string `json:"params"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	res := api.powerwall.RunQuery(req.Name, &req.Params)
	if res == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query failed"})
		return
	}

	var data any
	if err := json.Unmarshal([]byte(*res), &data); err != nil {
		// Return raw string if not JSON
		c.String(http.StatusOK, *res)
		return
	}

	c.JSON(http.StatusOK, data)
}

func (api *Api) downloadTechBundle(c *gin.Context) {
	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)

	// 1. Run all queries
	for _, qName := range queries.QueryList() {
		res := api.powerwall.RunQuery(qName, nil)
		if res != nil {
			f, _ := zw.Create(fmt.Sprintf("queries/%s.json", qName))
			var pretty bytes.Buffer
			_ = json.Indent(&pretty, []byte(*res), "", "  ")
			_, _ = f.Write(pretty.Bytes())
		}
	}

	// 2. Export Config (sanitized)
	conf, _ := yaml.Marshal(api.options)
	f, _ := zw.Create("config.yaml")
	_, _ = f.Write(conf)

	// 3. TSDB Stats
	stats := map[string]any{
		"ts":     time.Now(),
		"series": api.store.GetAllSeries(),
	}
	statsJson, _ := json.MarshalIndent(stats, "", "  ")
	sf, _ := zw.Create("tsdb_stats.json")
	_, _ = sf.Write(statsJson)

	_ = zw.Close()

	fileName := fmt.Sprintf("power-dash-bundle-%d.zip", time.Now().Unix())
	c.Header("Content-Disposition", "attachment; filename="+fileName)
	c.Data(http.StatusOK, "application/zip", buf.Bytes())
}

func (api *Api) testImport(c *gin.Context) {
	var req importer.Config
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	imp := importer.NewImporter(req, api.store, api.logger)
	if err := imp.TestConnection(); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "connected"})
}

func (api *Api) getImportStatus(c *gin.Context) {
	c.JSON(http.StatusOK, api.importStatus)
}

func (api *Api) runImport(c *gin.Context) {
	var req struct {
		importer.Config
		Start time.Time `json:"start"`
		End   time.Time `json:"end"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if api.importStatus.Active {
		c.JSON(http.StatusConflict, gin.H{"error": "An import is already in progress"})
		return
	}

	imp := importer.NewImporter(req.Config, api.store, api.logger)

	// Calculate total days (chunks)
	totalDays := int(req.End.Sub(req.Start).Hours()/24) + 1
	api.importStatus.Active = true
	api.importStatus.TotalChunks = totalDays
	api.importStatus.CurrentChunk = 0
	api.importStatus.Percentage = 0
	api.importStatus.Message = "Starting import..."
	api.importStatus.Error = ""

	// Run in background
	go func() {
		progress := make(chan string)
		done := make(chan struct{})

		go func() {
			for msg := range progress {
				api.importStatus.CurrentChunk++
				api.importStatus.Message = msg
				api.importStatus.Percentage = (float64(api.importStatus.CurrentChunk) / float64(api.importStatus.TotalChunks)) * 100
			}
			close(done)
		}()

		err := imp.RunImport(context.Background(), req.Start, req.End, progress)
		close(progress)
		<-done

		api.importStatus.Active = false
		if err != nil {
			api.importStatus.Error = err.Error()
			api.logger.Error("Background import failed", zap.Error(err))
		} else {
			api.importStatus.Message = "Import completed successfully"
			api.importStatus.Percentage = 100
			api.logger.Info("Background import completed")
		}
	}()

	c.JSON(http.StatusOK, gin.H{"status": "started"})
}
