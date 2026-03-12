package powerwall

import (
	"crypto/rsa"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"encoding/pem"
	"fmt"
	"net/http"
	"net/url"
	"os"

	"github.com/ygelfand/power-dash/internal/config"
	"go.uber.org/zap"
	"golang.org/x/sync/semaphore"
)

func NewPowerwallGateway(opts *config.PowerwallOptions, logger *zap.Logger) *PowerwallGateway {
	u, err := url.Parse(opts.Endpoint)
	if err != nil {
		logger.Error("Invalid endpoint", zap.Error(err), zap.String("url", opts.Endpoint))
		return nil
	}
	pwr := &PowerwallGateway{
		password:       opts.Password,
		Endpoint:       u,
		logger:         logger,
		connectionMode: opts.ConnectionMode,
	}

	if opts.ConnectionMode == config.ConnectionModeLan {
		if opts.KeyPath == "" {
			logger.Error("lan mode requires a key-path")
			return nil
		}
		key, err := LoadRSAPrivateKey(opts.KeyPath)
		if err != nil {
			logger.Error("Failed to load RSA private key for lan mode", zap.Error(err), zap.String("path", opts.KeyPath))
			return nil
		}
		pwr.privateKey = key
		pubDER := x509.MarshalPKCS1PublicKey(&key.PublicKey)
		sum := sha256.Sum256(pubDER)
		logger.Debug("RSA key loaded", zap.String("path", opts.KeyPath), zap.String("pubkey_sha256", hex.EncodeToString(sum[:])))
	}

	pwr.httpClient = pwr.getClient()
	if opts.DIN != "" {
		pwr.Din = opts.DIN
	} else {
		din := pwr.getDin()
		if din == nil {
			logger.Error("Failed to retrieve DIN from gateway")
			return nil
		}
		pwr.Din = *din
	}
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

func LoadRSAPrivateKey(path string) (*rsa.PrivateKey, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	block, _ := pem.Decode(data)
	if block == nil {
		return nil, fmt.Errorf("no PEM block found in %s", path)
	}
	key, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		k, err2 := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err2 != nil {
			return nil, fmt.Errorf("parse RSA key (PKCS1: %v, PKCS8: %v)", err, err2)
		}
		rk, ok := k.(*rsa.PrivateKey)
		if !ok {
			return nil, fmt.Errorf("key at %s is not an RSA key", path)
		}
		return rk, nil
	}
	return key, nil
}

