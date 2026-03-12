package fleet

import "net/http"

type Client struct {
	ClientID     string
	ClientSecret string
	RedirectURI  string
	FleetAPIBase string
	httpClient   *http.Client
}

type EnergySite struct {
	EnergySiteID int64
	GatewayDIN   string
	SiteName     string
}

type Tokens struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
	ObtainedAt   string `json:"obtained_at"`
	ClientID     string `json:"client_id,omitempty"`
	ClientSecret string `json:"client_secret,omitempty"`
	Region       string `json:"region,omitempty"`
	GatewayDIN   string `json:"gateway_din,omitempty"`
	EnergySiteID int64  `json:"energy_site_id,omitempty"`
}

// AuthorizedClient represents a registered key on the device.
type AuthorizedClient struct {
	State       int
	Description string
	PublicKey   string
}
