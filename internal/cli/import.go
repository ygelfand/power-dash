package cli

import (
	"context"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
	"github.com/ygelfand/power-dash/internal/config"
	"github.com/ygelfand/power-dash/internal/importer"
	"github.com/ygelfand/power-dash/internal/store"
	"go.uber.org/zap"
)

var importCmd = &cobra.Command{
	Use:   "import",
	Short: "Import data from InfluxDB 1.x",
	Run:   runImport,
}

func init() {
	rootCmd.AddCommand(importCmd)

	importCmd.Flags().String("influx-host", "http://localhost:8086", "InfluxDB host")
	importCmd.Flags().String("influx-db", "powerwall", "InfluxDB database")
	importCmd.Flags().String("influx-user", "", "InfluxDB username")
	importCmd.Flags().String("influx-pass", "", "InfluxDB password")
	importCmd.Flags().StringSlice("measurements", []string{"http", "alerts", "soe", "vitals"}, "Specific measurements to import")
	importCmd.Flags().StringSlice("retention-policies", []string{"autogen", "strings", "pwtemps", "vitals", "pod", "pwfans", "alerts"}, "Retention policies to query")
	importCmd.Flags().String("since", "2mo", "Import data since this duration (e.g. 24h, 7d, 2mo)")
}

func parseSince(since string) (time.Duration, error) {
	if strings.HasSuffix(since, "mo") {
		months, _ := strconv.Atoi(strings.TrimSuffix(since, "mo"))
		return time.Duration(months) * 30 * 24 * time.Hour, nil
	}
	if strings.HasSuffix(since, "d") {
		days, _ := strconv.Atoi(strings.TrimSuffix(since, "d"))
		return time.Duration(days) * 24 * time.Hour, nil
	}
	if strings.HasSuffix(since, "w") {
		weeks, _ := strconv.Atoi(strings.TrimSuffix(since, "w"))
		return time.Duration(weeks) * 7 * 24 * time.Hour, nil
	}
	if strings.HasSuffix(since, "y") {
		years, _ := strconv.Atoi(strings.TrimSuffix(since, "y"))
		return time.Duration(years) * 365 * 24 * time.Hour, nil
	}
	return time.ParseDuration(since)
}

func runImport(cmd *cobra.Command, args []string) {
	host, _ := cmd.Flags().GetString("influx-host")
	db, _ := cmd.Flags().GetString("influx-db")
	user, _ := cmd.Flags().GetString("influx-user")
	pass, _ := cmd.Flags().GetString("influx-pass")
	measurements, _ := cmd.Flags().GetStringSlice("measurements")
	rps, _ := cmd.Flags().GetStringSlice("retention-policies")
	since, _ := cmd.Flags().GetString("since")

	dataPath := viper.GetString("storage.path")
	if dataPath == "" {
		dataPath = "./data"
	}

	storageOpts := config.StorageOptions{
		DataPath:          dataPath,
		Retention:         viper.GetString("storage.retention"),
		PartitionDuration: viper.GetString("storage.partition"),
	}

	zapLogger, _ := zap.NewDevelopment()
	st, err := store.NewStore(store.Config{
		DataPath:          storageOpts.DataPath,
		Retention:         storageOpts.GetRetention(),
		PartitionDuration: storageOpts.GetPartitionDuration(),
	}, zapLogger)
	if err != nil {
		log.Fatalf("Failed to open local storage: %v", err)
	}
	defer st.Close()

	imp := importer.NewImporter(importer.Config{
		Host:              host,
		Database:          db,
		User:              user,
		Password:          pass,
		Measurements:      measurements,
		RetentionPolicies: rps,
	}, st, zapLogger)

	duration, err := parseSince(since)
	if err != nil {
		log.Fatalf("Invalid duration format: %v", err)
	}

	endTime := time.Now()
	startTime := endTime.Add(-duration)

	log.Printf("Importing data from %s to %s", startTime.Format(time.RFC3339), endTime.Format(time.RFC3339))

	progress := make(chan string)
	go func() {
		for msg := range progress {
			log.Println(msg)
		}
	}()

	err = imp.RunImport(context.Background(), startTime, endTime, progress)
	if err != nil {
		log.Fatalf("Import failed: %v", err)
	}
	log.Println("Done.")
}
