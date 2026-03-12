// Package fleet provides a client for the Tesla Fleet API, used for OAuth
// authentication and RSA key registration with energy devices.
package fleet

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/ygelfand/power-dash/internal/utils"
)

const (
	AuthBase  = "https://auth.tesla.com"
	TokenBase = "https://fleet-auth.prd.vn.cloud.tesla.com"
	Scope     = "openid offline_access energy_device_data energy_cmds"

	KeyStatePending             = 1
	KeyStatePendingVerification = 2
	KeyStateVerified            = 3
)

var FleetRegions = map[string]string{
	"na": "https://fleet-api.prd.na.vn.cloud.tesla.com",
	"eu": "https://fleet-api.prd.eu.vn.cloud.tesla.com",
	"cn": "https://fleet-api.prd.cn.vn.cloud.tesla.com",
}

func NewClient(clientID, clientSecret, redirectURI, fleetAPIBase string) *Client {
	return &Client{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		RedirectURI:  redirectURI,
		FleetAPIBase: fleetAPIBase,
		httpClient:   &http.Client{Timeout: 30 * time.Second},
	}
}

// ParseObtainedAt parses the ObtainedAt field as a time.Time.
func (t *Tokens) ParseObtainedAt() (time.Time, error) {
	return time.Parse(time.RFC3339, t.ObtainedAt)
}

// IsExpired reports whether the access token has expired (with a 60s buffer).
func (t *Tokens) IsExpired() bool {
	if t.ObtainedAt == "" || t.ExpiresIn == 0 {
		return false
	}
	obtained, err := time.Parse(time.RFC3339, t.ObtainedAt)
	if err != nil {
		return false
	}
	return time.Now().After(obtained.Add(time.Duration(t.ExpiresIn)*time.Second - 60*time.Second))
}

