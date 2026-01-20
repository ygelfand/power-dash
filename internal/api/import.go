package api

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/ygelfand/power-dash/internal/importer"
	"go.uber.org/zap"
)

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
