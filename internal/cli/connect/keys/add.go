package keys

import (
	"encoding/base64"
	"fmt"
	"os"
	"time"

	"github.com/pterm/pterm"
	"github.com/spf13/cobra"
	"github.com/ygelfand/power-dash/internal/config"
	"github.com/ygelfand/power-dash/internal/fleet"
	"github.com/ygelfand/power-dash/internal/utils"
)

func newKeysAddCmd(opts *config.PowerwallOptions) *cobra.Command {
	var (
		tokensFile   string
		region       string
		siteID       int64
		clientID     string
		clientSecret string
		keyPath      string
	)
	cmd := &cobra.Command{
		Use:   "add",
		Short: "register a new RSA key with the Powerwall and verify it",
		Long: `Registers an RSA-4096 key with your Powerwall for LAN (v1r) access.

If the key file does not exist a new RSA-4096 key pair is generated.
After registration the Powerwall needs physical confirmation: toggle ONE
breaker OFF then ON. The command polls for up to 90s.

Use --key-path to register an additional key alongside an existing one.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			clientID = utils.FirstNonEmpty(clientID, os.Getenv("TESLA_CLIENT_ID"))
			clientSecret = utils.FirstNonEmpty(clientSecret, os.Getenv("TESLA_CLIENT_SECRET"))

			tokens, err := loadTokens(tokensFile, clientID, clientSecret)
			if err != nil {
				return err
			}

			client, siteID, din, err := resolveClient(tokens, tokensFile, region, siteID)
			if err != nil {
				return err
			}

			kp := utils.FirstNonEmpty(keyPath, opts.KeyPath, "tedapi_rsa_private.pem")
			pterm.DefaultSection.Println("RSA Key Pair")
			if _, err := os.Stat(kp); err == nil {
				pterm.Info.Printfln("Existing key found at %s — reusing", kp)
			} else {
				pterm.Info.Println("Generating RSA-4096 key pair...")
			}
			_, pubKeyDER, err := fleet.GenerateRSAKey(kp)
			if err != nil {
				return fmt.Errorf("RSA key: %w", err)
			}
			pterm.Success.Printfln("Private key: %s", kp)

			pterm.DefaultSection.Println("Register RSA public key")
			keyState, err := client.RegisterKey(tokens.AccessToken, siteID, pubKeyDER)
			if err != nil {
				return fmt.Errorf("register key: %w", err)
			}

			pubKeyB64 := base64.StdEncoding.EncodeToString(pubKeyDER)

			if keyState == fleet.KeyStateVerified {
				pterm.Success.Println("Key verified automatically — no breaker toggle needed.")
			} else {
				pterm.Info.Printfln("Key state: %s — polling for cloud verification...", keyStateName(keyState))
				keyState = pollKeyState(client, tokens.AccessToken, siteID, pubKeyB64, 6, 5*time.Second)

				if keyState != fleet.KeyStateVerified {
					pterm.DefaultSection.Println("Physical confirmation required")
					pterm.Println("Toggle ONE Powerwall breaker OFF, wait 2 seconds, then back ON.")
					pterm.DefaultInteractiveTextInput.Show("Press Enter after toggling the breaker")
					keyState = pollKeyState(client, tokens.AccessToken, siteID, pubKeyB64, 18, 5*time.Second)
				}
			}

			pterm.Println()
			if keyState == fleet.KeyStateVerified {
				pterm.DefaultSection.Println("Registration complete")
				pterm.Success.Println("Key is VERIFIED and ready for LAN (v1r) access.")
			} else {
				pterm.DefaultSection.Println("Registration incomplete")
				pterm.Warning.Printfln("Key state is still %s after polling.", keyStateName(keyState))
				pterm.Println("Try toggling the breaker again, then re-run:  power-dash connect keys list")
				pterm.Println("If still stuck, register a fresh key:")
				pterm.Println("  power-dash connect keys add --key-path tedapi_rsa_private_2.pem")
			}

			snippet := "connection-mode: lan\nkey-path: " + kp
			if din != "" {
				snippet += "\ndin: " + din
			}
			pterm.Println()
			fmt.Println(pterm.DefaultBox.WithTitle("Add to your config").Sprint(snippet))
			return nil
		},
	}
	addTokenFlags(cmd, &tokensFile, &region, &siteID)
	cmd.Flags().StringVar(&clientID, "client-id", "", "Tesla app client ID for token refresh (env: TESLA_CLIENT_ID)")
	cmd.Flags().StringVar(&clientSecret, "client-secret", "", "Tesla app client secret for token refresh (env: TESLA_CLIENT_SECRET)")
	cmd.Flags().StringVar(&keyPath, "key-path", "", "path to RSA private key PEM (created if absent; defaults to config key-path)")
	return cmd
}
