package powerwall

import (
	"crypto/tls"
	"net/http"
	"net/url"

	"go.uber.org/zap"
	"golang.org/x/sync/semaphore"
)

func NewPowerwallGateway(endpoint string, password string, logger *zap.Logger) *PowerwallGateway {
	url, err := url.Parse(endpoint)
	if err != nil {
		logger.Error("Invalid endpoint", zap.Error(err), zap.String("url", endpoint))
		return nil
	}
	pwr := &PowerwallGateway{
		password: password,
		Endpoint: url,
		logger:   logger,
	}

	pwr.httpClient = pwr.getClient()
	pwr.Din = *pwr.getDin()
	pwr.refreshSem = semaphore.NewWeighted(1)
	pwr.authSem = semaphore.NewWeighted(1)
	return pwr
}

func (p *PowerwallGateway) getClient() *http.Client {
	return &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: true,
			},
		},
	}
}
