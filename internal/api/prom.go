package api

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

func (api *Api) promQuery(c *gin.Context) {
	query := c.Query("query")
	tsStr := c.Query("time")

	if query == "" {
		c.JSON(http.StatusBadRequest, gin.H{"status": "error", "errorType": "bad_data", "error": "missing query argument"})
		return
	}

	var ts time.Time
	if tsStr != "" {
		if t, err := parseTime(tsStr); err == nil {
			ts = t
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"status": "error", "errorType": "bad_data", "error": "invalid time parameter"})
			return
		}
	} else {
		ts = time.Now()
	}

	qry, err := api.promqlEngine.NewInstantQuery(context.Background(), api.store.Queryable(), nil, query, ts)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"status": "error", "errorType": "bad_data", "error": err.Error()})
		return
	}
	defer qry.Close()

	res := qry.Exec(c.Request.Context())
	if res.Err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"status": "error", "errorType": "execution", "error": res.Err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status": "success",
		"data": gin.H{
			"resultType": res.Value.Type(),
			"result":     res.Value,
		},
	})
}

func (api *Api) promQueryRange(c *gin.Context) {
	query := c.Query("query")
	startStr := c.Query("start")
	endStr := c.Query("end")
	stepStr := c.Query("step")

	if query == "" || startStr == "" || endStr == "" || stepStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"status": "error", "errorType": "bad_data", "error": "missing required parameters"})
		return
	}

	start, err := parseTime(startStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"status": "error", "errorType": "bad_data", "error": "invalid start parameter"})
		return
	}
	end, err := parseTime(endStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"status": "error", "errorType": "bad_data", "error": "invalid end parameter"})
		return
	}
	step, err := parseDuration(stepStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"status": "error", "errorType": "bad_data", "error": "invalid step parameter"})
		return
	}

	qry, err := api.promqlEngine.NewRangeQuery(context.Background(), api.store.Queryable(), nil, query, start, end, step)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"status": "error", "errorType": "bad_data", "error": err.Error()})
		return
	}
	defer qry.Close()

	res := qry.Exec(c.Request.Context())
	if res.Err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"status": "error", "errorType": "execution", "error": res.Err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status": "success",
		"data": gin.H{
			"resultType": res.Value.Type(),
			"result":     res.Value,
		},
	})
}

func parseTime(s string) (time.Time, error) {
	if t, err := strconv.ParseFloat(s, 64); err == nil {
		return time.UnixMilli(int64(t * 1000)), nil
	}
	return time.Parse(time.RFC3339, s)
}

func parseDuration(s string) (time.Duration, error) {
	if d, err := strconv.ParseFloat(s, 64); err == nil {
		return time.Duration(d * float64(time.Second)), nil
	}
	return time.ParseDuration(s)
}
