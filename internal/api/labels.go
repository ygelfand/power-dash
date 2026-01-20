package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/ygelfand/power-dash/internal/config"
)

func (api *Api) getLabels(c *gin.Context) {
	if api.labelManager == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "label manager not initialized"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"config":   api.labelManager.Config,
		"writable": api.labelManager.IsWritable(),
	})
}

func (api *Api) saveLabels(c *gin.Context) {
	if api.labelManager == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "label manager not initialized"})
		return
	}

	if !api.labelManager.IsWritable() {
		c.JSON(http.StatusForbidden, gin.H{"error": "Label config file is not writable"})
		return
	}

	var req config.LabelConfig
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := api.labelManager.Save(req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "saved"})
}
