package powerwall

import (
	"net/http"
	"net/url"

	"go.uber.org/zap"
	"golang.org/x/sync/semaphore"
)

type PowerwallGateway struct {
	Endpoint   *url.URL
	password   string
	authToken  string
	userRecord string
	httpClient *http.Client
	Din        string
	refreshSem *semaphore.Weighted
	authSem    *semaphore.Weighted
	logger     *zap.Logger
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
