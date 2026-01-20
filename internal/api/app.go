package api

import (
	"net/http"
	"net/http/httputil"
	"strings"
	"time"

	"github.com/gin-contrib/gzip"
	"github.com/gin-contrib/timeout"
	ginzap "github.com/gin-contrib/zap"
	"github.com/gin-gonic/gin"
	"github.com/ygelfand/power-dash/internal/collector"
	"github.com/ygelfand/power-dash/internal/config"
	"github.com/ygelfand/power-dash/internal/powerwall"
	"github.com/ygelfand/power-dash/internal/store"
	"github.com/ygelfand/power-dash/internal/ui"
	"go.uber.org/zap"
)

type Api struct {
	powerwall        *powerwall.PowerwallGateway
	proxy            *httputil.ReverseProxy
	store            *store.Store
	collectorManager *collector.Manager
	options          *config.ProxyOptions
	dashboards       []config.DashboardConfig
	logger           *zap.Logger
	importStatus     *ImportStatus
	labelManager     *config.LabelManager
}

type ImportStatus struct {
	Active       bool    `json:"active"`
	TotalChunks  int     `json:"total_chunks"`
	CurrentChunk int     `json:"current_chunk"`
	Message      string  `json:"message"`
	Error        string  `json:"error,omitempty"`
	Percentage   float64 `json:"percentage"`
}

func NewApi(p *powerwall.PowerwallGateway, s *store.Store, cm *collector.Manager, opts *config.ProxyOptions, z *zap.Logger, lm *config.LabelManager) *Api {
	if z == nil {
		z = zap.NewNop()
	}
	return &Api{
		powerwall:        p,
		proxy:            newProxy(p),
		store:            s,
		collectorManager: cm,
		options:          opts,
		dashboards:       opts.Dashboards,
		logger:           z,
		importStatus:     &ImportStatus{},
		labelManager:     lm,
	}
}

func timeoutMiddleware() gin.HandlerFunc {
	return timeout.New(
		timeout.WithTimeout(10*time.Second),
		timeout.WithResponse(func(c *gin.Context) {
			c.String(http.StatusRequestTimeout, "timeout")
		}),
	)
}

func (api *Api) Handler() http.Handler {
	router := gin.New()

	// Use standard recovery first to catch panics and log them properly
	router.Use(gin.Recovery())

	// Enable Gzip compression
	router.Use(gzip.Gzip(gzip.DefaultCompression))

	if api.logger != nil {
		router.Use(ginzap.Ginzap(api.logger, time.RFC3339, true))
	} else {
		router.Use(gin.Logger())
	}

	router.Use(timeoutMiddleware())
	router.SetTrustedProxies(nil)

	base := router.Group("/api")
	{
		v1 := base.Group("/v1")
		{
			v1.POST("/query", api.batchQueryMetrics)
			v1.POST("/latest", api.latestMetrics)
			v1.GET("/dashboards", api.getDashboards)
			v1.GET("/status", api.getStatus)
			v1.GET("/settings", api.getSettings)
			v1.POST("/settings", api.saveSettings)
			v1.GET("/labels", api.getLabels)
			v1.POST("/labels", api.saveLabels)
			v1.POST("/collectors/run", api.forceRunCollectors)
			v1.POST("/debug/query", api.debugQuery)
			v1.GET("/debug/bundle", api.downloadTechBundle)
			v1.POST("/import/test", api.testImport)
			v1.POST("/import/run", api.runImport)
			v1.GET("/import/status", api.getImportStatus)
			v1.GET("/config", api.getConfig)
		}
	}

	router.StaticFS("/assets", http.FS(ui.GetAssetsFS()))
	router.StaticFS("/images", http.FS(ui.GetImagesFS()))

	router.GET("/", ui.ServeSPA)

	router.NoRoute(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api") {
			api.proxyRequest(c)
			return
		}
		ui.ServeSPA(c)
	})

	return router
}

func (api *Api) Run(listen string) {
	srv := &http.Server{
		Addr:    listen,
		Handler: api.Handler(),
	}
	srv.ListenAndServe()
}
