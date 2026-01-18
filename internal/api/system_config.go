package api

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/ygelfand/power-dash/internal/powerwall"
	"go.uber.org/zap"
)

type cachedConfig struct {
	config    *powerwall.ConfigResponse
	timestamp time.Time
}

var (
	configCache cachedConfig
	configMutex sync.RWMutex
	cacheTTL    = 15 * time.Minute
)

func (api *Api) getConfig(c *gin.Context) {
	configMutex.RLock()
	if configCache.config != nil && time.Since(configCache.timestamp) < cacheTTL {
		c.JSON(http.StatusOK, configCache.config)
		configMutex.RUnlock()
		return
	}
	configMutex.RUnlock()

	// Fetch fresh config
	cfg, err := api.powerwall.FetchConfig()
	if err != nil {
		api.logger.Error("Failed to fetch config", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch system config"})
		return
	}

	configMutex.Lock()
	configCache.config = cfg
	configCache.timestamp = time.Now()
	configMutex.Unlock()

	c.JSON(http.StatusOK, cfg)
}
