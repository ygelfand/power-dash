package powerwall

import (
	"crypto/rsa"
	"net/http"
	"net/url"

	"github.com/ygelfand/power-dash/internal/config"
	"go.uber.org/zap"
	"golang.org/x/sync/semaphore"
)

type PowerwallGateway struct {
	Endpoint       *url.URL
	password       string
	authToken      string
	userRecord     string
	httpClient     *http.Client
	Din            string
	refreshSem     *semaphore.Weighted
	authSem        *semaphore.Weighted
	logger         *zap.Logger
	connectionMode config.ConnectionMode
	privateKey     *rsa.PrivateKey
}

type loginResponse struct {
	Email     string   `json:"email"`
	FirstName string   `json:"firstname"`
	LastName  string   `json:"lastname"`
	Roles     []string `json:"roles"`
	Token     string   `json:"token"`
	Provider  string   `json:"provider"`
	LoginTime string   `json:"loginTime"`
}