// RefreshTokens exchanges the refresh token for a new access token.
// Falls back to env vars TESLA_CLIENT_ID / TESLA_CLIENT_SECRET if not stored.
func RefreshTokens(tokens *Tokens) (*Tokens, error) {
	if tokens.RefreshToken == "" {
		return nil, fmt.Errorf("no refresh token available — re-run: power-dash connect auth")
	}
	clientID := utils.FirstNonEmpty(tokens.ClientID, os.Getenv("TESLA_CLIENT_ID"))
	if clientID == "" {
		return nil, fmt.Errorf("client_id required for refresh — set TESLA_CLIENT_ID or re-run: power-dash connect auth")
	}
	body := url.Values{
		"grant_type":    {"refresh_token"},
		"refresh_token": {tokens.RefreshToken},
		"client_id":     {clientID},
		"scope":         {Scope},
	}
	clientSecret := utils.FirstNonEmpty(tokens.ClientSecret, os.Getenv("TESLA_CLIENT_SECRET"))
	if clientSecret != "" {
		body.Set("client_secret", clientSecret)
	}
	req, err := http.NewRequest("POST", TokenBase+"/oauth2/v3/token", strings.NewReader(body.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("token refresh failed (%d): %s", resp.StatusCode, raw)
	}
	var newTokens Tokens
	if err := json.Unmarshal(raw, &newTokens); err != nil {
		return nil, fmt.Errorf("parse refresh response: %w", err)
	}
	newTokens.ObtainedAt = time.Now().Format(time.RFC3339)
	newTokens.ClientID = clientID
	newTokens.ClientSecret = clientSecret
	return &newTokens, nil
}

// AuthURL returns the OAuth authorization URL the user must open in their browser.
func (c *Client) AuthURL(state string) string {
	params := url.Values{
		"response_type": {"code"},
		"client_id":     {c.ClientID},
		"redirect_uri":  {c.RedirectURI},
		"scope":         {Scope},
		"state":         {state},
	}
	return AuthBase + "/oauth2/v3/authorize?" + params.Encode()
}

// ExchangeCode exchanges an OAuth authorization code for access/refresh tokens.
func (c *Client) ExchangeCode(code string) (*Tokens, error) {
	body := url.Values{
		"grant_type":    {"authorization_code"},
		"client_id":     {c.ClientID},
		"client_secret": {c.ClientSecret},
		"code":          {code},
		"audience":      {c.FleetAPIBase},
		"redirect_uri":  {c.RedirectURI},
		"scope":         {Scope},
	}
	req, err := http.NewRequest("POST", TokenBase+"/oauth2/v3/token",
		strings.NewReader(body.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("token exchange failed (%d): %s", resp.StatusCode, raw)
	}
	var tokens Tokens
	if err := json.Unmarshal(raw, &tokens); err != nil {
		return nil, fmt.Errorf("parse token response: %w", err)
	}
	tokens.ObtainedAt = time.Now().Format(time.RFC3339)
	return &tokens, nil
}

// PartnerToken obtains a partner authentication token via client credentials
// grant. This is required for RegisterPartner — it is distinct from the user
// access token obtained via the authorization code flow.
func (c *Client) PartnerToken() (string, error) {
	body := url.Values{
		"grant_type":    {"client_credentials"},
		"client_id":     {c.ClientID},
		"client_secret": {c.ClientSecret},
		"scope":         {Scope},
		"audience":      {c.FleetAPIBase},
	}
	req, err := http.NewRequest("POST", TokenBase+"/oauth2/v3/token",
		strings.NewReader(body.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("partner token failed (%d): %s", resp.StatusCode, raw)
	}
	var result struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return "", fmt.Errorf("parse partner token response: %w", err)
	}
	return result.AccessToken, nil
}

// RegisterPartner registers the partner app with the Fleet API for the current
// region. This must be called once before any other Fleet API calls.
// The domain must match the one hosting the EC public key at
// /.well-known/appspecific/com.tesla.3p.public-key.pem.
func (c *Client) RegisterPartner(accessToken, domain string) error {
	body, _ := json.Marshal(map[string]string{"domain": domain})
	req, err := http.NewRequest("POST", c.FleetAPIBase+"/api/1/partner_accounts", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return fmt.Errorf("partner registration failed (%d): %s", resp.StatusCode, raw)
	}
	return nil
}

// GetEnergySites fetches the list of energy sites from the Fleet API.
func (c *Client) GetEnergySites(accessToken string) ([]EnergySite, error) {
	req, err := http.NewRequest("GET", c.FleetAPIBase+"/api/1/products", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("get products failed (%d): %s", resp.StatusCode, raw)
	}

	var result struct {
		Response []map[string]any `json:"response"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("parse products response: %w", err)
	}

	var sites []EnergySite
	for _, p := range result.Response {
		if id, ok := p["energy_site_id"]; ok {
			site := EnergySite{SiteName: "unknown", GatewayDIN: "unknown"}
			switch v := id.(type) {
			case float64:
				site.EnergySiteID = int64(v)
			}
			if name, ok := p["site_name"].(string); ok {
				site.SiteName = name
			}
			if din, ok := p["gateway_id"].(string); ok {
				site.GatewayDIN = din
			}
			sites = append(sites, site)
		}
	}
	return sites, nil
}

// RegisterKey sends an add_authorized_client_request to register the RSA public
// key (PKCS1 DER, base64-encoded) with the given energy site.
// Returns the key state integer from the response (1=PENDING, 2=PENDING_VERIFICATION, 3=VERIFIED).
func (c *Client) RegisterKey(accessToken string, siteID int64, publicKeyDER []byte) (int, error) {
	payload := map[string]any{
		"command_properties": map[string]any{
			"message": map[string]any{
				"authorization": map[string]any{
					"add_authorized_client_request": map[string]any{
						"key_type":               1,
						"public_key":             base64.StdEncoding.EncodeToString(publicKeyDER),
						"authorized_client_type": 1,
						"description":            "power-dash LAN Client",
					},
				},
			},
			"identifier_type": 1,
		},
		"command_type": "grpc_command",
	}
	return c.sendCommand(accessToken, siteID, payload)
}

// RemoveKey sends a grpc_signed_command to remove an authorized client key.
// signedMessageBase64 is a base64-encoded serialized SignedMessage protobuf,
// signed by the caller using the registered RSA private key.
// The signing key must be VERIFIED on the device for Tesla to accept the removal.
func (c *Client) RemoveKey(accessToken string, siteID int64, signedMessageBase64 string) (map[string]any, error) {
	payload := map[string]any{
		"command_properties": map[string]any{
			"message": map[string]any{
				"routable_message": signedMessageBase64,
			},
			"identifier_type": 1,
		},
		"command_type": "grpc_signed_command",
	}
	return c.rawCommand(accessToken, siteID, payload)
}

// ListClients returns the full list of authorized clients registered on the site.
func (c *Client) ListClients(accessToken string, siteID int64) ([]AuthorizedClient, error) {
	payload := map[string]any{
		"command_properties": map[string]any{
			"message": map[string]any{
				"authorization": map[string]any{
					"list_authorized_clients_request": map[string]any{},
				},
			},
			"identifier_type": 1,
		},
		"command_type": "grpc_command",
	}
	resp, err := c.rawCommand(accessToken, siteID, payload)
	if err != nil {
		return nil, err
	}
	msg := nestedGet(resp, "response", "message", "payload", "authorization", "message")
	if msg == nil {
		msg = nestedGet(resp, "response", "message", "Payload", "Authorization", "Message")
	}
	if msg == nil {
		return nil, nil
	}
	m, _ := msg.(map[string]any)
	for _, respKey := range []string{"list_authorized_clients_response", "ListAuthorizedClientsResponse"} {
		entry, ok := m[respKey].(map[string]any)
		if !ok {
			continue
		}
		var out []AuthorizedClient
		for _, cl := range anySlice(entry, "clients", "Clients") {
			cm, _ := cl.(map[string]any)
			pk, _ := strField(cm, "public_key", "PublicKey")
			desc, _ := strField(cm, "description", "Description")
			out = append(out, AuthorizedClient{
				State:       intField(cm, "state", "State"),
				Description: desc,
				PublicKey:   pk,
			})
		}
		return out, nil
	}
	return nil, nil
}

// ListAuthorizedClients queries the key verification state for the site.
// Returns the state of the first client in the list.
func (c *Client) ListAuthorizedClients(accessToken string, siteID int64) (int, error) {
	clients, err := c.ListClients(accessToken, siteID)
	if err != nil {
		return 0, err
	}
	if len(clients) == 0 {
		return 0, nil
	}
	return clients[0].State, nil
}

// GetClientStateByKey returns the state of the client whose public_key matches
// pubKeyBase64 (standard base64-encoded PKCS1 DER). Returns 0 if not found.
func (c *Client) GetClientStateByKey(accessToken string, siteID int64, pubKeyBase64 string) (int, error) {
	clients, err := c.ListClients(accessToken, siteID)
	if err != nil {
		return 0, err
	}
	for _, cl := range clients {
		if cl.PublicKey == pubKeyBase64 {
			return cl.State, nil
		}
	}
	return 0, nil
}

func (c *Client) rawCommand(accessToken string, siteID int64, payload any) (map[string]any, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	u := fmt.Sprintf("%s/api/1/energy_sites/%d/command", c.FleetAPIBase, siteID)
	req, err := http.NewRequest("POST", u, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("command failed (%d): %s", resp.StatusCode, raw)
	}
	var result map[string]any
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}
	return result, nil
}

// sendCommand posts a payload and extracts the key state from the response.
func (c *Client) sendCommand(accessToken string, siteID int64, payload any) (int, error) {
	result, err := c.rawCommand(accessToken, siteID, payload)
	if err != nil {
		return 0, err
	}
	return extractKeyState(result), nil
}

// extractKeyState navigates the nested Fleet API response to find the client
// key state integer. Returns 0 if not found.
func extractKeyState(resp map[string]any) int {
	// Try both capitalisation variants that Tesla returns.
	msg := nestedGet(resp,
		"response", "message", "payload", "authorization", "message")
	if msg == nil {
		msg = nestedGet(resp,
			"response", "message", "Payload", "Authorization", "Message")
	}
	if msg == nil {
		return 0
	}
	m, ok := msg.(map[string]any)
	if !ok {
		return 0
	}
	for _, respKey := range []string{
		"add_authorized_client_response", "AddAuthorizedClientResponse",
		"list_authorized_clients_response", "ListAuthorizedClientsResponse",
	} {
		if entry, ok := m[respKey].(map[string]any); ok {
			// AddAuthorizedClientResponse has a single "client"; list has "clients" array.
			if client, ok := entry["client"].(map[string]any); ok {
				return intField(client, "state", "State")
			}
			if client, ok := entry["Client"].(map[string]any); ok {
				return intField(client, "state", "State")
			}
			if clients, ok := entry["clients"].([]any); ok && len(clients) > 0 {
				if client, ok := clients[0].(map[string]any); ok {
					return intField(client, "state", "State")
				}
			}
		}
	}
	return 0
}

func nestedGet(m map[string]any, keys ...string) any {
	var cur any = m
	for _, k := range keys {
		mm, ok := cur.(map[string]any)
		if !ok {
			return nil
		}
		cur = mm[k]
	}
	return cur
}

func intField(m map[string]any, keys ...string) int {
	for _, k := range keys {
		if v, ok := m[k]; ok {
			switch n := v.(type) {
			case float64:
				return int(n)
			case int:
				return n
			}
		}
	}
	return 0
}

func strField(m map[string]any, keys ...string) (string, bool) {
	for _, k := range keys {
		if v, ok := m[k].(string); ok {
			return v, true
		}
	}
	return "", false
}

func anySlice(m map[string]any, keys ...string) []any {
	for _, k := range keys {
		if v, ok := m[k].([]any); ok {
			return v
		}
	}
	return nil
}

// GenerateRSAKey generates an RSA-4096 key pair, saves the private key as PEM
// to keyPath, and returns the private key and PKCS1 DER-encoded public key.
// If the key already exists at keyPath it is loaded and reused.
func GenerateRSAKey(keyPath string) (*rsa.PrivateKey, []byte, error) {
	if _, err := os.Stat(keyPath); err == nil {
		data, err := os.ReadFile(keyPath)
		if err != nil {
			return nil, nil, fmt.Errorf("read existing key: %w", err)
		}
		block, _ := pem.Decode(data)
		if block == nil {
			return nil, nil, fmt.Errorf("no PEM block in %s", keyPath)
		}
		key, err := x509.ParsePKCS1PrivateKey(block.Bytes)
		if err != nil {
			return nil, nil, fmt.Errorf("parse existing key: %w", err)
		}
		pub := x509.MarshalPKCS1PublicKey(&key.PublicKey)
		return key, pub, nil
	}

	key, err := rsa.GenerateKey(rand.Reader, 4096)
	if err != nil {
		return nil, nil, fmt.Errorf("generate RSA key: %w", err)
	}

	pemBlock := &pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(key),
	}
	f, err := os.OpenFile(keyPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return nil, nil, fmt.Errorf("save private key: %w", err)
	}
	defer f.Close()
	if err := pem.Encode(f, pemBlock); err != nil {
		return nil, nil, fmt.Errorf("write PEM: %w", err)
	}

	pub := x509.MarshalPKCS1PublicKey(&key.PublicKey)
	return key, pub, nil
}

// SaveTokens writes tokens to a JSON file with mode 0600.
func SaveTokens(path string, tokens *Tokens) error {
	data, err := json.MarshalIndent(tokens, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0600)
}

// GenerateECKey generates a P-256 EC key pair, saves the private key as PEM to
// keyPath (mode 0600), and returns the public key as a PEM block ready to serve
// at /.well-known/appspecific/com.tesla.3p.public-key.pem.
// If the key already exists it is loaded and reused.
func GenerateECKey(keyPath string) ([]byte, error) {
	if _, err := os.Stat(keyPath); err == nil {
		data, err := os.ReadFile(keyPath)
		if err != nil {
			return nil, fmt.Errorf("read existing EC key: %w", err)
		}
		block, _ := pem.Decode(data)
		if block == nil {
			return nil, fmt.Errorf("no PEM block in %s", keyPath)
		}
		key, err := x509.ParseECPrivateKey(block.Bytes)
		if err != nil {
			return nil, fmt.Errorf("parse existing EC key: %w", err)
		}
		return ecPublicKeyPEM(&key.PublicKey)
	}

	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("generate EC key: %w", err)
	}

	privDER, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		return nil, fmt.Errorf("marshal EC key: %w", err)
	}
	f, err := os.OpenFile(keyPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return nil, fmt.Errorf("save EC key: %w", err)
	}
	defer f.Close()
	if err := pem.Encode(f, &pem.Block{Type: "EC PRIVATE KEY", Bytes: privDER}); err != nil {
		return nil, fmt.Errorf("write EC PEM: %w", err)
	}

	return ecPublicKeyPEM(&key.PublicKey)
}

func ecPublicKeyPEM(pub *ecdsa.PublicKey) ([]byte, error) {
	der, err := x509.MarshalPKIXPublicKey(pub)
	if err != nil {
		return nil, fmt.Errorf("marshal EC public key: %w", err)
	}
	return pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der}), nil
}

// LoadTokens reads tokens from a JSON file. Returns nil, nil if the file doesn't exist.
func LoadTokens(path string) (*Tokens, error) {
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var t Tokens
	if err := json.Unmarshal(data, &t); err != nil {
		return nil, fmt.Errorf("parse tokens file: %w", err)
	}
	return &t, nil
}
