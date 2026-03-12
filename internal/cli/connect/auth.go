package connect

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	localtunnel "github.com/localtunnel/go-localtunnel"
	"github.com/pterm/pterm"
	"github.com/spf13/cobra"
	"github.com/ygelfand/power-dash/internal/config"
	"github.com/ygelfand/power-dash/internal/fleet"
	"github.com/ygelfand/power-dash/internal/utils"
)

func NewConnectAuthCmd(opts *config.PowerwallOptions) *cobra.Command {
	var (
		clientID     string
		clientSecret string
		region       string
		tokensFile   string
		force        bool
		refresh      bool
	)

	cmd := &cobra.Command{
		Use:   "auth",
		Short: "obtain or refresh Tesla Fleet API OAuth tokens",
		Long: `Manages Tesla Fleet API OAuth tokens required for key registration.

If valid tokens already exist they are shown and nothing else happens.
If tokens are expired, a refresh is attempted automatically.
Use --force to run a full OAuth login regardless.

A localtunnel.me tunnel is started only when a full OAuth login is needed,
to serve the EC public key and receive the callback.

Credentials via flags or env vars: TESLA_CLIENT_ID, TESLA_CLIENT_SECRET`,
		RunE: func(cmd *cobra.Command, args []string) error {
			clientID = utils.FirstNonEmpty(clientID, os.Getenv("TESLA_CLIENT_ID"))
			clientSecret = utils.FirstNonEmpty(clientSecret, os.Getenv("TESLA_CLIENT_SECRET"))

			existing, _ := fleet.LoadTokens(tokensFile)

			// ── Already have valid tokens ─────────────────────────────────────
			if existing != nil && !force {
				if !existing.IsExpired() && !refresh {
					pterm.Info.Printfln("Tokens valid (obtained %s, expires in ~%s).", existing.ObtainedAt, tokenTTL(existing))
					pterm.Info.Println("Run 'power-dash connect register' to register your RSA key.")
					return nil
				}

				// Expired or --refresh requested — try refresh.
				if existing.IsExpired() {
					pterm.Info.Printfln("Tokens expired (obtained %s) — refreshing...", existing.ObtainedAt)
				} else {
					pterm.Info.Printfln("Refreshing tokens (obtained %s, expires in ~%s)...", existing.ObtainedAt, tokenTTL(existing))
				}
				existing.ClientID = utils.FirstNonEmpty(existing.ClientID, clientID)
				existing.ClientSecret = utils.FirstNonEmpty(existing.ClientSecret, clientSecret)

				if existing.ClientID == "" {
					existing.ClientID, _ = pterm.DefaultInteractiveTextInput.Show("TESLA_CLIENT_ID (required for refresh)")
				}

				refreshed, rErr := fleet.RefreshTokens(existing)
				if rErr == nil {
					if sErr := fleet.SaveTokens(tokensFile, refreshed); sErr != nil {
						pterm.Warning.Printfln("could not save tokens: %v", sErr)
					} else {
						pterm.Success.Printfln("Tokens refreshed and saved to %s", tokensFile)
					}
					return nil
				}
				if refresh {
					return fmt.Errorf("refresh failed: %w", rErr)
				}
				pterm.Warning.Printfln("Refresh failed: %v — falling back to full OAuth login.", rErr)
			}

			// ── Full OAuth flow ───────────────────────────────────────────────
			ecKeyPath := "tesla_ec_private.pem"
			ecPubPEM, err := fleet.GenerateECKey(ecKeyPath)
			if err != nil {
				return fmt.Errorf("EC key: %w", err)
			}

			ln, err := net.Listen("tcp", "127.0.0.1:0")
			if err != nil {
				return fmt.Errorf("start local server: %w", err)
			}
			localPort := ln.Addr().(*net.TCPAddr).Port

			codeCh := make(chan string, 1)
			errCh := make(chan error, 1)

			mux := http.NewServeMux()
			mux.HandleFunc("/.well-known/appspecific/com.tesla.3p.public-key.pem", func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/x-pem-file")
				w.Write(ecPubPEM)
			})
			mux.HandleFunc("/callback", func(w http.ResponseWriter, r *http.Request) {
				code := r.URL.Query().Get("code")
				if code == "" {
					errCh <- fmt.Errorf("callback missing code (query: %s)", r.URL.RawQuery)
					http.Error(w, "missing code", http.StatusBadRequest)
					return
				}
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
				fmt.Fprint(w, `<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:3em">`+
					`<h2>Authorization successful</h2><p>You can close this tab.</p></body></html>`)
				codeCh <- code
			})
			srv := &http.Server{Handler: mux}
			go srv.Serve(ln)
			defer srv.Shutdown(context.Background())

			pterm.DefaultSection.Println("Starting tunnel")
			spinner, _ := pterm.DefaultSpinner.Start("Connecting to localtunnel.me...")
			lt, err := localtunnel.New(localPort, "localhost", localtunnel.Options{})
			if err != nil {
				spinner.Fail()
				return fmt.Errorf("localtunnel: %w", err)
			}
			defer lt.Close()

			tunnelURL := lt.URL()
			tunnelHost := strings.TrimPrefix(tunnelURL, "https://")
			redirectURI := tunnelURL + "/callback"
			spinner.Success("Tunnel ready: " + pterm.Bold.Sprint(tunnelURL))

			tunnelPassword := ""
			if resp, _ := http.Get("https://loca.lt/mytunnelpassword"); resp != nil {
				if b, _ := io.ReadAll(resp.Body); len(b) > 0 {
					tunnelPassword = strings.TrimSpace(string(b))
				}
				resp.Body.Close()
			}

			pterm.Println()
			pterm.Println("In your Tesla developer app (https://developer.tesla.com/):")
			pterm.Println("  Allowed Origins:       " + pterm.Bold.Sprint("https://loca.lt"))
			pterm.Println("  Allowed Redirect URIs: " + pterm.Bold.Sprint(redirectURI))
			if tunnelPassword != "" {
				pterm.Println()
				pterm.Println("Tunnel password (if prompted): " + pterm.Bold.Sprint(tunnelPassword))
			}
			pterm.Println()

			if clientID == "" {
				clientID, _ = pterm.DefaultInteractiveTextInput.Show("TESLA_CLIENT_ID")
			}
			if clientSecret == "" {
				clientSecret, _ = pterm.DefaultInteractiveTextInput.Show("TESLA_CLIENT_SECRET")
			}

			fleetBase := utils.FirstNonEmpty(os.Getenv("TESLA_FLEET_API_BASE"), fleet.FleetRegions[region], fleet.FleetRegions["na"])
			oauthClient := fleet.NewClient(clientID, clientSecret, redirectURI, fleetBase)

			stateBuf := make([]byte, 16)
			rand.Read(stateBuf)
			authURL := oauthClient.AuthURL(hex.EncodeToString(stateBuf))

			pterm.DefaultSection.Println("Tesla OAuth Login")
			pterm.Println("Opening browser — or copy this URL:")
			pterm.Println()
			pterm.Println("  " + pterm.Bold.Sprint(authURL))
			pterm.Println()
			openBrowser(authURL)

			waitSpinner, _ := pterm.DefaultSpinner.Start("Waiting for OAuth callback...")
			var code string
			select {
			case code = <-codeCh:
				waitSpinner.Success("Callback received")
			case cbErr := <-errCh:
				waitSpinner.Fail()
				return cbErr
			case <-time.After(5 * time.Minute):
				waitSpinner.Fail()
				return fmt.Errorf("timed out waiting for OAuth callback")
			}

			pterm.DefaultSection.Println("Exchanging code for tokens")
			tokens, err := oauthClient.ExchangeCode(code)
			if err != nil {
				return fmt.Errorf("token exchange: %w", err)
			}
			tokens.ClientID = clientID
			tokens.ClientSecret = clientSecret
			if sErr := fleet.SaveTokens(tokensFile, tokens); sErr != nil {
				pterm.Warning.Printfln("could not save tokens: %v", sErr)
			} else {
				pterm.Success.Printfln("Tokens saved to %s", tokensFile)
			}

			pterm.DefaultSection.Println("Register partner app")
			if fleet.FleetRegions[region] == "" {
				detectSpinner, _ := pterm.DefaultSpinner.Start("Detecting region...")
				for name, base := range map[string]string{"na": fleet.FleetRegions["na"], "eu": fleet.FleetRegions["eu"]} {
					c := fleet.NewClient(clientID, clientSecret, redirectURI, base)
					if sites, _ := c.GetEnergySites(tokens.AccessToken); len(sites) > 0 {
						fleetBase = base
						oauthClient = c
						detectSpinner.Success("Region: " + name)
						break
					}
				}
			}
			regSpinner, _ := pterm.DefaultSpinner.Start(fmt.Sprintf("Registering %s with %s...", tunnelHost, fleetBase))
			partnerToken, err := oauthClient.PartnerToken()
			if err != nil {
				regSpinner.Fail()
				return fmt.Errorf("partner token: %w", err)
			}
			if err := oauthClient.RegisterPartner(partnerToken, tunnelHost); err != nil {
				regSpinner.Fail()
				return fmt.Errorf("partner registration: %w", err)
			}
			regSpinner.Success("Partner registered")
			pterm.Println()
			pterm.Info.Println("Run 'power-dash connect register' to register your RSA key.")
			return nil
		},
	}

	cmd.Flags().StringVar(&clientID, "client-id", "", "Tesla app client ID (env: TESLA_CLIENT_ID)")
	cmd.Flags().StringVar(&clientSecret, "client-secret", "", "Tesla app client secret (env: TESLA_CLIENT_SECRET)")
	cmd.Flags().StringVar(&region, "region", "", "Fleet API region: na, eu (auto-detected)")
	cmd.Flags().StringVar(&tokensFile, "tokens-file", "fleet_tokens.json", "path to save/load OAuth tokens")
	cmd.Flags().BoolVar(&force, "force", false, "force full OAuth login even if tokens are valid")
	cmd.Flags().BoolVar(&refresh, "refresh", false, "force token refresh even if not yet expired")
	return cmd
}

func openBrowser(u string) {
	var bin string
	var args []string
	switch runtime.GOOS {
	case "darwin":
		bin, args = "open", []string{u}
	case "linux":
		bin, args = "xdg-open", []string{u}
	case "windows":
		bin, args = "rundll32", []string{"url.dll,FileProtocolHandler", u}
	default:
		return
	}
	exec.Command(bin, args...).Start()
}

func tokenTTL(t *fleet.Tokens) string {
	obtained, err := t.ParseObtainedAt()
	if err != nil {
		return "unknown"
	}
	remaining := time.Until(obtained.Add(time.Duration(t.ExpiresIn) * time.Second))
	if remaining <= 0 {
		return "expired"
	}
	h := int(remaining.Hours())
	m := int(remaining.Minutes()) % 60
	return fmt.Sprintf("%dh%dm", h, m)
}
